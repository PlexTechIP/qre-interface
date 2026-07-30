import { describe, it, expect, beforeAll } from "vitest";
import { Ajv } from "ajv";
import addFormatsRaw from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";
import { QreEngine } from "./qreEngine.js";
import { resolvePythonBin } from "./pythonBin.js";
import runResultSchema from "../../shared/contracts/runresult.schema.json";
import {
  buildBenchmarkConfig,
  buildFailingConfig,
  buildLargeConfig,
  buildSparseConfig,
} from "../../shared/testing/index.js";

// ajv-formats' type declarations aren't written for TS's NodeNext/ESM CJS-interop
// analysis, so the default import resolves to the raw CJS module namespace type
// instead of the callable plugin. The runtime value is correct (proven by the
// tests below actually invoking addFormats); this cast only restores the static
// type that ajv-formats' own .d.ts already declares (FormatsPlugin).
const addFormats = addFormatsRaw as unknown as FormatsPlugin;

const PYTHON_BIN = resolvePythonBin();

const SUCCESS_CONFIGS = [
  ["benchmark", buildBenchmarkConfig()],
  ["large", buildLargeConfig()],
  ["sparse", buildSparseConfig()],
] as const;

describe("QreEngine conformance harness", () => {
  let validate: ReturnType<Ajv["compile"]>;

  beforeAll(() => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validate = ajv.compile(runResultSchema);
  });

  function expectSchemaValid(result: unknown, fixtureName: string): void {
    const valid = validate(result);
    if (!valid) {
      throw new Error(
        `Schema validation failed for ${fixtureName}: ${JSON.stringify(validate.errors, null, 2)}`,
      );
    }
  }

  for (const [label, config] of SUCCESS_CONFIGS) {
    it(`runs a real estimate and produces a schema-valid success for ${label}`, async () => {
      const engine = new QreEngine(PYTHON_BIN);
      const result = await engine.run(config);

      expectSchemaValid(result, label);
      expect(result.runId).toBe(config.id);
      expect(result.status).toBe("succeeded");
      expect(result.error).toBeNull();
      expect(result.frontier).not.toBeNull();
      expect(result.frontier!.length).toBeGreaterThanOrEqual(1);

      for (const row of result.frontier!) {
        for (const metric of [
          row.physicalQubits,
          row.runtime,
          row.logicalCycleTime,
          row.totalError,
          row.codeDistance,
        ]) {
          expect(Number.isFinite(metric.value)).toBe(true);
          expect(typeof metric.unit).toBe("string");
          expect(typeof metric.display).toBe("string");
        }
        expect(Array.isArray(row.factories.value)).toBe(true);
        expect(typeof row.factories.unit).toBe("string");
        expect(typeof row.factories.display).toBe("string");
        for (const factory of row.factories.value) {
          expect(typeof factory.stateType).toBe("string");
          expect(Number.isInteger(factory.copies)).toBe(true);
          expect(factory.copies).toBeGreaterThanOrEqual(0);
        }
      }
    }, 60000);
  }

  it("resolves the failing config as a schema-valid FAILED result, not a hang or rejection", async () => {
    const config = buildFailingConfig();
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(config);
    expectSchemaValid(result, "failing");
    expect(result.runId).toBe(config.id);
    expect(result.status).toBe("failed");
    expect(result.error).not.toBeNull();
    expect(result.frontier).toBeNull();
  }, 60000);
});
