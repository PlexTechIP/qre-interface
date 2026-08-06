import type { AgentProviderStatus } from "../../shared/agentTypes";

export function NetworkStatus({
  status,
}: {
  status: AgentProviderStatus;
}): React.JSX.Element {
  const label = status.available
    ? status.mode === "local_demo"
      ? "Network off · Local demo"
      : `Network on · ${status.provider}/${status.model}`
    : "Network features off";

  return (
    <span
      className={`agent-status agent-status--${status.networkEnabled ? "on" : "off"}`}
      title={status.available ? label : status.message}
      aria-label={`LLM provider status: ${label}`}
    >
      <span className="agent-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
