import type { ResultsAreaProps } from "../../shared/types";
import type { RunState } from "../state/useRunFlow";
import { ResultsArea } from "../results/ResultsArea";
import { RunConfigInspector } from "./RunConfigInspector";

interface RunFlowPanelProps {
  runState: RunState;
  onRetry: () => void;
  onEdit: () => void;
}

/**
 * Team 1's chrome around the Results seam. It maps the run lifecycle to
 * `ResultsAreaProps`, hands them to the (debug) Results surface, and surfaces
 * the recovery affordances — Retry and Edit configuration — that keep any
 * failure from being a dead end. Retry/Edit are Team 1's, driven by run status.
 */
export function RunFlowPanel({
  runState,
  onRetry,
  onEdit,
}: RunFlowPanelProps): React.JSX.Element {
  if (runState.phase === "idle") {
    // Parent only mounts this panel for non-idle states; render nothing otherwise.
    return <></>;
  }

  // A schema-invalid config reaching the engine is a producer bug, not a failed
  // run — Run is gated on validity, so this is a defensive escape hatch.
  if (runState.phase === "rejected") {
    return (
      <section className="run-flow">
        <div className="run-flow__banner run-flow__banner--rejected" role="alert">
          <strong>Couldn't start the run.</strong>
          <p>{runState.message}</p>
        </div>
        <div className="run-flow__actions">
          <button type="button" className="run-button" onClick={onEdit}>
            Edit configuration
          </button>
        </div>
        <RunConfigInspector
          config={runState.config}
          valid={false}
          title="Serialized RunConfig (dev)"
          note="This config was rejected at the engine boundary."
        />
      </section>
    );
  }

  const props: ResultsAreaProps =
    runState.phase === "running"
      ? { result: null, phase: "running", config: runState.config }
      : { result: runState.result, phase: "done", config: runState.config };

  const failed =
    runState.phase === "done" && runState.result.status === "failed";
  const running = runState.phase === "running";

  return (
    <section className="run-flow">
      <ResultsArea {...props} />

      <div className="run-flow__actions">
        {failed && (
          <button
            type="button"
            className="run-button"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="run-button run-button--secondary"
          onClick={onEdit}
          disabled={running}
        >
          Edit configuration
        </button>
      </div>

      <RunConfigInspector
        config={runState.config}
        valid
        title="Serialized RunConfig (dev)"
        note="The exact config stamped at Run-click and sent to the engine."
      />
    </section>
  );
}
