/**
 * A deterministic, offline `AgentService` for tests.
 *
 * This lived at `renderer/agent/demoAgentService.ts` until week 6, where it was
 * the third branch of `agentService ?? window.agent ?? demoAgentService` — a
 * fixture inside the renderer's production tree. `preload.ts` defines
 * `window.agent` in every shipped build, so that branch was unreachable in
 * Electron and reachable only under test: the suite exercised a seam the app
 * can never take. It is a test double, so it lives with the test doubles and is
 * injected by the tests that want it.
 *
 * It reports `mode: "provider"` — the shape the real main-process handler
 * returns once a key is stored (see `main/agentHandler.ts`). Reporting
 * `local_demo` here would put the App suite back on a status the shipped app
 * cannot produce, which is the same mistake one level down. The two components
 * that render `local_demo` build that status inline in their own tests.
 */

import {
  PROVIDER_IDS,
  type AgentChatRequest,
  type AgentChatResult,
  type AgentProviderStatus,
  type AgentService,
  type CredentialClearResult,
  type CredentialConfigureResult,
  type GeneratedRunDraft,
} from "../agentTypes";
import { PROVIDER_MODELS } from "../providerModels";

/** The proposal `fakeAgentService` returns. Grover, gate-based, all defaults. */
export const FAKE_GENERATED_DRAFT: GeneratedRunDraft = {
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
  // The Grover variant only — the schema is one variant per benchmark, not
  // every key with the irrelevant ones nulled.
  parameters: { searchQubits: 20 },
  traceTransform: { tStatesPerRotation: 20, ccxMagicStates: false },
  maxError: 1,
};

export interface FakeAgentServiceOptions {
  /** The proposal `requestReply` resolves with. Defaults to Grover. */
  draft?: GeneratedRunDraft | null;
  /** The prose `requestReply` resolves with. */
  reply?: string;
  /** Resolve as a typed failure instead, the way a real provider outcome does. */
  failure?: Extract<AgentChatResult, { ok: false }>;
}

export function fakeAgentService(
  options: FakeAgentServiceOptions = {},
): AgentService {
  const draft = options.draft === undefined ? FAKE_GENERATED_DRAFT : options.draft;
  return {
    async getStatus(): Promise<AgentProviderStatus> {
      return {
        available: true,
        networkEnabled: true,
        // Derived from the shared catalogue rather than copied. providerModels.ts
        // exists so a selectable model cannot describe one provider in preview
        // and another at send time; a hand-kept second list here would drift the
        // moment a model is added and silently break that guarantee under test.
        providers: PROVIDER_IDS.map((provider) => ({
          provider,
          ...PROVIDER_MODELS[provider],
          configured: true,
        })),
        mode: "provider",
      };
    },

    /** Nothing is sent, so the honest preview is the request and nothing else. */
    async previewRequest(request: AgentChatRequest): Promise<unknown> {
      return { note: "Test fixture — no request leaves this machine.", ...request };
    },

    async requestReply(_request: AgentChatRequest): Promise<AgentChatResult> {
      if (options.failure !== undefined) return options.failure;
      return {
        ok: true,
        reply: options.reply ?? "Here is a starting point for that estimate.",
        draft: draft === null ? null : structuredClone(draft),
        provider: "Test fixture",
        model: "deterministic fixture",
      };
    },

    /** Nothing is in flight behind a fixture, so cancelling is a no-op. */
    async cancelReply(): Promise<void> {},

    /** There is no store behind a fixture, so accepting a key would be a lie. */
    async configureCredential(): Promise<CredentialConfigureResult> {
      return {
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        message:
          "The test fixture has no credential store. Run the packaged app to configure a provider.",
      };
    },

    /**
     * Removing a key that was never stored is the success case in the real
     * handler too: the analyst asked for it to be gone, and it is.
     */
    async clearCredential(): Promise<CredentialClearResult> {
      return { ok: true };
    },
  };
}
