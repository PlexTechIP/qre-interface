/**
 * Boundary types for model-generated configuration drafts.
 *
 * A generated draft is deliberately not a RunConfig: identity, timestamps,
 * derived QEC, provenance, and the bundled QRE version remain app-controlled.
 * Part E converts this draft into the existing editable FormState before the
 * normal toRunConfig/validation/Run-click path can execute anything.
 */

import type { Application, Architecture, RunConfig } from "./types";

export const PROVIDER_IDS = ["anthropic", "openai", "openrouter"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

type RequiredNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined> | null;
};

type BenchmarkApplication = Extract<Application, { type: "benchmark" }>;
type ManualCountsApplication = Extract<Application, { type: "manualCounts" }>;

/**
 * Uploaded programs are intentionally absent. Choosing or inventing a local
 * file path is not natural-language configuration, and circuit generation is
 * explicitly outside week 5's scope.
 */
export type GeneratedApplication =
  BenchmarkApplication | ManualCountsApplication;

type GateBasedArchitecture = Extract<Architecture, { type: "gateBased" }>;
type MajoranaArchitecture = Extract<Architecture, { type: "majorana" }>;
type NeutralAtomArchitecture = Extract<Architecture, { type: "neutralAtom" }>;

/**
 * Optional contract values become required-and-nullable for strict output.
 *
 * The Majorana T error rate and target year, and the Neutral Atom data-qubit
 * spacing and target year, are deliberately absent: `draftToFormState` refused
 * every one of them, so offering them gave the model four ways to produce a
 * draft the app would throw away — while each nullable field also spent one of
 * the provider's capped union slots and inflated the decoding grammar. The
 * analyst sets them in the form.
 */
export type GeneratedArchitecture =
  | RequiredNullable<GateBasedArchitecture, "twoQubitGateTime">
  | Omit<MajoranaArchitecture, "tErrorRate" | "targetYear">
  | Omit<NeutralAtomArchitecture, "dataQubitSpacing" | "targetYear">;

type CanonicalTraceTransform = RunConfig["traceTransform"];

/**
 * PSSPC settings only. Dynamic Memory Compute and Unmemory were refused by the
 * mapping and `slowDownFactor` is pinned to 1 by the contract, so all three
 * were pure grammar cost with no reachable outcome. The analyst configures the
 * pipeline in the form.
 */
export type GeneratedTraceTransform = Pick<
  CanonicalTraceTransform,
  "tStatesPerRotation" | "ccxMagicStates"
>;

/**
 * Benchmark parameters, as one variant per benchmark rather than a flat record
 * of every key with the irrelevant ones nulled.
 *
 * The flat shape was not merely untidy: each nullable field is a union, and the
 * API caps a structured-output schema at 16 union-typed parameters. Twelve
 * nullable parameters spent most of that budget and the request was rejected
 * with a 400 before the model ever saw it. One variant per benchmark costs a
 * single union and says the true thing — parameters *are* per-benchmark.
 *
 * Consumers still index by key: `draftToFormState` reads only the keys the
 * selected benchmark declares, so a variant that does not match the chosen
 * benchmark yields no parameters rather than wrong ones — the same outcome the
 * all-null shape produced, without the union cost.
 */
export type GeneratedBenchmarkParameters = Partial<
  Record<string, number | string | boolean>
>;

/** Model-owned fields only. This shape can never mint a runnable identity. */
export type GeneratedRunDraft = Pick<
  RunConfig,
  "magicStateFactories" | "maxError"
> & {
  name: string | null;
  application: GeneratedApplication;
  architecture: GeneratedArchitecture;
  secondaryFactories: NonNullable<RunConfig["secondaryFactories"]>;
  memoryOptimization: NonNullable<RunConfig["memoryOptimization"]>;
  parameters: GeneratedBenchmarkParameters;
  traceTransform: GeneratedTraceTransform;
};

/**
 * The lowered generation contract this build speaks.
 *
 * A CONSTANT, not a literal repeated at each site: the renderer stamps it onto
 * every request and the main process checks it, so the two halves have to be
 * reading the same value or the check is decorative. A mismatch means the
 * renderer bundle and the main bundle came from different builds — see
 * `agentHandler.readDraftRequest`.
 */
export const GENERATION_SCHEMA_ID = "runconfig-generation-v1.4.0";

export type ChatRole = "user" | "assistant";

/**
 * One turn as it travels to the provider: role and content, nothing else.
 *
 * Stored messages carry an id, a timestamp, an attributed model and a parsed
 * draft (see `chatTypes.ts`); none of that is the provider's business, and
 * sending it would put app-local identity into a prompt. An assistant turn's
 * `content` is the JSON envelope the model itself emitted, replayed verbatim,
 * so the transcript the model reads back is one it could have written.
 */
export interface ChatTurn {
  readonly role: ChatRole;
  readonly content: string;
}

/**
 * The exact, renderer-visible envelope sent to a configured provider.
 *
 * The whole transcript travels with every request, for the same reason provider
 * and model do: main holds no conversation. Week 5 deferred multi-turn on the
 * grounds that "context has to live somewhere" — it lives here, in the request,
 * and durably in the renderer-owned chat store. The main process still learns
 * nothing between two calls, which is what keeps `previewRequest` honest: what
 * it renders is the entire input to the next completion, not a summary of
 * something main is holding.
 */
export interface AgentChatRequest {
  /** The conversation so far, oldest first, ending on the analyst's new turn. */
  messages: readonly ChatTurn[];
  /** Identifies the lowered structured-output contract used for generation. */
  generationSchema: typeof GENERATION_SCHEMA_ID;
  /** Provider and model travel with every request, never as main-process state. */
  provider: ProviderId;
  model: string;
}

/**
 * One model an aggregating provider actually routes to, as it reported itself.
 *
 * The first-party providers need nothing like this: their model lists are three
 * pinned strings apiece and everything worth saying about them fits in the id.
 * OpenRouter routes hundreds, so the picker has to say more than a slug — a
 * context window and a price are what separate two plausible-looking options.
 */
export interface ModelCatalogEntry {
  /** The `vendor/model` slug, which is also what travels in a request. */
  readonly id: string;
  readonly displayName: string;
  /** Tokens, as the provider reports it. Null when it reports nothing usable. */
  readonly contextLength: number | null;
  /** USD per million tokens. Null rather than 0, which is a real free-tier price. */
  readonly promptPricePerMillion: number | null;
  readonly completionPricePerMillion: number | null;
  /** On the shortlist this build promotes — pinned above the long tail. */
  readonly promoted: boolean;
}

/**
 * What a metered key has left, for providers that publish it.
 *
 * OpenRouter does, through the same endpoint that validates the key, so it
 * costs nothing extra to show. Neither first-party provider exposes an
 * equivalent, which is why this is per-provider data and not a field on status.
 */
export interface ProviderCredits {
  /** USD still spendable. Null when the key is uncapped rather than exhausted. */
  readonly remaining: number | null;
  /** USD spent on this key so far. */
  readonly used: number;
  /** The cap `remaining` counts down from, or null for an uncapped key. */
  readonly limit: number | null;
}

export interface ProviderAvailability {
  readonly provider: ProviderId;
  readonly displayName: string;
  /** A key is stored for this provider — never the key itself. */
  readonly configured: boolean;
  readonly models: readonly string[];
  readonly defaultModel: string;
  /**
   * The provider's own model list. Three states, all of them meaningful:
   *
   * - **absent** — this provider has no catalogue to fetch. Its models are a
   *   compile-time constant and there is nothing to refresh, which is why
   *   Settings shows no catalogue controls for Anthropic or OpenAI.
   * - **null** — it has one, and nothing has been fetched yet. `models` is the
   *   shortlist this build ships, and a refresh would replace it.
   * - **a list** — fetched this session. `models` is derived from it, and the
   *   entries carry the context window and pricing a slug alone cannot.
   *
   * Collapsing the first two into "absent" would leave the Settings page
   * guessing which providers own a catalogue by name.
   */
  readonly catalog?: readonly ModelCatalogEntry[] | null;
}

/**
 * Refreshing an aggregating provider's model catalogue, and reading whatever
 * account detail comes back with it.
 *
 * A failure resolves as data like every other provider outcome: a catalogue
 * that could not be fetched leaves the app on its shipped shortlist, which is
 * a degraded picker rather than a broken feature.
 */
export type ProviderCatalogResult =
  | {
      ok: true;
      models: readonly ModelCatalogEntry[];
      credits: ProviderCredits | null;
    }
  | { ok: false; code: AgentFailureCode; message: string };

export type AgentProviderStatus =
  | {
      available: true;
      networkEnabled: boolean;
      providers: readonly ProviderAvailability[];
      /** Local demo is deterministic and makes no network request. */
      mode: "provider" | "local_demo";
    }
  | {
      available: false;
      networkEnabled: false;
      providers: readonly ProviderAvailability[];
      mode: "unavailable";
      message: string;
    };

export type AgentFailureCode =
  | "AUTHENTICATION"
  | "RATE_LIMITED"
  | "NETWORK"
  | "TIMEOUT"
  | "REFUSED"
  | "INVALID_RESPONSE"
  /**
   * The analyst abandoned the request while it was in flight.
   *
   * Distinct from TIMEOUT, which is the same `AbortError` from the same
   * `fetch`. Collapsing them would tell someone who just pressed Cancel that
   * "the provider did not respond in time" — a claim about the provider, made
   * about their own action, and the sort of thing that gets debugged for an
   * afternoon.
   */
  | "CANCELLED"
  /**
   * The stored blob exists but could not be decrypted — a locked or reset
   * keychain, a denied access prompt, a file truncated by a crash.
   *
   * Distinct from AUTHENTICATION, which is the provider rejecting a key we read
   * successfully. The analyst's fix differs: re-enter the key (which overwrites
   * the unreadable blob) rather than check it for typos.
   */
  | "CREDENTIAL_UNREADABLE"
  /**
   * The selected model is not one this provider will route to.
   *
   * Only reachable for a provider whose catalogue is fetched rather than
   * pinned. For the first-party providers an unknown model means the renderer
   * and main bundles disagree, which rejects; here it means OpenRouter's
   * inventory moved under a selection the analyst made earlier, which is an
   * ordinary Tuesday and has to arrive as something the UI can render.
   */
  | "UNSUPPORTED_MODEL";

/**
 * Provider failures are expected outcomes and therefore resolve as data.
 *
 * `draft` is nullable because an assistant turn is allowed to be a question.
 * The one-shot surface this replaced could only answer with a complete
 * configuration — structured output left it no other shape — so "what error
 * budget do you want?" was unrepresentable and the model guessed instead. A
 * turn that carries no draft carries no draft; it is not a failure, and the
 * transcript is where the work of narrowing actually happens.
 */
export type AgentChatResult =
  | {
      ok: true;
      /** Prose addressed to the analyst. Never the JSON envelope around it. */
      reply: string;
      draft: GeneratedRunDraft | null;
      provider: string;
      model: string;
    }
  | {
      ok: false;
      code: AgentFailureCode;
      message: string;
    };

/** Storage-layer refusal — distinct from a provider rejecting the key itself. */
export type CredentialStorageFailureCode = "BACKEND_UNAVAILABLE" | "WRITE_FAILED";

/**
 * Configuring a provider key: validated once with a cheap request, then
 * stored. Both provider and storage failures are expected domain outcomes —
 * they resolve as data, exactly like AgentDraftResult, never throw.
 */
export type CredentialConfigureResult =
  | { ok: true }
  | { ok: false; code: AgentFailureCode | CredentialStorageFailureCode; message: string };

/**
 * Removing a stored key. Deleting a file the analyst asked to be gone can fail
 * for ordinary reasons — a permission change, a locked volume — so it resolves
 * as data like everything else on this surface.
 *
 * This is the counterpart `configureCredential` lacked. It is NOT a getter and
 * does not weaken the asymmetry the surface is built on: it takes a provider and
 * returns whether the blob is gone. Nothing about the key's *value* travels.
 */
export type CredentialClearResult =
  | { ok: true }
  | { ok: false; code: "CLEAR_FAILED"; message: string };

/**
 * Renderer-facing seam. It intentionally has no credential getter.
 *
 * `configureCredential` is one-way by design: a key can be handed to the main
 * process and never asked for again. That asymmetry — a setter with no
 * matching getter — is the point of putting the key in main at all, and it is
 * why credential entry stayed on this surface instead of becoming a sixth one:
 * a `window.credentials` object invites someone to add `get()` to it later.
 */
export interface AgentService {
  getStatus(): Promise<AgentProviderStatus>;
  /** The exact request body `requestReply` would send. Carries no credential. */
  previewRequest(request: AgentChatRequest): Promise<unknown>;
  requestReply(request: AgentChatRequest): Promise<AgentChatResult>;
  /**
   * Abandon the turn this window has in flight, if any. Resolves either way —
   * a cancel that races the reply is not an error, it is a no-op.
   */
  cancelReply(): Promise<void>;
  configureCredential(
    provider: ProviderId,
    apiKey: string,
  ): Promise<CredentialConfigureResult>;
  /** Delete a provider's stored key. The one-way street's exit, not a getter. */
  clearCredential(provider: ProviderId): Promise<CredentialClearResult>;
  /**
   * Re-fetch an aggregating provider's model catalogue, and its credit balance
   * if it publishes one.
   *
   * Always a network call, never a cached read — the button that triggers it
   * says "Refresh", and a refresh that quietly returned last hour's list would
   * be the only control on this page that lies. The result is cached in main
   * for the session so `getStatus` can report it without going out again.
   *
   * It needs the stored key, which is why it lives on this surface and takes no
   * credential: the renderer names the provider, main supplies the secret. That
   * is the same asymmetry `requestReply` runs on, and the reason there is still
   * nothing here that hands a key back.
   */
  refreshCatalog(provider: ProviderId): Promise<ProviderCatalogResult>;
}
