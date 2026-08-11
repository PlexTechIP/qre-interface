/**
 * Boundary types for model-generated configuration drafts.
 *
 * A generated draft is deliberately not a RunConfig: identity, timestamps,
 * derived QEC, provenance, and the bundled QRE version remain app-controlled.
 * Part E converts this draft into the existing editable FormState before the
 * normal toRunConfig/validation/Run-click path can execute anything.
 */

import type { Application, Architecture, RunConfig } from "./types";

export const PROVIDER_IDS = ["anthropic", "openai"] as const;
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

/** The exact, renderer-visible envelope sent to a configured provider. */
export interface AgentDraftRequest {
  /** Natural-language configuration request entered by the analyst. */
  prompt: string;
  /** Identifies the lowered structured-output contract used for generation. */
  generationSchema: typeof GENERATION_SCHEMA_ID;
  /** Provider and model travel with every request, never as main-process state. */
  provider: ProviderId;
  model: string;
}

export interface ProviderAvailability {
  readonly provider: ProviderId;
  readonly displayName: string;
  /** A key is stored for this provider — never the key itself. */
  readonly configured: boolean;
  readonly models: readonly string[];
  readonly defaultModel: string;
}

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

export type AgentDraftFailureCode =
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
  | "CREDENTIAL_UNREADABLE";

/** Provider failures are expected outcomes and therefore resolve as data. */
export type AgentDraftResult =
  | {
      ok: true;
      draft: GeneratedRunDraft;
      provider: string;
      model: string;
    }
  | {
      ok: false;
      code: AgentDraftFailureCode;
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
  | { ok: false; code: AgentDraftFailureCode | CredentialStorageFailureCode; message: string };

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
  /** The exact request body `requestDraft` would send. Carries no credential. */
  previewRequest(request: AgentDraftRequest): Promise<unknown>;
  requestDraft(request: AgentDraftRequest): Promise<AgentDraftResult>;
  /**
   * Abandon the draft this window has in flight, if any. Resolves either way —
   * a cancel that races the reply is not an error, it is a no-op.
   */
  cancelDraft(): Promise<void>;
  configureCredential(
    provider: ProviderId,
    apiKey: string,
  ): Promise<CredentialConfigureResult>;
  /** Delete a provider's stored key. The one-way street's exit, not a getter. */
  clearCredential(provider: ProviderId): Promise<CredentialClearResult>;
}
