import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist-electron",
    ssr: "src/main/preload.ts",
    target: "node22",
    rollupOptions: {
      external: ["electron"],
      output: { format: "cjs", entryFileNames: "preload.cjs" },
    },
  },
});
