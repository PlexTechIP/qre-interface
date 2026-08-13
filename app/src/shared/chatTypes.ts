/**
 * The conversation model behind "Describe a Run", and the store that keeps it.
 *
 * Two shapes that look similar are deliberately not the same type. `ChatTurn`
 * (agentTypes.ts) is what goes *out* to a provider — role and content. This
 * file's `ChatMessage` is what is kept *here*: it also carries an id, a
 * timestamp, which model produced it, and the parsed draft, none of which the
 * provider needs and none of which it should be told. `toChatTurns` is the one
 * place the second becomes the first.
 *
 * A note on what this puts on disk. Until now the analyst's prose was session
 * state only — held by the shell so it survived navigation, deliberately not in
 * localStorage, "text the analyst composed to send to a third party" that never
 * landed on disk. Persisting transcripts reverses that, knowingly: a
 * conversation the analyst cannot come back to is not a conversation, it is a
 * long prompt. What follows from that reversal is `ChatStore.clear` and a
 * separate database file — see `main/sqliteChatStore.ts`.
 */

import type { ChatRole, ChatTurn, GeneratedRunDraft } from "./agentTypes";

/** Re-exported so a consumer of the conversation model imports one module. */
export type { ChatRole };

/** One stored turn of a conversation. */
export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  /**
   * Prose, and only prose. For an assistant turn this is the model's `reply`
   * field — never the JSON envelope that carried it, which is a wire detail the
   * transcript has no reason to show.
   */
  readonly text: string;
  /** Assistant turns may carry a proposal. User turns never do. */
  readonly draft: GeneratedRunDraft | null;
  /** `"Anthropic/claude-sonnet-5"` on an assistant turn; null on a user turn. */
  readonly model: string | null;
  readonly createdAt: string;
}

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  /** Bumped by `append` to the new message's timestamp. Orders the rail. */
  readonly updatedAt: string;
  /** Oldest first — the order a transcript is read and replayed in. */
  readonly messages: readonly ChatMessage[];
}

/**
 * One row of the conversation list.
 *
 * No `messages`: the list renders every conversation, and loading every
 * transcript to draw a table of titles is how a history view becomes the
 * slowest thing in an app. What it does carry is the handful of derived values
 * the list shows instead — cheap to compute in SQL, and the reason the table
 * earns the room a sidebar of bare titles did not.
 *
 * Every field here has a column. `lastMessage` and `snippet` used to live here
 * too, feeding a Last message column that has since been removed — and once
 * nothing rendered them they were a per-row correlated subquery and an FTS5
 * `snippet()` call computed on every list and search, serialised across IPC,
 * and dropped on the floor.
 */
export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
  /** How many assistant turns carried a configuration. */
  readonly proposalCount: number;
}

/** The fields a conversation is born with. `updatedAt` starts at `createdAt`. */
export interface NewConversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

/**
 * Persistence for conversations, mirroring `RunStore`: one narrow async
 * interface, a SQLite implementation in main, an in-memory twin kept
 * behaviourally aligned so the UI can be tested without a database.
 *
 * Messages are append-only. A transcript is a log of what was actually said,
 * and an editable one would let the analyst rewrite a question after seeing the
 * answer — which is exactly the record this exists to keep. The single mutable
 * field on a conversation is its title.
 */
export interface ChatStore {
  /** Most recently updated first. */
  list(): Promise<ConversationSummary[]>;
  get(id: string): Promise<Conversation | null>;
  /** Rejects if `id` is already taken. */
  create(conversation: NewConversation): Promise<void>;
  /** Rejects on an unknown conversation or a duplicate message id. */
  append(conversationId: string, message: ChatMessage): Promise<void>;
  /**
   * Rejects on an unknown conversation. Deliberately does NOT bump `updatedAt`:
   * the rail is ordered by conversation activity, and renaming an old thread
   * should not reorder the list under the cursor of the person renaming it.
   */
  rename(id: string, title: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Empty the store. The exit from having put prose on disk at all. */
  clear(): Promise<void>;
  /**
   * Conversations whose title or any message matches every term in `query`, in
   * the same order `list` returns. A blank query returns everything, so a
   * search box that is being cleared never blinks empty.
   */
  search(query: string): Promise<ConversationSummary[]>;
}

/**
 * Split a search box's contents into terms.
 *
 * Shared by both stores, which is the point: FTS5 has a query *language*, so an
 * analyst typing `AND`, a stray quote, or `*` would otherwise either change the
 * meaning of their own search or crash it with a syntax error. Runs of letters,
 * digits and underscores are terms; everything else separates them, so nothing
 * the analyst types can reach the parser as syntax.
 *
 * Lower-cased here rather than at each call site so the in-memory twin and
 * FTS5's `unicode61` tokenizer agree on case without either one saying so.
 */
export function parseSearchTerms(query: string): string[] {
  return fold(query).match(/[\p{L}\p{N}_]+/gu) ?? [];
}

/**
 * Case- and diacritic-fold, to agree with how SQLite has already indexed the
 * text.
 *
 * `SqliteChatStore` tokenizes with FTS5's `unicode61`, which strips diacritics:
 * it indexes "naïve" as "naive", so searching "naive" finds it. Lower-casing
 * alone left the in-memory twin unable to, and the two stores quietly disagreed
 * on every accented word — invisible to the contract suite, whose fixtures were
 * all ASCII until one wasn't.
 *
 * NFD splits a letter from its combining marks and `\p{M}` drops them, which
 * covers the Latin range this app's prose actually uses. It is an approximation
 * of unicode61 rather than a port of it, which is exactly why the equivalence
 * is asserted against a real database in `chatStoreContract` instead of being
 * argued for here.
 */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/**
 * Whether `text` matches every term, each as a token PREFIX.
 *
 * Prefix rather than substring, and stated once here, because FTS5 can only
 * cheaply do prefixes — `"grov"*` matches "grover", nothing matches "rover"
 * mid-word. Defining the semantics in shared code and implementing SQLite to
 * it (rather than describing whatever SQLite happened to do) is what lets one
 * test suite run against both stores.
 *
 * Each term is folded here rather than assumed to arrive folded. It previously
 * was not, so `matchesSearchTerms("Grover search", ["Grover"])` returned FALSE
 * — a predicate that silently disagrees with the obvious call is worse than one
 * that documents a precondition, and folding costs nothing.
 */
export function matchesSearchTerms(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const words = parseSearchTerms(text);
  return terms.every((term) => {
    const folded = fold(term);
    return words.some((word) => word.startsWith(folded));
  });
}

/**
 * The transcript, lowered to what actually goes over the wire.
 *
 * An assistant turn replays as the JSON envelope the model emitted rather than
 * as its prose. Sending back only the prose would drop the draft, and a model
 * asked to "make the gate time 80" while shown a transcript with no
 * configuration in it re-derives one from scratch — silently changing fields
 * the analyst had already settled. Replaying the envelope makes the previous
 * proposal part of the context, which is the whole mechanism by which
 * refinement works.
 */
export function toChatTurns(messages: readonly ChatMessage[]): ChatTurn[] {
  return messages.map((message) =>
    message.role === "user"
      ? { role: "user" as const, content: message.text }
      : {
          role: "assistant" as const,
          content: JSON.stringify({ reply: message.text, draft: message.draft }),
        },
  );
}

/**
 * A conversation title, derived from the analyst's opening message.
 *
 * Auto-titling rather than prompting for one: nobody names a conversation
 * before having it. The rename control exists for the ones worth keeping.
 */
export const UNTITLED_CONVERSATION = "New conversation";

export function titleFromFirstMessage(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return UNTITLED_CONVERSATION;

  /**
   * Measured and cut by CODE POINT, not by `String.length`.
   *
   * `slice(0, 60)` counts UTF-16 code units, so a cut landing between the two
   * halves of a surrogate pair — an emoji, anything outside the BMP — leaves a
   * lone surrogate that renders as U+FFFD and is stored that way in SQLite and
   * in the FTS index. It reaches the raw cut whenever there is no space after
   * position 40, which is the ordinary case for CJK text.
   *
   * Code points, not grapheme clusters: a ZWJ sequence can still be split. That
   * degrades to two valid emoji rather than to a replacement character, which
   * is the difference worth the `Intl.Segmenter` this does not use.
   */
  const points = [...collapsed];
  if (points.length <= 60) return collapsed;

  // Cut on a word boundary where there is one nearby, so the rail does not show
  // a title ending mid-word for the sake of four characters.
  const cut = points.slice(0, 60).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
