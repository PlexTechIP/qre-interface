// @vitest-environment node
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";

import { InMemoryChatStore } from "../shared/chatStore.js";
import type { ChatMessage, Conversation, ConversationSummary } from "../shared/chatTypes.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { registerChatHandlers } from "./chatHandler.js";
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

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const event = {} as IpcMainInvokeEvent;

const message: ChatMessage = {
  id: "m1",
  role: "user",
  text: "Estimate Grover search",
  draft: null,
  model: null,
  createdAt: "2026-08-10T09:01:00.000Z",
};

function setup() {
  const handlers = new Map<string, Listener>();
  const ipcMain: Pick<IpcMain, "handle"> = {
    handle(channel, listener) {
      handlers.set(channel, listener as Listener);
    },
  };
  const store = new InMemoryChatStore();
  registerChatHandlers(ipcMain, store);
  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler registered for ${channel}`);
    return (await handler(event, ...args)) as T;
  };
  return { invoke, store, handlers };
}

describe("registerChatHandlers", () => {
  it("registers exactly the chat channels", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(
      [
        CHAT_APPEND_CHANNEL,
        CHAT_CLEAR_CHANNEL,
        CHAT_CREATE_CHANNEL,
        CHAT_DELETE_CHANNEL,
        CHAT_GET_CHANNEL,
        CHAT_LIST_CHANNEL,
        CHAT_RENAME_CHANNEL,
        CHAT_SEARCH_CHANNEL,
      ].sort(),
    );
  });

  it("round-trips a conversation across the bridge", async () => {
    const { invoke } = setup();
    await invoke(CHAT_CREATE_CHANNEL, {
      id: "c1",
      title: "Grover",
      createdAt: "2026-08-10T09:00:00.000Z",
    });
    await invoke(CHAT_APPEND_CHANNEL, "c1", message);

    expect(await invoke<ConversationSummary[]>(CHAT_LIST_CHANNEL)).toEqual([
      expect.objectContaining({ id: "c1", messageCount: 1 }),
    ]);
    expect((await invoke<Conversation | null>(CHAT_GET_CHANNEL, "c1"))?.messages).toEqual([
      message,
    ]);
  });

  it("renames, searches, deletes and clears", async () => {
    const { invoke } = setup();
    await invoke(CHAT_CREATE_CHANNEL, {
      id: "c1",
      title: "Untitled",
      createdAt: "2026-08-10T09:00:00.000Z",
    });
    await invoke(CHAT_APPEND_CHANNEL, "c1", message);

    await invoke(CHAT_RENAME_CHANNEL, "c1", "Weekly baseline");
    expect(await invoke<ConversationSummary[]>(CHAT_SEARCH_CHANNEL, "baseline")).toEqual([
      expect.objectContaining({ title: "Weekly baseline" }),
    ]);

    await invoke(CHAT_DELETE_CHANNEL, "c1");
    expect(await invoke<ConversationSummary[]>(CHAT_LIST_CHANNEL)).toEqual([]);

    await invoke(CHAT_CREATE_CHANNEL, {
      id: "c2",
      title: "Another",
      createdAt: "2026-08-10T09:10:00.000Z",
    });
    await invoke(CHAT_CLEAR_CHANNEL);
    expect(await invoke<ConversationSummary[]>(CHAT_LIST_CHANNEL)).toEqual([]);
  });

  /**
   * `ipcMain.handle` checks nothing, so the store would otherwise write
   * whatever the renderer sent — durably, and reloaded on every launch.
   * `SqliteRunStore.save` has `validateRunRecord` in front of its INSERT for
   * exactly this reason; these are the equivalent.
   */
  describe("what it refuses to write", () => {
    const create = { id: "c1", title: "Grover", createdAt: "2026-08-10T09:00:00.000Z" };

    it.each([
      ["a message that is not an object", "nope"],
      ["a missing id", { ...message, id: undefined }],
      ["an empty id", { ...message, id: "" }],
      ["an unknown role", { ...message, role: "system" }],
      ["non-string text", { ...message, text: 42 }],
      ["a non-ISO timestamp", { ...message, createdAt: "yesterday" }],
      ["a numeric model", { ...message, model: 7 }],
      ["a draft that is not a configuration", { ...message, draft: { name: "partial" } }],
    ])("rejects %s", async (_label, payload) => {
      const { invoke } = setup();
      await invoke(CHAT_CREATE_CHANNEL, create);
      await expect(invoke(CHAT_APPEND_CHANNEL, "c1", payload)).rejects.toThrow();
    });

    it.each([
      ["a conversation that is not an object", 7],
      ["a blank title", { ...create, title: "" }],
      ["a non-ISO createdAt", { ...create, createdAt: "2026-08-10" }],
    ])("rejects creating with %s", async (_label, payload) => {
      const { invoke } = setup();
      await expect(invoke(CHAT_CREATE_CHANNEL, payload)).rejects.toThrow();
    });

    /** Rebuilt field by field, so extra keys cannot ride along onto disk. */
    it("stores only the fields a message is made of", async () => {
      const { invoke, store } = setup();
      await invoke(CHAT_CREATE_CHANNEL, create);
      await invoke(CHAT_APPEND_CHANNEL, "c1", { ...message, smuggled: "extra" });

      expect((await store.get("c1"))?.messages[0]).toEqual(message);
    });

    it("still accepts a message carrying a contract-valid draft", async () => {
      const { invoke, store } = setup();
      await invoke(CHAT_CREATE_CHANNEL, create);
      await invoke(CHAT_APPEND_CHANNEL, "c1", {
        ...message,
        id: "m2",
        role: "assistant",
        text: "Here it is.",
        draft: FAKE_GENERATED_DRAFT,
        model: "Anthropic/claude-sonnet-5",
      });

      expect((await store.get("c1"))?.messages[0]?.draft).toEqual(FAKE_GENERATED_DRAFT);
    });
  });

  /**
   * The run store's convention, kept: a contractual refusal is a programmer
   * error and crosses the bridge as a rejection, not as a resolved failure
   * object. Nothing on this surface is a provider outcome, so nothing here has
   * the estimator's resolve-as-data rule to follow.
   */
  it("propagates store refusals as rejections", async () => {
    const { invoke } = setup();
    await invoke(CHAT_CREATE_CHANNEL, {
      id: "c1",
      title: "Grover",
      createdAt: "2026-08-10T09:00:00.000Z",
    });
    await expect(
      invoke(CHAT_CREATE_CHANNEL, {
        id: "c1",
        title: "Again",
        createdAt: "2026-08-10T09:05:00.000Z",
      }),
    ).rejects.toThrow(/already exists/i);
    await expect(invoke(CHAT_APPEND_CHANNEL, "missing", message)).rejects.toThrow(/missing/);
  });
});
