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
            "src/main/engine/configToInvocationV14.test.ts",
            "src/main/engine/outputToResult.test.ts",
            "src/main/engine/execute.test.ts",
            "src/main/engine/qreEngine.test.ts",
          ],
        },
      },
      {
        test: {
          name: "main-node",
          environment: "node",
          globals: true,
          include: ["src/main/**/*.test.ts"],
          exclude: ["src/main/engine/**"], // engine tests run via test:engine
        },
      },
      {
        // The contract layer both processes import. Without this project its
        // tests match no include pattern and silently never run.
        test: {
          name: "shared",
          environment: "node",
          globals: true,
          include: ["src/shared/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "mcp",
          environment: "node",
          globals: true,
          include: ["src/mcp/**/*.test.ts"],
        },
      },
    ],
  },
});
