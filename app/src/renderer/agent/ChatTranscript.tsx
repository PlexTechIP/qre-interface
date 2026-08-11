import { useEffect, useRef } from "react";

import type { GeneratedRunDraft } from "../../shared/agentTypes";
import type { ChatMessage } from "../../shared/chatTypes";
import { ARCHITECTURE_LABELS } from "../constants/labels";
import { findBenchmark } from "../constants/staticOptions";

interface ChatTranscriptProps {
  messages: readonly ChatMessage[];
  sending: boolean;
  onUseDraft: (message: ChatMessage) => void;
  /** A proposal this mapping refuses, reported on the card it belongs to. */
  draftError: { messageId: string; message: string } | null;
}

/**
 * A compact description of what a proposal actually is.
 *
 * Deliberately three lines, not forty. The exhaustive account of what the model
 * chose is `ModelProposalSummary`, which appears above the form after the
 * handoff and can point at the live controls; repeating it here would be a
 * second copy that says the same thing worse, in a scrolling transcript, with
 * no controls to point at.
 */
function describeDraft(draft: GeneratedRunDraft): { label: string; value: string }[] {
  const application =
    draft.application.type === "benchmark"
      ? (findBenchmark(draft.application.benchmarkId)?.name ?? draft.application.benchmarkId)
      : "Manual logical counts";
  return [
    ...(draft.name === null ? [] : [{ label: "Name", value: draft.name }]),
    { label: "Application", value: application },
    { label: "Architecture", value: ARCHITECTURE_LABELS[draft.architecture.type] },
  ];
}

export function ChatTranscript({
  messages,
  sending,
  onUseDraft,
  draftError,
}: ChatTranscriptProps): React.JSX.Element {
  const end = useRef<HTMLDivElement>(null);
  const newest = messages.at(-1)?.id ?? null;

  /**
   * Bring the newest turn into view.
   *
   * `scrollIntoView` on a sentinel rather than `scrollTop = scrollHeight` on the
   * list: the transcript is no longer its own scroll container — the page
   * scrolls — so there is no element here whose scrollTop means anything. The
   * sentinel works whichever ancestor is actually scrolling.
   *
   * Fires on OPEN too, because a conversation reopened from the list should
   * resume where it was left rather than at a question asked twenty turns ago.
   *
   * Not unit-tested: jsdom reports every element as 0×0 and implements
   * `scrollIntoView` as a no-op, so an assertion here would pass whatever the
   * code did. Verified in the running app instead.
   */
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [newest, sending]);

  return (
    <ol className="chat-transcript" aria-label="Transcript">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`chat-turn chat-turn--${message.role}`}
          /*
           * The role is on the element, not only in the styling, so a screen
           * reader is not left inferring who is speaking from indentation.
           */
          aria-label={message.role === "user" ? "You" : (message.model ?? "Assistant")}
        >
          <p className="chat-turn__who">
            {message.role === "user" ? "You" : (message.model ?? "Assistant")}
          </p>
          <p className="chat-turn__text">{message.text}</p>

          {message.draft === null ? null : (
            <div className="chat-draft">
              <h3 className="chat-draft__heading">Proposed configuration</h3>
              <dl className="chat-draft__fields">
                {describeDraft(message.draft).map((entry) => (
                  <div key={entry.label}>
                    <dt>{entry.label}</dt>
                    <dd>{entry.value}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="run-button agent-primary"
                onClick={() => onUseDraft(message)}
              >
                Use this configuration
              </button>
              <p className="chat-draft__note">
                Opens it in Run Configuration for review. Nothing runs until you say so.
              </p>
              {/*
                The proposal as it arrived. The same reflex as the outbound
                preview: the analyst is entitled to read the literal thing, not
                only this panel's account of it.
              */}
              <details className="chat-draft__raw">
                <summary>Show the proposal as JSON</summary>
                <pre>{JSON.stringify(message.draft, null, 2)}</pre>
              </details>
              {draftError?.messageId === message.id ? (
                <p className="agent-error" role="alert">
                  {draftError.message}
                </p>
              ) : null}
            </div>
          )}
        </li>
      ))}

      {sending ? (
        <li className="chat-turn chat-turn--assistant chat-turn--pending">
          <p className="chat-turn__who">Assistant</p>
          <p className="chat-turn__text" role="status">
            Thinking…
          </p>
        </li>
      ) : null}

      {/* The scroll target. Renders nothing; it only marks the end. */}
      <div ref={end} aria-hidden="true" />
    </ol>
  );
}
