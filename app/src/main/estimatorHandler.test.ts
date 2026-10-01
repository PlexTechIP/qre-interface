// @vitest-environment node

/**
 * The estimator boundary records every run before it replies.
 *
 * Recording used to be the renderer's job, done after the reply arrived. A
 * renderer that was not there to receive it — reloaded mid-run, or a page that
 * had unmounted — meant the engine's work was done and then dropped: the run
 * never reached history. Main is the process that outlives both, so it saves.
 */

import { describe, expect, it, vi } from "vitest";

import { InMemoryRunStore } from "../shared/runStore";
import { buildFailedResult, buildRunConfig, buildSuccessResult } from "../shared/testing";
import type { EstimatorService, RunConfig, RunResult } from "../shared/types";
import { registerEstimatorHandler } from "./estimatorHandler";
import { ESTIMATOR_CANCEL_CHANNEL, ESTIMATOR_RUN_CHANNEL } from "./ipcChannels";

type Handler = (event: unknown, config: RunConfig) => Promise<RunResult>;
type CancelHandler = (event: unknown, runId: string) => Promise<void>;

/** Registers the handlers against a stand-in ipcMain and returns them. */
function registerBoth(
  engine: Pick<EstimatorService, "run">,
  recorder: Parameters<typeof registerEstimatorHandler>[2],
): { run: Handler; cancel: CancelHandler } {
  let run: Handler | undefined;
  let cancel: CancelHandler | undefined;
  registerEstimatorHandler(
    {
      handle: (channel: string, listener: Handler & CancelHandler) => {
        if (channel === ESTIMATOR_RUN_CHANNEL) run = listener;
        if (channel === ESTIMATOR_CANCEL_CHANNEL) cancel = listener;
      },
    } as never,
    engine,
    recorder,
  );
  if (!run || !cancel) throw new Error("The estimator handlers were not registered.");
  return { run, cancel };
}

function register(
  engine: Pick<EstimatorService, "run">,
  recorder: Parameters<typeof registerEstimatorHandler>[2],
): Handler {
  return registerBoth(engine, recorder).run;
}

/** An engine that runs until its signal is aborted, like a long estimate. */
function engineUntilAborted(): Pick<EstimatorService, "run"> {
  return {
    run: (config, options) =>
      new Promise((resolve) => {
        options?.signal?.addEventListener("abort", () =>
          resolve({ ...buildFailedResult(), runId: config.id }),
        );
      }),
  };
}

/** An engine that answers with `result`, stamped for this config. */
function engineReturning(result: RunResult): Pick<EstimatorService, "run"> {
  return {
    run: async (config) => ({ ...structuredClone(result), runId: config.id }),
  };
}

describe("the estimator IPC handler", () => {
  it("records a finished run in history before it replies", async () => {
    const store = new InMemoryRunStore();
    const run = register(engineReturning(buildSuccessResult()), { store });
    const config = buildRunConfig();

    const result = await run({}, config);

    const [saved] = await store.list();
    expect(saved?.id).toBe(config.id);
    expect(saved?.result).toEqual(result);
    expect(saved?.savedAt).toBeTruthy();
  });

  it("records a failed run as well, since a failure is a real history record", async () => {
    const store = new InMemoryRunStore();
    const run = register(engineReturning(buildFailedResult()), { store });

    await run({}, buildRunConfig());

    const [saved] = await store.list();
    expect(saved?.result.status).toBe("failed");
  });

  it("records the boundary failure when the engine throws", async () => {
    const store = new InMemoryRunStore();
    const run = register(
      { run: async () => Promise.reject(new Error("python missing")) },
      { store },
    );

    const result = await run({}, buildRunConfig());

    expect(result.status).toBe("failed");
    expect(await store.list()).toHaveLength(1);
  });

  it("tells listeners once the run is recorded", async () => {
    const store = new InMemoryRunStore();
    const onRecorded = vi.fn();
    const run = register(engineReturning(buildSuccessResult()), { store, onRecorded });

    await run({}, buildRunConfig());

    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("stops the engine run when the analyst cancels it", async () => {
    const store = new InMemoryRunStore();
    const { run, cancel } = registerBoth(engineUntilAborted(), { store });
    const config = buildRunConfig();

    const pending = run({}, config);
    await cancel({}, config.id);

    // Settles because the engine was told to stop — it would otherwise never.
    await expect(pending).resolves.toMatchObject({ runId: config.id });
  });

  it("does not record a run the analyst cancelled", async () => {
    const store = new InMemoryRunStore();
    const onRecorded = vi.fn();
    const { run, cancel } = registerBoth(engineUntilAborted(), { store, onRecorded });
    const config = buildRunConfig();

    const pending = run({}, config);
    await cancel({}, config.id);
    await pending;

    expect(await store.list()).toEqual([]);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("ignores a cancel for a run that is not in flight", async () => {
    const { cancel } = registerBoth(engineReturning(buildSuccessResult()), {
      store: new InMemoryRunStore(),
    });

    await expect(cancel({}, "not-a-running-id")).resolves.toBeUndefined();
  });

  it("still replies with the result when recording fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryRunStore();
    vi.spyOn(store, "save").mockRejectedValue(new Error("disk full"));
    const onRecorded = vi.fn();
    const run = register(engineReturning(buildSuccessResult()), { store, onRecorded });

    const result = await run({}, buildRunConfig());

    expect(result.status).toBe("succeeded");
    expect(onRecorded).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
