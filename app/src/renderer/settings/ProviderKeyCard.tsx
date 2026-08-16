import { useId, useRef, useState } from "react";

import type { AgentService, ProviderId } from "../../shared/agentTypes";

interface ProviderKeyCardProps {
  provider: ProviderId;
  displayName: string;
  /** A key is stored for this provider — never the key itself. */
  configured: boolean;
  service: Pick<AgentService, "configureCredential" | "clearCredential">;
  /**
   * A key was stored. Separate from `onCleared` rather than one
   * `onCredentialChange`, because the shell does more here than re-read status:
   * configuring the first provider is what makes it the active one.
   */
  onConfigured: (provider: ProviderId) => void;
  /** A key was deleted. The shell re-reads status; the selection is untouched. */
  onCleared: (provider: ProviderId) => void;
}

/**
 * One provider's key, managed on the Settings page.
 *
 * This replaces the single `<details>` panel that used to sit on the chat page
 * and carry a provider dropdown. That control conflated two questions —
 * "which provider am I configuring" and "which provider does the next send
 * use" — so configuring a second key silently repointed the chat. A card per
 * provider only answers the first; the second belongs to `ProviderModelSelect`.
 *
 * The input is deliberately uncontrolled: the key is read from the DOM once,
 * handed to main, then cleared. It never becomes retained React state.
 */
export function ProviderKeyCard({
  provider,
  displayName,
  configured,
  service,
  onConfigured,
  onCleared,
}: ProviderKeyCardProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /**
   * Two-step removal, in the button itself rather than a `window.confirm`.
   *
   * Deleting the key is recoverable — the analyst pastes it again — but only if
   * they still have it, and a key pasted from a console that has since rotated
   * is gone. One deliberate second click is the right price. This state is per
   * card, so an armed confirm on one provider cannot fire on another.
   */
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const id = useId();
  const inputId = `${id}-key`;
  const headingId = `${id}-heading`;

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
      onConfigured(provider);
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
      onCleared(provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConfirmingRemoval(false);
      setRemoving(false);
    }
  };

  return (
    <section className="provider-card" aria-labelledby={headingId}>
      <div className="provider-card__header">
        <h3 className="provider-card__name" id={headingId}>
          {displayName}
        </h3>
        <span className={`agent-status agent-status--${configured ? "on" : "off"}`}>
          {/*
            The same dot the header badge uses. Without it `--on` and `--off`
            style nothing — the variant's only rule targets this element — so
            both pills rendered identically and the one thing this row exists
            to show was carried by the word alone.
          */}
          <span className="agent-status__dot" aria-hidden="true" />
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>

      <form className="agent-credential-form" onSubmit={(event) => void submit(event)}>
        <p className="provider-card__intro">
          {configured
            ? `A key is stored for ${displayName}. Saving another one replaces it.`
            : `Paste an API key from the ${displayName} console. It is validated once, encrypted by your operating system's key store, and never readable from this window again.`}
        </p>

        <label className="agent-label" htmlFor={inputId}>
          {displayName} API key
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className="agent-credential-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          aria-describedby={`${id}-note`}
          onChange={() => {
            if (error !== null) setError(null);
            if (saved) setSaved(false);
          }}
        />
        <p id={`${id}-note`} className="agent-note">
          The key goes straight to the app's main process and is stored encrypted
          outside the run database. No screen, export, or log can display it
          afterwards.
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
      {removed ? (
        <p className="agent-success" role="status">
          Key removed from this machine. Networked features are off.
        </p>
      ) : null}
    </section>
  );
}
