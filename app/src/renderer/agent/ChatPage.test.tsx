import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PROVIDER_IDS,
  type AgentChatRequest,
  type AgentChatResult,
  type AgentProviderStatus,
  type AgentService,
  type FormContextEntry,
  type ProviderId,
} from "../../shared/agentTypes";
import { InMemoryChatStore } from "../../shared/chatStore";
import type { ChatStore } from "../../shared/chatTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";
import { InMemoryRunStore } from "../../shared/runStore";
import type { RunConfig, RunResult } from "../../shared/types";
import { buildSuccessResult, fakeEstimator } from "../../shared/testing";
import { fakeAgentService, FAKE_GENERATED_DRAFT } from "../../shared/testing/fakeAgentService";
import { ChatPage, type ChatView } from "./ChatPage";
import type { FormSnapshot } from "../RunConfiguration";

function statusWith(configured: readonly ProviderId[]): AgentProviderStatus {
  const providers = PROVIDER_IDS.map((provider) => ({
    provider,
    ...PROVIDER_MODELS[provider],
    configured: configured.includes(provider),
  }));
  return configured.length === 0
    ? {
        available: false,
        networkEnabled: false,
        providers,
        mode: "unavailable",
        message: "No model provider is configured. The rest of the app remains available offline.",
      }
    : { available: true, networkEnabled: true, providers, mode: "provider" };
}

interface HarnessOptions {
  service?: AgentService;
  store?: ChatStore;
  status?: AgentProviderStatus;
  provider?: ProviderId;
  onRunComplete?: (config: RunConfig, result: RunResult, conversationId?: string) => void;
  /** Which view to land on. The shell owns this, so the harness does too. */
  view?: ChatView;
  onOpenSettings?: () => void;
  onOpenProviderSettings?: () => void;
  onSelectionChange?: (provider: ProviderId, model: string) => void;
  formContext?: readonly FormContextEntry[];
}

/**
 * The shell owns the open conversation and the composer, so the harness does
 * too — testing them as local state would exercise a component the app does not
 * render.
 */
function renderChat(options: HarnessOptions = {}) {
  const store = options.store ?? new InMemoryChatStore();
  const service = options.service ?? fakeAgentService();
  const onRunComplete = options.onRunComplete ?? vi.fn();
  const onOpenSettings = options.onOpenSettings ?? vi.fn();
  const onOpenProviderSettings = options.onOpenProviderSettings ?? vi.fn();
  const onSelectionChange = options.onSelectionChange ?? vi.fn();
  const provider = options.provider ?? "anthropic";

  function Harness(): React.JSX.Element {
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [composer, setComposer] = useState("");
    const [view, setView] = useState<ChatView>(options.view ?? "conversation");
    // Mirror the shell's ownership of the inline editor, so the harness exercises
    // the real open/seed/close wiring rather than a fake.
    const [editorOpen, setEditorOpen] = useState(false);
    const editorSnapshot = useRef<FormSnapshot | null>(null);
    return (
      <ChatPage
        view={view}
        onViewChange={setView}
        service={service}
        store={store}
        status={options.status ?? statusWith(["anthropic", "openai"])}
        provider={provider}
        model={PROVIDER_MODELS[provider].defaultModel}
        activeConversationId={activeConversationId}
        onActiveConversationChange={setActiveConversationId}
        composer={composer}
        onComposerChange={setComposer}
        onSelectionChange={onSelectionChange}
        onOpenSettings={onOpenSettings}
        onOpenProviderSettings={onOpenProviderSettings}
        getFormContext={() => options.formContext ?? []}
        onRunComplete={onRunComplete}
        editorOpen={editorOpen}
        editorSnapshot={editorSnapshot.current ?? undefined}
        onOpenEditor={(snapshot) => {
          editorSnapshot.current = snapshot;
          setEditorOpen(true);
        }}
        onCloseEditor={() => {
          editorSnapshot.current = null;
          setEditorOpen(false);
        }}
        onEditorStateChange={(snapshot) => {
          editorSnapshot.current = snapshot;
        }}
      />
    );
  }

  render(<Harness />);
  return {
    store,
    service,
    onRunComplete,
    onOpenSettings,
    onOpenProviderSettings,
    onSelectionChange,
  };
}

/*
 * The export tests stub `URL.createObjectURL` and `HTMLAnchorElement.click` on
 * shared prototypes. Restoring at the end of a test body only runs when every
 * assertion above it passed, so one real failure used to leave those stubs in
 * place for the rest of the file and bury the cause under cascading ones.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

const composer = (): HTMLElement => screen.getByRole("textbox", { name: "Your message" });

/**
 * Scoped, because a conversation is auto-titled from its opening message — so
 * the rail legitimately shows the same words the transcript does, and a bare
 * `getByText` cannot tell which one it found.
 */
const transcript = (): HTMLElement => screen.getByRole("list", { name: "Transcript" });

/** The "All conversations" table. Only rendered while that view is showing. */
const list = (): HTMLElement => screen.getByRole("region", { name: "Conversations" });

/**
 * Switch to the list view, the way the analyst does.
 *
 * Scoped to the view switcher. The bare name matched the header's back button
 * too, and the two were told apart only by the `←` the back button's label
 * happened to start with — so removing a decorative glyph for accessibility
 * would have broken every test that routes through here with "found multiple
 * elements".
 */
async function showList(): Promise<HTMLElement> {
  const views = screen.getByRole("group", { name: "Chat views" });
  await userEvent.click(within(views).getByRole("button", { name: /^All conversations/ }));
  return list();
}

/** List → click a title → back on the conversation, which is what Open does. */
async function openConversation(title: string): Promise<void> {
  const table = await showList();
  await userEvent.click(await within(table).findByRole("button", { name: title }));
}

/**
 * Two stored conversations, one of them carrying a proposal.
 *
 * Module scope rather than inside one `describe`: the conversation tests and
 * the audit regressions below both need exactly this fixture, and a second copy
 * is a second thing to keep in step.
 */
async function seedTwo(): Promise<ChatStore> {
  const store = new InMemoryChatStore();
  await store.create({ id: "c1", title: "Grover baseline", createdAt: "2026-08-10T09:00:00.000Z" });
  await store.append("c1", {
    id: "m1",
    role: "user",
    text: "Estimate Grover search",
    draft: null,
    model: null,
    createdAt: "2026-08-10T09:01:00.000Z",
  });
  await store.append("c1", {
    id: "m1b",
    role: "assistant",
    text: "Here is a starting point.",
    draft: FAKE_GENERATED_DRAFT,
    model: "Anthropic/claude-sonnet-5",
    createdAt: "2026-08-10T09:02:00.000Z",
  });
  await store.create({ id: "c2", title: "Shor factoring", createdAt: "2026-08-10T10:00:00.000Z" });
  await store.append("c2", {
    id: "m2",
    role: "user",
    text: "Estimate Shor for 2048 bits",
    draft: null,
    model: null,
    createdAt: "2026-08-10T10:01:00.000Z",
  });
  return store;
}

async function sendMessage(text: string): Promise<void> {
  await userEvent.type(composer(), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("ChatPage — a turn", () => {
  it("shows the model's prose and its proposal, and stores both", async () => {
    const { store } = renderChat();

    await sendMessage("Estimate Grover search");

    expect(
      await screen.findByText("Here is a starting point for that estimate."),
    ).toBeVisible();
    expect(within(transcript()).getByText("Estimate Grover search")).toBeVisible();
    expect(screen.getByRole("button", { name: "Run this configuration" })).toBeVisible();

    const [conversation] = await store.list();
    if (!conversation) throw new Error("Expected the conversation to be stored.");
    const stored = await store.get(conversation.id);
    expect(stored?.messages.map((message) => [message.role, message.text])).toEqual([
      ["user", "Estimate Grover search"],
      ["assistant", "Here is a starting point for that estimate."],
    ]);
    expect(stored?.messages[1]?.draft).toEqual(FAKE_GENERATED_DRAFT);
    expect(stored?.messages[1]?.model).toBe("Test fixture/deterministic fixture");
  });

  /**
   * The whole reason for the envelope. The one-shot surface could only answer
   * with a complete configuration, so a clarifying question was unrepresentable
   * and the model guessed instead.
   */
  it("renders a turn that asks a question rather than proposing", async () => {
    renderChat({
      service: fakeAgentService({ draft: null, reply: "Which error budget do you want?" }),
    });

    await sendMessage("Estimate something");

    expect(await screen.findByText("Which error budget do you want?")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Run this configuration" }),
    ).not.toBeInTheDocument();
  });

  /**
   * `message.model ?? "model"` used to be fed to `draftToFormState`, so the
   * literal string "model" cleared the schema's `minLength: 1` and was written
   * onto an immutable run record as the model that authored it.
   */
  it("refuses to open a proposal that has no model recorded against it", async () => {
    const store = new InMemoryChatStore();
    await store.create({ id: "c1", title: "Grover", createdAt: "2026-08-10T09:00:00.000Z" });
    await store.append("c1", {
      id: "m1",
      role: "assistant",
      text: "Here is a starting point.",
      draft: FAKE_GENERATED_DRAFT,
      model: null,
      createdAt: "2026-08-10T09:01:00.000Z",
    });
    renderChat({ store });

    await openConversation("Grover");
    await userEvent.click(
      await screen.findByRole("button", { name: "View / edit configuration" }),
    );

    // No editor opens, and the reason is on the card.
    expect(await screen.findByRole("alert")).toHaveTextContent(/which model authored it/);
    expect(
      screen.queryByRole("region", { name: "Edit proposed configuration" }),
    ).not.toBeInTheDocument();
  });

  it("opens the proposal in an editor on this page, and runs nothing", async () => {
    const estimatorRun = vi.fn(() => Promise.resolve(buildSuccessResult()));
    window.estimator = { run: estimatorRun };
    window.store = new InMemoryRunStore();
    renderChat();

    await sendMessage("Estimate Grover search");
    await userEvent.click(
      await screen.findByRole("button", { name: "View / edit configuration" }),
    );

    // The editable configuration is shown in place, seeded with the draft.
    const editor = await screen.findByRole("region", {
      name: "Edit proposed configuration",
    });
    expect(
      within(editor).getByDisplayValue("Model-assisted Grover estimate"),
    ).toBeVisible();
    // Opening the editor runs nothing.
    expect(estimatorRun).not.toHaveBeenCalled();
  });

  /**
   * Running a proposal AS DRAFTED behaves like the Configure tab: the run is
   * persisted to history and the shell is told to move to Results — the AI agent
   * and Configure are separate ways to build a run, sharing what happens after.
   */
  it("runs a proposal as drafted, saves it, and reports the finished run", async () => {
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 0 });
    const runStore = new InMemoryRunStore();
    window.store = runStore;
    const onRunComplete = vi.fn();
    renderChat({ onRunComplete });

    await sendMessage("Estimate Grover search");
    await userEvent.click(
      await screen.findByRole("button", { name: "Run this configuration" }),
    );

    // The shell is handed the finished run (which is how it moves to Results).
    await waitFor(() => expect(onRunComplete).toHaveBeenCalledTimes(1));
    const [config, result] = onRunComplete.mock.calls[0] ?? [];
    expect((config as RunConfig).provenance?.authoredBy).toBe("model_assisted");
    expect((result as RunResult).status).toBe("succeeded");
    // And it is saved to history, like any run.
    await waitFor(async () => expect(await runStore.list()).toHaveLength(1));
  });

  /**
   * Refinement is the feature. Without the earlier turns in the request, a model
   * asked to change one field re-derives the whole configuration — silently
   * moving fields the analyst had already settled.
   */
  it("carries the whole conversation into the next request", async () => {
    const seen: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return {
          ok: true,
          reply: "Updated.",
          draft: FAKE_GENERATED_DRAFT,
          provider: "Test fixture",
          model: "deterministic fixture",
        };
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");
    await screen.findByText("Updated.");
    await sendMessage("make the gate time 80");
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[0]?.messages).toEqual([
      { role: "user", content: "Estimate Grover search" },
    ]);
    expect(seen[1]?.messages).toEqual([
      { role: "user", content: "Estimate Grover search" },
      { role: "assistant", content: "Updated.", draft: FAKE_GENERATED_DRAFT },
      { role: "user", content: "make the gate time 80" },
    ]);
  });
});

describe("ChatPage — concurrency", () => {
  /** A service whose reply is released by the test, so a turn can be held open. */
  function heldService(): { service: AgentService; release: (reply?: string) => void } {
    let release = (_reply?: string): void => {};
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(): Promise<AgentChatResult> {
        const reply = await new Promise<string>((resolve) => {
          release = (text = "Here it is.") => resolve(text);
        });
        return {
          ok: true,
          reply,
          draft: null,
          provider: "Test fixture",
          model: "deterministic fixture",
        };
      },
    };
    return { service, release: (reply?: string) => release(reply) };
  }

  /**
   * The reply belongs to the conversation it was asked of. Nothing in the rail
   * is disabled while a turn is in flight, so reading another thread meanwhile
   * is ordinary use — and the transcript state used to be untagged, so the
   * reply landed in whichever one happened to be on screen.
   */
  it("does not put a reply into a conversation it was not sent from", async () => {
    const store = new InMemoryChatStore();
    await store.create({ id: "other", title: "Shor factoring", createdAt: "2026-08-10T08:00:00.000Z" });
    await store.append("other", {
      id: "om1",
      role: "user",
      text: "Estimate Shor for 2048 bits",
      draft: null,
      model: null,
      createdAt: "2026-08-10T08:01:00.000Z",
    });
    const { service, release } = heldService();
    renderChat({ store, service });

    await sendMessage("Estimate Grover search");
    await openConversation("Shor factoring");
    expect(await within(transcript()).findByText("Estimate Shor for 2048 bits")).toBeVisible();

    release("Grover reply");
    await waitFor(async () => expect((await store.list())[0]?.messageCount).toBe(2));

    // On screen: the other conversation, untouched.
    expect(within(transcript()).queryByText("Grover reply")).toBeNull();
    // On disk: filed against the conversation it was asked of.
    const grover = (await store.list()).find((row) => row.title.startsWith("Estimate Grover"));
    expect((await store.get(grover?.id ?? ""))?.messages.map((m) => m.text)).toEqual([
      "Estimate Grover search",
      "Grover reply",
    ]);
    // ...and it is there when the analyst comes back to it.
    await openConversation("Estimate Grover search");
    expect(await within(transcript()).findByText("Grover reply")).toBeVisible();
  });

  /**
   * The guard used to read the `sending` STATE, which is set two awaits into
   * the send — so both of two Enter presses in one frame saw `false`, minted a
   * conversation each, and fired two requests.
   */
  it("starts one conversation when Enter is pressed twice in a frame", async () => {
    const store = new InMemoryChatStore();
    const requestReply = vi.fn(fakeAgentService().requestReply);
    renderChat({ store, service: { ...fakeAgentService(), requestReply } });

    await userEvent.type(composer(), "Estimate Grover search");
    // Dispatched back-to-back with no await between them: React has not
    // re-rendered, so any state-based guard is still stale on the second.
    fireEvent.keyDown(composer(), { key: "Enter" });
    fireEvent.keyDown(composer(), { key: "Enter" });

    await waitFor(() => expect(requestReply).toHaveBeenCalled());
    expect(await store.list()).toHaveLength(1);
    expect(requestReply).toHaveBeenCalledTimes(1);
  });

  /**
   * Pressing Enter to accept an IME conversion candidate is not a send. Without
   * the `isComposing` check the commit is swallowed and whatever half-composed
   * text is in the box goes to the provider.
   */
  it("does not send on the Enter that commits an IME candidate", async () => {
    const store = new InMemoryChatStore();
    const requestReply = vi.fn(fakeAgentService().requestReply);
    renderChat({ store, service: { ...fakeAgentService(), requestReply } });

    await userEvent.type(composer(), "グローバー");
    fireEvent.keyDown(composer(), { key: "Enter", isComposing: true });

    // `send` is async and reaches the provider several microtasks in, so the
    // negative has to be asserted after long enough for a send to have landed —
    // otherwise this passes against a version with no IME guard at all.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestReply).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
    expect(composer()).toHaveValue("グローバー");

    // The very next Enter, once composition has ended, does send.
    fireEvent.keyDown(composer(), { key: "Enter" });
    await waitFor(() => expect(requestReply).toHaveBeenCalledOnce());
  });
});

describe("ChatPage — failures", () => {
  const rateLimited: Extract<AgentChatResult, { ok: false }> = {
    ok: false,
    code: "RATE_LIMITED",
    message: "The provider rate-limited this request. Wait a moment and try again.",
  };

  /**
   * The analyst's message stays. Losing a carefully written description to a
   * rate limit is the complaint that moved the prompt box into the shell in the
   * first place, and the transcript is supposed to be the record of what was
   * asked — not only of what was answered.
   */
  it("keeps the analyst's message, says why, and offers to send it again", async () => {
    let outcome: AgentChatResult = rateLimited;
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(): Promise<AgentChatResult> {
        return outcome;
      },
    };
    const { store } = renderChat({ service });

    await sendMessage("Estimate Grover search");

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate-limited/);
    expect(within(transcript()).getByText("Estimate Grover search")).toBeVisible();
    const [conversation] = await store.list();
    expect((await store.get(conversation?.id ?? ""))?.messages).toHaveLength(1);

    outcome = {
      ok: true,
      reply: "Here it is.",
      draft: null,
      provider: "Test fixture",
      model: "deterministic fixture",
    };
    await userEvent.click(screen.getByRole("button", { name: "Send this message again" }));

    expect(await screen.findByText("Here it is.")).toBeVisible();
    // Retried, not re-posted: the transcript still holds one question.
    expect(within(transcript()).getAllByText("Estimate Grover search")).toHaveLength(1);
  });

  it("reports a cancelled turn as a notice, not an error", async () => {
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(): Promise<AgentChatResult> {
        return {
          ok: false,
          code: "CANCELLED",
          message: "Request cancelled. Nothing was added to the conversation.",
        };
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    expect(await screen.findByRole("status")).toHaveTextContent(/cancelled/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Cancel only while a turn is in flight, and abandons it", async () => {
    const cancelReply = vi.fn(async () => {});
    let release = (): void => {};
    const service: AgentService = {
      ...fakeAgentService(),
      cancelReply,
      async requestReply(): Promise<AgentChatResult> {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return {
          ok: false,
          code: "CANCELLED",
          message: "Request cancelled. Nothing was added to the conversation.",
        };
      },
    };
    renderChat({ service });

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await sendMessage("Estimate Grover search");

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await userEvent.click(cancel);
    expect(cancelReply).toHaveBeenCalledOnce();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument(),
    );
  });

  it("refuses to send when the message could not be saved first", async () => {
    const store = new InMemoryChatStore();
    const requestReply = vi.fn();
    vi.spyOn(store, "create").mockRejectedValue(new Error("disk is full"));
    renderChat({ store, service: { ...fakeAgentService(), requestReply } });

    await sendMessage("Estimate Grover search");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved/i);
    expect(requestReply).not.toHaveBeenCalled();
  });
});

describe("ChatPage — the outbound request", () => {
  it("makes no request until the analyst sends one", async () => {
    const requestReply = vi.fn();
    const previewRequest = vi.fn(async () => ({}));
    renderChat({ service: { ...fakeAgentService(), requestReply, previewRequest } });

    await userEvent.type(composer(), "Estimate Grover search");

    expect(requestReply).not.toHaveBeenCalled();
    expect(previewRequest).not.toHaveBeenCalled();
  });

  /**
   * The constraint the mandatory review step existed to satisfy: the analyst can
   * read the exact body BEFORE it leaves, and nothing leaves without an explicit
   * action. Both still hold — this just is not a gate on every turn.
   */
  it("shows the exact body it would send, on demand, without sending it", async () => {
    const requestReply = vi.fn();
    renderChat({ service: { ...fakeAgentService(), requestReply } });

    await userEvent.type(composer(), "Estimate Grover search");
    await userEvent.click(
      screen.getByText("Show the exact request this would send"),
    );

    await waitFor(() =>
      expect(screen.getByText(/"content": "Estimate Grover search"/)).toBeVisible(),
    );
    expect(requestReply).not.toHaveBeenCalled();
  });

  it("still lets you send when the selected provider holds no key, and says why", async () => {
    renderChat({ status: statusWith(["openai"]), provider: "anthropic" });

    await userEvent.type(composer(), "Estimate Grover search");

    // The send is deliberately not gated: the analyst can try it and get the
    // typed NOT_CONFIGURED failure, rather than face a dead button.
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByText(/No key is configured for Anthropic/)).toBeVisible();
  });

  /**
   * Key entry moved to Settings, so the sentence that used to say "add one
   * under Model provider above" now points at a page this one cannot show.
   * A dead-end instruction is worse than none: the control it names is gone.
   */
  it("offers a way to reach Settings when the selected provider holds no key", async () => {
    const { onOpenSettings } = renderChat({
      status: statusWith(["openai"]),
      provider: "anthropic",
    });

    await userEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("offers the same route when no provider is configured at all", async () => {
    const { onOpenSettings } = renderChat({ status: statusWith([]) });

    await userEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("sends the analyst to the AI providers tab from the model bar", async () => {
    const { onOpenProviderSettings } = renderChat();

    await userEvent.click(screen.getByRole("button", { name: "Manage keys" }));

    expect(onOpenProviderSettings).toHaveBeenCalledOnce();
  });

  /** Nothing on this page may accept a key any more — Settings owns that. */
  it("no longer carries a credential panel", () => {
    renderChat({ status: statusWith([]) });

    expect(screen.queryByText("Model provider")).toBeNull();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
  });

  /**
   * The switcher stays, because which model answers is a per-conversation
   * decision and the network badge beside it names the pair being used.
   */
  it("switches provider and model without leaving the page", async () => {
    const { onSelectionChange } = renderChat();

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "openai");

    expect(onSelectionChange).toHaveBeenCalledWith(
      "openai",
      PROVIDER_MODELS.openai.defaultModel,
    );
  });
});

describe("ChatPage — conversations", () => {
  /** An `<ol>` may contain only `<li>`; a sentinel div also drew a 28px gap. */
  it("builds the transcript from list items only", async () => {
    renderChat({ store: await seedTwo() });
    await openConversation("Grover baseline");

    const children = [...(await within(transcript()).findAllByRole("listitem"))];
    expect(children).toHaveLength(2);
    expect([...transcript().children].every((node) => node.tagName === "LI")).toBe(true);
  });

  /** The visible speaker line already names the turn; the label doubled it. */
  it("does not announce each turn's speaker twice", async () => {
    renderChat({ store: await seedTwo() });
    await openConversation("Grover baseline");

    const [first] = await within(transcript()).findAllByRole("listitem");
    expect(first).not.toHaveAttribute("aria-label");
  });

  it("opens on the conversation, not on the list", async () => {
    renderChat({ store: await seedTwo() });

    expect(screen.getByRole("textbox", { name: "Your message" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Conversations" })).not.toBeInTheDocument();
  });

  /**
   * The columns that justify a table over the 280px rail this replaced: a rail
   * that narrow could only ever show a title.
   */
  it("lists every conversation with what distinguishes them", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();

    const grover = within(table).getByRole("row", { name: /Grover baseline/ });
    expect(within(grover).getByRole("button", { name: "Grover baseline" })).toBeVisible();
    // 2 messages, 1 of which carried a proposal.
    expect(within(grover).getByRole("cell", { name: "2" })).toBeVisible();
    expect(within(grover).getByRole("cell", { name: "1" })).toBeVisible();
    // No Last message column: 30 characters of the most recent turn told the
    // analyst less than the name does, and it was the column that squeezed the
    // row controls off the end of a narrow window.
    expect(within(grover).queryByText("Here is a starting point.")).toBeNull();
  });

  /** The title IS the opener; there is no second button doing the same job. */
  it("offers exactly one control per row for opening it", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    expect(within(row).queryByRole("button", { name: "Open" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Grover baseline" })).toBeVisible();
  });

  it("opens a conversation from the list and returns to the transcript", async () => {
    renderChat({ store: await seedTwo() });

    await openConversation("Grover baseline");

    expect(await within(transcript()).findByText("Estimate Grover search")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Conversations" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grover baseline" })).toBeVisible();
  });

  it("names the open conversation and counts its turns in the thread header", async () => {
    renderChat({ store: await seedTwo() });

    await openConversation("Grover baseline");

    expect(screen.getByRole("heading", { name: "Grover baseline" })).toBeVisible();
    expect(screen.getByText("2 messages · 1 proposal")).toBeVisible();
  });

  /**
   * The header used to read `conversations.find(...)`, and that list holds
   * search RESULTS — so a filter excluding the open conversation made its
   * header claim to be new and empty while its transcript rendered below.
   */
  it("keeps the open conversation's identity while a search hides it", async () => {
    renderChat({ store: await seedTwo() });
    await openConversation("Grover baseline");
    expect(await within(transcript()).findByText("Estimate Grover search")).toBeVisible();

    const table = await showList();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "factoring",
    );
    await waitFor(() => expect(within(table).queryByText("Grover baseline")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Conversation" }));

    // Still itself: name, counts, and the controls that act on it.
    expect(screen.getByRole("heading", { name: "Grover baseline" })).toBeVisible();
    expect(screen.getByText("2 messages · 1 proposal")).toBeVisible();
    expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Export" })).toBeVisible();
    expect(within(transcript()).getByText("Estimate Grover search")).toBeVisible();
  });

  /** "All conversations · 1" beside twelve stored ones is a lie. */
  it("does not badge the tab with a filtered count", async () => {
    renderChat({ store: await seedTwo() });
    expect(await screen.findByRole("button", { name: "All conversations · 2" })).toBeVisible();

    await showList();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "factoring",
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "All conversations" })).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: /All conversations · 1$/ })).toBeNull();
  });

  it("titles a new conversation from its opening message", async () => {
    renderChat();

    await sendMessage("Estimate Grover search over 20 qubits");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Estimate Grover search over 20 qubits" }),
      ).toBeVisible(),
    );

    const table = await showList();
    expect(
      within(table).getByRole("button", { name: "Estimate Grover search over 20 qubits" }),
    ).toBeVisible();
  });

  it("filters the list by a search over stored messages", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "2048",
    );

    await waitFor(() => expect(within(table).queryByText("Grover baseline")).toBeNull());
    expect(within(table).getByRole("button", { name: "Shor factoring" })).toBeVisible();
  });

  /**
   * One query per pause, not one per keystroke: each is an FTS5 MATCH plus a
   * second query, over IPC.
   */
  it("searches once for a burst of typing, not once per character", async () => {
    const store = await seedTwo();
    const search = vi.spyOn(store, "search");
    renderChat({ store });
    const table = await showList();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "factoring",
    );
    await waitFor(() => expect(within(table).queryByText("Grover baseline")).toBeNull());

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("factoring");
  });

  /** A live destructive control beside the words "no conversations match". */
  it("does not offer Delete all history over a search that matches nothing", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();
    expect(within(table).getByRole("button", { name: "Delete all history" })).toBeEnabled();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "zzzz",
    );

    expect(await within(table).findByText(/No conversations match/)).toBeVisible();
    expect(within(table).getByRole("button", { name: "Delete all history" })).toBeDisabled();
  });

  /**
   * The export re-reads from the store rather than serialising what is on
   * screen, so a row in the list — which only ever holds a summary — can still
   * export a full transcript.
   */
  /**
   * A preview first, not an immediate download. The other two export surfaces
   * both open a dialog you can read and copy from; this one wrote a file
   * straight to Downloads, so the only way to see what you had exported was to
   * go and open it.
   */
  it("opens a readable preview of the whole transcript", async () => {
    const store = await seedTwo();
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    const dialog = await screen.findByRole("dialog");
    const preview = within(dialog).getByLabelText("Conversation export preview");
    // The whole transcript, not the summary the row was rendered from.
    expect(preview).toHaveTextContent("# Grover baseline");
    expect(preview).toHaveTextContent("Estimate Grover search");
    expect(preview).toHaveTextContent("Proposed configuration");
    expect(within(dialog).getByRole("button", { name: "Copy Markdown" })).toBeInTheDocument();
  });

  it("downloads the transcript from that preview", async () => {
    const store = await seedTwo();
    const saved: { name: string; text: string }[] = [];
    const created: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      created.push("blob:stub");
      void (source as Blob).text().then((text) => {
        const last = saved.at(-1);
        if (last) last.text = text;
      });
      return "blob:stub";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, text: "" });
    });

    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });
    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Download .md" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    // Stamped with the export time, like every other export.
    expect(saved[0]?.name).toMatch(/^grover-baseline-\d{8}-\d{4}\.md$/);
    await waitFor(() => expect(saved[0]?.text).toContain("### Proposed configuration"));
    // One object URL created, and NOT revoked out from under the download that
    // is still fetching it; the lifetime is asserted in `download.test.ts`.
    expect(created).toHaveLength(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("closes the preview without exporting anything", async () => {
    const store = await seedTwo();
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });
    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports an export of a conversation that is no longer stored", async () => {
    const store = await seedTwo();
    vi.spyOn(store, "get").mockResolvedValue(null);
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer stored/);
  });

  it("renames a conversation from the list", async () => {
    const store = await seedTwo();
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
    const field = within(row).getByRole("textbox", { name: "Conversation name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Weekly baseline");
    await userEvent.click(within(row).getByRole("button", { name: "Save name" }));

    await waitFor(async () => expect((await store.get("c1"))?.title).toBe("Weekly baseline"));
    expect(await within(table).findByRole("button", { name: "Weekly baseline" })).toBeVisible();
  });

  /** The same control, in the header of the conversation you are reading. */
  it("renames the open conversation from its header", async () => {
    const store = await seedTwo();
    renderChat({ store });
    await openConversation("Grover baseline");

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Conversation name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Weekly baseline");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(async () => expect((await store.get("c1"))?.title).toBe("Weekly baseline"));
    expect(
      await screen.findByRole("heading", { name: "Weekly baseline" }),
    ).toBeVisible();
  });

  /** Two-step, like the credential panel's key removal. One click cannot delete. */
  it("deletes a conversation only after confirmation", async () => {
    const store = await seedTwo();
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(await store.get("c1")).not.toBeNull();

    await userEvent.click(within(row).getByRole("button", { name: "Confirm delete" }));

    await waitFor(async () => expect(await store.get("c1")).toBeNull());
    expect(within(table).queryByText("Grover baseline")).toBeNull();
  });

  it("clears the open transcript when that conversation is deleted", async () => {
    const store = await seedTwo();
    renderChat({ store });
    await openConversation("Grover baseline");
    expect(await within(transcript()).findByText("Estimate Grover search")).toBeVisible();

    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(row).getByRole("button", { name: "Confirm delete" }));
    await waitFor(async () => expect(await store.get("c1")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Conversation" }));
    expect(screen.queryByText("Estimate Grover search")).not.toBeInTheDocument();
  });

  it("empties the whole history only after confirmation", async () => {
    const store = await seedTwo();
    renderChat({ store });
    const table = await showList();

    await userEvent.click(within(table).getByRole("button", { name: "Delete all history" }));
    expect(await store.list()).toHaveLength(2);

    await userEvent.click(within(table).getByRole("button", { name: "Delete everything" }));

    await waitFor(async () => expect(await store.list()).toEqual([]));
    expect(within(table).getByText(/No conversations yet/)).toBeVisible();
  });

  /**
   * These were `void store.rename(...).then(refreshList)` — no rejection
   * handler at all, so a store refusal was an unhandled promise rejection and
   * the list went on showing the state the analyst thought they had changed.
   */
  it.each([
    ["rename", "rename" as const, /could not be renamed/],
    ["delete", "delete" as const, /could not be deleted/],
    ["clear", "clear" as const, /history could not be deleted/],
  ])("reports a failed %s instead of dropping it", async (_label, method, expected) => {
    const store = await seedTwo();
    vi.spyOn(store, method).mockRejectedValue(new Error("database is locked"));
    renderChat({ store });
    const table = await showList();

    if (method === "clear") {
      await userEvent.click(within(table).getByRole("button", { name: "Delete all history" }));
      await userEvent.click(within(table).getByRole("button", { name: "Delete everything" }));
    } else {
      const row = within(table).getByRole("row", { name: /Grover baseline/ });
      if (method === "delete") {
        await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
        await userEvent.click(within(row).getByRole("button", { name: "Confirm delete" }));
      } else {
        await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
        const field = within(row).getByRole("textbox", { name: "Conversation name" });
        await userEvent.clear(field);
        await userEvent.type(field, "Weekly baseline");
        await userEvent.click(within(row).getByRole("button", { name: "Save name" }));
      }
    }

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(alert).toHaveTextContent(/database is locked/);
    // The list still shows the truth, not the change that did not happen.
    expect(within(table).getByRole("button", { name: "Grover baseline" })).toBeVisible();
  });

  it("starts a fresh conversation without touching the stored ones", async () => {
    const store = await seedTwo();
    renderChat({ store });
    await openConversation("Grover baseline");
    expect(await within(transcript()).findByText("Estimate Grover search")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "New conversation" }));

    expect(screen.queryByText("Estimate Grover search")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New conversation" })).toBeVisible();
    expect(await store.list()).toHaveLength(2);
  });

  /** New conversation from the list has to land you on the composer. */
  it("returns to the conversation view when starting a new one from the list", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();

    await userEvent.click(within(table).getByRole("button", { name: "New conversation" }));

    expect(screen.getByRole("textbox", { name: "Your message" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Conversations" })).not.toBeInTheDocument();
  });
});

/**
 * The defects a UI audit of this surface turned up, each pinned so it stays
 * fixed. Layout findings are absent on purpose: jsdom computes no geometry, so
 * an assertion about where the composer sits relative to the transcript would
 * pass whatever the stylesheet said. Those were verified in the running app.
 */
describe("ChatPage — audit regressions", () => {
  /** A thread where the analyst turned the first proposal down. */
  async function seedTwoProposals(): Promise<ChatStore> {
    const store = new InMemoryChatStore();
    await store.create({
      id: "c1",
      title: "Two proposals",
      createdAt: "2026-08-10T09:00:00.000Z",
    });
    const turns = [
      { id: "u1", role: "user" as const, text: "Estimate something", model: null, draft: null },
      {
        id: "a1",
        role: "assistant" as const,
        text: "Here is a starting point.",
        model: "anthropic/claude-sonnet-5",
        draft: FAKE_GENERATED_DRAFT,
      },
      { id: "u2", role: "user" as const, text: "Not that one", model: null, draft: null },
      {
        id: "a2",
        role: "assistant" as const,
        text: "Swapped.",
        model: "anthropic/claude-sonnet-5",
        draft: FAKE_GENERATED_DRAFT,
      },
    ];
    for (const [index, turn] of turns.entries()) {
      await store.append("c1", {
        ...turn,
        // Padded: `09:0${index + 1}` produced `09:010` at the tenth turn,
        // which is not a timestamp and which no store here validates.
        createdAt: `2026-08-10T09:${String(index + 1).padStart(2, "0")}:00.000Z`,
      });
    }
    return store;
  }

  /*
   * The one that could cost real work: both cards carried a live "Use this
   * configuration", so the proposal the analyst had explicitly rejected sat
   * there one click from the form, indistinguishable from the one they asked
   * for.
   */
  it("offers exactly one proposal as the conversation's live answer", async () => {
    renderChat({ store: await seedTwoProposals() });
    await openConversation("Two proposals");
    const turns = within(transcript());

    expect(await turns.findByRole("button", { name: "View this earlier proposal" })).toBeVisible();
    expect(turns.getAllByRole("button", { name: "Run this configuration" })).toHaveLength(1);
    expect(turns.getByText(/a later one follows in this conversation/)).toBeVisible();
  });

  /** Superseded is not disabled — going back for the one you refused is real. */
  it("still opens an earlier proposal in the editor when it is asked for", async () => {
    renderChat({ store: await seedTwoProposals() });
    await openConversation("Two proposals");

    await userEvent.click(
      await within(transcript()).findByRole("button", { name: "View this earlier proposal" }),
    );

    expect(
      await screen.findByRole("region", { name: "Edit proposed configuration" }),
    ).toBeVisible();
  });

  /** Worth reading once. Under every card it is furniture. */
  it("explains the live proposal once, not under every proposal", async () => {
    renderChat({ store: await seedTwoProposals() });
    await openConversation("Two proposals");
    await within(transcript()).findByRole("button", { name: "Run this configuration" });

    expect(within(transcript()).getAllByText(/saves it to Run History/)).toHaveLength(1);
  });

  it("copies a proposal's JSON rather than making it a drag-select", async () => {
    // Typed with its argument, so the assertion below can read it back.
    const writeText = vi.fn((_text: string) => Promise.resolve());
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      renderChat({ store: await seedTwoProposals() });
      await openConversation("Two proposals");
      const turns = within(transcript());
      await userEvent.click((await turns.findAllByText("Show the proposal as JSON"))[0]!);

      await userEvent.click(turns.getAllByRole("button", { name: "Copy JSON" })[0]!);

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(writeText.mock.calls[0]?.[0]))).toEqual(FAKE_GENERATED_DRAFT);
    } finally {
      if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
      else Object.defineProperty(navigator, "clipboard", original);
    }
  });

  /*
   * It did nothing at all here, sitting under a heading reading the same three
   * words — the loudest control on the page wired to a no-op.
   */
  it("drops New conversation on a conversation that is already new", async () => {
    renderChat();

    expect(screen.getByRole("heading", { name: "New conversation" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "New conversation" })).toBeNull();
  });

  /*
   * The header sticks and opening a conversation scrolls the switcher off the
   * top, so without this the only way back to the list was scrolling up through
   * the whole transcript.
   */
  it("gets back to the list from the conversation header", async () => {
    renderChat({ store: await seedTwo() });
    await openConversation("Grover baseline");

    await userEvent.click(screen.getByRole("button", { name: "Back to all conversations" }));

    expect(screen.getByRole("region", { name: "Conversations" })).toBeVisible();
  });

  it("drops a starter into the composer and leaves the caret there", async () => {
    renderChat();

    await userEvent.click(screen.getByRole("button", { name: /Estimate Shor's factoring/ }));

    expect(composer()).toHaveValue(
      "Estimate Shor's factoring for RSA-2048 on a superconducting architecture",
    );
    expect(composer()).toHaveFocus();
  });

  /** Escape is the universal cancel for an inline editor. */
  it("cancels a rename on Escape and leaves the stored name alone", async () => {
    const store = await seedTwo();
    renderChat({ store });
    await openConversation("Grover baseline");

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Conversation name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Something else");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Conversation name" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Grover baseline" })).toBeVisible();
    expect((await store.get("c1"))?.title).toBe("Grover baseline");
  });

  /*
   * `messages` is legitimately empty while an existing conversation is being
   * read back, so the "nothing sent yet" branch used to paint over a ten-turn
   * thread for the length of a store round trip — with three live starter chips
   * on it. A microtask against this twin; tens of milliseconds against SQLite
   * over IPC, which is long enough to click one.
   */
  it("does not paint the empty state over a conversation that is still loading", async () => {
    const store = await seedTwo();
    // Held open, so the load window is observable at all.
    vi.spyOn(store, "get").mockReturnValue(new Promise<never>(() => {}));
    renderChat({ store });

    await openConversation("Grover baseline");

    expect(screen.queryByText(/Describe the application, architecture/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Estimate Shor's factoring/ })).toBeNull();
  });

  /*
   * A starter REPLACES the composer, the composer sits directly beneath the
   * chips, and its contents are the one thing in this app deliberately never
   * persisted — so a mis-aimed click discarded a description with no undo.
   */
  it("withdraws the starters once the composer holds a draft", async () => {
    renderChat();
    expect(screen.getByRole("button", { name: /Estimate Shor's factoring/ })).toBeVisible();

    await userEvent.type(composer(), "My own description");

    expect(screen.queryByRole("button", { name: /Estimate Shor's factoring/ })).toBeNull();
    expect(composer()).toHaveValue("My own description");
  });

  /*
   * "All" is read against whatever the list is showing, and this button sits
   * beside the search box that narrowed it.
   */
  it("says the delete-all reaches conversations the search is hiding", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "Grover",
    );
    await waitFor(() => expect(within(table).queryByText("Shor factoring")).toBeNull());

    await userEvent.click(within(table).getByRole("button", { name: "Delete all history" }));

    expect(
      within(table).getByText(/including the ones your search is currently hiding/),
    ).toBeVisible();
  });
});

/**
 * The reply used to be a string field inside a strict JSON envelope, so nothing
 * could render until the whole object closed — up to two minutes of a static
 * "Thinking…". With the draft moved to a tool call the prose is just prose, and
 * arrives a fragment at a time.
 */
describe("ChatPage — a reply arriving", () => {
  /** Holds the turn open so the transcript can be inspected mid-stream. */
  function streamingService(fragments: readonly string[]) {
    let release = (): void => {};
    const base = fakeAgentService({ stream: fragments });
    const service: AgentService = {
      ...base,
      async requestReply(request): Promise<AgentChatResult> {
        const result = await base.requestReply(request);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return result;
      },
    };
    return { service, release: () => release() };
  }

  it("paints the prose as it arrives, before the turn lands", async () => {
    const { service, release } = streamingService(["Gate-based ", "suits this best."]);
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    // Mid-flight: the fragments are on screen and nothing has been stored yet.
    expect(await screen.findByText(/Gate-based suits this best\./)).toBeVisible();
    expect(screen.queryByRole("button", { name: /run this configuration/i })).toBeNull();

    release();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /run this configuration/i })).toBeVisible(),
    );
  });

  it("says Thinking… only until the first fragment", async () => {
    const { service, release } = streamingService(["Working on it."]);
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    await waitFor(() => expect(screen.queryByText("Thinking…")).toBeNull());
    release();
  });

  /**
   * The streamed copy and the stored one must never both be on screen — the
   * analyst would read the same sentence twice and reasonably assume the model
   * had said it twice.
   */
  it("shows the finished turn once, not twice", async () => {
    const { service, release } = streamingService(["Here is a starting point."]);
    renderChat({ service });

    await sendMessage("Estimate Grover search");
    // Released only once the turn is demonstrably in flight. Calling it before
    // `runTurn` reaches its await resolves nothing, and the turn never lands.
    await screen.findByText("Here is a starting point.");
    release();

    await waitFor(() =>
      expect(screen.getAllByText("Here is a starting point.")).toHaveLength(1),
    );
  });

  /**
   * Streaming is a push channel with no request/response pairing of its own, so
   * a fragment from an abandoned turn is indistinguishable from a live one
   * unless the id is checked.
   */
  it("ignores fragments belonging to a request it is no longer running", async () => {
    const service: AgentService = {
      ...fakeAgentService(),
      onReplyDelta(listener) {
        // Fires immediately under an id this page has never issued.
        listener({ requestId: "someone-elses-request", fragment: "LEAKED" });
        return () => {};
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    expect(screen.queryByText(/LEAKED/)).toBeNull();
  });

  it("renders the model's markdown rather than showing its syntax", async () => {
    renderChat({ service: fakeAgentService({ reply: "Use **gate-based** here." }) });

    await sendMessage("Estimate Grover search");

    expect(await screen.findByText("gate-based")).toBeVisible();
    expect(screen.queryByText(/\*\*gate-based\*\*/)).toBeNull();
  });

  /** The analyst's own words are shown as typed — markdown is the model's register. */
  it("does not reformat what the analyst wrote", async () => {
    renderChat();

    await sendMessage("compare **two** architectures");

    // Scoped to the transcript: the conversation title is derived from this
    // same first message, so a page-wide query matches it too.
    const turn = await screen.findByText("You");
    expect(turn.parentElement).toHaveTextContent("compare **two** architectures");
    expect(turn.parentElement?.querySelector("strong")).toBeNull();
  });
});

describe("ChatPage — what the analyst has already filled in", () => {
  it("sends the form context with every turn", async () => {
    const seen: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return fakeAgentService().requestReply(request);
      },
    };
    renderChat({
      service,
      formContext: [{ field: "architecture.gateTime", value: "80" }],
    });

    await sendMessage("Estimate Grover search");

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.formContext).toEqual([{ field: "architecture.gateTime", value: "80" }]);
  });

  /**
   * Absent, not empty. `previewRequest` renders this object verbatim as "the
   * exact outbound request", and a `formContext: []` there would claim the form
   * was inspected and found bare when in fact it was never read.
   */
  it("omits the field entirely when the form is untouched", async () => {
    const seen: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return fakeAgentService().requestReply(request);
      },
    };
    renderChat({ service, formContext: [] });

    await sendMessage("Estimate Grover search");

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).not.toHaveProperty("formContext");
  });
});

/**
 * The fake service reads `request.requestId` straight off the object it was
 * handed, so every streaming test above passes whether or not that field
 * survives the trip through main. It did not: `readChatRequest` rebuilds the
 * request field by field and dropped it, so every fragment shipped tagged
 * `undefined` and this page discarded all of them — streaming was dead in the
 * shipped app while the suite stayed green.
 *
 * This service answers only what a request actually carried, which is the
 * property the fake cannot check.
 */
describe("ChatPage — streaming survives the round trip", () => {
  it("only paints fragments tagged with an id the request really carried", async () => {
    const listeners = new Set<(delta: { requestId: string; fragment: string }) => void>();
    const service: AgentService = {
      ...fakeAgentService(),
      onReplyDelta(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async requestReply(request): Promise<AgentChatResult> {
        // Exactly what main does: narrow, then tag from the narrowed value.
        const narrowed: { requestId?: string } = {};
        if (typeof request.requestId === "string") narrowed.requestId = request.requestId;
        for (const listener of listeners) {
          listener({ requestId: narrowed.requestId ?? "", fragment: "Streamed." });
        }
        return {
          ok: true,
          reply: "Streamed.",
          draft: null,
          provider: "Test fixture",
          model: "deterministic fixture",
        };
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    // One copy: the streamed paint and the stored turn are the same sentence.
    await waitFor(() => expect(screen.getAllByText("Streamed.")).toHaveLength(1));
  });

  /**
   * The streamed text has to actually reach the screen while the turn is still
   * in flight. Every other streaming test here resolves the request straight
   * away, so the stored turn paints and the assertion passes whether or not a
   * single fragment was ever revealed — the same blind spot that let the
   * dropped `requestId` ship green. This one holds the request open, so the
   * only thing that can put the words on screen is the reveal loop.
   */
  it("paints the reply while it is still arriving, before the turn resolves", async () => {
    const listeners = new Set<(delta: { requestId: string; fragment: string }) => void>();
    // A holder, not a bare `let`: control-flow analysis narrows a variable only
    // assigned inside a callback to `never` at the call site below.
    const gate: { release: (() => void) | null } = { release: null };
    const service: AgentService = {
      ...fakeAgentService(),
      onReplyDelta(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async requestReply(request): Promise<AgentChatResult> {
        for (const fragment of ["Gate-based ", "looks ", "right ", "here."]) {
          for (const listener of listeners) {
            listener({ requestId: request.requestId ?? "", fragment });
          }
        }
        // Held open, so nothing but the reveal can paint.
        await new Promise<void>((resolve) => {
          gate.release = resolve;
        });
        return {
          ok: true,
          reply: "Gate-based looks right here.",
          draft: null,
          provider: "Test fixture",
          model: "deterministic fixture",
        };
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    // Revealed a few characters at a time, so this only passes once the frame
    // loop has run enough times to get through the sentence.
    await waitFor(
      () => expect(screen.getByText(/Gate-based looks right here\./)).toBeVisible(),
      { timeout: 4000 },
    );

    gate.release?.();
  });

  /**
   * What "smoother" actually means, measured.
   *
   * The provider delivers in clumps — one character here, ninety there. The old
   * batch painted whatever had landed in the window, so the steps on screen
   * were as uneven as the delivery. Here the painted increments should be far
   * more even than the bursts that produced them, which is the whole claim.
   */
  it("paints in even steps even though delivery is lumpy", async () => {
    const BURSTS = [2, 1, 90, 3, 1, 120, 4, 60, 1, 2];
    const PROSE = "x".repeat(BURSTS.reduce((a, b) => a + b, 0));
    const listeners = new Set<(delta: { requestId: string; fragment: string }) => void>();
    const gate: { release: (() => void) | null } = { release: null };
    const service: AgentService = {
      ...fakeAgentService(),
      onReplyDelta(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async requestReply(request): Promise<AgentChatResult> {
        let at = 0;
        for (const size of BURSTS) {
          await new Promise((r) => setTimeout(r, 40));
          const fragment = PROSE.slice(at, at + size);
          at += size;
          for (const listener of listeners) {
            listener({ requestId: request.requestId ?? "", fragment });
          }
        }
        await new Promise<void>((resolve) => {
          gate.release = resolve;
        });
        return {
          ok: true,
          reply: PROSE,
          draft: null,
          provider: "Test fixture",
          model: "deterministic fixture",
        };
      },
    };
    renderChat({ service });

    // Sample the streamed turn as it grows, then look at the step sizes.
    const lengths: number[] = [];
    const stop = { now: false };
    const poll = (): void => {
      // `.chat-md` is the assistant's prose specifically — the analyst's own
      // turn is rendered as typed and shares `.chat-turn__text`.
      const all = document.querySelectorAll(".chat-md");
      const el = all[all.length - 1];
      const len = el?.textContent?.length ?? 0;
      if (len > 0 && len !== lengths[lengths.length - 1]) lengths.push(len);
      if (!stop.now) setTimeout(poll, 8);
    };
    poll();

    await sendMessage("Estimate Grover search");
    await waitFor(() => expect(lengths[lengths.length - 1]).toBe(PROSE.length), {
      timeout: 8000,
    });
    stop.now = true;
    gate.release?.();

    const steps = lengths.slice(1).map((len, i) => len - lengths[i]!);
    expect(steps.length).toBeGreaterThan(10);
    // No paint may dump a whole large burst. The biggest arrival was 120
    // characters; the biggest thing drawn at once must be far under that.
    expect(Math.max(...steps)).toBeLessThan(40);
  }, 20000);

  it("sends a request id at all", async () => {
    const seen: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async requestReply(request): Promise<AgentChatResult> {
        seen.push(request);
        return fakeAgentService().requestReply(request);
      },
    };
    renderChat({ service });

    await sendMessage("Estimate Grover search");

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(typeof seen[0]?.requestId).toBe("string");
    expect(seen[0]?.requestId).not.toBe("");
  });
});

describe("ChatPage — the request preview", () => {
  /**
   * Constraint 8: the panel shows the exact outbound request. The form context
   * is interpolated into the system prompt, so a preview built without it
   * describes a prompt the analyst is never actually sending — on the one
   * surface that exists to tell them what leaves the machine.
   */
  it("shows the form context that the send will carry", async () => {
    const previewed: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async previewRequest(request): Promise<unknown> {
        previewed.push(request);
        return { note: "preview", ...request };
      },
    };
    renderChat({
      service,
      formContext: [{ field: "architecture.gateTime", value: "80" }],
    });

    await userEvent.click(screen.getByText("Show the exact request this would send"));

    await waitFor(() => expect(previewed.length).toBeGreaterThan(0));
    expect(previewed.at(-1)?.formContext).toEqual([
      { field: "architecture.gateTime", value: "80" },
    ]);
  });

  /** A preview streams nothing, so it has no id to name. */
  it("carries no request id", async () => {
    const previewed: AgentChatRequest[] = [];
    const service: AgentService = {
      ...fakeAgentService(),
      async previewRequest(request): Promise<unknown> {
        previewed.push(request);
        return { note: "preview", ...request };
      },
    };
    renderChat({ service });

    await userEvent.click(screen.getByText("Show the exact request this would send"));

    await waitFor(() => expect(previewed.length).toBeGreaterThan(0));
    expect(previewed.at(-1)).not.toHaveProperty("requestId");
  });
});
