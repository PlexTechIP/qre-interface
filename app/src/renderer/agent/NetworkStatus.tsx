import type { AgentProviderStatus, ProviderId } from "../../shared/agentTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";

/**
 * The permanent networked-features indicator (brief constraint 7). It is on
 * every page, so the slim visible label is just on/off; the provider and model
 * live in the tooltip and the accessible name, with the full detail repeated
 * inside the Describe a Run panel.
 *
 * **On/off is per SELECTED provider, not per app.** `status.networkEnabled` is
 * true when *any* provider holds a key, so reading it directly made the badge
 * announce "Network on · OpenAI/…" while only Anthropic was configured — the
 * indicator naming a provider it could not actually reach, which is the one
 * thing this component exists to get right.
 */
export function NetworkStatus({
  status,
  provider,
  model,
}: {
  status: AgentProviderStatus;
  provider: ProviderId;
  model: string;
}): React.JSX.Element {
  const selectedIsConfigured = status.providers.some(
    (candidate) => candidate.provider === provider && candidate.configured,
  );
  // The offline fixture is available but deliberately not networked; saying
  // "Network off · Anthropic/…" there would name a provider nothing will call.
  const isDemo = status.mode === "local_demo";
  const on = selectedIsConfigured && status.networkEnabled && !isDemo;

  const label = on ? "Network on" : "Network off";
  const detail = isDemo
    ? `${label} · Local demo — no request leaves this machine`
    : on
      ? `${label} · ${PROVIDER_MODELS[provider].displayName}/${model}`
      : `${label} · No key configured for ${PROVIDER_MODELS[provider].displayName}`;

  return (
    <span
      className={`agent-status agent-status--${on ? "on" : "off"}`}
      title={detail}
      aria-label={`LLM provider status: ${detail}`}
    >
      <span className="agent-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
