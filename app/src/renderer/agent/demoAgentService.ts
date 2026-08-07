import type {
  AgentDraftRequest,
  AgentDraftResult,
  AgentProviderStatus,
  AgentService,
  CredentialConfigureResult,
  GeneratedRunDraft,
} from "../../shared/agentTypes";

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
      provider: "Local demo",
      model: "deterministic fixture",
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
