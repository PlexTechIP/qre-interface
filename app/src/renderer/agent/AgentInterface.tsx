import { useMemo, useState } from "react";

import {
  GENERATION_SCHEMA_ID,
  type AgentDraftRequest,
  type AgentProviderStatus,
  type AgentService,
  type ProviderId,
} from "../../shared/agentTypes";
import { draftToFormState, type DraftHandoff } from "./draftToFormState";
import { ProviderCredentialPanel } from "./ProviderCredentialPanel";

/**
 * Field-by-field, so adding a field to `AgentDraftRequest` without handling it
 * here is a compile error rather than a silently stale preview. `JSON.stringify`
 * would have been shorter and would have quietly tolerated key reordering.
 */
function sameRequest(a: AgentDraftRequest, b: AgentDraftRequest): boolean {
  return (
    a.prompt === b.prompt &&
    a.generationSchema === b.generationSchema &&
    a.provider === b.provider &&
    a.model === b.model
  );
}

interface AgentInterfaceProps {
  service: AgentService;
  status: AgentProviderStatus;
  onReviewDraft: (handoff: DraftHandoff) => void;
  /** Re-read provider status once a key is stored or removed. */
  onCredentialChange: () => void;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
  /**
   * Owned by the shell, not by this component.
   *
   * Every page in this app is a conditional render, so this panel unmounts the
   * moment the analyst clicks anything in the sidebar. While the prompt was
   * local state, checking a default on the Run Configuration page destroyed a
   * carefully written description, and coming back from a draft to rephrase it
   * meant retyping from nothing — which is most of why the round trip through
   * "Describe a Run" never felt usable.
   */
  prompt: string;
  onPromptChange: (prompt: string) => void;
}

/** An error the analyst must act on, versus something that merely happened. */
type Note = { tone: "error" | "notice"; text: string };

export function AgentInterface({
  service,
  status,
  onReviewDraft,
  onCredentialChange,
  provider,
  model,
  onSelectionChange,
  prompt,
  onPromptChange,
}: AgentInterfaceProps): React.JSX.Element {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const setMessage = (text: string | null): void =>
    setNote(text === null ? null : { tone: "error", text });
  const request = useMemo<AgentDraftRequest>(
    () => ({ prompt, generationSchema: GENERATION_SCHEMA_ID, provider, model }),
    [prompt, provider, model],
  );

  /**
   * Whether the provider CURRENTLY SELECTED holds a key — which is not what
   * `status.available` reports. That flag is true when *any* provider is
   * configured, so with Anthropic configured and OpenAI selected the primary
   * button was disabled while the only sentence that explains why was suppressed:
   * a dead control and no reason given. `NetworkStatus` and
   * `ProviderCredentialPanel` each carry a comment about fixing this same
   * confusion; this is the third site, and the one where it cost the most.
   */
  const selected = status.providers.find(
    (candidate) => candidate.provider === provider,
  );
  const selectedIsConfigured = selected?.configured ?? false;

  /**
   * The reviewed payload is stored *with the request that produced it*, and the
   * review step counts as current only while the two still match.
   *
   * A separate `reviewing` boolean is what made this unsafe: only the textarea
   * cleared it, so changing provider or model left the panel showing the old
   * provider's body while Send used the new one — the analyst approving payload
   * A and payload B going out. Pairing them makes that unrepresentable rather
   * than merely handled: any input that changes `request` invalidates the
   * review by construction, and no future field can be added to
   * `AgentDraftRequest` and forgotten here.
   */
  const [reviewed, setReviewed] = useState<{
    request: AgentDraftRequest;
    body: unknown;
  } | null>(null);
  const reviewing =
    reviewed !== null && sameRequest(reviewed.request, request);
  const outboundPreview = reviewed?.body ?? null;

  const beginReview = async (): Promise<void> => {
    setMessage(null);
    try {
      setReviewed({ request, body: await service.previewRequest(request) });
    } catch (error) {
      // Refuse to advance rather than send something we couldn't show first.
      setMessage(
        `Could not read the outbound request, so nothing was sent: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const send = async (): Promise<void> => {
    // Belt and braces for the invariant above: the button is only rendered
    // while `reviewing` is true, but sending a request the analyst has not seen
    // is the one failure this surface must never have, so it is also checked
    // here rather than trusted to the render path.
    if (!reviewing) return;
    setSending(true);
    setMessage(null);
    try {
      const result = await service.requestDraft(request);
      if (!result.ok) {
        // Cancelling is not a failure — it is the analyst getting what they
        // asked for. Showing it in the same red as a revoked key would teach
        // them to distrust the colour.
        setNote({
          tone: result.code === "CANCELLED" ? "notice" : "error",
          text: result.message,
        });
        return;
      }
      const mapped = draftToFormState(
        result.draft,
        `${result.provider}/${result.model}`,
      );
      if (!mapped.ok) {
        setMessage(mapped.message);
        return;
      }
      onReviewDraft(mapped.handoff);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="agent-page">
      <header className="run-config__header">
        <h1>Describe a Run</h1>
        <p className="run-config__subtitle">
          Turn a natural-language request into a draft configuration. You will
          review and edit it in Run Configuration before anything can execute.
        </p>
      </header>

      <ProviderCredentialPanel
        service={service}
        status={status}
        provider={provider}
        model={model}
        onSelectionChange={onSelectionChange}
        onCredentialChange={onCredentialChange}
      />

      <section className="agent-card" aria-labelledby="agent-prompt-heading">
        <div className="agent-card__heading">
          <div>
            <h2 id="agent-prompt-heading">What do you want to estimate?</h2>
            <p>
              Describe the application, architecture, and constraints you care
              about.
            </p>
          </div>
          {status.mode === "local_demo" ? (
            <span className="agent-demo-badge">Offline demo</span>
          ) : null}
        </div>

        <label className="agent-label" htmlFor="agent-prompt">
          Run description
        </label>
        <textarea
          id="agent-prompt"
          className="agent-prompt"
          rows={7}
          value={prompt}
          onChange={(event) => {
            // No `setReviewing(false)` needed: changing the prompt changes
            // `request`, which invalidates the stored review on its own.
            onPromptChange(event.target.value);
            setMessage(null);
          }}
          placeholder="Estimate Grover search for a 20-qubit search space on a gate-based QPU with 50 ns gates…"
        />

        {status.mode === "local_demo" ? (
          <p className="agent-note">
            Running against a deterministic local fixture. No network request
            will occur.
          </p>
        ) : null}

        {!reviewing ? (
          <>
            <button
              type="button"
              className="run-button agent-primary"
              disabled={!selectedIsConfigured || prompt.trim().length === 0}
              onClick={() => void beginReview()}
            >
              Review request
            </button>
            {/*
              Only when ANOTHER provider is configured. With none configured,
              `status.message` below already says it, and two sentences saying
              the same thing read as two different problems.
            */}
            {!selectedIsConfigured && status.available ? (
              <p className="agent-note">
                No key is configured for {selected?.displayName ?? provider}, so
                there is nothing to send this to. Add one under{" "}
                <strong>Model provider</strong> above, or switch to a provider
                that has one.
              </p>
            ) : null}
          </>
        ) : (
          <section className="agent-review" aria-labelledby="agent-review-heading">
            <div>
              <h3 id="agent-review-heading">Exact outbound request</h3>
              <p>
                This is the complete request body, read back from the process
                that would send it. Your key travels as a header and is not part
                of it. Nothing is sent until you confirm.
              </p>
            </div>
            <pre>{JSON.stringify(outboundPreview, null, 2)}</pre>
            <div className="agent-actions">
              {/*
                Cancel REPLACES Edit description while a request is in flight
                rather than sitting beside it disabled. A draft is a two-minute
                commitment, and the only exit used to be waiting it out; the one
                control the analyst wants at that moment should not be the one
                that is greyed out.
              */}
              {sending ? (
                <button
                  type="button"
                  className="agent-secondary"
                  onClick={() => void service.cancelDraft()}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-secondary"
                  onClick={() => setReviewed(null)}
                >
                  Edit description
                </button>
              )}
              <button
                type="button"
                className="run-button agent-primary"
                disabled={sending}
                onClick={() => void send()}
              >
                {sending ? "Creating draft…" : "Send and create draft"}
              </button>
            </div>
          </section>
        )}

        {!status.available ? (
          <p className="agent-error">{status.message}</p>
        ) : null}
        {note ? (
          <p
            className={note.tone === "error" ? "agent-error" : "agent-note"}
            role={note.tone === "error" ? "alert" : "status"}
          >
            {note.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
