import type { AgentProviderStatus, ProviderId } from "../../shared/agentTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";

interface SettingsButtonProps {
  status: AgentProviderStatus;
  /** The provider the next send would use — not "any provider with a key". */
  provider: ProviderId;
  model: string;
  /** Settings is the page currently on screen. */
  active: boolean;
  onOpen: () => void;
}

/**
 * The way into Settings, and the app's networked-features indicator.
 *
 * These were two things in the header: a "Network on · Anthropic/…" badge and,
 * before that, a Settings entry in the left nav. One control does both jobs
 * because they are the same job — the badge reported a state whose only fix is
 * on the page this button opens, so a reader who saw "Network off" had to go
 * looking for the place to do something about it.
 *
 * Dropping the indicator entirely was not an option: brief constraint 7 asks
 * that the feature stay visibly networked, and outside the chat page this is
 * the only thing that says so.
 */
export function SettingsButton({
  status,
  provider,
  model,
  active,
  onOpen,
}: SettingsButtonProps): React.JSX.Element {
  /*
   * On/off is per SELECTED provider, not per app.
   *
   * `status.networkEnabled` is true when ANY provider holds a key, so reading
   * it alone announced a network for a provider this app could not actually
   * reach — the one thing an indicator like this must never do.
   */
  const selectedIsConfigured = status.providers.some(
    (candidate) => candidate.provider === provider && candidate.configured,
  );
  // The offline fixture is available but deliberately not networked.
  const isDemo = status.mode === "local_demo";
  const on = selectedIsConfigured && status.networkEnabled && !isDemo;

  const displayName = PROVIDER_MODELS[provider].displayName;
  const state = on ? "Networked features on" : "Networked features off";
  const detail = isDemo
    ? "Local demo — no request leaves this machine"
    : on
      ? `${displayName}/${model}`
      : `No key configured for ${displayName}`;
  /*
   * The action leads and the state follows, for the same reason it does on
   * `ThemeToggle`: `aria-label` overrides `title` in the accessible-name
   * computation, so a state that lived only in the tooltip would reach sighted
   * mouse users and nobody else.
   */
  const label = `Settings — ${state}: ${detail}`;

  return (
    <button
      type="button"
      className={`icon-button settings-button${active ? " settings-button--active" : ""}`}
      onClick={onOpen}
      aria-label={label}
      title={label}
      // `page`, not `aria-pressed`: this navigates rather than toggling, and a
      // toggle that never turns off reads as permanently stuck to a reader.
      {...(active ? { "aria-current": "page" as const } : {})}
    >
      <GearIcon />
      {/*
        The same dot the provider cards use, so "configured" means one thing
        across the app. `aria-hidden` because the state is already in the name
        above — announcing it twice is worse than once.
      */}
      <span
        className={`agent-status__dot agent-status--${on ? "on" : "off"}`}
        aria-hidden="true"
      />
    </button>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        d="M19.4 13.6a7.8 7.8 0 0 0 0-3.2l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-2.8-1.6L13.8 2h-3.6l-.4 2.9a7.8 7.8 0 0 0-2.8 1.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3.2l-2 1.5 2 3.4 2.4-1a7.8 7.8 0 0 0 2.8 1.6l.4 2.9h3.6l.4-2.9a7.8 7.8 0 0 0 2.8-1.6l2.4 1 2-3.4Z"
      />
    </svg>
  );
}
