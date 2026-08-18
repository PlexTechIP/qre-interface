import { DatabaseSync } from "node:sqlite";

import type { GeneratedRunDraft } from "../shared/agentTypes.js";
import {
  ChatRecordExistsError,
  ConversationNotFoundError,
} from "../shared/chatStore.js";
import {
  parseSearchTerms,
  type ChatMessage,
  type ChatRole,
  type ChatStore,
  type Conversation,
  type ConversationSummary,
  type NewConversation,
} from "../shared/chatTypes.js";
import { prepareDatabasePath } from "./databaseFile.js";

const DATABASE_SCHEMA_VERSION = 1;

/**
 * Main-process SQLite implementation of the `ChatStore` boundary.
 *
 * **Its own database file, not a table in `run-history.sqlite`.** Two reasons,
 * and the second is the one that decided it. Runs and conversations have no
 * join between them and no shared lifetime — a run record is immutable
 * forever, a transcript is something the analyst is entitled to delete.
 * Rather more to the point: the week-6 walkthrough verified, by grepping the
 * shipped store, that no prompt text ever reaches `run-history.sqlite`.
 * Chat history is prompt text by definition. Putting it in that file would
 * make a check someone deliberately performed permanently false, and would
 * mean "delete all my chat history" had to reach into the file that holds
 * immutable run records. Two files keep both claims literally true.
 *
 * Search is FTS5 over a plain (non-external-content) table. External content
 * would avoid storing the text twice, at the cost of triggers that have to stay
 * in step with every write path; the duplicated text is a few kilobytes and the
 * delete path becomes one DELETE.
 */
const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    draft_json TEXT,
    model TEXT,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
    ON chat_messages(conversation_id, seq);
  CREATE INDEX IF NOT EXISTS conversations_newest_first_idx
    ON conversations(updated_at DESC, created_at DESC, id DESC);

  CREATE VIRTUAL TABLE IF NOT EXISTS chat_search USING fts5(
    conversation_id UNINDEXED,
    message_id UNINDEXED,
    body,
    tokenize = 'unicode61'
  );
`;

/**
 * The `message_id` of the row that indexes a conversation's TITLE.
 *
 * Titles share the search table with messages rather than getting a LIKE query
 * of their own, so "find every conversation matching these terms" is one
 * MATCH with one set of tokenizing rules. A title is the one field the analyst
 * can edit, so it is also the one that has to be findable by the words they
 * chose rather than the words the model used.
 */
const TITLE_ROW_ID = "";

/**
 * The derived columns every list row shows, as correlated subqueries against
 * `chat_messages`.
 *
 * Written once and interpolated into both `list` and `search`, because the two
 * differ only in their WHERE clause and a summary that meant something
 * different depending on how you got to it would be its own bug. All three read
 * the `(conversation_id, seq)` index, so the cost is a seek per row rather than
 * a scan.
 */
const SUMMARY_COLUMNS = `
  (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id)
    AS message_count,
  (SELECT COUNT(*) FROM chat_messages m
     WHERE m.conversation_id = c.id AND m.draft_json IS NOT NULL)
    AS proposal_count
`;

export class SqliteChatStore implements ChatStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    prepareDatabasePath(databasePath);
    this.database = new DatabaseSync(databasePath, { timeout: 5_000 });
    try {
      this.migrate();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  async list(): Promise<ConversationSummary[]> {
    return this.database
      .prepare(
        `
        SELECT c.id, c.title, c.created_at, c.updated_at,
               ${SUMMARY_COLUMNS}
        FROM conversations c
        ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
      `,
      )
      .all()
      .map(readSummary);
  }

  async get(id: string): Promise<Conversation | null> {
    const row = this.database
      .prepare(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
      )
      .get(id);
    if (row === undefined) return null;

    const messages = this.database
      .prepare(
        `
        SELECT id, role, text, draft_json, model, created_at
        FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY seq ASC
      `,
      )
      .all(id)
      .map(readMessage);

    return {
      id: readText(row, "id"),
      title: readText(row, "title"),
      createdAt: readText(row, "created_at"),
      updatedAt: readText(row, "updated_at"),
      messages,
    };
  }

  async create(conversation: NewConversation): Promise<void> {
    this.transact(() => {
      if (this.exists(conversation.id)) {
        throw new ChatRecordExistsError(conversation.id);
      }
      this.database
        .prepare(
          "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run(
          conversation.id,
          conversation.title,
          conversation.createdAt,
          // A conversation with no messages was last touched when it was made.
          conversation.createdAt,
        );
      this.indexTitle(conversation.id, conversation.title);
    });
  }

  async append(conversationId: string, message: ChatMessage): Promise<void> {
    this.transact(() => {
      if (!this.exists(conversationId)) {
        throw new ConversationNotFoundError(conversationId);
      }
      const clash = this.database
        .prepare("SELECT 1 FROM chat_messages WHERE id = ?")
        .get(message.id);
      if (clash !== undefined) throw new ChatRecordExistsError(message.id);

      const next = this.database
        .prepare(
          "SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM chat_messages WHERE conversation_id = ?",
        )
        .get(conversationId);

      this.database
        .prepare(
          `
          INSERT INTO chat_messages
            (id, conversation_id, seq, role, text, draft_json, model, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          message.id,
          conversationId,
          Number(next?.seq ?? 1),
          message.role,
          message.text,
          message.draft === null ? null : JSON.stringify(message.draft),
          message.model,
          message.createdAt,
        );

      this.database
        .prepare(
          "INSERT INTO chat_search (conversation_id, message_id, body) VALUES (?, ?, ?)",
        )
        .run(conversationId, message.id, message.text);

      // The message's own timestamp, never a clock read here — the store stays
      // free of time exactly as the run store is.
      this.database
        .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
        .run(message.createdAt, conversationId);
    });
  }

  async rename(id: string, title: string): Promise<void> {
    this.transact(() => {
      if (!this.exists(id)) throw new ConversationNotFoundError(id);
      // `updated_at` is deliberately untouched: see the ChatStore contract.
      this.database.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, id);
      this.database
        .prepare("DELETE FROM chat_search WHERE conversation_id = ? AND message_id = ?")
        .run(id, TITLE_ROW_ID);
      this.indexTitle(id, title);
    });
  }

  async delete(id: string): Promise<void> {
    this.transact(() => {
      this.database.prepare("DELETE FROM chat_search WHERE conversation_id = ?").run(id);
      this.database.prepare("DELETE FROM chat_messages WHERE conversation_id = ?").run(id);
      this.database.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    });
  }

  async clear(): Promise<void> {
    this.transact(() => {
      this.database.exec("DELETE FROM chat_search");
      this.database.exec("DELETE FROM chat_messages");
      this.database.exec("DELETE FROM conversations");
    });
  }

  async search(query: string): Promise<ConversationSummary[]> {
    const terms = parseSearchTerms(query);
    // A search box being cleared should show the full list, not blink empty —
    // and a query of nothing but punctuation is a query of nothing.
    if (terms.length === 0) return this.list();

    /**
     * Every term quoted as a phrase and prefix-matched. The quoting is what
     * stops `AND`, `NOT`, `*` or a stray `"` typed into the search box from
     * being read as FTS5 operators; `parseSearchTerms` has already removed the
     * characters that could escape the quotes.
     */
    const match = terms.map((term) => `"${term}"*`).join(" AND ");
    /*
     * Which conversations matched, and nothing else. This used to select a
     * `snippet()` per hit and rank the results to pick the best one per
     * conversation — both only ever fed a Last message column that no longer
     * exists. `DISTINCT` does the de-duplication FTS5 was being ranked for, and
     * dropping `ORDER BY rank` means bm25 is not computed for a set that gets
     * re-sorted by `updated_at` two statements later anyway.
     */
    const ids = this.database
      .prepare(`SELECT DISTINCT conversation_id FROM chat_search WHERE chat_search MATCH ?`)
      .all(match)
      .map((row) => readText(row, "conversation_id"));
    if (ids.length === 0) return [];

    // Ordered by the same clause `list` uses, so search reads as a filter over
    // the rail rather than as a differently-sorted second list.
    const placeholders = ids.map(() => "?").join(", ");
    return this.database
      .prepare(
        `
        SELECT c.id, c.title, c.created_at, c.updated_at,
               ${SUMMARY_COLUMNS}
        FROM conversations c
        WHERE c.id IN (${placeholders})
        ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
      `,
      )
      .all(...ids)
      .map(readSummary);
  }

  /** Close the underlying connection during application shutdown or test cleanup. */
  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private exists(id: string): boolean {
    return (
      this.database.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id) !== undefined
    );
  }

  private indexTitle(id: string, title: string): void {
    this.database
      .prepare("INSERT INTO chat_search (conversation_id, message_id, body) VALUES (?, ?, ?)")
      .run(id, TITLE_ROW_ID, title);
  }

  /**
   * Every write here touches two or three tables — a message row, its search
   * row, and the conversation's `updated_at`. A half-applied append would leave
   * a transcript that cannot be searched or a rail ordered by an event that did
   * not happen, so they go in or none of them does.
   */
  private transact(work: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    const versionRow = this.database.prepare("PRAGMA user_version").get();
    const currentVersion = versionRow?.user_version;
    if (typeof currentVersion !== "number") {
      throw new Error("Could not read the SQLite chat-store schema version.");
    }
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `Chat-store schema version ${currentVersion} is newer than supported version ${DATABASE_SCHEMA_VERSION}.`,
      );
    }
    if (currentVersion === DATABASE_SCHEMA_VERSION) return;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(INITIAL_SCHEMA);
      this.database.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function readText(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`SQLite chat row is missing its ${column} column.`);
  }
  return value;
}

function readSummary(row: Record<string, unknown>): ConversationSummary {
  return {
    id: readText(row, "id"),
    title: readText(row, "title"),
    createdAt: readText(row, "created_at"),
    updatedAt: readText(row, "updated_at"),
    messageCount: Number(row["message_count"] ?? 0),
    proposalCount: Number(row["proposal_count"] ?? 0),
  };
}

function readMessage(row: Record<string, unknown>): ChatMessage {
  const draftJson = row["draft_json"];
  const model = row["model"];
  return {
    id: readText(row, "id"),
    role: readText(row, "role") as ChatRole,
    text: readText(row, "text"),
    draft: typeof draftJson === "string" ? (JSON.parse(draftJson) as GeneratedRunDraft) : null,
    model: typeof model === "string" ? model : null,
    createdAt: readText(row, "created_at"),
  };
}
