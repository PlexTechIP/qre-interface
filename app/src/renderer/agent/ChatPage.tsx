import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentProviderStatus,
  AgentService,
  FormContextEntry,
  ProviderId,
} from "../../shared/agentTypes";
import type {
  ChatMessage,
  ChatStore,
  Conversation,
  ConversationSummary,
} from "../../shared/chatTypes";
import type { RunConfig, RunResult } from "../../shared/types";
import { RunConfiguration, type FormSnapshot } from "../RunConfiguration";
import { ChatRunPanel } from "./ChatRunPanel";
import { ChatTranscript } from "./ChatTranscript";
import { CopyButton } from "../CopyButton";
import {
  assistantTurn,
  awaitingReply,
  buildChatRequest,
  startConversation,
  userTurn,
} from "./chatSession";
import { ConversationActions } from "./ConversationActions";
import { ConversationList } from "./ConversationList";
import { ConversationExportDialog } from "./ConversationExportDialog";
import { draftToFormState, type DraftHandoff } from "./draftToFormState";
import { ProviderModelSelect } from "../components/ProviderModelSelect";
import { charsToReveal, minCommitIntervalMs } from "./streamReveal";
import { useRunFlow } from "../state/useRunFlow";

interface ChatPageProps {
  service: AgentService;
  /** Persistence. Reaches the chat database and never a provider. */
  store: ChatStore;
  status: AgentProviderStatus;
  /**
   * A run finished — running a proposal from here behaves exactly like the
   * Configure page: the shell persists it to Run History and shows it on the
   * Results page. The AI agent and Configure are two separate ways to configure
   * and run; they share the same Results and History downstream.
   */
  onRunComplete: (config: RunConfig, result: RunResult, conversationId?: string) => void;
  /**
   * The inline configuration editor, held by the shell so it survives this
   * page's unmounting.
   *
   * Every page here is a conditional render, so the editor — and any edits in it
   * — would die on a sidebar click if it lived in this component. The shell owns
   * whether it is open and keeps its live state, exactly as it does for the
   * chat's own composer and conversation, so "edit a proposal, look at History,
   * come back" keeps the work.
   */
  editorOpen: boolean;
  /** The editor's state to seed from — the proposal on first open, then the
   *  running edit. Read once, when the editor mounts. */
  editorSnapshot?: FormSnapshot | undefined;
  /** Open the editor on a proposal (its handoff doubles as the first snapshot). */
  onOpenEditor: (snapshot: FormSnapshot) => void;
  /** Close the editor and return to the conversation. */
  onCloseEditor: () => void;
  /** Report the editor's state upward so an edit outlives a remount. */
  onEditorStateChange: (snapshot: FormSnapshot) => void;
  /**
   * Take the analyst to Settings, where provider keys now live.
   *
   * This page used to carry the credential panel itself, so "you have no key"
   * and "here is where you fix that" were the same piece of UI. Now that key
   * entry has moved, an explanation without a route to the fix would be a
   * dead end on the only page that surfaces the problem.
   */
  onOpenSettings: () => void;
  /**
   * Take the analyst straight to the AI providers tab in Settings — where keys
   * are added and changed. Distinct from `onOpenSettings` (which opens wherever
   * they last were) so the model bar's "Manage keys" lands on the right tab.
   */
  onOpenProviderSettings: () => void;
  provider: ProviderId;
  model: string;
  onSelectionChange: (provider: ProviderId, model: string) => void;
  /**
   * What the analyst has already set on the run form.
   *
   * Sent with every turn so a proposal starts from their work instead of from
   * defaults. Without it the model authors against an empty form and the draft
   * silently resets fields they had already chosen — the week-6 backlog's "a
   * model draft still discards a half-filled form".
   */
  /**
   * Read as a function rather than taken as a value, so the shell does not have
   * to re-render on every keystroke in the run form just to keep this current.
   * Called when a turn is sent and when the request preview is rebuilt, which
   * are the only two moments it is read.
   */
  getFormContext: () => readonly FormContextEntry[];
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

const describeError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  // Electron wraps a thrown main-process error as
  // "Error invoking remote method 'agent:reply': Error: <original>". That prefix
  // names an IPC channel the analyst has no use for; strip it and any leading
  // "Error:" left behind so a genuinely unexpected failure still reads as prose.
  // Expected failures never reach here — they resolve as typed AgentChatResult
  // data with their own messages.
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^Error:\s*/, "")
    .trim();
};

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
  onRunComplete,
  editorOpen,
  editorSnapshot,
  onOpenEditor,
  onCloseEditor,
  onEditorStateChange,
  onOpenSettings,
  onOpenProviderSettings,
  provider,
  model,
  onSelectionChange,
  getFormContext,
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
  /**
   * Running a proposal AS DRAFTED, without opening the editor first.
   *
   * The same run flow the Configure path uses — it stamps a RunConfig, runs it
   * over the estimator bridge, and persists the finished run to history. On
   * completion the shell moves to the Results page (via `onRunComplete`), so a
   * run started here lands exactly where a Configure run does. The in-flight
   * spinner shows via `ChatRunPanel` until then.
   */
  const { runState, start: startRun, edit: clearRun } = useRunFlow();
  /** The conversation the in-flight run came from, for the Results back-link. */
  const runConversationId = useRef<string | undefined>(undefined);
  /** Fire `onRunComplete` once per finished run, not on every re-render. */
  const reportedRunId = useRef<string | null>(null);

  useEffect(() => {
    if (runState.phase !== "done") return;
    if (reportedRunId.current === runState.config.id) return;
    reportedRunId.current = runState.config.id;
    onRunComplete(runState.config, runState.result, runConversationId.current);
  }, [runState, onRunComplete]);
  // The conversation whose export preview is open (null = closed). Holding the
  // loaded conversation itself means the dialog can never be open with nothing
  // to render.
  const [exportTarget, setExportTarget] = useState<Conversation | null>(null);
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
  /*
   * Derived once, on arrival.
   *
   * That is not a staleness bug, it is the lifetime: the run form lives on a
   * different page, every page here is a conditional render, and this component
   * therefore mounts fresh each time the analyst comes back from editing the
   * form. The value is current as of the moment they arrived, and the form
   * cannot change while they are looking at this page.
   *
   * Reading it as a function rather than taking it as a prop is what keeps the
   * shell from re-rendering on every keystroke typed on that other page.
   */
  const formContext = useMemo(getFormContext, [getFormContext]);

  const settledComposer = useSettled(composer, SETTLE_MS);
  const nextRequest = useMemo(
    /*
     * The form context is part of this, because it is part of what gets sent.
     *
     * Leaving it out made the "exact outbound request" panel show a system
     * prompt WITHOUT the analyst's own field values while the real request
     * carried them — so the one surface that exists to report what leaves the
     * machine was the one hiding what this milestone added to it.
     */
    () => buildChatRequest(messages, provider, model, settledComposer, { formContext }),
    [messages, provider, model, settledComposer, formContext],
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

  /**
   * The prose of the turn currently arriving, and the id it belongs to.
   *
   * Held together so a fragment can be matched to the request that asked for
   * it: a window that cancelled and re-sent would otherwise paint the abandoned
   * request's fragments into the new turn, and once they are just strings the
   * two streams are indistinguishable.
   */
  const [streaming, setStreaming] = useState<{ requestId: string; text: string }>({
    requestId: "",
    text: "",
  });

  /**
   * The turn currently being streamed, readable from the delta listener.
   *
   * The listener is registered once for the life of the page, so it cannot
   * close over the live id — it reads it here instead.
   */
  const liveRequestId = useRef("");
  /** Everything received for the live turn, whether painted yet or not. */
  const received = useRef("");
  /** How much of `received` is on screen. The rest is still being revealed. */
  const shown = useRef(0);
  const frame = useRef<number | null>(null);
  const lastFrameAt = useRef(0);
  const lastCommitAt = useRef(0);

  /** Stop the reveal loop. Safe to call when it is not running. */
  const stopReveal = useCallback((): void => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  /*
   * One subscription for the life of the page, not one per turn.
   *
   * Registering inside `runTurn` would add and remove a listener on every send,
   * and a fragment arriving between the provider's first byte and the effect
   * committing would be dropped. The id filter is what makes a single
   * long-lived listener safe.
   *
   * What arrives is buffered, not painted. A provider delivers prose in clumps
   * shaped by tokenisation and network buffering, so painting each burst as it
   * lands moves the text in steps as uneven as the network — legible, but it
   * lurches. `charsToReveal` drains the buffer toward the screen at a rate that
   * holds the unshown remainder at a roughly constant duration, which is what
   * reads as smooth; see `streamReveal.ts` for the pacing itself.
   *
   * This also bounds the markdown cost, which is why the batch it replaces
   * existed: every paint re-parses the whole accumulated reply, and a frame
   * loop paints at the display's rate no matter how many fragments arrived.
   *
   * A hidden window stops delivering frames, so the reveal pauses while the app
   * is minimised or occluded. That is the behaviour worth having: nothing is
   * lost — arrival keeps filling the buffer — and the first frame after the
   * window comes back is charged the whole elapsed gap, so it catches up at
   * once instead of replaying the wait.
   */
  useEffect(() => {
    const step = (now: number): void => {
      const elapsed = Math.max(0, now - lastFrameAt.current);
      lastFrameAt.current = now;
      shown.current += charsToReveal(received.current.length - shown.current, elapsed);
      const drained = shown.current >= received.current.length;
      /*
       * The cursor advances every frame; the screen does not have to. Painting
       * re-parses the whole reply, so a long one is throttled to keep that cost
       * inside its budget — see `minCommitIntervalMs`. A skipped paint shows
       * more characters next time rather than showing them later, so the pacing
       * above is unaffected. The last one is never skipped, or the tail of a
       * reply would sit revealed-but-unpainted until the turn landed.
       */
      if (drained || now - lastCommitAt.current >= minCommitIntervalMs(shown.current)) {
        lastCommitAt.current = now;
        const text = received.current.slice(0, shown.current);
        setStreaming((current) =>
          current.requestId === liveRequestId.current
            ? { requestId: current.requestId, text }
            : current,
        );
      }
      frame.current = drained ? null : requestAnimationFrame(step);
    };

    return service.onReplyDelta(({ requestId, fragment }) => {
      if (requestId !== liveRequestId.current) return;
      received.current += fragment;
      if (frame.current !== null) return;
      // Timed from now rather than from the last frame: the gap since the
      // previous burst is not reading time the analyst spent, and charging it
      // as elapsed would dump the whole buffer in the first frame.
      lastFrameAt.current = performance.now();
      // Not reset alongside it: a burst arriving right after a paint should
      // still wait out the interval rather than paint twice in a frame.
      frame.current = requestAnimationFrame(step);
    });
  }, [service]);

  // A page that unmounts mid-stream must not leave a frame loop holding a
  // setState for a component React has already dropped.
  useEffect(() => stopReveal, [stopReveal]);

  /** One turn against the provider. Callers hold the send slot. */
  const runTurn = useCallback(
    async (conversationId: string, transcript: readonly ChatMessage[]): Promise<void> => {
      // Minted here so the listener can be armed BEFORE the request goes out:
      // a provider that answers quickly would otherwise stream its first
      // fragments at an id nothing is listening for.
      const requestId = crypto.randomUUID();
      liveRequestId.current = requestId;
      received.current = "";
      shown.current = 0;
      lastCommitAt.current = 0;
      stopReveal();
      setStreaming({ requestId, text: "" });
      setSending(true);
      setNote(null);
      try {
        const result = await service.requestReply(
          buildChatRequest(transcript, provider, model, "", { requestId, formContext }),
        );
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
        // Cleared once the turn has landed in the transcript, so the streamed
        // copy and the stored one are never both on screen. The buffer goes
        // too, or a fragment that raced the reply would paint onto the next turn.
        liveRequestId.current = "";
        received.current = "";
        shown.current = 0;
        stopReveal();
        // Any remainder still waiting is not lost: the stored turn rendering
        // below carries the identical prose, so this hands off rather than
        // truncating. Snapping the last fraction of a second is the right
        // trade — holding the finished reply back to finish typing it would
        // stall a turn the analyst can already see is done.
        setStreaming({ requestId: "", text: "" });
      }
    },
    [service, store, provider, model, refreshList, formContext, stopReveal],
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

  /**
   * Turn a proposal message into a runnable handoff, or report why it cannot be.
   *
   * Shared by the two things a proposal can do — run here, or open in Configure
   * to edit — so the same guards (an open conversation to return to, a recorded
   * model to attribute the run, a mapping the form accepts) apply to both.
   * Returns `null` and sets the card's error on any failure.
   */
  const resolveDraft = (message: ChatMessage): DraftHandoff | null => {
    if (message.draft === null) return null;
    /*
     * A proposal can only be acted on from the conversation showing it, so this
     * is not expected — but a run has to name a real conversation for the
     * analyst to get back to afterwards.
     *
     * Reported rather than returned silently, like the attribution guard below
     * it. A bare return leaves the button doing nothing at all: no run, no
     * message, nothing to distinguish it from a dead control.
     */
    if (activeConversationId === null) {
      setDraftError({
        messageId: message.id,
        message:
          "This proposal is not attached to an open conversation, so there would be no thread to return to after the run. Reopen the conversation and try again.",
      });
      return null;
    }
    /**
     * No attribution, no run. This read `message.model ?? "model"`, and that
     * fallback went straight into `RunProvenance.model` — which the canonical
     * schema constrains only with `minLength: 1`, so the literal string "model"
     * passed the gate and was written onto an IMMUTABLE run record claiming a
     * model by that name had authored it. Refusing is the only option that does
     * not put a lie in history.
     */
    if (message.model === null) {
      setDraftError({
        messageId: message.id,
        message:
          "This proposal has no model recorded against it, so it cannot be run — a run has to say which model authored it. Ask for the configuration again.",
      });
      return null;
    }
    const mapped = draftToFormState(message.draft, message.model, activeConversationId);
    if (!mapped.ok) {
      // On the card it belongs to, not in the page-level note: the analyst is
      // being told this proposal cannot be used, and which one matters.
      setDraftError({ messageId: message.id, message: mapped.message });
      return null;
    }
    setDraftError(null);
    return mapped.handoff;
  };

  /** Run the proposal as drafted — the shell moves to Results on completion. */
  const runDraft = (message: ChatMessage): void => {
    const handoff = resolveDraft(message);
    if (handoff === null) return;
    runConversationId.current = handoff.conversationId;
    startRun(handoff.state, handoff.provenance);
  };

  /** Open the proposal in the editor, in place on this page, to change it first. */
  const editDraft = (message: ChatMessage): void => {
    const handoff = resolveDraft(message);
    if (handoff === null) return;
    // A handoff carries exactly the snapshot fields (state, provenance, proposed,
    // conversationId), so it seeds the editor as its first state.
    onOpenEditor(handoff);
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
   * Open the export preview for a conversation.
   *
   * Re-reads it from the store rather than exporting what is on screen: the
   * list only holds summaries, and even in the Conversation view the export
   * should be the record on disk rather than whatever this component happens to
   * be holding. A read can fail, so it is reported like every other store
   * failure instead of silently producing nothing.
   *
   * The loaded conversation IS the dialog's open/closed state — there is no
   * second boolean that could disagree with it, and no window in which the
   * dialog is open with nothing to show.
   */
  const exportConversation = (id: string): void => {
    void store.get(id).then(
      (conversation) => {
        if (conversation === null) {
          setNote({ tone: "error", text: "That conversation is no longer stored." });
          return;
        }
        setExportTarget(conversation);
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

      {/*
        Which model answers is a per-conversation decision — an analyst
        comparing two providers' readings of the same prompt switches here
        mid-thread — so the switcher stays even though key entry left. It is
        the same component Settings renders, so "provider resets the model"
        cannot be true on one surface and not the other.
      */}
      <div className="chat-model-bar">
        <div className="chat-model-bar__head">
          <div className="chat-model-bar__heading">
            <h2 className="chat-model-bar__title">Model for this conversation</h2>
          </div>
          <button
            type="button"
            className="agent-secondary chat-model-bar__manage"
            onClick={onOpenProviderSettings}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
              <circle
                cx="8"
                cy="15"
                r="4"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="m11 12 8-8M17 6l2 2M14.5 8.5l2 2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Manage keys
          </button>
        </div>
        <ProviderModelSelect
          providers={status.providers}
          provider={provider}
          model={model}
          onChange={onSelectionChange}
        />
      </div>

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

      {editorOpen ? (
        <section className="chat-editor" aria-label="Edit proposed configuration">
          <div className="chat-editor__bar">
            <button
              type="button"
              className="chat-thread__back"
              onClick={onCloseEditor}
            >
              <span aria-hidden="true">←</span> Back to conversation
            </button>
            <p className="chat-editor__hint">
              Edit the proposed configuration below. Running it works exactly like
              the Configure tab — the result opens on the Results page and is saved
              to Run History.
            </p>
          </div>
          {/*
            The same editor the Configure tab uses, embedded here so a proposal
            is reviewed and edited in place rather than by leaving for that tab.
            Seeded and mirrored through the shell (`editorSnapshot` /
            `onEditorStateChange`) — its OWN snapshot, kept separate from the
            Configure tab's — so an edit survives leaving this page and coming
            back. The proposal's provenance and proposed-field list travel inside
            that snapshot, so a run stays marked model-authored after an edit.
          */}
          <RunConfiguration
            onRunComplete={onRunComplete}
            restoredState={editorSnapshot}
            onStateChange={onEditorStateChange}
          />
        </section>
      ) : view === "list" ? (
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
              streamed={streaming.text}
              onRunDraft={runDraft}
              onEditDraft={editDraft}
              draftError={draftError}
            />
          )}

          {/*
            The in-flight run started from a proposal card. On completion the
            shell moves to the Results page (and saves the run to history), so
            this only ever paints the spinner before that hand-off.
          */}
          <ChatRunPanel runState={runState} onDismiss={clearRun} />

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
            <div className="chat-composer__box">
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

              <div className="chat-composer__bar">
                <span className="chat-composer__hint">
                  Enter to send · Shift+Enter for a new line
                </span>
                <div className="chat-composer__buttons">
                  {sending ? (
                    <button
                      type="button"
                      className="agent-secondary"
                      onClick={() => void service.cancelReply()}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="run-button agent-primary"
                    // The send is NOT gated on a configured provider: the analyst
                    // can point the picker at a provider they have not set up, and
                    // the clearer feedback is to let them send and surface the
                    // typed NOT_CONFIGURED failure than to leave a dead button
                    // with no explanation of what pressing it would do.
                    disabled={composer.trim().length === 0 || sending}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>

            {/*
              One block, two readings of the same problem: this provider has no
              key, or nothing does. Both end at Settings, so both carry the way
              there rather than naming a control that is no longer on this page.
            */}
            {!selectedIsConfigured ? (
              <div className="chat-needs-key">
                {status.available ? (
                  <p className="agent-note">
                    No key is configured for {selected?.displayName ?? provider}, so a
                    send will fail until you add one in Settings, or switch to a
                    provider that has one.
                  </p>
                ) : (
                  <p className="agent-error">{status.message}</p>
                )}
                <button type="button" className="agent-secondary" onClick={onOpenSettings}>
                  Open Settings
                </button>
              </div>
            ) : null}

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
                    <CopyButton value={previewText} label="Copy request" className="chat-copy" />
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

      {exportTarget === null ? null : (
        <ConversationExportDialog
          conversation={exportTarget}
          onClose={() => setExportTarget(null)}
        />
      )}
    </div>
  );
}
