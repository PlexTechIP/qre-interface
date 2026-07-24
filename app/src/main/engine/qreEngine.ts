import type {
  EstimatorService,
  RunConfig,
  RunResult,
} from "../../shared/types.js";
import { configToInvocation } from "./configToInvocation.js";
import { execute } from "./execute.js";
import { outputToResult } from "./outputToResult.js";

const DEFAULT_TIMEOUT_MS = 120_000;

export class QreEngine implements EstimatorService {
  constructor(
    private readonly pythonBin: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async run(config: RunConfig): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    try {
      const invocationResult = configToInvocation(config, this.timeoutMs);
      if (!invocationResult.ok) {
        return {
          schemaVersion: "1.0.0",
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
        schemaVersion: "1.0.0",
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
