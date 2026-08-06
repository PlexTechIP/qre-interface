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

/** The exact, renderer-visible envelope sent to a configured provider. */
export interface AgentDraftRequest {
  /** Natural-language configuration request entered by the analyst. */
  prompt: string;
  /** Identifies the lowered structured-output contract used for generation. */
  generationSchema: "runconfig-generation-v1.4.0";
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
  | "INVALID_RESPONSE";

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

/** Renderer-facing seam. It intentionally has no credential getter. */
export interface AgentService {
  getStatus(): Promise<AgentProviderStatus>;
  requestDraft(request: AgentDraftRequest): Promise<AgentDraftResult>;
}
