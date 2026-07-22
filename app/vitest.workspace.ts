import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "renderer",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/renderer/test/setup.ts"],
          include: ["src/renderer/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "engine-fast",
          environment: "node",
          globals: true,
          include: [
            "src/main/engine/pythonBin.test.ts",
            "src/main/engine/benchmarkRegistry.test.ts",
            "src/main/engine/configToInvocation.test.ts",
            "src/main/engine/outputToResult.test.ts",
            "src/main/engine/execute.test.ts",
            "src/main/engine/qreEngine.test.ts",
          ],
        },
      },
    ],
  },
});
