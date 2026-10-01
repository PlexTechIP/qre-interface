/**
 * The Run flow: turns a valid draft into a stamped RunConfig, hands it to the
 * EstimatorService over the preload bridge, and tracks the lifecycle the Results
 * seam consumes.
 *
 * `id`/`createdAt` are stamped here — only at Run-click, never while editing.
 * The engine RESOLVES with a failed RunResult on engine failure and REJECTS
 * only on programmer error (schema-invalid input reaching the boundary); Run is
 * gated on validity, so the rejected branch is defensive, not an expected path.
 *
 * Recording the run in history is NOT done here. Main saves every run before
 * it replies (main/estimatorHandler.ts): saving here, after the reply, lost the
 * run whenever the page was not there to receive it — a reload mid-run, or a
 * page that had unmounted.
 */

import { useCallback, useRef, useState } from "react";

import type {
  EstimatorBridge,
  RunConfig,
  RunProvenance,
  RunResult,
} from "../../shared/types";
import type { FormState } from "./formState";
import { toRunConfig, type RunStamp } from "./toRunConfig";

export type RunState =
  | { phase: "idle" }
  | { phase: "running"; config: RunConfig }
  | { phase: "done"; config: RunConfig; result: RunResult }
  | { phase: "rejected"; config: RunConfig; message: string };

/**
 * What the caller that started a run wants to hear about it.
 *
 * These ride on the run itself — they are called from the promise, not from an
 * effect watching `runState` — so they still fire when the page that started
 * the run has unmounted. Reporting completion from an effect is what used to
 * lose a run the moment the analyst navigated away from it.
 */
export interface RunHooks {
  onStarted?: (config: RunConfig) => void;
  onSettled?: (config: RunConfig, result: RunResult) => void;
  /** The defensive programmer-error path: the run never reached a result. */
  onRejected?: (config: RunConfig) => void;
  /** The analyst stopped the run; it will not be recorded. */
  onCancelled?: (config: RunConfig) => void;
}

export interface RunFlow {
  runState: RunState;
  /** Serialize the draft, stamp it, and run. No-op if the draft can't serialize. */
  start: (state: FormState, provenance?: RunProvenance, hooks?: RunHooks) => void;
  /** Re-run the last config under a fresh stamp (same configuration, new run). */
  retry: (hooks?: RunHooks) => void;
  /** Stop the run in flight and return to the form. Its result is never shown. */
  cancel: () => void;
  /** Return to the form to change the configuration. */
  edit: () => void;
}

function stamp(provenance?: RunProvenance): RunStamp {
  const next: RunStamp = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  // Omitted rather than written as undefined, so `retry`'s spread below cannot
  // erase the provenance the previous config carried.
  if (provenance !== undefined) next.provenance = provenance;
  return next;
}

function getEstimator(): EstimatorBridge {
  return window.estimator;
}

export function useRunFlow(estimator: EstimatorBridge = getEstimator()): RunFlow {
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  /**
   * The last config run, for Retry — read from a ref, not from inside a
   * `setRunState` updater. An updater must be pure: React calls it twice under
   * StrictMode, and starting the run from one ran every Retry twice in dev.
   */
  const lastConfig = useRef<RunConfig | null>(null);
  /** The run in flight, if any — cleared by Cancel, so its reply is ignored. */
  const inFlight = useRef<{ config: RunConfig; hooks: RunHooks } | null>(null);

  const execute = useCallback(
    async (config: RunConfig, hooks: RunHooks = {}): Promise<void> => {
      lastConfig.current = config;
      inFlight.current = { config, hooks };
      setRunState({ phase: "running", config });
      hooks.onStarted?.(config);
      let result: RunResult;
      try {
        // Resolves once main has run the estimate AND recorded it in history.
        result = await estimator.run(config);
      } catch (err) {
        if (inFlight.current?.config.id !== config.id) return;
        inFlight.current = null;
        setRunState({
          phase: "rejected",
          config,
          message: err instanceof Error ? err.message : String(err),
        });
        hooks.onRejected?.(config);
        return;
      }
      // Cancelled (or superseded) while running: nobody is waiting on this one.
      if (inFlight.current?.config.id !== config.id) return;
      inFlight.current = null;
      setRunState({ phase: "done", config, result });
      hooks.onSettled?.(config, result);
    },
    [estimator],
  );

  const cancel = useCallback((): void => {
    const running = inFlight.current;
    if (running === null) return;
    inFlight.current = null;
    void estimator.cancel?.(running.config.id);
    setRunState({ phase: "idle" });
    running.hooks.onCancelled?.(running.config);
  }, [estimator]);

  const start = useCallback(
    (state: FormState, provenance?: RunProvenance, hooks?: RunHooks): void => {
      // Provenance goes IN through the stamp rather than onto the result
      // afterwards. The Run gate validates `toRunConfig(state, stamp)`, so a
      // field assigned after that call is a field the gate never inspected —
      // the object approved and the object executed have to be the same one.
      const config = toRunConfig(state, stamp(provenance));
      if (config === null) return; // Run is gated on validity; unreachable in practice.
      void execute(config, hooks);
    },
    [execute],
  );

  const retry = useCallback(
    (hooks?: RunHooks): void => {
      if (lastConfig.current === null) return;
      void execute({ ...lastConfig.current, ...stamp() }, hooks);
    },
    [execute],
  );

  const edit = useCallback((): void => setRunState({ phase: "idle" }), []);

  return { runState, start, retry, cancel, edit };
}
