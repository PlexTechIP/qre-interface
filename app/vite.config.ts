/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

import { contentSecurityPolicy } from "./src/shared/contentSecurityPolicy";

/**
 * Injects the renderer's CSP as a `<meta>` at the very top of `<head>`.
 *
 * Build only. The dev server injects its own inline scripts for HMR and
 * react-refresh and needs `ws:` to talk to itself, so a policy loose enough for
 * dev would have to allow `'unsafe-inline'` and `'unsafe-eval'` — which is most
 * of what the policy is for. Rather than ship a weakened one and call the app
 * protected, the strict policy applies to the artifact that gets demoed and
 * distributed, and the dev server is understood to be unprotected.
 *
 * `enforce: "post"` so this sees the FINAL html: the hashes are computed from
 * the inline scripts that actually survived the build, not from the ones in the
 * source template. That is the difference between a hash that stays correct
 * when someone edits `index.html` and one that silently blanks the app.
 *
 * `head-prepend` because a meta CSP governs only what is fetched after the
 * parser reaches it — injected after the script tags, it would police nothing.
 */
function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: "qre-content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
          .map((match) => match[1] ?? "")
          .filter((source) => source.trim().length > 0)
          .map((source) => `sha256-${createHash("sha256").update(source, "utf8").digest("base64")}`);

        return {
          html,
          tags: [
            {
              tag: "meta",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content: contentSecurityPolicy(hashes),
              },
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  // Relative, because the packaged app loads the renderer with `loadFile` over
  // `file://`, where Vite's default absolute `/assets/...` resolves against the
  // filesystem root and finds nothing.
  base: "./",
  plugins: [react(), contentSecurityPolicyPlugin()],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
});
