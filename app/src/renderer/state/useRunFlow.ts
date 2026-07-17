/**
 * The Run flow: turns a valid draft into a stamped RunConfig, hands it to the
 * EstimatorService (MockEngine this week), and tracks the lifecycle the Results
 * seam consumes.
 *
 * `id`/`createdAt` are stamped here — only at Run-click, never while editing.
 * The engine RESOLVES with a failed RunResult on engine failure and REJECTS
 * only on programmer error (schema-invalid input reaching the boundary); Run is
 * gated on validity, so the rejected branch is defensive, not an expected path.
 */

import { useCallback, useState } from "react";

import type { RunConfig, RunResult } from "../../shared/types";
import { MockEngine, type MockEngineMode } from "../../shared/mockEngine";
import type { FormState } from "./formState";
import { toRunConfig, type RunStamp } from "./toRunConfig";

export type RunState =
  | { phase: "idle" }
  | { phase: "running"; config: RunConfig }
  | { phase: "done"; config: RunConfig; result: RunResult }
  | { phase: "rejected"; config: RunConfig; message: string };

export interface RunFlow {
  runState: RunState;
  /** Dev-only: which fixture the mock resolves with, for demoing the failure path. */
  engineMode: MockEngineMode;
  setEngineMode: (mode: MockEngineMode) => void;
  /** Serialize the draft, stamp it, and run. No-op if the draft can't serialize. */
  start: (state: FormState) => void;
  /** Re-run the last config under a fresh stamp (same configuration, new run). */
  retry: () => void;
  /** Return to the form to change the configuration. */
  edit: () => void;
}

function stamp(): RunStamp {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

export function useRunFlow(): RunFlow {
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  const [engineMode, setEngineMode] = useState<MockEngineMode>("success");

  const execute = useCallback(
    async (config: RunConfig, mode: MockEngineMode): Promise<void> => {
      setRunState({ phase: "running", config });
      try {
        const result = await new MockEngine({ mode }).run(config);
        setRunState({ phase: "done", config, result });
      } catch (err) {
        setRunState({
          phase: "rejected",
          config,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [],
  );

  const start = useCallback(
    (state: FormState): void => {
      const config = toRunConfig(state, stamp());
      if (config === null) return; // Run is gated on validity; unreachable in practice.
      void execute(config, engineMode);
    },
    [execute, engineMode],
  );

  const retry = useCallback((): void => {
    setRunState((prev) => {
      if (prev.phase === "idle") return prev;
      const config: RunConfig = { ...prev.config, ...stamp() };
      void execute(config, engineMode);
      return { phase: "running", config };
    });
  }, [execute, engineMode]);

  const edit = useCallback((): void => setRunState({ phase: "idle" }), []);

  return { runState, engineMode, setEngineMode, start, retry, edit };
}
