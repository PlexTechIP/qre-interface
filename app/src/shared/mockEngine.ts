/**
 * Week-2 MockEngine — the stand-in behind EstimatorService.
 *
 * TEMPORARY: week 3 replaces this with Team 3's QreEngine behind the same
 * interface. UI code must talk only to EstimatorService, never to this class
 * or to the fixtures directly, so that swap costs nothing.
 *
 * Behaviour is specified in the week-2 Team 1 technical brief:
 *   - validates input against the committed runconfig.schema.json (Ajv)
 *   - REJECTS on schema-invalid input (programmer error, per types.ts)
 *   - waits ~2s so the running state is visible
 *   - resolves with a committed fixture, cloned, with runId/timestamps stamped
 */

import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import runConfigSchema from "./contracts/runconfig.schema.json";
import failedFixture from "./contracts/fixtures/runresult.failed.json";
import successFixture from "./contracts/fixtures/runresult.success.json";
import type {
  EstimatorService,
  RunConfig,
  RunResult,
} from "./types";

/** Which fixture the mock resolves with. */
export type MockEngineMode = "success" | "failed";

export interface MockEngineOptions {
  /** Default: "success". */
  mode?: MockEngineMode;
  /** Simulated engine latency in ms. Default: 2000. */
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 2000;

// Compiled once at module load — compilation is expensive, validation is not.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateRunConfig: ValidateFunction = ajv.compile(runConfigSchema);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thrown when a config reaching the boundary does not satisfy the contract
 * schema. This is a bug in the producer, not a failed run — a real engine
 * would not accept off-contract input either.
 */
export class SchemaValidationError extends Error {
  constructor(public readonly errors: string) {
    super(`RunConfig failed contract schema validation:\n${errors}`);
    this.name = "SchemaValidationError";
  }
}

export class MockEngine implements EstimatorService {
  private readonly mode: MockEngineMode;
  private readonly delayMs: number;

  constructor(options: MockEngineOptions = {}) {
    this.mode = options.mode ?? "success";
    this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  }

  async run(config: RunConfig): Promise<RunResult> {
    if (!validateRunConfig(config)) {
      throw new SchemaValidationError(
        ajv.errorsText(validateRunConfig.errors, { separator: "\n" }),
      );
    }

    const startedAt = new Date().toISOString();
    await delay(this.delayMs);
    const completedAt = new Date().toISOString();

    // Clone so repeated runs never mutate the imported fixture.
    const fixture = structuredClone(
      this.mode === "failed" ? failedFixture : successFixture,
    ) as RunResult;

    return {
      ...fixture,
      runId: config.id,
      startedAt,
      completedAt,
    };
  }
}