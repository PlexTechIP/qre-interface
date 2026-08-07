// @vitest-environment jsdom
/**
 * Save-after-run: a completed run must be persisted to the store so it appears in
 * Run History. These drive the real hook with an injected store + fake estimator.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFailedResult, buildSuccessResult, fakeEstimator } from "../../shared/testing";
import { InMemoryRunStore } from "../../shared/runStore";
import { createInitialFormState, type FormState } from "./formState";
import { useRunFlow } from "./useRunFlow";

afterEach(() => vi.restoreAllMocks());

/** A structurally complete draft (the two required GateBased times are filled). */
function filledForm(): FormState {
  const base = createInitialFormState();
  return {
    ...base,
    architecture: {
      ...base.architecture,
      gateBased: {
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
    },
  };
}

describe("useRunFlow save-after-run", () => {
  it("adds model provenance only when the normal Run action stamps the config", async () => {
    const store = new InMemoryRunStore();
    const { result } = renderHook(() =>
      useRunFlow(fakeEstimator(buildSuccessResult()), store),
    );
    const draft = filledForm();
    expect(draft).not.toHaveProperty("provenance");

    act(() =>
      result.current.start(draft, {
        authoredBy: "model_assisted",
        model: "provider/model",
      }),
    );

    await waitFor(async () => expect(await store.list()).toHaveLength(1));
    const [saved] = await store.list();
    expect(saved?.config.provenance).toEqual({
      authoredBy: "model_assisted",
      model: "provider/model",
    });
    expect(saved?.config.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved?.config.createdAt).toBeTruthy();
  });

  it("persists a completed run to the store, keyed by the run's config id", async () => {
    const store = new InMemoryRunStore();
    const { result } = renderHook(() =>
      useRunFlow(fakeEstimator(buildSuccessResult()), store),
    );

    act(() => result.current.start(filledForm()));

    await waitFor(async () => expect(await store.list()).toHaveLength(1));

    const runState = result.current.runState;
    expect(runState.phase).toBe("done");
    const [saved] = await store.list();
    if (runState.phase === "done") {
      expect(saved?.id).toBe(runState.config.id);
      expect(saved?.result.runId).toBe(runState.config.id);
      expect(saved?.result.status).toBe("succeeded");
    }
  });

  it("persists a failed run as well (a failure is a real history record)", async () => {
    const store = new InMemoryRunStore();
    const { result } = renderHook(() =>
      useRunFlow(fakeEstimator(buildFailedResult()), store),
    );

    act(() => result.current.start(filledForm()));

    await waitFor(async () => expect(await store.list()).toHaveLength(1));
    const [saved] = await store.list();
    expect(saved?.result.status).toBe("failed");
  });

  it("a save failure is logged but never breaks the results view", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryRunStore();
    vi.spyOn(store, "save").mockRejectedValue(new Error("disk full"));

    const { result } = renderHook(() =>
      useRunFlow(fakeEstimator(buildSuccessResult()), store),
    );

    act(() => result.current.start(filledForm()));

    // The run still reaches "done" and renders, despite the persistence failure.
    await waitFor(() => expect(result.current.runState.phase).toBe("done"));
    expect(consoleError).toHaveBeenCalled();
  });
});
