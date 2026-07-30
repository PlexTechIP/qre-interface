import type {
  EstimatorService,
  RunConfig,
  RunResult,
} from "../../shared/types.js";
import { configToInvocation } from "./configToInvocation.js";
import { execute } from "./execute.js";
import { outputToResult } from "./outputToResult.js";
import { preflightUploadedProgram } from "./uploadValidation.js";

const DEFAULT_TIMEOUT_MS = 120_000;

export class QreEngine implements EstimatorService {
  constructor(
    private readonly pythonBin: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async run(config: RunConfig): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    try {
      // Pre-flight uploaded programs before the engine spawns: a missing,
      // unreadable, wrong-extension, or obviously-not-this-format file yields a
      // clear INVALID_CONFIG here instead of a slow COMPILE_ERROR from the
      // compiler three seconds later.
      if (config.application.type === "uploaded") {
        const preflight = await preflightUploadedProgram(
          config.application.filePath,
          config.application.format,
        );
        if (!preflight.ok) {
          return {
            schemaVersion: "1.1.0",
            runId: config.id,
            status: "failed",
            error: { code: preflight.code, message: preflight.message },
            frontier: null,
            raw: null,
            qreVersion: config.qreVersion,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }
      }

      const invocationResult = configToInvocation(config, this.timeoutMs);
      if (!invocationResult.ok) {
        return {
          schemaVersion: "1.1.0",
          runId: config.id,
          status: "failed",
          error: invocationResult.error,
          frontier: null,
          raw: null,
          qreVersion: config.qreVersion,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      const executeResult = await execute(
        invocationResult.invocation,
        this.pythonBin,
      );
      return outputToResult(
        config,
        executeResult,
        startedAt,
        new Date().toISOString(),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        schemaVersion: "1.1.0",
        runId: config.id,
        status: "failed",
        error: {
          code: "ENGINE_CRASH",
          message: `Unexpected engine adapter failure: ${detail}. Verify the Python environment and retry.`,
        },
        frontier: null,
        raw: null,
        qreVersion: config.qreVersion,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }
}
