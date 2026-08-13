import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentProviderStatus,
  AgentService,
  ProviderId,
} from "../../shared/agentTypes";
import type { ChatMessage, ChatStore, ConversationSummary } from "../../shared/chatTypes";
import { ChatTranscript } from "./ChatTranscript";
import { CopyButton } from "./CopyButton";
import {
  assistantTurn,
  awaitingReply,
  buildChatRequest,
  startConversation,
  userTurn,
} from "./chatSession";
import { downloadMarkdown } from "../downloadMarkdown";
import { ConversationActions } from "./ConversationActions";
import { ConversationList } from "./ConversationList";
import { buildConversationMarkdown } from "./exportConversation";
import { draftToFormState, type DraftHandoff } from "./draftToFormState";
import { ProviderCredentialPanel } from "./ProviderCredentialPanel";

interface ChatPageProps {
  service: AgentService;
  /** Persistence. Reaches the chat database and never a provider. */
  store: ChatStore;
  status: AgentProviderStatus;
  onReviewDraft: (handoff: DraftHandoff) => void;
  /** Re-read provider status once a key is stored or removed. */
  onCredentialChange: () => void;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
  /**
   * Which conversation is open, owned by the shell.
   *
   * Every page here is a conditional render, so this component unmounts on any
   * sidebar click. Local state would send the analyst back to "no conversation
   * selected" every time they checked a field on Run Configuration — the same
   * complaint that moved the prompt box up here in the first place.
   */
  activeConversationId: string | null;
  onActiveConversationChange: (id: string | null) => void;
  /**
   * The unsent composer text, also shell-owned, and also session-only.
   *
   * The TRANSCRIPT is on disk now; this is not, and the difference is
   * deliberate. A sent message is a record of something that happened. A half
   * typed one is a thought in progress, and quitting the app is a reasonable
   * way to abandon it.
   */
  composer: string;
  onComposerChange: (text: string) => void;
  /**
   * Which of the two views is showing, owned by the shell for the same reason
   * the open conversation is: this component unmounts on every sidebar click,
   * and coming back to "Conversation" after deliberately opening the list is
   * the app forgetting what you were doing.
   */
  view: ChatView;
  onViewChange: (view: ChatView) => void;
}

/** The transcript, or the table of every conversation. */
export type ChatView = "conversation" | "list";

/** An error the analyst must act on, versus something that merely happened. */
type Note = { tone: "error" | "notice"; text: string };

/**
 * A transcript AND the conversation it belongs to, held as one value.
 *
 * These were two pieces of state, and every bug that followed came from their
 * being able to disagree. A reply resolving after the analyst clicked another
 * conversation was appended to whatever transcript was on screen — persisted to
 * the right thread, displayed in the wrong one. Tagging the messages makes
 * "append only if this is still the conversation I sent from" a thing the
 * reducer can check, rather than a thing the caller has to remember.
 */
interface Thread {
  readonly conversationId: string | null;
  /**
   * The open conversation's name, held HERE rather than looked up in the list.
   *
   * The header used to read `conversations.find(row => row.id === activeId)`,
   * and `conversations` holds search RESULTS when a search is active — so a
   * filter that excluded the open conversation made its header claim to be a
   * new, empty one while its transcript rendered underneath. Identity belongs
   * to the thread, not to a view of the list.
   */
  readonly title: string;
  readonly messages: readonly ChatMessage[];
}

const NO_THREAD: Thread = { conversationId: null, title: "", messages: [] };

/** Stable identity, so deriving an empty transcript does not churn memos. */
const NO_MESSAGES: readonly ChatMessage[] = [];

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Long enough to coalesce typing, short enough to feel immediate. */
const SETTLE_MS = 200;

/**
 * Somewhere to start.
 *
 * An empty conversation offered a single placeholder inside the box and nothing
 * else — fine if you already know what this page accepts, a blank wall if you
 * do not. These are the three shapes the assistant handles well: a benchmark, a
 * comparison, and a constraint worked backwards. Three rather than one, so they
 * teach the range instead of priming the same answer every time.
 */
const STARTERS: readonly string[] = [
  "Estimate Shor's factoring for RSA-2048 on a superconducting architecture",
  "Compare Majorana and superconducting qubits for a 20×20 Ising model",
  "What physical error rate would I need to factor RSA-2048 in under a day?",
];

/**
 * A value that follows `value` once it has stopped changing for `delayMs`.
 *
 * Two things here are driven by a text box and are expensive per keystroke: the
 * rail's search (an FTS5 MATCH plus a second query, over IPC) and the outbound
 * preview (which rebuilds the ~18 KB system prompt and schema in main and
 * serialises it back). Typing a 300-character description with the preview open
 * issued 300 round trips of each.
 *
 * Safe for the preview specifically because it is not a gate: `send` builds its
 * own request from the real composer text, so a preview that is 200 ms behind
 * is a panel the analyst has not finished reading, never a payload mismatch.
 */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function ChatPage({
  service,
  store,
  status,
  onReviewDraft,
  onCredentialChange,
  provider,
  model,
  onSelectionChange,
  activeConversationId,
  onActiveConversationChange,
  composer,
  onComposerChange,
  view,
  onViewChange,
}: ChatPageProps): React.JSX.Element {
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([]);
  const [thread, setThread] = useState<Thread>(NO_THREAD);
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [draftError, setDraftError] = useState<{ messageId: string; message: string } | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<unknown>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [listToken, setListToken] = useState(0);
  const refreshList = useCallback(() => setListToken((token) => token + 1), []);

  /** So a starter lands the analyst IN the box, ready to edit or send. */
  const composerBox = useRef<HTMLTextAreaElement>(null);

  /**
   * Whether the provider CURRENTLY SELECTED holds a key — which is not what
   * `status.available` reports. That flag is true when *any* provider is
   * configured, so with Anthropic configured and OpenAI selected the primary
   * button was disabled while the only sentence that explains why was
   * suppressed: a dead control and no reason given.
   */
  const selected = status.providers.find((candidate) => candidate.provider === provider);
  const selectedIsConfigured = selected?.configured ?? false;

  const settledSearch = useSettled(searchQuery, SETTLE_MS);

  useEffect(() => {
    let current = true;
    const load = settledSearch.trim().length > 0 ? store.search(settledSearch) : store.list();
    void load.then(
      (rows) => {
        if (current) setConversations(rows);
      },
      () => {
        // A rail that cannot be listed must not take the composer down with it.
        if (current) setConversations([]);
      },
    );
    return () => {
      current = false;
    };
  }, [store, settledSearch, listToken]);

  /**
   * The transcript on screen — the loaded one, or nothing while a different
   * conversation is still loading.
   *
   * Derived rather than stored, so there is no render in which the rail
   * highlights one conversation and the thread beside it shows another's
   * messages.
   */
  const messages = thread.conversationId === activeConversationId ? thread.messages : NO_MESSAGES;

  /**
   * An existing conversation is open but its transcript has not arrived yet.
   *
   * Named, because two very different things have to agree about this window:
   * `send` refuses inside it (posting a turn against an empty transcript drops
   * every earlier one from the request), and the EMPTY STATE must not render
   * inside it either. `messages` is legitimately empty here, so the "nothing
   * sent yet" branch and its starter chips used to paint over a ten-turn
   * conversation for the length of a store round trip — a microtask against the
   * in-memory twin, tens of milliseconds against SQLite over IPC, and long
   * enough to click one of the chips.
   */
  const loadingConversation =
    activeConversationId !== null && thread.conversationId !== activeConversationId;

  /**
   * Load the open conversation, unless the thread already holds it.
   *
   * `thread.conversationId` is in the deps rather than a ref, so the skip is
   * derived from what is actually loaded instead of from a one-shot flag. That
   * flag was a bug of its own: `send` set it before handing the new id to the
   * shell, and anything that changed the active conversation first left it
   * pointing at an id it would then refuse to load, forever.
   *
   * It also covers the first send. A new conversation is created, appended to
   * and put on screen here in one go, so re-reading it back would at best cost
   * a round trip and at worst — if the read is slower than the provider — land
   * after the reply and drop it.
   */
  useEffect(() => {
    if (activeConversationId === null) {
      setThread(NO_THREAD);
      return;
    }
    if (thread.conversationId === activeConversationId) return;

    let current = true;
    void store.get(activeConversationId).then(
      (conversation) => {
        if (current) {
          setThread({
            conversationId: activeConversationId,
            title: conversation?.title ?? "",
            messages: conversation?.messages ?? [],
          });
        }
      },
      () => {
        // Tagged with the id even on failure, so this settles rather than
        // retrying on every unrelated render.
        if (current) {
          setThread({ conversationId: activeConversationId, title: "", messages: [] });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [store, activeConversationId, thread.conversationId]);

  /**
   * The request the next send would make, from the stored transcript plus
   * whatever is in the composer. Recomputed as the analyst types so the preview
   * describes what would go out now, not what would have gone out when they
   * opened it.
   */
  const settledComposer = useSettled(composer, SETTLE_MS);
  const nextRequest = useMemo(
    () => buildChatRequest(messages, provider, model, settledComposer),
    [messages, provider, model, settledComposer],
  );

  useEffect(() => {
    if (!previewOpen) return;
    let current = true;
    void service.previewRequest(nextRequest).then(
      (body) => {
        if (!current) return;
        setPreview(body);
        setPreviewError(null);
      },
      (error) => {
        if (!current) return;
        setPreview(null);
        setPreviewError(describeError(error));
      },
    );
    return () => {
      current = false;
    };
  }, [service, previewOpen, nextRequest]);

  /**
   * The outbound body as text, serialised ONCE per preview.
   *
   * This was `JSON.stringify(preview, null, 2)` written twice in the JSX — once
   * for the `<pre>`, once for the copy button — over a body that is the ~18 KB
   * system prompt plus the generation schema. This component re-renders on
   * every composer keystroke, so with the disclosure open that was two full
   * serialisations per character typed: exactly the per-keystroke cost
   * `useSettled` exists to keep off this data.
   */
  const previewText = useMemo(() => JSON.stringify(preview, null, 2), [preview]);

  /**
   * The single send slot, as a ref rather than the `sending` state beside it.
   *
   * `sending` is set inside `runTurn`, two awaits after `send` begins, so a
   * guard reading it saw `false` for both of two Enter presses in the same
   * frame — and with no conversation open that minted TWO conversations and
   * fired two requests, the second of which aborted the first in main. A ref is
   * written synchronously, before anything yields, which is the only thing that
   * makes the check mean what it says.
   */
  const busy = useRef(false);

  /** One turn against the provider. Callers hold the send slot. */
  const runTurn = useCallback(
    async (conversationId: string, transcript: readonly ChatMessage[]): Promise<void> => {
      setSending(true);
      setNote(null);
      try {
        const result = await service.requestReply(buildChatRequest(transcript, provider, model));
        if (!result.ok) {
          // Cancelling is not a failure — it is the analyst getting what they
          // asked for. Showing it in the same red as a revoked key would teach
          // them to distrust the colour.
          setNote({ tone: result.code === "CANCELLED" ? "notice" : "error", text: result.message });
          return;
        }
        const reply = assistantTurn(result);
        await store.append(conversationId, reply);
        // Only into the conversation it was asked of. The analyst is free to
        // read another thread while a reply is in flight, and the reply belongs
        // where it was sent from — the store already has it there.
        setThread((current) =>
          current.conversationId === conversationId
            ? { ...current, messages: [...current.messages, reply] }
            : current,
        );
        refreshList();
      } catch (error) {
        setNote({ tone: "error", text: describeError(error) });
      } finally {
        setSending(false);
      }
    },
    [service, store, provider, model, refreshList],
  );

  const send = async (): Promise<void> => {
    const text = composer.trim();
    if (text.length === 0 || busy.current) return;
    // See `loadingConversation`: sending here would post against a transcript
    // that has not finished loading.
    if (loadingConversation) return;
    busy.current = true;
    try {
      setNote(null);
      setDraftError(null);

      let conversationId = activeConversationId;
      let transcript = messages;
      let outgoing: ChatMessage;
      let newTitle = "";

      // Persisted BEFORE the request goes out. A message that reached the
      // provider but not the disk would vanish from a transcript that is
      // supposed to be the record of what was asked.
      try {
        if (conversationId === null) {
          const started = startConversation(text);
          await store.create(started.conversation);
          conversationId = started.conversation.id;
          newTitle = started.conversation.title;
          outgoing = started.message;
          transcript = [];
          onActiveConversationChange(conversationId);
        } else {
          outgoing = userTurn(text);
        }
        await store.append(conversationId, outgoing);
      } catch (error) {
        setNote({
          tone: "error",
          text: `This message could not be saved, so nothing was sent: ${describeError(error)}`,
        });
        return;
      }

      setThread((current) => ({
        conversationId,
        title: current.conversationId === conversationId ? current.title : newTitle,
        messages: [...transcript, outgoing],
      }));
      onComposerChange("");
      refreshList();
      await runTurn(conversationId, [...transcript, outgoing]);
    } finally {
      busy.current = false;
    }
  };

  /** Ask the unanswered question again, without retyping it. */
  const retry = async (): Promise<void> => {
    if (activeConversationId === null || busy.current) return;
    busy.current = true;
    try {
      await runTurn(activeConversationId, messages);
    } finally {
      busy.current = false;
    }
  };

  const useDraft = (message: ChatMessage): void => {
    if (message.draft === null) return;
    /**
     * No attribution, no handoff. This read `message.model ?? "model"`, and
     * that fallback went straight into `RunProvenance.model` — which the
     * canonical schema constrains only with `minLength: 1`, so the literal
     * string "model" passed the gate and was written onto an IMMUTABLE run
     * record claiming a model by that name had authored it. Refusing is the
     * only option that does not put a lie in history.
     */
    if (message.model === null) {
      setDraftError({
        messageId: message.id,
        message:
          "This proposal has no model recorded against it, so it cannot be carried into the form — a run has to say which model authored it. Ask for the configuration again.",
      });
      return;
    }
    const mapped = draftToFormState(message.draft, message.model);
    if (!mapped.ok) {
      // On the card it belongs to, not in the page-level note: the analyst is
      // being told this proposal cannot be opened, and which one matters.
      setDraftError({ messageId: message.id, message: mapped.message });
      return;
    }
    setDraftError(null);
    onReviewDraft(mapped.handoff);
  };

  /**
   * Run a store mutation and REPORT a rejection rather than dropping it.
   *
   * These were bare `void store.rename(...).then(refreshList)` calls with no
   * second argument. `ChatStore.rename` and `delete` reject on an unknown
   * conversation — which a second window deleting it makes reachable — and the
   * SQLite implementation rejects on a locked or full disk. The rejection was
   * unhandled, the follow-up never ran, and the rail went on showing the old
   * title as though the rename had worked.
   */
  const mutateStore = useCallback(
    (work: Promise<void>, failed: string, done: () => void = () => {}): void => {
      void work.then(
        () => {
          done();
          refreshList();
        },
        (error: unknown) => setNote({ tone: "error", text: `${failed}: ${describeError(error)}` }),
      );
    },
    [refreshList],
  );

  const startNew = (): void => {
    onActiveConversationChange(null);
    onComposerChange("");
    setNote(null);
    setDraftError(null);
    setPreviewOpen(false);
    // Cleared, or the conversation about to be created would not appear in the
    // list the analyst returns to — filtered out by a term they typed before
    // it existed.
    setSearchQuery("");
    onViewChange("conversation");
  };

  const openConversation = (id: string): void => {
    onActiveConversationChange(id);
    setNote(null);
    setDraftError(null);
    onViewChange("conversation");
  };

  const renameConversation = (id: string, title: string): void => {
    mutateStore(store.rename(id, title), "This conversation could not be renamed", () => {
      // The header reads the thread, not the list, so it needs telling too.
      setThread((current) => (current.conversationId === id ? { ...current, title } : current));
    });
  };

  const deleteConversation = (id: string): void => {
    mutateStore(store.delete(id), "This conversation could not be deleted", () => {
      if (id === activeConversationId) onActiveConversationChange(null);
    });
  };

  /**
   * Write a conversation out as Markdown.
   *
   * Re-reads it from the store rather than exporting what is on screen: the
   * list only holds summaries, and even in the Conversation view the export
   * should be the record on disk rather than whatever this component happens to
   * be holding. A read can fail, so it is reported like every other store
   * failure instead of silently producing nothing.
   */
  const exportConversation = (id: string): void => {
    void store.get(id).then(
      (conversation) => {
        if (conversation === null) {
          setNote({ tone: "error", text: "That conversation is no longer stored." });
          return;
        }
        downloadMarkdown(buildConversationMarkdown(conversation), conversation.title);
      },
      (error: unknown) =>
        setNote({
          tone: "error",
          text: `This conversation could not be exported: ${describeError(error)}`,
        }),
    );
  };

  const unanswered = activeConversationId !== null && awaitingReply(messages) && !sending;
  const openTitle = thread.conversationId === activeConversationId ? thread.title : "";
  const proposalCount = messages.filter((message) => message.draft !== null).length;

  return (
    <div className="chat-page">
      <header className="run-config__header">
        <h1>Describe a Run</h1>
        <p className="run-config__subtitle">
          Talk through a configuration in plain language. Any proposal opens in Run
          Configuration for review and editing before anything can execute.
        </p>
      </header>

      <ProviderCredentialPanel
        service={service}
        status={status}
        provider={provider}
        model={model}
        onSelectionChange={onSelectionChange}
        onCredentialChange={onCredentialChange}
      />

      {/*
        Two views of one store behind a segmented control — the same shape
        `RunHistoryContainer` uses for History and Comparison. A conversation is
        the same kind of saved object as a run, and this app already had a way
        to list those; the 280px rail this replaced was a second vertical rail
        beside the app's only other one, on the only page that had two.
      */}
      <div className="chat-views" role="group" aria-label="Chat views">
        <button
          type="button"
          className={`chat-views__tab${view === "conversation" ? " chat-views__tab--active" : ""}`}
          aria-pressed={view === "conversation"}
          onClick={() => onViewChange("conversation")}
        >
          Conversation
        </button>
        <button
          type="button"
          className={`chat-views__tab${view === "list" ? " chat-views__tab--active" : ""}`}
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
        >
          All conversations
          {/*
            Suppressed while a search is running: `conversations` then holds
            MATCHES, and "All conversations · 1" beside twelve stored ones is a
            label naming everything next to a number counting a subset.
          */}
          {searchQuery.trim().length === 0 && conversations.length > 0
            ? ` · ${conversations.length}`
            : ""}
        </button>
      </div>

      {/*
        Page level, not inside the transcript. Renaming and deleting happen in
        the LIST view, so a note that only rendered beside the composer made
        every store failure raised from the list invisible — reported into a
        branch that was not on screen.
      */}
      {note ? (
        <p
          className={note.tone === "error" ? "agent-error" : "agent-note"}
          role={note.tone === "error" ? "alert" : "status"}
        >
          {note.text}
        </p>
      ) : null}

      {view === "list" ? (
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpen={openConversation}
          onNew={startNew}
          onRename={renameConversation}
          onDelete={deleteConversation}
          onExport={exportConversation}
          onClearAll={() => {
            mutateStore(store.clear(), "The chat history could not be deleted", () =>
              onActiveConversationChange(null),
            );
          }}
        />
      ) : (
        <section className="chat-thread">
          <div className="chat-thread__header">
            <div className="chat-thread__identity">
              {/*
                The way back.
                
                This header sticks, and opening a conversation scrolls its newest
                turn into view — which carries the page heading, the provider
                panel and the view switcher off the top along with it. Without
                this the sticky header was a dead end: the only route back to the
                list was scrolling up through the entire transcript to reach a
                control that had been on screen a moment earlier.
              */}
              <button
                type="button"
                className="chat-thread__back"
                /*
                 * The glyph is decoration and the name is explicit. Read aloud,
                 * "← All conversations" became "left arrow All conversations"
                 * sitting beside a tab announcing "All conversations · 3" that
                 * goes to the same place — two near-identical entries in a
                 * button list, told apart by a character that means nothing
                 * spoken.
                 */
                aria-label="Back to all conversations"
                onClick={() => onViewChange("list")}
              >
                <span aria-hidden="true">←</span> All conversations
              </button>
              <h2 className="chat-thread__title">
                {activeConversationId === null ? "New conversation" : openTitle}
              </h2>
              <p className="chat-thread__meta">
                {activeConversationId === null
                  ? "Nothing sent yet — your first message names it."
                  : `${messages.length === 1 ? "1 message" : `${messages.length} messages`}${
                      proposalCount > 0
                        ? ` · ${proposalCount === 1 ? "1 proposal" : `${proposalCount} proposals`}`
                        : ""
                    }`}
              </p>
            </div>
            {/*
              ONE group. These were siblings under the header's own `flex-wrap`,
              so a title long enough to need the room pushed only the LAST of
              them onto a second row — "New conversation" landing at the far
              left, beneath the title, opposite the three buttons it belongs
              with.
            */}
            <div className="chat-thread__controls">
              {activeConversationId === null ? null : (
                <>
                  <ConversationActions
                    id={activeConversationId}
                    title={openTitle}
                    onRename={renameConversation}
                    onDelete={deleteConversation}
                    onExport={exportConversation}
                  />
                  {/*
                    Secondary, and absent entirely on a conversation that is
                    already new — where it did nothing at all, under a heading
                    that read "New conversation" beside a button reading "New
                    conversation".

                    It was the one accent-filled control here and 2.4x the width
                    of the Delete next to it, which put the loudest button on the
                    page on the action that discards what you are looking at,
                    while Send — the actual point of this screen — sat below it in
                    a plain outline.
                  */}
                  <button type="button" className="agent-secondary" onClick={startNew}>
                    New conversation
                  </button>
                </>
              )}
            </div>
          </div>

          {loadingConversation ? null : messages.length === 0 && !sending ? (
            <div className="chat-thread__empty">
              <p>
                Describe the application, architecture, and constraints you care about. The
                assistant can ask questions back, and will propose a configuration once it has
                enough to go on.
              </p>
              {/*
                Only over an empty composer. A starter REPLACES what is in the
                box, and the box is directly beneath these chips and holds the
                one thing in this app that is deliberately never persisted — so
                one mis-aimed click on a chip discarded a description someone had
                just typed, with nothing to undo it. Clearing the box brings them
                back.
              */}
              {composer.trim().length > 0 ? null : (
                <div className="chat-thread__starters">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      className="chat-thread__starter"
                      onClick={() => {
                        onComposerChange(starter);
                        // Into the box, not merely onto the screen: a starter is
                        // a first draft to edit, not a button that sends for you.
                        composerBox.current?.focus();
                      }}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ChatTranscript
              messages={messages}
              sending={sending}
              onUseDraft={useDraft}
              draftError={draftError}
            />
          )}

          {/*
            The analyst's message stays in the transcript when a turn fails —
            it is what they wrote, and losing it to a rate limit is the complaint
            that moved the prompt box into the shell to begin with. The cost is a
            transcript ending on an unanswered question, so there has to be a way
            to ask it again without retyping it.
          */}
          {unanswered ? (
            <div className="chat-retry">
              <button type="button" className="agent-secondary" onClick={() => void retry()}>
                Send this message again
              </button>
            </div>
          ) : null}

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {/*
              Visually hidden: the placeholder already says what the box is for,
              and a standing "Your message" caption above a chat composer is a
              line of chrome repeated on every turn for no one who cannot
              already see where they are typing.
            */}
            <label className="sr-only" htmlFor="chat-composer">
              Your message
            </label>
            <textarea
              id="chat-composer"
              ref={composerBox}
              className="agent-prompt"
              rows={2}
              value={composer}
              onChange={(event) => {
                onComposerChange(event.target.value);
                setNote(null);
              }}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. A multi-paragraph
                // description is normal here, so the newline has to stay
                // reachable — but making the analyst leave the keyboard for
                // every turn is what makes a chat feel like a form.
                //
                // `isComposing` is the third case and the one that is easy to
                // miss: an analyst typing Japanese, Chinese or Korean presses
                // Enter to ACCEPT an IME conversion candidate. That keydown is
                // indistinguishable from a send unless this is checked, so
                // without it the commit is swallowed and a half-composed
                // message goes to the provider.
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Estimate Grover search for a 20-qubit search space on a gate-based QPU with 50 ns gates…"
            />

            <div className="agent-actions">
              <button
                type="submit"
                className="run-button agent-primary"
                disabled={!selectedIsConfigured || composer.trim().length === 0 || sending}
              >
                {sending ? "Sending…" : "Send"}
              </button>
              {sending ? (
                <button
                  type="button"
                  className="agent-secondary"
                  onClick={() => void service.cancelReply()}
                >
                  Cancel
                </button>
              ) : null}
              <span className="chat-composer__hint">
                Enter to send · Shift+Enter for a new line
              </span>
            </div>

            {!selectedIsConfigured && status.available ? (
              <p className="agent-note">
                No key is configured for {selected?.displayName ?? provider}, so there is
                nothing to send this to. Add one under <strong>Model provider</strong> above, or
                switch to a provider that has one.
              </p>
            ) : null}
            {!status.available ? <p className="agent-error">{status.message}</p> : null}

            {/*
              The exact outbound request, on demand rather than as a gate.
              Reviewing every turn of a conversation was two clicks and a JSON
              wall per message; what the constraint actually asks for is that
              the analyst can read what will leave the machine BEFORE it does,
              and that nothing leaves without their explicit action. Both still
              hold — this is the whole body, credential-free, read back from the
              process that would send it, and it is built by the same function
              `send` uses.
            */}
            <details
              className="chat-preview"
              open={previewOpen}
              onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
            >
              <summary>Show the exact request this would send</summary>
              <p>
                The complete request body, read back from the process that would send it. Your
                key travels as a header and is not part of it.
              </p>
              {previewError === null ? (
                <>
                  <pre>{previewText}</pre>
                  {preview === null ? null : (
                    <CopyButton value={previewText} label="Copy request" />
                  )}
                </>
              ) : (
                <p className="agent-error">
                  Could not read the outbound request: {previewError}
                </p>
              )}
            </details>
          </form>
        </section>
      )}
    </div>
  );
}
