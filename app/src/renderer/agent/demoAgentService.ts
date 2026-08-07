import {
  PROVIDER_IDS,
  type AgentDraftRequest,
  type AgentDraftResult,
  type AgentProviderStatus,
  type AgentService,
  type CredentialConfigureResult,
  type GeneratedRunDraft,
} from "../../shared/agentTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";

const DEMO_DRAFT: GeneratedRunDraft = {
  name: "Model-assisted Grover estimate",
  application: { type: "benchmark", benchmarkId: "grovers-search" },
  architecture: {
    type: "gateBased",
    errorRate: 0.0001,
    gateTime: 50,
    measurementTime: 100,
    twoQubitGateTime: null,
  },
  magicStateFactories: ["round_based"],
  secondaryFactories: [],
  memoryOptimization: "none",
  parameters: {
    bitSize: null,
    generator: null,
    rsaInstance: null,
    latticeN1: null,
    latticeN2: null,
    totalTime: null,
    trotterStep: null,
    couplingJ: null,
    fieldG: null,
    searchQubits: 20,
    precision: null,
    registerSize: null,
  },
  traceTransform: {
    tStatesPerRotation: 20,
    ccxMagicStates: false,
    slowDownFactor: 1,
    dynamicMemoryCompute: null,
    unmemory: false,
  },
  maxError: 1,
};

/**
 * Deterministic, offline service used only while the real preload/provider seam
 * is unavailable. Its status makes that limitation explicit in the UI.
 */
export const demoAgentService: AgentService = {
  async getStatus(): Promise<AgentProviderStatus> {
    return {
      available: true,
      networkEnabled: false,
      // Derived from the shared catalogue rather than copied. providerModels.ts
      // exists so a selectable model cannot describe one provider in preview
      // and another at send time; a hand-kept second list here would drift the
      // moment a model is added and silently break that guarantee under test.
      providers: PROVIDER_IDS.map((provider) => ({
        provider,
        ...PROVIDER_MODELS[provider],
        // The fixture answers for whichever provider is selected — it is
        // offline, so "configured" costs nothing and keeps the demo usable.
        configured: true,
      })),
      mode: "local_demo",
    };
  },

  /** Nothing is sent, so the honest preview is the prompt and nothing else. */
  async previewRequest(request: AgentDraftRequest): Promise<unknown> {
    return { mode: "local_demo", note: "No request leaves this machine.", ...request };
  },

  async requestDraft(_request: AgentDraftRequest): Promise<AgentDraftResult> {
    return {
      ok: true,
      draft: structuredClone(DEMO_DRAFT),
      provider: "Local demo",
      model: "deterministic fixture",
    };
  },

  /** There is no store behind the demo, so accepting a key would be a lie. */
  async configureCredential(): Promise<CredentialConfigureResult> {
    return {
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      message:
        "The offline demo has no credential store. Run the packaged app to configure a provider.",
    };
  },
};
