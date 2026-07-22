import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
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
