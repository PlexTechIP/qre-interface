import { useId } from "react";

import type {
  ModelCatalogEntry,
  ProviderAvailability,
  ProviderId,
} from "../../shared/agentTypes";

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
  const catalog = selected?.catalog;

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
          {/*
            A model the list does not contain, kept selectable.

            A `<select>` whose value matches no option does not stay empty — it
            displays the first option instead, so the control would quietly
            claim a model that is not the one the next send uses. This happens
            for real: OpenRouter retires a slug, or the stored selection
            predates the catalogue this session fetched.
          */}
          {models.includes(model) ? null : (
            <option value={model}>{`${model} — no longer listed`}</option>
          )}
          {/*
            `== null` catches both states that mean "no fetched list to group":
            a provider with no catalogue at all, and one whose catalogue has not
            been fetched yet. In both cases `models` is a short shipped list and
            a flat dropdown is the right shape for it.
          */}
          {catalog == null ? (
            models.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))
          ) : (
            <CatalogOptions catalog={catalog} />
          )}
        </select>
      </div>
    </div>
  );
}

/**
 * A fetched catalogue, grouped so the promoted models are not lost in the tail.
 *
 * Three pinned models need no structure; three hundred do. The split is the
 * whole reason a shortlist exists — without it the default experience of
 * choosing an OpenRouter model is scrolling an alphabetised list of everything
 * the internet currently serves.
 */
function CatalogOptions({
  catalog,
}: {
  catalog: readonly ModelCatalogEntry[];
}): React.JSX.Element {
  const promoted = catalog.filter((entry) => entry.promoted);
  const rest = catalog.filter((entry) => !entry.promoted);

  return (
    <>
      {promoted.length === 0 ? null : (
        <optgroup label="Recommended">
          {promoted.map((entry) => (
            <ModelOption key={entry.id} entry={entry} />
          ))}
        </optgroup>
      )}
      {rest.length === 0 ? null : (
        <optgroup label="All models">
          {rest.map((entry) => (
            <ModelOption key={entry.id} entry={entry} />
          ))}
        </optgroup>
      )}
    </>
  );
}

function ModelOption({ entry }: { entry: ModelCatalogEntry }): React.JSX.Element {
  return (
    <option value={entry.id}>
      {[entry.displayName, ...describeModel(entry)].join(" · ")}
    </option>
  );
}

/**
 * The facts that actually separate two options, and only the ones the provider
 * gave us.
 *
 * Absent figures are omitted rather than rendered as a dash or a zero: the
 * catalogue distinguishes "free" from "no price reported", and flattening that
 * here would put "$0.00/M" against a model whose cost the app does not know.
 */
function describeModel(entry: ModelCatalogEntry): string[] {
  const parts: string[] = [];
  if (entry.contextLength !== null) parts.push(`${formatTokens(entry.contextLength)} context`);
  if (entry.promptPricePerMillion !== null) {
    parts.push(`$${formatPrice(entry.promptPricePerMillion)}/M in`);
  }
  if (entry.completionPricePerMillion !== null) {
    parts.push(`$${formatPrice(entry.completionPricePerMillion)}/M out`);
  }
  return parts;
}

/**
 * Rounded to a unit an analyst reads at a glance: 32768 is "33K", not "32,768".
 *
 * The unit is chosen from the ROUNDED value, not the raw one. Testing the raw
 * count against a million first meant 999,999 rounded up inside the K branch
 * and rendered as "1000K" — a four-digit K figure, which is precisely the shape
 * this function exists to avoid.
 */
function formatTokens(tokens: number): string {
  const thousands = Math.round(tokens / 1_000);
  if (thousands >= 1_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${thousands}K`;
  return String(tokens);
}

/**
 * Two decimals, except where two decimals would round a real price to zero —
 * some OpenRouter models genuinely cost fractions of a cent per million tokens,
 * and "$0.00" for a model that is not free is the wrong kind of wrong.
 *
 * Sub-cent prices get exactly as many decimals as it takes to show a leading
 * digit, then have the padding trimmed. The obvious `toPrecision(1)` cannot be
 * used: it switches to exponential notation below 1e-6, so a genuinely cheap
 * model rendered as "$1e-7/M in" — unreadable in a different way than "$0.00",
 * but no more useful.
 */
function formatPrice(perMillion: number): string {
  if (perMillion === 0) return "0.00";
  if (perMillion >= 0.01) return perMillion.toFixed(2);
  const decimals = Math.min(10, 1 - Math.floor(Math.log10(perMillion)));
  return perMillion.toFixed(decimals).replace(/0+$/, "");
}
