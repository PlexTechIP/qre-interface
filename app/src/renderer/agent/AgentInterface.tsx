import { useMemo, useState } from "react";

import type {
  AgentDraftRequest,
  AgentProviderStatus,
  AgentService,
} from "../../shared/agentTypes";
import { draftToFormState, type DraftHandoff } from "./draftToFormState";
import { ProviderCredentialPanel } from "./ProviderCredentialPanel";

interface AgentInterfaceProps {
  service: AgentService;
  status: AgentProviderStatus;
  onReviewDraft: (handoff: DraftHandoff) => void;
  /** Re-read provider status once a key is stored. */
  onCredentialConfigured: () => void;
}

export function AgentInterface({
  service,
  status,
  onReviewDraft,
  onCredentialConfigured,
}: AgentInterfaceProps): React.JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The literal body the main process would send, fetched when review begins.
  // Null until then: rendering a hand-assembled guess of the payload would
  // defeat the point of showing it at all.
  const [outboundPreview, setOutboundPreview] = useState<unknown>(null);
  const request = useMemo<AgentDraftRequest>(
    () => ({ prompt, generationSchema: "runconfig-generation-v1.4.0" }),
    [prompt],
  );

  const beginReview = async (): Promise<void> => {
    setMessage(null);
    try {
      setOutboundPreview(await service.previewRequest(request));
      setReviewing(true);
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
            setPrompt(event.target.value);
            setReviewing(false);
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
            disabled={!status.available || prompt.trim().length === 0}
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
                onClick={() => setReviewing(false)}
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
