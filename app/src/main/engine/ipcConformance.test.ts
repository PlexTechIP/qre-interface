import Ajv from "ajv";
import addFormatsRaw, { type FormatsPlugin } from "ajv-formats";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import type { RunConfig, RunResult } from "../../shared/types.js";
import { registerEstimatorHandler } from "../estimatorHandler.js";
import { QreEngine } from "./qreEngine.js";
import { resolvePythonBin } from "./pythonBin.js";
import runResultSchema from "../../shared/contracts/runresult.schema.json";
import {
  buildBenchmarkConfig,
  buildFailingConfig,
  buildLargeConfig,
  buildSparseConfig,
} from "../../shared/testing/index.js";

const addFormats = addFormatsRaw as unknown as FormatsPlugin;
const scenarios = [
  ["benchmark", buildBenchmarkConfig()],
  ["failing", buildFailingConfig()],
  ["large", buildLargeConfig()],
  ["sparse", buildSparseConfig()],
] as const;

type RunHandler = (event: IpcMainInvokeEvent, config: RunConfig) => Promise<RunResult>;

describe("estimator IPC conformance", () => {
  it.each(scenarios)("resolves a schema-valid result for %s", async (label, config) => {
    let runHandler: RunHandler | undefined;
    const ipcMain = {
      handle(_channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) {
        runHandler = async (event, cfg) => await listener(event, cfg) as RunResult;
      },
    } satisfies Pick<IpcMain, "handle">;

    registerEstimatorHandler(ipcMain, new QreEngine(resolvePythonBin()));
    expect(runHandler).toBeDefined();

    const result = await runHandler!({} as IpcMainInvokeEvent, config);
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(runResultSchema);

    expect(validate(result), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(result.runId).toBe(config.id);
    if (label === "failing") expect(result.status).toBe("failed");
  }, 60_000);
});
