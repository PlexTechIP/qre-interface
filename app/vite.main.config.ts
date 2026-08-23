import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // This config is the only one that empties dist-electron, and four builds
    // write there — main, preload, the MCP server, and the runtime assets
    // below. So this one must run FIRST and the others after it, in `npm run
    // build` and in scripts/dev.mjs alike. Running it on its own deletes the
    // MCP bundle, which an MCP client holds an absolute path to.
    emptyOutDir: true,
    outDir: "dist-electron",
    ssr: "src/main/main.ts",
    target: "node22",
    rollupOptions: {
      external: ["electron"],
      output: { format: "cjs", entryFileNames: "main.cjs" },
    },
  },
  plugins: [
    {
      name: "copy-qre-runtime-assets",
      closeBundle() {
        const pythonDestination = resolve("dist-electron/python");
        mkdirSync(pythonDestination, { recursive: true });
        cpSync(resolve("src/main/engine/python"), pythonDestination, {
          recursive: true,
          filter: (source) =>
            ![".venv", "__pycache__", ".qre-cache", ".matplotlib"].some(
              (generatedDirectory) => source.includes(generatedDirectory),
            ),
        });

        const benchmarkDestination = resolve("dist-electron/benchmarks");
        mkdirSync(benchmarkDestination, { recursive: true });
        cpSync(resolve("src/main/engine/benchmarks"), benchmarkDestination, {
          recursive: true,
        });
      },
    },
  ],
});
