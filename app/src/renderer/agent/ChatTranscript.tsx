import { useEffect, useMemo, useRef } from "react";

import type { GeneratedRunDraft } from "../../shared/agentTypes";
import type { ChatMessage } from "../../shared/chatTypes";
import { ARCHITECTURE_LABELS } from "../constants/labels";
import { applicationLabel } from "../history/historyLabels";
import { CopyButton } from "./CopyButton";

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
 * no controls to point at. Anyone who wants the literal thing has the JSON
 * disclosure below, which is now one click from the clipboard.
 */
function describeDraft(draft: GeneratedRunDraft): { label: string; value: string }[] {
  // `applicationLabel` rather than a second benchmark lookup: History, the run
  // export and the comparison table all name an application through it, and a
  // benchmark renamed in the registry must not read one way here and another
  // way three screens later. It takes the `application` field, which a draft
  // carries in exactly the RunConfig shape.
  const application = applicationLabel({ application: draft.application } as Parameters<
    typeof applicationLabel
  >[0]);
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
  const list = useRef<HTMLOListElement>(null);
  const newest = messages.at(-1)?.id ?? null;

  /**
   * The one proposal that is still the conversation's answer.
   *
   * Every card rendered identically before this, each with its own live "Use
   * this configuration" — so in a thread where the analyst had said "not that
   * one, the other one", the REJECTED proposal was still sitting there, one
   * click from the form and indistinguishable from the one they had asked for.
   * Nothing in the UI said which was current, and the two differ by a single
   * field an analyst is not obliged to remember.
   */
  const newestProposal = useMemo(() => {
    // Backwards to the first hit rather than `filter(...).at(-1)`, which built
    // and threw away a whole array to read one id — on every keystroke, since
    // this component re-renders with the page.
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate !== undefined && candidate.draft !== null) return candidate.id;
    }
    return null;
  }, [messages]);

  /**
   * Bring the newest turn into view — but only when it is not already there.
   *
   * The last `<li>` is the target, not a sentinel element. A sentinel `<div>`
   * was invalid inside an `<ol>` and, being a flex child of a `gap: 28px`
   * column, rendered as 28px of unexplained space at the end of every
   * transcript.
   *
   * The visibility check is what stops this being a nuisance: `scrollIntoView`
   * moves the WINDOW now that the page is the scroll container, so opening a
   * two-message conversation that already fits used to scroll the page heading
   * and the provider panel off the top for no benefit.
   *
   * Not unit-tested: jsdom reports every element as 0×0 and implements
   * `scrollIntoView` as a no-op, so an assertion here would pass whatever the
   * code did. Verified in the running app instead.
   */
  useEffect(() => {
    const target = list.current?.lastElementChild;
    if (!(target instanceof HTMLElement)) return;
    const box = target.getBoundingClientRect();
    const alreadyVisible = box.top >= 0 && box.bottom <= window.innerHeight;
    if (!alreadyVisible) target.scrollIntoView({ block: "end" });
  }, [newest, sending]);

  return (
    <ol className="chat-transcript" aria-label="Transcript" ref={list}>
      {messages.map((message) => {
        const proposal = message.draft;
        const superseded = proposal !== null && message.id !== newestProposal;
        // Once. It was serialised for the `<pre>` and again for the copy button,
        // for every proposal in the thread, on every render.
        const proposalJson = proposal === null ? null : JSON.stringify(proposal, null, 2);
        return (
          <li
            key={message.id}
            className={`chat-turn chat-turn--${message.role}`}
            /*
             * No `aria-label` here. It duplicated the visible speaker line
             * directly below it, so every turn was announced "You … You …", and
             * `aria-label` on a `listitem` is honoured inconsistently anyway. The
             * visible label does the job on its own.
             */
          >
            <p className="chat-turn__who">
              {message.role === "user" ? "You" : (message.model ?? "Assistant")}
            </p>
            <p className="chat-turn__text">{message.text}</p>

            {proposal === null ? null : (
              <div className={`chat-draft${superseded ? " chat-draft--superseded" : ""}`}>
                <h3 className="chat-draft__heading">Proposed configuration</h3>
                <dl className="chat-draft__fields">
                  {describeDraft(proposal).map((entry) => (
                    <div key={entry.label}>
                      <dt>{entry.label}</dt>
                      <dd>{entry.value}</dd>
                    </div>
                  ))}
                </dl>

                {superseded ? (
                  <>
                    {/*
                      Still reachable — going back for the one you turned down is
                      a real thing to want — but no longer dressed as the
                      conversation's live answer.
                    */}
                    {/*
                      A POSITIONAL claim, which is the only kind this component
                      can make honestly. It said "Replaced by a later proposal",
                      which asserts currency — and the moment someone takes the
                      button below, the proposal now loaded in the form is the
                      one captioned as replaced, while the one they rejected
                      keeps the accent-filled "Use this configuration". Which
                      draft is live is the form's business; message order is
                      this transcript's.
                    */}
                    <p className="chat-draft__superseded">
                      An earlier proposal — a later one follows in this conversation.
                    </p>
                    <button
                      type="button"
                      className="agent-secondary"
                      onClick={() => onUseDraft(message)}
                    >
                      Use this earlier proposal
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="run-button agent-primary"
                      onClick={() => onUseDraft(message)}
                    >
                      Use this configuration
                    </button>
                    {/*
                      On the live proposal only. Repeated under every card it was
                      six identical lines in a six-proposal thread, which is how a
                      sentence worth reading becomes furniture.
                    */}
                    <p className="chat-draft__note">
                      Opens it in Run Configuration for review. Nothing runs until you say so.
                    </p>
                  </>
                )}

                {/*
                  The proposal as it arrived. The same reflex as the outbound
                  preview: the analyst is entitled to read the literal thing, not
                  only this panel's account of it.
                */}
                <details className="chat-draft__raw">
                  <summary>Show the proposal as JSON</summary>
                  <pre>{proposalJson}</pre>
                  <CopyButton value={proposalJson ?? ""} label="Copy JSON" />
                </details>
                {draftError?.messageId === message.id ? (
                  <p className="agent-error" role="alert">
                    {draftError.message}
                  </p>
                ) : null}
              </div>
            )}
          </li>
        );
      })}

      {sending ? (
        <li className="chat-turn chat-turn--assistant chat-turn--pending">
          <p className="chat-turn__who">Assistant</p>
          <p className="chat-turn__text" role="status">
            Thinking…
          </p>
        </li>
      ) : null}
    </ol>
  );
}
