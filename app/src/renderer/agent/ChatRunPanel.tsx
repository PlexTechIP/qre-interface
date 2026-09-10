import type { ResultsAreaProps } from "../../shared/types";
import { ResultsArea } from "../results/ResultsArea";
import type { RunState } from "../state/useRunFlow";

interface ChatRunPanelProps {
  runState: RunState;
  /** Clear a rejected run and return to the conversation. */
  onDismiss: () => void;
}

/**
 * A proposal running from the conversation, before the Results page takes over.
 *
 * Running a proposal behaves like the Configure page: on completion the shell
 * moves to Results and the run is saved to history. This covers only the
 * interval before that hand-off — the in-flight spinner, and the rare
 * engine-boundary rejection — so a run started here is never a button press
 * with no visible effect. The "done" phase paints nothing here: by then the
 * shell has already moved to Results.
 */
export function ChatRunPanel({
  runState,
  onDismiss,
}: ChatRunPanelProps): React.JSX.Element | null {
  if (runState.phase === "running") {
    const props: ResultsAreaProps = {
      result: null,
      phase: "running",
      config: runState.config,
    };
    return (
      <section className="chat-run" aria-label="Run">
        <ResultsArea {...props} />
      </section>
    );
  }

  if (runState.phase === "rejected") {
    return (
      <section className="chat-run" aria-label="Run">
        <div className="chat-run__banner" role="alert">
          <strong>Couldn&rsquo;t start the run.</strong>
          <p>{runState.message}</p>
        </div>
        <div className="chat-run__actions">
          <button type="button" className="agent-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  return null;
}
