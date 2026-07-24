import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormatsRaw, { type FormatsPlugin } from "ajv-formats";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import type { RunConfig, RunResult } from "../../shared/types.js";
import { registerEstimatorHandler } from "../estimatorHandler.js";
import { QreEngine } from "./qreEngine.js";
import { resolvePythonBin } from "./pythonBin.js";

const addFormats = addFormatsRaw as unknown as FormatsPlugin;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../..");
const fixturesDir = path.join(repoRoot, "contracts", "fixtures");
const fixtureNames = [
  "runconfig.benchmark.json",
  "runconfig.failing.json",
  "runconfig.large.json",
  "runconfig.sparse.json",
] as const;

type RunHandler = (event: IpcMainInvokeEvent, config: RunConfig) => Promise<RunResult>;

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("estimator IPC conformance", () => {
  it.each(fixtureNames)("resolves a schema-valid result for %s", async (fixtureName) => {
    let runHandler: RunHandler | undefined;
    const ipcMain = {
      handle(_channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) {
        runHandler = async (event, config) => await listener(event, config) as RunResult;
      },
    } satisfies Pick<IpcMain, "handle">;

    registerEstimatorHandler(ipcMain, new QreEngine(resolvePythonBin()));
    expect(runHandler).toBeDefined();

    const config = loadJson<RunConfig>(path.join(fixturesDir, fixtureName));
    const result = await runHandler!({} as IpcMainInvokeEvent, config);
    const schema = loadJson<object>(path.join(repoRoot, "contracts", "runresult.schema.json"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(result), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(result.runId).toBe(config.id);
    if (fixtureName === "runconfig.failing.json") expect(result.status).toBe("failed");
  }, 60_000);
});
