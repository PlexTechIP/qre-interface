import { useCallback, useState } from "react";

import type {
  AgentService,
  ModelCatalogEntry,
  ProviderCredits,
  ProviderId,
} from "../../shared/agentTypes";

interface ModelCatalogPanelProps {
  provider: ProviderId;
  displayName: string;
  /** A key is stored. Without one there is nothing to authenticate a fetch. */
  configured: boolean;
  /**
   * The catalogue main is currently holding, or null when it holds none yet.
   *
   * Display only. The shell owns WHEN a catalogue is first fetched — this
   * component unmounts on every navigation away from Settings, so a first-fetch
   * guard living in here retried a failing catalogue on each visit.
   */
  catalog: readonly ModelCatalogEntry[] | null;
  service: Pick<AgentService, "refreshCatalog">;
  /**
   * A new catalogue landed.
   *
   * The shell re-reads `agent:status`, which is what every model picker in the
   * app renders from. Without it the list would update here and nowhere else.
   */
  onCatalogRefreshed: () => void;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The model catalogue for a provider whose models are fetched, not pinned.
 *
 * Only OpenRouter has one today. It is written against the data rather than
 * against that name because the data already is general — `catalog` and
 * `credits` are both optional on the shared types, for providers that have
 * neither — and because the alternative was an `if (provider === "openrouter")`
 * inside the Settings page.
 *
 * The balance is shown only when it has just been fetched. It is not carried in
 * `agent:status` alongside the catalogue on purpose: a model list is stable for
 * hours, while a balance changes with every request, and a figure from twenty
 * minutes ago rendered as though it were current is worse than no figure.
 */
export function ModelCatalogPanel({
  provider,
  displayName,
  configured,
  catalog,
  service,
  onCatalogRefreshed,
}: ModelCatalogPanelProps): React.JSX.Element {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<ProviderCredits | null>(null);
  const [fetchedCount, setFetchedCount] = useState<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await service.refreshCatalog(provider);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCredits(result.credits);
      setFetchedCount(result.models.length);
      onCatalogRefreshed();
    } catch (caught) {
      // A rejection here means the preload bridge is missing or main threw —
      // neither is something this panel can fix, but both have to be readable
      // rather than an unhandled promise in the console.
      setError(describeError(caught));
    } finally {
      setRefreshing(false);
    }
  }, [onCatalogRefreshed, provider, service]);

  if (!configured) {
    return (
      <div className="catalog-panel">
        <p className="agent-note">
          Add an {displayName} key above to load the model list. Until then the
          app offers the small shortlist it ships with.
        </p>
      </div>
    );
  }

  const count = catalog?.length ?? fetchedCount;

  return (
    <div className="catalog-panel">
      <p className="agent-note">{describeCount(count, displayName)}</p>

      {credits === null ? null : <CreditsLine credits={credits} />}

      <div className="agent-actions">
        <button
          type="button"
          className="agent-secondary"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh model list"}
        </button>
      </div>

      {error === null ? null : (
        <p className="agent-error" role="alert">
          {error} The shipped shortlist is still available.
        </p>
      )}
    </div>
  );
}

/**
 * What the app is currently offering for this provider.
 *
 * Zero is the case worth spelling out. A fetch that succeeds and matches
 * nothing is not "a catalogue of zero models": `ModelCatalog` stores an empty
 * result as no catalogue at all, so every picker keeps offering the shipped
 * shortlist — and this panel announcing "0 models available" beside a dropdown
 * holding three was two halves of the same page contradicting each other. The
 * shortlist is the half that is true, and the reason it is in use is worth
 * saying, because the analyst can act on it by picking a different provider.
 */
function describeCount(count: number | null, displayName: string): string {
  if (count === null) {
    return `Using the shortlist ${displayName} ships with. Refresh to load everything it currently routes.`;
  }
  if (count === 0) {
    return `${displayName} returned a model list, but none of them support the strict reply format this app requires. The shipped shortlist is still in use.`;
  }
  return `${count} ${count === 1 ? "model" : "models"} available — every one that supports the strict reply format this app requires.`;
}

/**
 * The balance, phrased so an uncapped key does not read as an empty one.
 *
 * `remaining === null` means "no limit set", which a naive `$${remaining}` would
 * render as `$null` and a naive `?? 0` would render as "$0.00 left" — telling
 * someone with an unlimited key that they have spent it all.
 */
function CreditsLine({ credits }: { credits: ProviderCredits }): React.JSX.Element {
  const spent = `$${credits.used.toFixed(2)} used`;
  return (
    <p className="agent-note catalog-panel__credits">
      {credits.remaining === null
        ? `${spent} on this key, which has no spending limit set.`
        : `${spent}, $${credits.remaining.toFixed(2)} remaining. Balance as of this refresh.`}
    </p>
  );
}
