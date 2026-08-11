/**
 * The Run flow: turns a valid draft into a stamped RunConfig, hands it to the
 * EstimatorService over the preload bridge, and tracks the lifecycle the Results
 * seam consumes.
 *
 * `id`/`createdAt` are stamped here — only at Run-click, never while editing.
 * The engine RESOLVES with a failed RunResult on engine failure and REJECTS
 * only on programmer error (schema-invalid input reaching the boundary); Run is
 * gated on validity, so the rejected branch is defensive, not an expected path.
 */

import { useCallback, useState } from "react";

import type {
  EstimatorService,
  RunConfig,
  RunProvenance,
  RunResult,
  RunStore,
} from "../../shared/types";
import { makeRunRecord } from "../../shared/types";
import type { FormState } from "./formState";
import { toRunConfig, type RunStamp } from "./toRunConfig";

export type RunState =
  | { phase: "idle" }
  | { phase: "running"; config: RunConfig }
  | { phase: "done"; config: RunConfig; result: RunResult }
  | { phase: "rejected"; config: RunConfig; message: string };

export interface RunFlow {
  runState: RunState;
  /** Serialize the draft, stamp it, and run. No-op if the draft can't serialize. */
  start: (state: FormState, provenance?: RunProvenance) => void;
  /** Re-run the last config under a fresh stamp (same configuration, new run). */
  retry: () => void;
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

function getEstimator(): Pick<EstimatorService, "run"> {
  return window.estimator;
}

function getRunStore(): RunStore {
  return window.store;
}

export function useRunFlow(
  estimator: Pick<EstimatorService, "run"> = getEstimator(),
  store: RunStore = getRunStore(),
): RunFlow {
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });

  const execute = useCallback(
    async (config: RunConfig): Promise<void> => {
      setRunState({ phase: "running", config });
      try {
        const result = await estimator.run(config);
        setRunState({ phase: "done", config, result });
        // Save-after-run: persist every completed run (succeeded OR failed) as an
        // immutable record, so it appears in Run History. `makeRunRecord` keys the
        // record by config.id and requires result.runId === config.id (both engines
        // guarantee this). A persistence failure must never break the results view.
        try {
          await store.save(makeRunRecord(config, result, new Date().toISOString()));
        } catch (saveErr) {
          console.error("Failed to save run to history:", saveErr);
        }
      } catch (err) {
        setRunState({
          phase: "rejected",
          config,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [estimator, store],
  );

  const start = useCallback(
    (state: FormState, provenance?: RunProvenance): void => {
      // Provenance goes IN through the stamp rather than onto the result
      // afterwards. The Run gate validates `toRunConfig(state, stamp)`, so a
      // field assigned after that call is a field the gate never inspected —
      // the object approved and the object executed have to be the same one.
      const config = toRunConfig(state, stamp(provenance));
      if (config === null) return; // Run is gated on validity; unreachable in practice.
      void execute(config);
    },
    [execute],
  );

  const retry = useCallback((): void => {
    setRunState((prev) => {
      if (prev.phase === "idle") return prev;
      const config: RunConfig = { ...prev.config, ...stamp() };
      void execute(config);
      return { phase: "running", config };
    });
  }, [execute]);

  const edit = useCallback((): void => setRunState({ phase: "idle" }), []);

  return { runState, start, retry, edit };
}
