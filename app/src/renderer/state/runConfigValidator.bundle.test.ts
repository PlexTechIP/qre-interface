/**
 * The precompiled validator, run the way the shipped renderer runs it: bundled
 * by Vite and executed by a plain JavaScript host.
 *
 * The other schema tests import `runConfigValidator.generated.js` through
 * Vitest, whose CommonJS interop unwraps one level further than the bundler
 * does. So the generator once emitted a call that resolved to a function under
 * Vitest and to `{ default: fn }` in the production bundle: every test stayed
 * green while the packaged app went blank ("_r is not a function") the moment
 * the form held a config complete enough to reach a string-length check.
 *
 * A child process rather than an in-test import, so Vitest's module loader —
 * the thing that hid the bug — is not in the path at all.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, type Rollup } from "vite";

import { buildRunConfig } from "../../shared/testing/builders";

// `__dirname`, not `import.meta.url`: under this project's jsdom environment
// the latter is an http URL, which no filesystem API accepts.
const VALIDATOR = path.join(__dirname, "runConfigValidator.generated.js");

let directory: string;
let harness: string;

beforeAll(async () => {
  const output = (await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry: VALIDATOR, formats: ["es"], fileName: "validator" },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const bundle = (Array.isArray(output) ? output[0] : output)?.output[0]?.code;
  if (bundle === undefined) throw new Error("Vite produced no validator bundle.");

  directory = mkdtempSync(path.join(tmpdir(), "qre-validator-bundle-"));
  writeFileSync(path.join(directory, "validator.mjs"), bundle);
  harness = path.join(directory, "harness.mjs");
  writeFileSync(
    harness,
    [
      'import validate from "./validator.mjs";',
      "const valid = validate(JSON.parse(process.argv[2]));",
      "process.stdout.write(JSON.stringify({ valid, errors: validate.errors ?? [] }));",
    ].join("\n"),
  );
}, 60_000);

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function validateBundled(config: unknown): { valid: boolean; errors: unknown[] } {
  const stdout = execFileSync(process.execPath, [harness, JSON.stringify(config)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout) as { valid: boolean; errors: unknown[] };
}

describe("the bundled RunConfig validator", () => {
  it("validates a complete config without throwing", () => {
    expect(validateBundled(buildRunConfig())).toEqual({ valid: true, errors: [] });
  });

  it("reports, rather than throws on, a string that fails its length check", () => {
    const result = validateBundled(buildRunConfig({ name: "" }));

    expect(result.valid).toBe(false);
  });
});
