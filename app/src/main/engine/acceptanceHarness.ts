import { Ajv } from "ajv";
import addFormatsRaw from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";
import runResultSchema from "../../shared/contracts/runresult.schema.json";
import {
  buildBenchmarkConfig,
  buildFailingConfig,
  buildLargeConfig,
  buildSparseConfig,
} from "../../shared/testing/index.js";

const addFormats = addFormatsRaw as unknown as FormatsPlugin;
const SCENARIOS = [
  ["benchmark", buildBenchmarkConfig(), true],
  ["large", buildLargeConfig(), true],
  ["sparse", buildSparseConfig(), true],
  ["failing", buildFailingConfig(), false],
] as const;

async function main(): Promise<void> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(runResultSchema);
  const engine = new QreEngine(resolvePythonBin());
  const summaries: Record<string, unknown>[] = [];

  for (const [label, config, expectsSuccess] of SCENARIOS) {
    const result = await engine.run(config);
    const schemaValid = validate(result);
    if (!schemaValid) {
      throw new Error(
        `${label} failed RunResult schema validation: ${JSON.stringify(validate.errors)}`,
      );
    }

    if (expectsSuccess && result.status !== "succeeded") {
      throw new Error(
        `${label} expected success but returned ${result.error?.code ?? "unknown failure"}`,
      );
    }
    if (!expectsSuccess && result.status !== "failed") {
      throw new Error(`${label} expected failure but returned success`);
    }

    const firstRow = result.frontier?.[0];
    summaries.push({
      fixture: label,
      config: {
        application:
          config.application.type === "benchmark"
            ? config.application.benchmarkId
            : config.application.type === "manualCounts"
              ? "manual-counts"
              : config.application.format,
        architecture: config.architecture.type,
        qecCode: config.qecCode,
        traceTransform: config.traceTransform.type,
        maxError: config.maxError,
      },
      schemaValid,
      status: result.status,
      frontierRows: result.frontier?.length ?? 0,
      firstRow: firstRow
        ? {
            physicalQubits: firstRow.physicalQubits.value,
            runtimeNs: firstRow.runtime.value,
            logicalCycleTimeNs: firstRow.logicalCycleTime.value,
            factories: firstRow.factories.value,
            totalError: firstRow.totalError.value,
            codeDistance: firstRow.codeDistance.value,
          }
        : null,
      error: result.error,
      rawPresent: result.raw !== null,
      qreVersion: result.qreVersion,
    });
  }

  process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
}

await main();
