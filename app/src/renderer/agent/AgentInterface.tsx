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
  /** Re-read provider status once a key is stored. */
  onCredentialConfigured: () => void;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
}

export function AgentInterface({
  service,
  status,
  onReviewDraft,
  onCredentialConfigured,
  provider,
  model,
  onSelectionChange,
}: AgentInterfaceProps): React.JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const request = useMemo<AgentDraftRequest>(
    () => ({ prompt, generationSchema: GENERATION_SCHEMA_ID, provider, model }),
    [prompt, provider, model],
  );

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
        setMessage(result.message);
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
        onConfigured={onCredentialConfigured}
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
            setPrompt(event.target.value);
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
          <button
            type="button"
            className="run-button agent-primary"
            disabled={
              !status.providers.some(
                (candidate) => candidate.provider === provider && candidate.configured,
              ) || prompt.trim().length === 0
            }
            onClick={() => void beginReview()}
          >
            Review request
          </button>
        ) : (
          <div className="agent-review" aria-labelledby="agent-review-heading">
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
              <button
                type="button"
                className="agent-secondary"
                disabled={sending}
                onClick={() => setReviewed(null)}
              >
                Edit description
              </button>
              <button
                type="button"
                className="run-button agent-primary"
                disabled={sending}
                onClick={() => void send()}
              >
                {sending ? "Creating draft…" : "Send and create draft"}
              </button>
            </div>
          </div>
        )}

        {!status.available ? (
          <p className="agent-error">{status.message}</p>
        ) : null}
        {message ? (
          <p className="agent-error" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
