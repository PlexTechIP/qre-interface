import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PROVIDER_IDS,
  type AgentChatRequest,
  type AgentChatResult,
  type AgentProviderStatus,
  type AgentService,
  type ModelCatalogEntry,
  type ProviderId,
} from "../shared/agentTypes";
import { InMemoryChatStore } from "../shared/chatStore";
import { PROVIDER_MODELS } from "../shared/providerModels";
import { InMemoryRunStore } from "../shared/runStore";
import {
  SAMPLE_RUN_RECORDS,
  buildFrontierRow,
  buildRunRecord,
  buildSuccessResult,
  fakeAgentService,
  fakeAppInfoService,
  fakeEstimator,
} from "../shared/testing";
import { App, resolveAgentService } from "./App";
import { setSystemPrefersDark, systemThemeListenerCount } from "./test/matchMedia";

/**
 * The preload seams the shell reads. `window.agent` and `window.chats` are
 * populated here for the same reason `estimator` and `store` are: preload
 * defines all of them in every shipped build, so a test that leaves one out is
 * testing a shape the app never has. (`window.chats` also has a default in
 * `test/setup.ts`; it is restated here beside the others for that reason.)
 */
describe("App shell wiring", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore(SAMPLE_RUN_RECORDS);
    window.agent = fakeAgentService();
    window.chats = new InMemoryChatStore();
  });

  /** One turn on the chat page, ending with the proposal handed to the form. */
  async function proposeViaChat(): Promise<void> {
    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your message" }),
      "Estimate Grover search",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Use this configuration" }),
    );
  }

  it("opens on the Run Configuration surface", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
  });

  it("places Describe a Run after Comparison in the sidebar", () => {
    render(<App />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels.indexOf("Describe a Run")).toBeGreaterThan(labels.indexOf("Comparison"));
  });

  it("moves a model proposal into the existing editable form without running", async () => {
    const estimatorRun = vi.fn(window.estimator.run);
    window.estimator = { run: estimatorRun };
    render(<App />);

    await proposeViaChat();

    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    expect(screen.getByDisplayValue("Model-assisted Grover estimate")).toBeVisible();
    expect(screen.getByDisplayValue("50")).toBeVisible();
    expect(estimatorRun).not.toHaveBeenCalled();
  });

  /**
   * The review step's missing half. The form the analyst lands on is fully
   * populated, so without this they cannot tell the model's decisions from the
   * defaults it never mentioned.
   */
  it("says which fields the model chose on the form it hands over", async () => {
    render(<App />);

    await proposeViaChat();

    const panel = (
      await screen.findByRole("heading", { name: /drafted by/i })
    ).closest("section");
    if (!panel) throw new Error("Expected the model-proposal panel.");
    // The fixture's draft: Grover, gate-based, 50 ns gates, 20 search qubits.
    // Queried by each entry's accessible name — "Benchmark" is both a field
    // label and the Application Type's value, so bare text is ambiguous.
    expect(
      within(panel).getByRole("button", { name: /^Benchmark: Grover's Search\./ }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: /^Search Qubits: 20\./ }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: /^Application Type: Benchmark\./ }),
    ).toBeVisible();

    // And it is a real affordance: the entry moves the analyst to the control.
    await userEvent.click(
      within(panel).getByRole("button", { name: /Gate time/ }),
    );
    expect(document.querySelector(".field--flash")).not.toBeNull();
  });

  it("the Results nav item shows the results surface, not the configuration form", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Results" }));

    // The results surface's idle empty state — proves the nav item is wired to a
    // real destination and no longer just re-renders the config form.
    expect(screen.getByText("No results yet")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Run estimate" }),
    ).not.toBeInTheDocument();
  });

  it("Rerun from history loads the reconstructed config into the form", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const rerunButtons = await screen.findAllByRole("button", { name: "Rerun" });
    await userEvent.click(rerunButtons[0]!);

    // We land back on the configuration form...
    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    // ...and the run-name field is pre-filled (the blank default would be empty),
    // proving the reconstructed config reached the form instead of a JSON dialog.
    const nameInput = screen.getByRole("textbox", {
      name: /optional/i,
    }) as HTMLInputElement;
    expect(nameInput.value.length).toBeGreaterThan(0);
  });

  it("switches the sidebar to Results when a run completes", async () => {
    render(<App />);

    // The default config only needs gate + measurement times to become valid.
    await userEvent.type(
      screen.getByRole("textbox", { name: /single-qubit gate time/i }),
      "50",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /^measurement time/i }),
      "100",
    );
    await userEvent.click(screen.getByRole("button", { name: /run estimate/i }));

    // On completion the sidebar moves to Results and the result shows there.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Estimation Results" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Rerun" })).toBeEnabled();
  });

  it("opening a run from Run History shows it on the Results page and moves the sidebar", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[0]!);

    expect(
      await screen.findByRole("heading", { name: "Estimation Results" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exports and reruns the resolved record directly from Results", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[0]!);

    const exportButton = await screen.findByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await userEvent.click(exportButton);

    const exportDialog = screen.getByRole("dialog");
    expect(
      within(exportDialog).getByRole("heading", {
        name: "Export run",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(exportDialog).getByRole("button", { name: "Close" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Rerun" }));
    expect(
      await screen.findByRole("heading", { name: "Run Configuration" }),
    ).toBeVisible();
    const nameInput = screen.getByRole("textbox", {
      name: /optional/i,
    }) as HTMLInputElement;
    // Rerun appends an incrementing "(n)" suffix, like a duplicate download.
    expect(nameInput.value).toMatch(/\(\d+\)$/);
  });

  it("keeps each run's selected frontier row across Results, History, and Comparison", async () => {
    const selectedRun = buildRunRecord({
      config: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Three-row session run",
      },
      result: {
        frontier: [
          buildFrontierRow({
            physicalQubits: { value: 111_111, unit: "qubits", display: "ignored" },
          }),
          buildFrontierRow({
            physicalQubits: { value: 222_222, unit: "qubits", display: "ignored" },
          }),
          buildFrontierRow({
            physicalQubits: { value: 333_333, unit: "qubits", display: "ignored" },
          }),
        ],
      },
    });
    const comparisonRun = buildRunRecord({
      config: {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Default-row comparison run",
      },
    });
    window.store = new InMemoryRunStore([selectedRun, comparisonRun]);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run History" }));

    const selectedRunCell = await screen.findByText(selectedRun.config.name);
    const selectedHistoryRow = selectedRunCell.closest("tr");
    if (!selectedHistoryRow) throw new Error("Expected selected run history row.");
    await userEvent.click(
      within(selectedHistoryRow).getByRole("button", { name: "View" }),
    );

    const thirdFrontierRow = await screen.findByRole("row", {
      name: /3 333,333/i,
    });
    await userEvent.click(thirdFrontierRow);

    await userEvent.click(screen.getByRole("button", { name: "Run History" }));
    const refreshedSelectedCell = await screen.findByText(selectedRun.config.name);
    const refreshedSelectedRow = refreshedSelectedCell.closest("tr");
    if (!refreshedSelectedRow) throw new Error("Expected refreshed history row.");
    expect(within(refreshedSelectedRow).getByText("333,333")).toBeInTheDocument();

    const defaultRunCell = screen.getByText(comparisonRun.config.name);
    const defaultHistoryRow = defaultRunCell.closest("tr");
    if (!defaultHistoryRow) throw new Error("Expected default comparison row.");
    await userEvent.click(within(refreshedSelectedRow).getByRole("checkbox"));
    await userEvent.click(within(defaultHistoryRow).getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: /compare selected \(2\)/i }),
    );

    const comparisonTable = screen.getByRole("table");
    expect(within(comparisonTable).getByText("Row 3 of 3")).toBeInTheDocument();
    const qubitsRow = within(comparisonTable)
      .getByText("Physical Qubits")
      .closest("tr");
    if (!qubitsRow) throw new Error("Expected physical-qubits comparison row.");
    expect(within(qubitsRow).getByText("333,333")).toBeInTheDocument();
  });
});

/**
 * How the shell finds the agent seam. This used to end in `demoAgentService` —
 * a fixture living in the renderer's production tree, third in the resolution
 * order of the shipped app.
 *
 * `preload.ts` defines `window.agent` unconditionally, so that third branch was
 * unreachable in Electron and reachable only under test: the whole suite ran
 * against a seam production can never take, and a green run therefore said
 * nothing about whether the real one worked. The fixture now lives with the
 * other test doubles and is injected, and the resolution order has two entries.
 */
describe("agent service resolution", () => {
  afterEach(() => {
    delete (window as { agent?: AgentService }).agent;
  });

  it("prefers an explicitly injected service", () => {
    const injected = fakeAgentService();
    window.agent = fakeAgentService();

    expect(resolveAgentService(injected)).toBe(injected);
  });

  it("otherwise uses the preload surface", () => {
    const preload = fakeAgentService();
    window.agent = preload;

    expect(resolveAgentService()).toBe(preload);
  });

  it("has no fixture behind the preload surface — a missing seam says so", () => {
    delete (window as { agent?: AgentService }).agent;

    expect(() => resolveAgentService()).toThrow(/window\.agent/);
  });
});

/**
 * Settings — the page that key entry moved to.
 *
 * These assert the shell's half of that move: the route exists, the chat page
 * can reach it, and configuring a provider there has the one shell-level
 * consequence it should.
 */
describe("App shell — Settings", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore();
    window.chats = new InMemoryChatStore();
    // `getInitialAgentSelection` reads localStorage, so a selection left behind
    // by another test would decide which provider these start on.
    window.localStorage.clear();
  });

  /** A service whose stored keys can change, so a refresh has something to see. */
  function agentServiceWithKeys(configured: Set<ProviderId>): AgentService {
    return {
      ...fakeAgentService(),
      async getStatus(): Promise<AgentProviderStatus> {
        const providers = PROVIDER_IDS.map((provider) => ({
          provider,
          ...PROVIDER_MODELS[provider],
          configured: configured.has(provider),
        }));
        return configured.size === 0
          ? {
              available: false,
              networkEnabled: false,
              providers,
              mode: "unavailable",
              message: "No model provider is configured.",
            }
          : { available: true, networkEnabled: true, providers, mode: "provider" };
      },
      async configureCredential(provider: ProviderId) {
        configured.add(provider);
        return { ok: true as const };
      },
    };
  }

  /** The header control that replaced the standalone "Network on" badge. */
  const badge = (): HTMLElement => screen.getByRole("button", { name: /^Settings/ });

  /**
   * Settings is reachable from the header on every page rather than from the
   * left nav. It was moved because the control that opens it is also the app's
   * networked-features indicator — the badge used to report a state whose only
   * fix lived somewhere the badge did not point at.
   */
  it("keeps Settings out of the primary navigation", () => {
    window.agent = fakeAgentService();
    render(<App />);

    const nav = screen.getByLabelText("Primary navigation");
    expect(within(nav).queryByRole("button", { name: /^Settings/ })).toBeNull();
    expect(within(nav).getByRole("button", { name: "Describe a Run" })).toBeVisible();
  });

  it("opens the Settings page from the header", async () => {
    window.agent = fakeAgentService();
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));

    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  it("reaches Settings from the chat page when nothing is configured", async () => {
    window.agent = agentServiceWithKeys(new Set());
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open Settings" }));

    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  /**
   * Without this the first key an analyst adds appears to do nothing: the chat
   * page keeps reporting "no key configured" because the ACTIVE provider is
   * still the unconfigured default, and the only clue is a dropdown they have
   * no reason to touch.
   */
  it("makes a newly configured provider active when the current one has no key", async () => {
    window.agent = agentServiceWithKeys(new Set());
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const openai = screen.getByRole("region", { name: "OpenAI" });
    await userEvent.type(within(openai).getByLabelText("OpenAI API key"), "sk-openai-value");
    await userEvent.click(within(openai).getByRole("button", { name: /validate and save/i }));

    await waitFor(() =>
      expect(badge()).toHaveAccessibleName(
        `Settings — Networked features on: OpenAI/${PROVIDER_MODELS.openai.defaultModel}`,
      ),
    );
  });

  it("leaves a working provider selected when a second key is added", async () => {
    window.agent = agentServiceWithKeys(new Set<ProviderId>(["anthropic"]));
    render(<App />);
    await waitFor(() => expect(badge()).toHaveAccessibleName(/Anthropic/));
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const openai = screen.getByRole("region", { name: "OpenAI" });
    await userEvent.type(within(openai).getByLabelText("OpenAI API key"), "sk-openai-value");
    await userEvent.click(within(openai).getByRole("button", { name: /validate and save/i }));

    // Adding a key is not a request to switch away from the one already working.
    await waitFor(() =>
      expect(within(openai).getByText("Configured")).toBeVisible(),
    );
    expect(badge()).toHaveAccessibleName(/Anthropic/);
  });

  it("re-reads provider status after a key is removed", async () => {
    const configured = new Set<ProviderId>(["anthropic"]);
    window.agent = {
      ...agentServiceWithKeys(configured),
      async clearCredential(provider: ProviderId) {
        configured.delete(provider);
        return { ok: true as const };
      },
    };
    render(<App />);
    await waitFor(() => expect(badge()).toHaveAccessibleName(/features on/i));
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const anthropic = screen.getByRole("region", { name: "Anthropic" });
    await userEvent.click(within(anthropic).getByRole("button", { name: "Remove key" }));
    await userEvent.click(within(anthropic).getByRole("button", { name: "Remove Anthropic key" }));

    // The header control would otherwise keep claiming a key that is gone.
    await waitFor(() => expect(badge()).toHaveAccessibleName(/features off/i));
  });

  it("shows where the databases live, via the preload bridge", async () => {
    window.agent = fakeAgentService();
    window.appInfo = fakeAppInfoService();
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Data & storage" }));

    expect(
      await screen.findByText("/fixture/userData/run-history.sqlite"),
    ).toBeVisible();
  });

  /**
   * The end-to-end shape of the bug: the shell holds the open conversation,
   * Settings deletes every conversation, and `send` then appends to an id the
   * store no longer has — which it rejects, so the next message and every one
   * after it fails to save.
   */
  it("can still send after deleting every conversation from Settings", async () => {
    window.agent = fakeAgentService();
    window.appInfo = fakeAppInfoService();
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your message" }),
      "Estimate Grover search",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("button", { name: "Use this configuration" });

    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Data & storage" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete all conversations" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete everything" }));

    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your message" }),
      "Estimate Shor factoring",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("button", { name: "Use this configuration" }),
    ).toBeVisible();
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
  });

  /**
   * The switch-on-first-key rule reads provider status, which refreshes
   * asynchronously. Saving a second key before that refresh lands used to see
   * a snapshot in which nothing was configured, and switch away from the
   * provider the first key had just made active.
   */
  it("does not switch away from a provider whose key is still settling", async () => {
    const configured = new Set<ProviderId>();
    // Held on an object: a bare `let` assigned only inside the promise
    // executor narrows to `never` at the call site below.
    const pending: { settle: (() => void) | null } = { settle: null };
    window.appInfo = fakeAppInfoService();
    window.agent = {
      ...fakeAgentService(),
      // Never resolves until a test releases it, so the shell keeps the
      // all-unconfigured status it starts with.
      getStatus(): Promise<AgentProviderStatus> {
        return new Promise((resolve) => {
          pending.settle = () =>
            resolve({
              available: true,
              networkEnabled: true,
              mode: "provider",
              providers: PROVIDER_IDS.map((provider) => ({
                provider,
                ...PROVIDER_MODELS[provider],
                configured: configured.has(provider),
              })),
            });
        });
      },
      async configureCredential(provider: ProviderId) {
        configured.add(provider);
        return { ok: true as const };
      },
    };
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const openai = screen.getByRole("region", { name: "OpenAI" });
    await userEvent.type(within(openai).getByLabelText("OpenAI API key"), "sk-openai");
    await userEvent.click(within(openai).getByRole("button", { name: /validate and save/i }));
    // Status has NOT refreshed yet — that is the whole point.
    const anthropic = screen.getByRole("region", { name: "Anthropic" });
    await userEvent.type(within(anthropic).getByLabelText("Anthropic API key"), "sk-ant");
    await userEvent.click(within(anthropic).getByRole("button", { name: /validate and save/i }));

    pending.settle?.();
    await waitFor(() => expect(badge()).toHaveAccessibleName(/OpenAI/));
  });

  it("changes the theme from Settings", async () => {
    window.agent = fakeAgentService();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

/**
 * Following the system theme.
 *
 * The preference ("system") and the applied theme ("light"/"dark") are
 * different values; these pin down the places that difference shows.
 */
describe("App shell — system theme", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore();
    window.chats = new InMemoryChatStore();
    window.agent = fakeAgentService();
    window.localStorage.clear();
    delete document.documentElement.dataset["theme"];
  });

  it("follows the system on a first launch with nothing stored", () => {
    setSystemPrefersDark(true);

    render(<App />);

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  /**
   * The whole point of the option. Reading `prefers-color-scheme` once at
   * mount would pass every other test here and still leave the app light at
   * sunset until the analyst relaunched it.
   */
  it("repaints when the system flips while following it", async () => {
    render(<App />);
    expect(document.documentElement.dataset["theme"]).toBe("light");

    await act(async () => {
      setSystemPrefersDark(true);
    });

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("stores the preference rather than the theme it resolved to", async () => {
    setSystemPrefersDark(true);
    render(<App />);

    await waitFor(() =>
      expect(window.localStorage.getItem("qre-theme")).toBe("system"),
    );
  });

  it("stops following once the header toggle pins a theme", async () => {
    render(<App />);

    // Prefix-matched: while following the system the button's accessible name
    // continues into the warning that pressing it stops doing so.
    await userEvent.click(screen.getByRole("button", { name: /^Switch to dark mode/ }));
    await act(async () => {
      setSystemPrefersDark(true);
    });

    // Pinned dark already; the interesting half is that going back to system
    // light does not drag the app back to light.
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    await act(async () => {
      setSystemPrefersDark(false);
    });
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(window.localStorage.getItem("qre-theme")).toBe("dark");
  });

  it("restores a pinned theme on the next launch", () => {
    window.localStorage.setItem("qre-theme", "dark");
    setSystemPrefersDark(false);

    render(<App />);

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  /** A subscription that outlives the window is a leak, and jsdom will not say so. */
  it("unsubscribes from the system theme when it goes away", () => {
    const { unmount } = render(<App />);
    expect(systemThemeListenerCount()).toBeGreaterThan(0);

    unmount();

    expect(systemThemeListenerCount()).toBe(0);
  });

  it("offers System alongside Light and Dark in Settings", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    setSystemPrefersDark(false);
    await userEvent.click(screen.getByRole("radio", { name: "System" }));

    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(window.localStorage.getItem("qre-theme")).toBe("system");
  });
});

/**
 * OpenRouter's model list is fetched, so the app's own compile-time default for
 * it is a guess that the provider can contradict. Anywhere the SHELL picks a
 * model on the analyst's behalf, it has to pick from what the provider actually
 * routes — a default nobody chose, that fails on first send, is the worst kind
 * of first impression.
 */
describe("App shell — OpenRouter", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore();
    window.chats = new InMemoryChatStore();
    window.localStorage.clear();
  });

  const CATALOGUE: readonly ModelCatalogEntry[] = [
    {
      id: "deepseek/deepseek-chat",
      displayName: "DeepSeek Chat",
      contextLength: 128_000,
      promptPricePerMillion: 0.14,
      completionPricePerMillion: 0.28,
      promoted: true,
    },
  ];

  /** Reports a catalogue that does NOT contain the shipped default slug. */
  function agentServiceWithCatalogue(configured: Set<ProviderId>): AgentService {
    return {
      ...fakeAgentService(),
      async getStatus(): Promise<AgentProviderStatus> {
        const providers = PROVIDER_IDS.map((provider) =>
          provider === "openrouter"
            ? {
                provider,
                displayName: PROVIDER_MODELS.openrouter.displayName,
                configured: configured.has(provider),
                models: CATALOGUE.map((entry) => entry.id),
                defaultModel: "deepseek/deepseek-chat",
                catalog: CATALOGUE,
              }
            : {
                provider,
                ...PROVIDER_MODELS[provider],
                configured: configured.has(provider),
              },
        );
        return configured.size === 0
          ? {
              available: false,
              networkEnabled: false,
              providers,
              mode: "unavailable",
              message: "No model provider is configured.",
            }
          : { available: true, networkEnabled: true, providers, mode: "provider" };
      },
      async configureCredential(provider: ProviderId) {
        configured.add(provider);
        return { ok: true as const };
      },
      async refreshCatalog() {
        return { ok: true as const, models: CATALOGUE, credits: null };
      },
    };
  }

  it("offers OpenRouter as a third provider to configure", async () => {
    window.agent = fakeAgentService();
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    expect(screen.getByRole("region", { name: "OpenRouter" })).toBeVisible();
  });

  /**
   * `PROVIDER_MODELS.openrouter.defaultModel` is `anthropic/claude-sonnet-5`,
   * which this catalogue does not route. Auto-activating the provider with the
   * shipped constant would select a model the main-process gate refuses.
   */
  it("activates a new key on a model the provider actually routes", async () => {
    window.agent = agentServiceWithCatalogue(new Set());
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const card = screen.getByRole("region", { name: "OpenRouter" });
    await userEvent.type(within(card).getByLabelText("OpenRouter API key"), "sk-or-value");
    await userEvent.click(within(card).getByRole("button", { name: /validate and save/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Settings/ })).toHaveAccessibleName(
        "Settings — Networked features on: OpenRouter/deepseek/deepseek-chat",
      ),
    );
  });

  it("shows the fetched catalogue in the model picker, grouped", async () => {
    window.agent = agentServiceWithCatalogue(new Set(["openrouter"]));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    await userEvent.selectOptions(
      (await screen.findAllByLabelText("Provider"))[0] as HTMLElement,
      "openrouter",
    );

    expect(await screen.findByRole("option", { name: /DeepSeek Chat/ })).toBeInTheDocument();
  });
});

/**
 * Fetching the catalogue is the SHELL's job, not the Settings panel's. The
 * panel unmounts on every navigation, so a first-fetch guard living there
 * retried a failing catalogue on each visit — and left the chat page's picker
 * on the shipped shortlist for anyone who never opened Settings at all.
 */
describe("App shell — who fetches the OpenRouter catalogue", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore();
    window.chats = new InMemoryChatStore();
    window.localStorage.clear();
  });

  const ROUTED: readonly ModelCatalogEntry[] = [
    {
      id: "deepseek/deepseek-chat",
      displayName: "DeepSeek Chat",
      contextLength: 128_000,
      promptPricePerMillion: 0.14,
      completionPricePerMillion: 0.28,
      promoted: true,
    },
  ];

  /**
   * Mirrors main: `catalog` is absent for pinned providers, null until a fetch
   * lands, and a list afterwards. `refreshCatalog` flips it, so the shell's
   * effect is exercised against the same state machine the handler implements.
   */
  function serviceWithColdCatalogue(configured: Set<ProviderId>) {
    let catalog: readonly ModelCatalogEntry[] | null = null;
    const refreshCatalog = vi.fn(async () => {
      catalog = ROUTED;
      return { ok: true as const, models: ROUTED, credits: null };
    });
    const service: AgentService = {
      ...fakeAgentService(),
      async getStatus(): Promise<AgentProviderStatus> {
        const providers = PROVIDER_IDS.map((provider) =>
          provider === "openrouter"
            ? {
                provider,
                displayName: PROVIDER_MODELS.openrouter.displayName,
                configured: configured.has(provider),
                models: catalog?.map((entry) => entry.id) ?? [
                  ...PROVIDER_MODELS.openrouter.models,
                ],
                defaultModel: catalog?.[0]?.id ?? PROVIDER_MODELS.openrouter.defaultModel,
                catalog,
              }
            : { provider, ...PROVIDER_MODELS[provider], configured: configured.has(provider) },
        );
        return configured.size === 0
          ? {
              available: false,
              networkEnabled: false,
              providers,
              mode: "unavailable",
              message: "No model provider is configured.",
            }
          : { available: true, networkEnabled: true, providers, mode: "provider" };
      },
      async configureCredential(provider: ProviderId) {
        configured.add(provider);
        return { ok: true as const };
      },
      refreshCatalog,
    };
    return { service, refreshCatalog };
  }

  it("fetches on its own, without the analyst opening Settings", async () => {
    const { service, refreshCatalog } = serviceWithColdCatalogue(new Set(["openrouter"]));
    window.agent = service;

    render(<App />);

    await waitFor(() => expect(refreshCatalog).toHaveBeenCalledWith("openrouter"));
  });

  it("asks once, not once per status read", async () => {
    const { service, refreshCatalog } = serviceWithColdCatalogue(new Set(["openrouter"]));
    window.agent = service;
    render(<App />);
    await waitFor(() => expect(refreshCatalog).toHaveBeenCalledOnce());

    // Navigating remounts Settings; the shell's record must outlive that.
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("button", { name: "Run Configuration" }));
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));

    expect(refreshCatalog).toHaveBeenCalledOnce();
  });

  it("does not go looking for a catalogue with no key to fetch it", async () => {
    const { service, refreshCatalog } = serviceWithColdCatalogue(new Set());
    window.agent = service;

    render(<App />);
    await screen.findByRole("button", { name: /^Settings/ });

    expect(refreshCatalog).not.toHaveBeenCalled();
  });

  /**
   * The real first-key sequence, which the earlier test could not reach: the
   * catalogue is COLD when the key lands, so the shell activates OpenRouter on
   * the shipped default. Once the fetch lands and contradicts it, a selection
   * the app chose — never one the analyst did — has to move to something that
   * actually routes, or their first send fails on a choice they never made.
   */
  it("re-points a selection it chose itself once the catalogue contradicts it", async () => {
    const { service } = serviceWithColdCatalogue(new Set());
    window.agent = service;
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    const card = screen.getByRole("region", { name: "OpenRouter" });
    await userEvent.type(within(card).getByLabelText("OpenRouter API key"), "sk-or-value");
    await userEvent.click(within(card).getByRole("button", { name: /validate and save/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Settings/ })).toHaveAccessibleName(
        "Settings — Networked features on: OpenRouter/deepseek/deepseek-chat",
      ),
    );
  });

  /** A model the analyst picked stays picked, even once it stops being routed. */
  it("leaves a selection the analyst made alone", async () => {
    const { service } = serviceWithColdCatalogue(new Set(["openrouter"]));
    window.agent = service;
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    await userEvent.click(screen.getByRole("tab", { name: "AI providers" }));

    await userEvent.selectOptions(await screen.findByLabelText("Provider"), "openrouter");
    await userEvent.selectOptions(
      screen.getByLabelText("Model"),
      "deepseek/deepseek-chat",
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Settings/ })).toHaveAccessibleName(
        /OpenRouter\/deepseek\/deepseek-chat/,
      ),
    );
  });
});

/**
 * The run form's state used to live only inside `RunConfiguration`, which is a
 * conditional render — so it was discarded on every sidebar click. That made
 * the week-6 backlog item "a model draft still discards a half-filled form"
 * unfixable in principle: by the time the analyst was on the chat page there
 * was no half-filled form left to discard.
 */
describe("App shell — the run form across navigation", () => {
  beforeEach(() => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 10 });
    window.store = new InMemoryRunStore();
    window.chats = new InMemoryChatStore();
    window.localStorage.clear();
  });

  const nameField = (): HTMLElement => screen.getByLabelText(/Run Name/i);

  it("still has what the analyst typed after a trip to another tab", async () => {
    window.agent = fakeAgentService();
    render(<App />);

    await userEvent.type(nameField(), "Shor at scale");
    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.click(screen.getByRole("button", { name: "Run Configuration" }));

    expect(nameField()).toHaveValue("Shor at scale");
  });

  /**
   * The other half of the same fix: what survives navigation is also what the
   * model is told. Without it a proposal is authored against defaults and
   * silently resets the field the analyst had just filled in.
   */
  it("tells the model what is already filled in", async () => {
    const seen: AgentChatRequest[] = [];
    window.agent = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return fakeAgentService().requestReply(request);
      },
    };
    render(<App />);

    await userEvent.type(nameField(), "Shor at scale");
    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      await screen.findByLabelText("Your message"),
      "size this for me",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.formContext).toEqual(
      expect.arrayContaining([{ field: "name", value: "Shor at scale" }]),
    );
  });

  it("says nothing about a form nobody has touched", async () => {
    const seen: AgentChatRequest[] = [];
    window.agent = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return fakeAgentService().requestReply(request);
      },
    };
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Describe a Run" }));
    await userEvent.type(
      await screen.findByLabelText("Your message"),
      "size this for me",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).not.toHaveProperty("formContext");
  });
});
