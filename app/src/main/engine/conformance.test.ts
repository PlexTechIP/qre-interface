import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import addFormatsRaw from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";
import { QreEngine } from "./qreEngine.js";
import type { RunConfig } from "../../shared/types.js";

// ajv-formats' type declarations aren't written for TS's NodeNext/ESM CJS-interop
// analysis, so the default import resolves to the raw CJS module namespace type
// instead of the callable plugin. The runtime value is correct (proven by the
// tests below actually invoking addFormats); this cast only restores the static
// type that ajv-formats' own .d.ts already declares (FormatsPlugin).
const addFormats = addFormatsRaw as unknown as FormatsPlugin;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// app/src/main/engine -> app/src/main -> app/src -> app -> repo root (4 levels up).
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function loadFixture<T>(name: string): T {
  const p = path.join(REPO_ROOT, "contracts", "fixtures", name);
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

const FIXTURES = [
  "runconfig.benchmark.json",
  "runconfig.large.json",
  "runconfig.sparse.json",
  "runconfig.failing.json",
] as const;

describe("QreEngine conformance harness", () => {
  let validate: ReturnType<Ajv["compile"]>;

  beforeAll(() => {
    const schema = JSON.parse(readFileSync(path.join(REPO_ROOT, "contracts", "runresult.schema.json"), "utf-8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  for (const fixtureName of FIXTURES) {
    it(`produces a schema-valid RunResult for ${fixtureName}`, async () => {
      const config = loadFixture<RunConfig>(fixtureName);
      const engine = new QreEngine(PYTHON_BIN);
      const result = await engine.run(config);

      const valid = validate(result);
      if (!valid) {
        throw new Error(`Schema validation failed for ${fixtureName}: ${JSON.stringify(validate.errors, null, 2)}`);
      }
      expect(result.runId).toBe(config.id);
    }, 60000);
  }

  it("resolves the failing fixture as a schema-valid FAILED result, not a hang or rejection", async () => {
    const config = loadFixture<RunConfig>("runconfig.failing.json");
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(config);
    expect(result.status).toBe("failed");
    expect(result.error).not.toBeNull();
    expect(result.frontier).toBeNull();
  }, 60000);
});
