import { useEffect, useId, useRef, useState } from "react";

import type { AgentProviderStatus, AgentService, ProviderId } from "../../shared/agentTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";

interface ProviderCredentialPanelProps {
  service: Pick<AgentService, "configureCredential" | "clearCredential">;
  status: AgentProviderStatus;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
  /** Re-read provider status after a key is stored OR removed. */
  onCredentialChange: () => void;
}

/**
 * The input is deliberately uncontrolled: the key is read from the DOM once,
 * handed to main, then cleared. It never becomes retained React state.
 */
export function ProviderCredentialPanel({
  service,
  status,
  provider,
  model,
  onSelectionChange,
  onCredentialChange,
}: ProviderCredentialPanelProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /**
   * Two-step removal, in the button itself rather than a `window.confirm`.
   *
   * Deleting the key is recoverable — the analyst pastes it again — but it is
   * recoverable only if they still have it, and a key pasted from a console
   * that has since rotated is gone. One deliberate second click is the right
   * price. Reset whenever the provider changes, so a confirm armed for Anthropic
   * cannot fire at OpenAI.
   */
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const inputId = useId();
  const selected = status.providers.find((candidate) => candidate.provider === provider);
  const configured = selected?.configured ?? false;
  const displayName = PROVIDER_MODELS[provider].displayName;

  // Native details deliberately owns its state after this first mount. A
  // status refresh while someone is entering a key must not slam it shut.
  //
  // The signal is the SELECTED provider's state, not `status.available` — that
  // flag is true when *any* provider has a key, so using it here left the panel
  // collapsed in exactly the case that needs it open: one provider configured,
  // the other one selected and still needing a key.
  useEffect(() => {
    if (detailsRef.current !== null) detailsRef.current.open = !configured;
    // This is an initial value, not a controlled disclosure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const result = await service.configureCredential(provider, apiKey);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      setRemoved(false);
      onCredentialChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      // A rejected key is still secret; never leave it on screen.
      field.value = "";
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    setRemoving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await service.clearCredential(provider);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRemoved(true);
      onCredentialChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConfirmingRemoval(false);
      setRemoving(false);
    }
  };

  return (
    <details ref={detailsRef} className="agent-card agent-provider-panel">
      <summary className="agent-provider-panel__summary">
        <span>
          <strong id={`${inputId}-heading`}>Model provider</strong>
          <small>{configured ? `${displayName} · ${model}` : "Not configured"}</small>
        </span>
        <span className={`agent-status agent-status--${configured ? "on" : "off"}`}>
          {configured ? "Configured" : "Not configured"}
        </span>
      </summary>

      <form className="agent-credential-form" onSubmit={(event) => void submit(event)}>
        <p>
          {configured
            ? `A key is configured for ${displayName}. Saving another one replaces that provider's stored key.`
            : "Paste an API key from your provider's console. It is validated once, encrypted by your operating system's key store, and never readable from this window again."}
        </p>
        <label className="agent-label" htmlFor={`${inputId}-provider`}>Provider</label>
        <select
          id={`${inputId}-provider`}
          className="agent-select"
          value={provider}
          onChange={(event) => {
            const nextProvider = event.target.value as ProviderId;
            onSelectionChange(nextProvider, PROVIDER_MODELS[nextProvider].defaultModel);
            if (inputRef.current !== null) inputRef.current.value = "";
            setError(null);
            setSaved(false);
            setRemoved(false);
            // An armed confirm belongs to the provider it was armed for.
            setConfirmingRemoval(false);
          }}
        >
          {status.providers.map((candidate) => (
            <option key={candidate.provider} value={candidate.provider}>
              {candidate.displayName}{candidate.configured ? " (configured)" : ""}
            </option>
          ))}
        </select>
        <label className="agent-label" htmlFor={`${inputId}-model`}>Model</label>
        <select
          id={`${inputId}-model`}
          className="agent-select"
          value={model}
          onChange={(event) => onSelectionChange(provider, event.target.value)}
        >
          {PROVIDER_MODELS[provider].models.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
        <label className="agent-label" htmlFor={inputId}>{displayName} API key</label>
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
          The key is sent straight to the app's main process and stored encrypted outside the run database. No screen, export, or log can display it afterwards.
        </p>
        <div className="agent-actions">
          <button type="submit" className="run-button agent-primary" disabled={saving || removing}>
            {saving ? "Validating…" : "Validate and save key"}
          </button>
          {/*
            The exit from the one-way street. Shown only where there is
            something to remove — offering to delete a key that was never
            stored would be a control that reports on nothing.
          */}
          {configured ? (
            confirmingRemoval ? (
              <>
                <button
                  type="button"
                  className="agent-secondary agent-secondary--danger"
                  disabled={removing}
                  onClick={() => void remove()}
                >
                  {removing ? "Removing…" : `Remove ${displayName} key`}
                </button>
                <button
                  type="button"
                  className="agent-secondary"
                  disabled={removing}
                  onClick={() => setConfirmingRemoval(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="agent-secondary"
                disabled={saving}
                onClick={() => {
                  setError(null);
                  setSaved(false);
                  setRemoved(false);
                  setConfirmingRemoval(true);
                }}
              >
                Remove key
              </button>
            )
          ) : null}
        </div>
        {confirmingRemoval ? (
          <p className="agent-note">
            This deletes the encrypted key from this machine. Nothing is sent to{" "}
            {displayName} — revoke it in their console too if that is what you
            want. You will need to paste it again to use networked features.
          </p>
        ) : null}
      </form>
      {error !== null ? <p className="agent-error" role="alert">{error}</p> : null}
      {saved ? <p className="agent-success" role="status">Key validated and stored. Networked features are on.</p> : null}
      {removed ? <p className="agent-success" role="status">Key removed from this machine. Networked features are off.</p> : null}
    </details>
  );
}
