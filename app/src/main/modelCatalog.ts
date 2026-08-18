import type { ModelCatalogEntry, ProviderId } from "../shared/agentTypes.js";
import { isModelForProvider } from "../shared/providerModels.js";

/**
 * One provider's fetched model list, held for the session.
 *
 * This exists because `isModelForProvider` cannot answer the OpenRouter
 * question on its own. The first-party providers publish three models each and
 * the app pins them, so the compile-time list *is* the truth. OpenRouter routes
 * hundreds and changes them weekly, so the truth is whatever the API said the
 * last time it was asked — and the gate has to read from that, not from a
 * constant baked in at release.
 *
 * Session-scoped and in memory on purpose. A catalogue persisted to disk would
 * be a second thing to invalidate and a second way to be wrong about what the
 * provider currently routes, in exchange for saving one request per launch.
 */
export class ModelCatalog {
  /** Null until a non-empty catalogue has been fetched. See `replace`. */
  private entries: readonly ModelCatalogEntry[] | null = null;

  constructor(
    private readonly provider: ProviderId,
    /**
     * The slugs this build promotes, in the order it wants them offered. Passed
     * in rather than imported so the ordering rule can be tested against a
     * two-item list instead of whatever ships this month.
     */
    private readonly shortlist: readonly string[],
  ) {}

  /**
   * Adopt a freshly fetched catalogue, promoted entries first.
   *
   * Replaces rather than merges: a model OpenRouter has stopped routing must
   * leave the picker, and a union with the previous fetch would keep it there
   * forever. Promotion is an intersection, never a union — a shortlist slug the
   * provider did not list is simply absent, because offering it would mean
   * promoting an option that fails on send.
   *
   * An empty list is stored as "no catalogue" rather than as an empty one. It
   * is a real answer — every model can be filtered out for lacking
   * structured-output support — but a warm-and-empty cache would reject every
   * model, turning a filter that found nothing into a total outage.
   */
  replace(entries: readonly ModelCatalogEntry[]): void {
    if (entries.length === 0) {
      this.entries = null;
      return;
    }
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const promoted = this.shortlist
      .map((id) => byId.get(id))
      .filter((entry): entry is ModelCatalogEntry => entry !== undefined)
      .map((entry) => ({ ...entry, promoted: true }));
    const promotedIds = new Set(promoted.map((entry) => entry.id));
    const rest = entries
      .filter((entry) => !promotedIds.has(entry.id))
      .map((entry) => ({ ...entry, promoted: false }));
    this.entries = [...promoted, ...rest];
  }

  /** The fetched catalogue, or null when there has not been a usable one. */
  list(): readonly ModelCatalogEntry[] | null {
    return this.entries;
  }

  /**
   * Whether this model may be sent.
   *
   * Warm, the provider's own list decides. Cold, the shared shape rule does —
   * the same rule that applies when there is no key to fetch a catalogue with.
   * Degrading to the looser check rather than to a refusal is deliberate: the
   * catalogue is an accuracy improvement over the shape rule, not a permission
   * the feature waits on.
   */
  accepts(model: unknown): boolean {
    if (this.entries === null) return isModelForProvider(this.provider, model);
    return this.entries.some((entry) => entry.id === model);
  }
}
