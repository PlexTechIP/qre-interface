/**
 * InMemoryChatStore — the reference `ChatStore` behind the persistence boundary.
 *
 * The same arrangement `InMemoryRunStore` has with `SqliteRunStore`: this is the
 * canonical behaviour, `main/sqliteChatStore.ts` must reproduce it exactly, and
 * one test suite (`chatStoreContract.ts`) runs against both. Renderer tests get
 * a real store on `window.chats` without a database, which matters more here
 * than it did for runs — `node:sqlite` needs Node 24 and the renderer project
 * runs under jsdom.
 *
 *   - APPEND-ONLY messages; `append` rejects a duplicate message id.
 *   - `create` rejects a duplicate conversation id.
 *   - `append`/`rename` reject an unknown conversation.
 *   - `list`/`search` return summaries, most recently updated first.
 *   - `get` hands back deep copies, so a caller mutating a returned transcript
 *     cannot corrupt stored state.
 */

import {
  matchesSearchTerms,
  parseSearchTerms,
  type ChatMessage,
  type ChatStore,
  type Conversation,
  type ConversationSummary,
  type NewConversation,
} from "./chatTypes";

/** A conversation was expected to exist and did not. */
export class ConversationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No conversation with id ${id}.`);
    this.name = "ConversationNotFoundError";
  }
}

/**
 * A create or append would have overwritten an existing record.
 *
 * A programmer error, not a recoverable state: every id on this surface is
 * minted fresh with `crypto.randomUUID()`, so a collision means the caller
 * reused one. Mirrors `RunRecordExistsError`.
 */
export class ChatRecordExistsError extends Error {
  constructor(public readonly id: string) {
    super(
      `A chat record with id ${id} already exists; conversations are created once ` +
        `and messages are append-only.`,
    );
    this.name = "ChatRecordExistsError";
  }
}

/** Newest-updated first, with deterministic tie-breaks so paging is stable. */
export function sortConversationsNewestFirst<
  T extends { updatedAt: string; createdAt: string; id: string },
>(conversations: readonly T[]): T[] {
  return [...conversations].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
}

export class InMemoryChatStore implements ChatStore {
  private readonly conversations = new Map<string, Conversation>();

  /** Optionally seed with existing conversations. Cloned on the way in. */
  constructor(seed: readonly Conversation[] = []) {
    for (const conversation of seed) {
      if (this.conversations.has(conversation.id)) {
        throw new ChatRecordExistsError(conversation.id);
      }
      this.conversations.set(conversation.id, structuredClone(conversation));
    }
  }

  async list(): Promise<ConversationSummary[]> {
    return sortConversationsNewestFirst([...this.conversations.values()]).map(summarize);
  }

  async get(id: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(id);
    return conversation ? structuredClone(conversation) : null;
  }

  async create(conversation: NewConversation): Promise<void> {
    if (this.conversations.has(conversation.id)) {
      throw new ChatRecordExistsError(conversation.id);
    }
    this.conversations.set(conversation.id, {
      ...conversation,
      updatedAt: conversation.createdAt,
      messages: [],
    });
  }

  async append(conversationId: string, message: ChatMessage): Promise<void> {
    const conversation = this.require(conversationId);
    if (conversation.messages.some((existing) => existing.id === message.id)) {
      throw new ChatRecordExistsError(message.id);
    }
    this.conversations.set(conversationId, {
      ...conversation,
      // The message's own timestamp, not a clock read here: the store stays
      // free of time the same way run records do, and a replayed transcript
      // orders identically wherever it is loaded.
      updatedAt: message.createdAt,
      messages: [...conversation.messages, structuredClone(message)],
    });
  }

  async rename(id: string, title: string): Promise<void> {
    const conversation = this.require(id);
    this.conversations.set(id, { ...conversation, title });
  }

  async delete(id: string): Promise<void> {
    this.conversations.delete(id);
  }

  async clear(): Promise<void> {
    this.conversations.clear();
  }

  async search(query: string): Promise<ConversationSummary[]> {
    const terms = parseSearchTerms(query);
    if (terms.length === 0) return this.list();
    return sortConversationsNewestFirst(
      [...this.conversations.values()].filter((conversation) =>
        searchableText(conversation).some((text) => matchesSearchTerms(text, terms)),
      ),
    ).map((conversation) => ({
      ...summarize(conversation),
      snippet: snippetFor(conversation, terms),
    }));
  }

  private require(id: string): Conversation {
    const conversation = this.conversations.get(id);
    if (conversation === undefined) throw new ConversationNotFoundError(id);
    return conversation;
  }
}

function summarize(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    lastMessage: conversation.messages.at(-1)?.text ?? null,
    proposalCount: conversation.messages.filter((message) => message.draft !== null).length,
  };
}

/**
 * Every string a search may hit. The title is included because it is the one
 * field the analyst can edit — a conversation renamed "Shor 2048" has to be
 * findable by the name its owner gave it, not only by what was said inside it.
 */
function searchableText(conversation: Conversation): string[] {
  return [conversation.title, ...conversation.messages.map((message) => message.text)];
}

/** The first matching text, which is what the rail shows under the title. */
function snippetFor(conversation: Conversation, terms: readonly string[]): string {
  return (
    conversation.messages.find((message) => matchesSearchTerms(message.text, terms))?.text ??
    conversation.title
  );
}
