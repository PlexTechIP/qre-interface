import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  PROVIDER_IDS,
  type AgentChatRequest,
  type AgentChatResult,
  type AgentProviderStatus,
  type AgentService,
  type ProviderId,
} from "../../shared/agentTypes";
import { InMemoryChatStore } from "../../shared/chatStore";
import type { ChatStore } from "../../shared/chatTypes";
import { PROVIDER_MODELS } from "../../shared/providerModels";
import { fakeAgentService, FAKE_GENERATED_DRAFT } from "../../shared/testing/fakeAgentService";
import { ChatPage, type ChatView } from "./ChatPage";
import type { DraftHandoff } from "./draftToFormState";

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
  onReviewDraft?: (handoff: DraftHandoff) => void;
  /** Which view to land on. The shell owns this, so the harness does too. */
  view?: ChatView;
}

/**
 * The shell owns the open conversation and the composer, so the harness does
 * too — testing them as local state would exercise a component the app does not
 * render.
 */
function renderChat(options: HarnessOptions = {}) {
  const store = options.store ?? new InMemoryChatStore();
  const service = options.service ?? fakeAgentService();
  const onReviewDraft = options.onReviewDraft ?? vi.fn();

  function Harness(): React.JSX.Element {
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [composer, setComposer] = useState("");
    const [view, setView] = useState<ChatView>(options.view ?? "conversation");
    return (
      <ChatPage
        view={view}
        onViewChange={setView}
        service={service}
        store={store}
        status={options.status ?? statusWith(["anthropic", "openai"])}
        provider={options.provider ?? "anthropic"}
        model={PROVIDER_MODELS.anthropic.defaultModel}
        activeConversationId={activeConversationId}
        onActiveConversationChange={setActiveConversationId}
        composer={composer}
        onComposerChange={setComposer}
        onSelectionChange={vi.fn()}
        onCredentialChange={vi.fn()}
        onReviewDraft={onReviewDraft}
      />
    );
  }

  render(<Harness />);
  return { store, service, onReviewDraft };
}

const composer = (): HTMLElement => screen.getByRole("textbox", { name: "Your message" });

/**
 * Scoped, because a conversation is auto-titled from its opening message — so
 * the rail legitimately shows the same words the transcript does, and a bare
 * `getByText` cannot tell which one it found.
 */
const transcript = (): HTMLElement => screen.getByRole("list", { name: "Transcript" });

/** The "All conversations" table. Only rendered while that view is showing. */
const list = (): HTMLElement => screen.getByRole("region", { name: "Conversations" });

/** Switch to the list view, the way the analyst does. */
async function showList(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: /^All conversations/ }));
  return list();
}

/** List → click a title → back on the conversation, which is what Open does. */
async function openConversation(title: string): Promise<void> {
  const table = await showList();
  await userEvent.click(await within(table).findByRole("button", { name: title }));
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
    expect(screen.getByRole("button", { name: "Use this configuration" })).toBeVisible();

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
      screen.queryByRole("button", { name: "Use this configuration" }),
    ).not.toBeInTheDocument();
  });

  /**
   * `message.model ?? "model"` used to be fed to `draftToFormState`, so the
   * literal string "model" cleared the schema's `minLength: 1` and was written
   * onto an immutable run record as the model that authored it.
   */
  it("refuses to carry a proposal that has no model recorded against it", async () => {
    const onReviewDraft = vi.fn();
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
    renderChat({ store, onReviewDraft });

    await openConversation("Grover");
    await userEvent.click(
      await screen.findByRole("button", { name: "Use this configuration" }),
    );

    expect(onReviewDraft).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/which model authored it/);
  });

  it("hands a proposal to the form and runs nothing", async () => {
    const onReviewDraft = vi.fn();
    renderChat({ onReviewDraft });

    await sendMessage("Estimate Grover search");
    await userEvent.click(
      await screen.findByRole("button", { name: "Use this configuration" }),
    );

    expect(onReviewDraft).toHaveBeenCalledTimes(1);
    const handoff = onReviewDraft.mock.calls[0]?.[0] as DraftHandoff;
    expect(handoff.provenance).toMatchObject({ authoredBy: "model_assisted" });
    expect(handoff.state.name).toBe("Model-assisted Grover estimate");
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
      {
        role: "assistant",
        content: JSON.stringify({ reply: "Updated.", draft: FAKE_GENERATED_DRAFT }),
      },
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

  it("disables Send when the selected provider holds no key, and says why", async () => {
    renderChat({ status: statusWith(["openai"]), provider: "anthropic" });

    await userEvent.type(composer(), "Estimate Grover search");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText(/No key is configured for Anthropic/)).toBeVisible();
  });
});

describe("ChatPage — conversations", () => {
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
    expect(within(grover).getByText("Here is a starting point.")).toBeVisible();
    // 2 messages, 1 of which carried a proposal.
    expect(within(grover).getByRole("cell", { name: "2" })).toBeVisible();
    expect(within(grover).getByRole("cell", { name: "1" })).toBeVisible();
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

  /** A live destructive control beside the words "no conversation matches". */
  it("does not offer Delete all history over a search that matches nothing", async () => {
    renderChat({ store: await seedTwo() });
    const table = await showList();
    expect(within(table).getByRole("button", { name: "Delete all history" })).toBeEnabled();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search conversations" }),
      "zzzz",
    );

    expect(await within(table).findByText(/No conversation matches/)).toBeVisible();
    expect(within(table).getByRole("button", { name: "Delete all history" })).toBeDisabled();
  });

  /**
   * The export re-reads from the store rather than serialising what is on
   * screen, so a row in the list — which only ever holds a summary — can still
   * export a full transcript.
   */
  it("exports a conversation from the list as Markdown", async () => {
    const store = await seedTwo();
    const saved: { name: string; text: string }[] = [];
    const created: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      created.push("blob:stub");
      void (source as Blob).text().then((text) => {
        saved[saved.length - 1] = { name: saved.at(-1)?.name ?? "", text };
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

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.name).toBe("grover-baseline.md");
    await waitFor(() => expect(saved[0]?.text).toContain("# Grover baseline"));
    // The whole transcript, not the summary the row was rendered from.
    expect(saved[0]?.text).toContain("Estimate Grover search");
    expect(saved[0]?.text).toContain("### Proposed configuration");
    vi.restoreAllMocks();
  });

  it("reports an export of a conversation that is no longer stored", async () => {
    const store = await seedTwo();
    vi.spyOn(store, "get").mockResolvedValue(null);
    renderChat({ store });
    const table = await showList();
    const row = within(table).getByRole("row", { name: /Grover baseline/ });

    await userEvent.click(within(row).getByRole("button", { name: "Export" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer stored/);
    vi.restoreAllMocks();
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
