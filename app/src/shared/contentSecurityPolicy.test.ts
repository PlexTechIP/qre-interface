// @vitest-environment node
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, CSP_DIRECTIVES } from "./contentSecurityPolicy";

describe("the renderer's content security policy", () => {
  /**
   * The one that matters most. The renderer makes no network requests — every
   * provider call happens in main, which is why the API key can live there and
   * never cross the bridge. `connect-src 'none'` turns that architectural fact
   * into an enforced one: even with something running in the page, there is
   * nowhere to send what it finds.
   *
   * If a future change needs the renderer to fetch, this test failing is the
   * point at which someone has to argue for it out loud.
   */
  it("forbids the renderer from opening any network connection", () => {
    expect(CSP_DIRECTIVES).toContain("connect-src 'none'");
  });

  it("closes the usual pivots", () => {
    expect(CSP_DIRECTIVES).toContain("object-src 'none'");
    expect(CSP_DIRECTIVES).toContain("base-uri 'none'");
    expect(CSP_DIRECTIVES).toContain("form-action 'none'");
    expect(CSP_DIRECTIVES).toContain("frame-src 'none'");
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
  });

  it("never allows inline or eval'd script", () => {
    const scriptSrc = CSP_DIRECTIVES.find((directive) => directive.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("appends build-time hashes to script-src and nothing else", () => {
    const policy = contentSecurityPolicy(["sha256-abc123", "sha256-def456"]);

    expect(policy).toContain("script-src 'self' 'sha256-abc123' 'sha256-def456'");
    // A hash on style-src or connect-src would be a copy-paste that silently
    // widened a directive nobody meant to widen.
    expect(policy).toContain("connect-src 'none'");
    expect(policy).not.toMatch(/(?:style|connect|img)-src[^;]*sha256/);
  });

  it("emits a directive list with no hashes when there are no inline scripts", () => {
    expect(contentSecurityPolicy()).toBe(CSP_DIRECTIVES.join("; "));
  });
});
