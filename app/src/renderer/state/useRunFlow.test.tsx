// @vitest-environment jsdom
/**
 * The run flow stamps the config, hands it to the estimator, and tracks the
 * lifecycle. Recording the run in history is the estimator boundary's job —
 * main saves before it replies (see main/estimatorHandler.ts) — so a renderer
 * that is not there for the reply cannot lose the run. These drive the real
 * hook with a fake estimator.
 */
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFailedResult, buildSuccessResult, fakeEstimator } from "../../shared/testing";
import { InMemoryRunStore, withNoChangeSource } from "../../shared/runStore";
import type { RunConfig } from "../../shared/types";
import { createInitialFormState } from "./formState";
import { useRunFlow } from "./useRunFlow";

afterEach(() => vi.restoreAllMocks());

describe("useRunFlow", () => {
  it("adds model provenance only when the normal Run action stamps the config", async () => {
    const run = vi.fn(fakeEstimator(buildSuccessResult()).run);
    const { result } = renderHook(() => useRunFlow({ run }));
    const draft = createInitialFormState();
    expect(draft).not.toHaveProperty("provenance");

    act(() =>
      result.current.start(draft, {
        authoredBy: "model_assisted",
        model: "provider/model",
      }),
    );

    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    const sent = run.mock.calls[0]?.[0] as RunConfig;
    expect(sent.provenance).toEqual({
      authoredBy: "model_assisted",
      model: "provider/model",
    });
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sent.createdAt).toBeTruthy();
  });

  it("leaves recording the run to the estimator boundary", async () => {
    const store = new InMemoryRunStore();
    window.store = withNoChangeSource(store);
    const { result } = renderHook(() => useRunFlow(fakeEstimator(buildSuccessResult())));

    act(() => result.current.start(createInitialFormState()));

    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    expect(await store.list()).toEqual([]);
  });

  /**
   * Retry used to start the run from inside a state updater. React runs
   * updaters twice under StrictMode to flush out exactly that, so in dev every
   * Retry ran the estimate twice and recorded two runs.
   */
  it("re-runs exactly once on Retry, even under StrictMode", async () => {
    const run = vi.fn(fakeEstimator(buildFailedResult()).run);
    const { result } = renderHook(() => useRunFlow({ run }), { wrapper: StrictMode });

    act(() => result.current.start(createInitialFormState()));
    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports a run's start and finish to the caller that started it", async () => {
    const onStarted = vi.fn();
    const onSettled = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRunFlow(fakeEstimator(buildSuccessResult(), { delayMs: 20 })),
    );

    act(() => result.current.start(createInitialFormState(), undefined, { onStarted, onSettled }));
    expect(onStarted).toHaveBeenCalledTimes(1);
    // The page that started the run is gone before the run finishes: the
    // caller still hears about it, because the report rides on the run itself.
    unmount();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    const [config, settled] = onSettled.mock.calls[0] as [RunConfig, { status: string }];
    expect(config.id).toBe((onStarted.mock.calls[0]?.[0] as RunConfig).id);
    expect(settled.status).toBe("succeeded");
  });

  /**
   * A large estimate runs for minutes, and there was no way to stop one: the
   * running panel's only control was a disabled "Edit configuration".
   */
  it("returns to the form at once on Cancel, and tells the estimator to stop", async () => {
    const cancel = vi.fn(async () => {});
    const estimator = { ...fakeEstimator(buildSuccessResult(), { delayMs: 60 }), cancel };
    const onSettled = vi.fn();
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useRunFlow(estimator));

    act(() =>
      result.current.start(createInitialFormState(), undefined, { onSettled, onCancelled }),
    );
    const running = result.current.runState;
    act(() => result.current.cancel());

    expect(result.current.runState.phase).toBe("idle");
    expect(cancel).toHaveBeenCalledWith(running.phase === "running" ? running.config.id : "");
    expect(onCancelled).toHaveBeenCalledTimes(1);
    // The estimator's reply, when it does come, is for a run nobody is waiting on.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.current.runState.phase).toBe("idle");
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("delivers a failed run as a finished one", async () => {
    const { result } = renderHook(() => useRunFlow(fakeEstimator(buildFailedResult())));

    act(() => result.current.start(createInitialFormState()));

    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    const runState = result.current.runState;
    expect(runState.phase === "done" && runState.result.status).toBe("failed");
  });
});
