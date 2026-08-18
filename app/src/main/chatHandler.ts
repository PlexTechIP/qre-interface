import type { IpcMain } from "electron";

import type { GeneratedRunDraft } from "../shared/agentTypes.js";
import type {
  ChatMessage,
  ChatStore,
  Conversation,
  ConversationSummary,
  NewConversation,
} from "../shared/chatTypes.js";
import { validateGeneratedDraft } from "./draftValidation.js";
import {
  CHAT_APPEND_CHANNEL,
  CHAT_CLEAR_CHANNEL,
  CHAT_CREATE_CHANNEL,
  CHAT_DELETE_CHANNEL,
  CHAT_GET_CHANNEL,
  CHAT_LIST_CHANNEL,
  CHAT_RENAME_CHANNEL,
  CHAT_SEARCH_CHANNEL,
} from "./ipcChannels.js";

/**
 * Wire the ChatStore behind IPC, mirroring `registerStoreHandlers`: one
 * `ipcMain.handle` per operation, each forwarding to the injected store.
 *
 * Same error model as the run store, and for the same reason. The store's
 * refusals — a duplicate id, an unknown conversation — are contractual, and
 * every id on this surface is minted with `crypto.randomUUID()` immediately
 * before use, so hitting one means the renderer is confused about its own
 * state. Those propagate as rejections. Nothing here is a provider failure, so
 * nothing here has the estimator's resolve-as-data convention to follow.
 *
 * Payloads are narrowed before they reach the store, for the reason
 * `agentHandler.readChatRequest` states: `ipcMain.handle` checks nothing, and a
 * typed listener signature is a claim, not a guard. `SqliteRunStore.save` runs
 * `validateRunRecord` before its INSERT; without an equivalent here, a renderer
 * bug writes a malformed transcript to disk where it is durable, reloaded on
 * every launch, and only surfaces later as a conversation that cannot be
 * continued.
 *
 * Note what is NOT on this surface: the transcript never travels to a provider
 * from here. `window.chats` persists; `window.agent` sends. Keeping them apart
 * is what lets the analyst read their own history with the network off.
 */
export function registerChatHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  store: ChatStore,
): void {
  ipcMain.handle(CHAT_LIST_CHANNEL, (): Promise<ConversationSummary[]> => store.list());
  ipcMain.handle(
    CHAT_GET_CHANNEL,
    (_event, id: unknown): Promise<Conversation | null> =>
      store.get(readId(CHAT_GET_CHANNEL, id)),
  );
  ipcMain.handle(
    CHAT_CREATE_CHANNEL,
    (_event, conversation: unknown): Promise<void> =>
      store.create(readNewConversation(CHAT_CREATE_CHANNEL, conversation)),
  );
  ipcMain.handle(
    CHAT_APPEND_CHANNEL,
    (_event, conversationId: unknown, message: unknown): Promise<void> =>
      store.append(
        readId(CHAT_APPEND_CHANNEL, conversationId),
        readChatMessage(CHAT_APPEND_CHANNEL, message),
      ),
  );
  ipcMain.handle(
    CHAT_RENAME_CHANNEL,
    (_event, id: unknown, title: unknown): Promise<void> =>
      store.rename(
        readId(CHAT_RENAME_CHANNEL, id),
        readNonEmpty(CHAT_RENAME_CHANNEL, "title", title),
      ),
  );
  ipcMain.handle(
    CHAT_DELETE_CHANNEL,
    (_event, id: unknown): Promise<void> => store.delete(readId(CHAT_DELETE_CHANNEL, id)),
  );
  ipcMain.handle(CHAT_CLEAR_CHANNEL, (): Promise<void> => store.clear());
  ipcMain.handle(
    CHAT_SEARCH_CHANNEL,
    (_event, query: unknown): Promise<ConversationSummary[]> => {
      // The one lenient field: search is read-only and a non-string query is
      // the same nothing an empty box is.
      return store.search(typeof query === "string" ? query : "");
    },
  );
}

function readNonEmpty(channel: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${channel} requires a non-empty string ${field}.`);
  }
  return value;
}

const readId = (channel: string, value: unknown): string =>
  readNonEmpty(channel, "id", value);

/**
 * Timestamps are compared lexicographically to order the rail and to sequence a
 * transcript, so a value that is merely string-shaped is not enough — one that
 * is not ISO-8601 sorts a conversation into the wrong place in history and
 * there is no later point at which that becomes detectable. Everything this app
 * writes comes from `new Date().toISOString()`, so round-tripping is exactly
 * the right bar.
 */
function readTimestamp(channel: string, value: unknown): string {
  const text = readNonEmpty(channel, "createdAt", value);
  if (new Date(text).toISOString() !== text) {
    throw new Error(`${channel} requires createdAt to be an ISO-8601 timestamp.`);
  }
  return text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNewConversation(channel: string, value: unknown): NewConversation {
  const record = asRecord(value);
  if (record === null) throw new Error(`${channel} requires a conversation object.`);
  return {
    id: readId(channel, record["id"]),
    title: readNonEmpty(channel, "title", record["title"]),
    createdAt: readTimestamp(channel, record["createdAt"]),
  };
}

/**
 * Rebuilt field by field rather than passed through, so a renderer that sent a
 * wider object cannot smuggle extra columns' worth of data onto disk.
 *
 * The draft is checked against the generation contract, not merely for being an
 * object. It arrives having already passed `validateGeneratedDraft` on the way out
 * of the provider, so this only ever rejects a renderer that has lost track of
 * its own state — but it is what makes "every draft in the store is
 * contract-valid" true rather than merely likely, which is what
 * `draftToFormState` is entitled to assume when it reads one back months later.
 */
function readChatMessage(channel: string, value: unknown): ChatMessage {
  const record = asRecord(value);
  if (record === null) throw new Error(`${channel} requires a message object.`);

  const role = record["role"];
  if (role !== "user" && role !== "assistant") {
    throw new Error(`${channel} requires role "user" or "assistant".`);
  }
  if (typeof record["text"] !== "string") {
    throw new Error(`${channel} requires string message text.`);
  }
  const model = record["model"];
  if (model !== null && typeof model !== "string") {
    throw new Error(`${channel} requires model to be a string or null.`);
  }

  let draft: GeneratedRunDraft | null = null;
  if (record["draft"] !== null && record["draft"] !== undefined) {
    const validated = validateGeneratedDraft(record["draft"]);
    if (!validated.ok) {
      throw new Error(
        `${channel} requires draft to match the generation contract (${validated.reason}).`,
      );
    }
    draft = validated.draft;
  }

  return {
    id: readId(channel, record["id"]),
    role,
    text: record["text"],
    draft,
    model,
    createdAt: readTimestamp(channel, record["createdAt"]),
  };
}
