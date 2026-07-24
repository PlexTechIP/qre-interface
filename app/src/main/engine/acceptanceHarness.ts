import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import addFormatsRaw from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";
import type { RunConfig } from "../../shared/types.js";
import { resolvePythonBin } from "./pythonBin.js";
import { QreEngine } from "./qreEngine.js";

const addFormats = addFormatsRaw as unknown as FormatsPlugin;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const FIXTURE_DIR = path.join(REPO_ROOT, "contracts", "fixtures");
const SUCCESS_FIXTURES = [
  "runconfig.benchmark.json",
  "runconfig.large.json",
  "runconfig.sparse.json",
] as const;
const FAILURE_FIXTURE = "runconfig.failing.json";

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const schema = loadJson<Record<string, unknown>>(
    path.join(REPO_ROOT, "contracts", "runresult.schema.json"),
  );
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const engine = new QreEngine(resolvePythonBin());
  const summaries: Record<string, unknown>[] = [];

  for (const fixtureName of [...SUCCESS_FIXTURES, FAILURE_FIXTURE]) {
    const config = loadJson<RunConfig>(path.join(FIXTURE_DIR, fixtureName));
    const result = await engine.run(config);
    const schemaValid = validate(result);
    if (!schemaValid) {
      throw new Error(
        `${fixtureName} failed RunResult schema validation: ${JSON.stringify(validate.errors)}`,
      );
    }

    const expectsSuccess = fixtureName !== FAILURE_FIXTURE;
    if (expectsSuccess && result.status !== "succeeded") {
      throw new Error(
        `${fixtureName} expected success but returned ${result.error?.code ?? "unknown failure"}`,
      );
    }
    if (!expectsSuccess && result.status !== "failed") {
      throw new Error(`${fixtureName} expected failure but returned success`);
    }

    const firstRow = result.frontier?.[0];
    summaries.push({
      fixture: fixtureName,
      config: {
        application:
          config.application.type === "benchmark"
            ? config.application.benchmarkId
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
