import { useId } from "react";

import type { ProviderAvailability, ProviderId } from "../../shared/agentTypes";

interface ProviderModelSelectProps {
  /**
   * The catalogue as main reports it, rather than the compile-time
   * `PROVIDER_MODELS` import. Both describe the same thing, but only this one
   * carries `configured`, and reading the models from one source and the key
   * state from another is how the two drift apart.
   */
  providers: readonly ProviderAvailability[];
  provider: ProviderId;
  model: string;
  /** Provider and model always travel together — see the reset below. */
  onChange: (provider: ProviderId, model: string) => void;
  className?: string;
}

/**
 * The provider/model pair, rendered wherever the analyst can change it.
 *
 * Two surfaces show this at once — Settings and the chat page — so the ids are
 * generated per instance. Hard-coded ones made the second instance's labels
 * point at the first instance's selects, and clicking "Model" on the chat page
 * focused a control in a page that was not on screen.
 */
export function ProviderModelSelect({
  providers,
  provider,
  model,
  onChange,
  className,
}: ProviderModelSelectProps): React.JSX.Element {
  const id = useId();
  const selected = providers.find((candidate) => candidate.provider === provider);
  const models = selected?.models ?? [];

  return (
    <div className={className ?? "provider-select"}>
      <div className="provider-select__field">
        <label className="agent-label" htmlFor={`${id}-provider`}>
          Provider
        </label>
        <select
          id={`${id}-provider`}
          className="agent-select"
          value={provider}
          onChange={(event) => {
            /*
             * Resolved back to the entry the option was rendered from, rather
             * than casting `event.target.value` to a ProviderId and looking
             * the default up separately. The options come from this array, so
             * the selected index always addresses one of them — which means
             * the provider and its default model are read from a single
             * object and cannot disagree, and no unchecked cast is needed.
             *
             * The model has to travel with the provider: carrying the old one
             * over emits a pair `isModelForProvider` rejects in main, which
             * reads as a working control that fails on every send.
             */
            const chosen = providers[event.target.selectedIndex];
            if (chosen === undefined) return;
            onChange(chosen.provider, chosen.defaultModel);
          }}
        >
          {providers.map((candidate) => (
            <option key={candidate.provider} value={candidate.provider}>
              {candidate.displayName}
              {candidate.configured ? " (configured)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="provider-select__field">
        <label className="agent-label" htmlFor={`${id}-model`}>
          Model
        </label>
        <select
          id={`${id}-model`}
          className="agent-select"
          value={model}
          onChange={(event) => onChange(provider, event.target.value)}
        >
          {models.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
