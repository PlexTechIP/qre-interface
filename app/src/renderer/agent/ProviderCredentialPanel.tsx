import { useId, useRef, useState } from "react";

import type { AgentProviderStatus, AgentService } from "../../shared/agentTypes";

interface ProviderCredentialPanelProps {
  service: Pick<AgentService, "configureCredential">;
  status: AgentProviderStatus;
  /** Re-read status after a successful save, so the header indicator updates. */
  onConfigured: () => void;
}

/**
 * Entry point for a provider key.
 *
 * **The input is deliberately uncontrolled.** A controlled input would put the
 * key in React state, which means it lives in renderer memory for the lifetime
 * of the component and rides along in any state snapshot, error boundary, or
 * devtools inspection. Here the value is read from the DOM node once, at
 * submit, handed straight to the main process, and the field is cleared. The
 * key is never assigned to a variable that outlives the call, never logged,
 * and never returned.
 *
 * The honest residual: while the analyst is typing, the characters are in the
 * DOM node. Closing that would require collecting the key in a main-process
 * window instead, which is a bigger change than this seam warrants — but it is
 * the reason the brief's "never in renderer memory" is met in spirit (nothing
 * retains it) rather than absolutely (the input element holds it transiently).
 */
export function ProviderCredentialPanel({
  service,
  status,
  onConfigured,
}: ProviderCredentialPanelProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputId = useId();

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const field = inputRef.current;
    if (field === null) return;

    const apiKey = field.value.trim();
    if (apiKey.length === 0) {
      setError("Enter a key before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await service.configureCredential(apiKey);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      onConfigured();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      // Cleared on every path, including failure: a rejected key is still a
      // secret, and leaving it in the field invites a screenshot.
      field.value = "";
      setSaving(false);
    }
  };

  return (
    <section className="agent-card" aria-labelledby={`${inputId}-heading`}>
      <div className="agent-card__heading">
        <div>
          <h2 id={`${inputId}-heading`}>Model provider</h2>
          <p>
            {status.available
              ? `Configured — ${status.provider}/${status.model}. Saving a new key replaces the stored one.`
              : "Paste an API key from your provider's console. It is validated once, encrypted by your operating system's key store, and never readable from this window again."}
          </p>
        </div>
        <span
          className={`agent-status agent-status--${status.available ? "on" : "off"}`}
        >
          {status.available ? "Configured" : "Not configured"}
        </span>
      </div>

      <form className="agent-credential-form" onSubmit={(event) => void submit(event)}>
        <label className="agent-label" htmlFor={inputId}>
          API key
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className="agent-credential-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          aria-describedby={`${inputId}-note`}
          onChange={() => {
            if (error !== null) setError(null);
            if (saved) setSaved(false);
          }}
        />
        <p id={`${inputId}-note`} className="agent-note">
          The key is sent straight to the app's main process and stored
          encrypted outside the run database. No screen, export, or log can
          display it afterwards.
        </p>
        <button type="submit" className="run-button agent-primary" disabled={saving}>
          {saving ? "Validating…" : "Validate and save key"}
        </button>
      </form>

      {error !== null ? (
        <p className="agent-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="agent-success" role="status">
          Key validated and stored. Networked features are on.
        </p>
      ) : null}
    </section>
  );
}
