import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist-electron",
    ssr: "src/mcp/server.ts",
    target: "node22",
    rollupOptions: {
      output: { format: "es", entryFileNames: "mcp-server.mjs" },
    },
  },
});
