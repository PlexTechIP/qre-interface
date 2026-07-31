import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/main/engine/pythonBin.test.ts",
      "src/main/engine/benchmarkRegistry.test.ts",
      "src/main/engine/benchmarkSmoke.test.ts",
      "src/main/engine/conformance.test.ts",
      "src/main/engine/ipcConformance.test.ts",
      "src/main/engine/pythonClassifier.test.ts",
      "src/main/engine/uploadedProgram.test.ts",
      "src/main/engine/robustness.test.ts",
      "src/main/engine/crossConfig.test.ts",
      "src/main/engine/magicStateFactories.test.ts",
      "src/main/engine/execute.test.ts",
      "src/main/engine/qreEngine.test.ts",
    ],
  },
});
