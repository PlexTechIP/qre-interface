import { useMemo, useState } from "react";

import type {
  AgentDraftRequest,
  AgentProviderStatus,
  AgentService,
} from "../../shared/agentTypes";
import { draftToFormState, type DraftHandoff } from "./draftToFormState";

interface AgentInterfaceProps {
  service: AgentService;
  status: AgentProviderStatus;
  onReviewDraft: (handoff: DraftHandoff) => void;
}

export function AgentInterface({
  service,
  status,
  onReviewDraft,
}: AgentInterfaceProps): React.JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const request = useMemo<AgentDraftRequest>(
    () => ({ prompt, generationSchema: "runconfig-generation-v1.4.0" }),
    [prompt],
  );

  const beginReview = (): void => {
    setMessage(null);
    setReviewing(true);
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
            This branch is using a deterministic local fixture while the real
            provider/preload work is developed independently. No network request
            will occur.
          </p>
        ) : null}

        {!reviewing ? (
          <button
            type="button"
            className="run-button agent-primary"
            disabled={!status.available || prompt.trim().length === 0}
            onClick={beginReview}
          >
            Review request
          </button>
        ) : (
          <div className="agent-review" aria-labelledby="agent-review-heading">
            <div>
              <h3 id="agent-review-heading">Exact outbound request</h3>
              <p>This complete payload will be sent only after you confirm.</p>
            </div>
            <pre>{JSON.stringify(request, null, 2)}</pre>
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
