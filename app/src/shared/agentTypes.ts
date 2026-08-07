/**
 * Boundary types for model-generated configuration drafts.
 *
 * A generated draft is deliberately not a RunConfig: identity, timestamps,
 * derived QEC, provenance, and the bundled QRE version remain app-controlled.
 * Part E converts this draft into the existing editable FormState before the
 * normal toRunConfig/validation/Run-click path can execute anything.
 */

import type { Application, Architecture, RunConfig } from "./types";

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

/** Optional contract values become required-and-nullable for strict output. */
export type GeneratedArchitecture =
  | RequiredNullable<GateBasedArchitecture, "twoQubitGateTime">
  | RequiredNullable<MajoranaArchitecture, "tErrorRate" | "targetYear">
  | RequiredNullable<
      NeutralAtomArchitecture,
      "dataQubitSpacing" | "targetYear"
    >;

type CanonicalTraceTransform = RunConfig["traceTransform"];

/** An absent optional pipeline stage is represented by null in model output. */
export type GeneratedTraceTransform = Omit<
  CanonicalTraceTransform,
  "dynamicMemoryCompute" | "unmemory"
> & {
  dynamicMemoryCompute: NonNullable<
    CanonicalTraceTransform["dynamicMemoryCompute"]
  > | null;
  unmemory: boolean;
};

/**
 * The lowered schema requires every known benchmark-parameter key. Parameters
 * irrelevant to the selected benchmark are null and are discarded when Part E
 * maps the proposal into FormState.
 */
export type GeneratedBenchmarkParameters = Record<
  string,
  number | string | null
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
}

export type AgentProviderStatus =
  | {
      available: true;
      networkEnabled: boolean;
      provider: string;
      model: string;
      /** Local demo is deterministic and makes no network request. */
      mode: "provider" | "local_demo";
    }
  | {
      available: false;
      networkEnabled: false;
      provider: null;
      model: null;
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
  configureCredential(apiKey: string): Promise<CredentialConfigureResult>;
}
