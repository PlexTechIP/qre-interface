// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { describeChatStoreContract } from "../shared/testing/chatStoreContract.js";
import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { SqliteChatStore } from "./sqliteChatStore.js";

const scratchDirs: string[] = [];

function scratchPath(name = "chat-history.sqlite"): string {
  const dir = mkdtempSync(join(tmpdir(), "qre-chat-store-"));
  scratchDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop() as string, { recursive: true, force: true });
  }
});

// The same suite `InMemoryChatStore` runs. A rule written once, checked twice.
describeChatStoreContract("SqliteChatStore", () => {
  const store = new SqliteChatStore(scratchPath());
  return { store, close: () => store.close() };
});

describe("SqliteChatStore persistence", () => {
  it("creates the database file and its parent directory", () => {
    const path = join(scratchPath(), "..", "nested", "chat-history.sqlite");
    const store = new SqliteChatStore(path);
    try {
      expect(existsSync(path)).toBe(true);
    } finally {
      store.close();
    }
  });

  it("reads a transcript back across a reopen, drafts intact", async () => {
    const path = scratchPath();
    const first = new SqliteChatStore(path);
    try {
      await first.create({ id: "c1", title: "Grover", createdAt: "2026-08-10T09:00:00.000Z" });
      await first.append("c1", {
        id: "m1",
        role: "user",
        text: "Estimate Grover search",
        draft: null,
        model: null,
        createdAt: "2026-08-10T09:01:00.000Z",
      });
      await first.append("c1", {
        id: "m2",
        role: "assistant",
        text: "Here is a starting point.",
        draft: FAKE_GENERATED_DRAFT,
        model: "Anthropic/claude-sonnet-5",
        createdAt: "2026-08-10T09:02:00.000Z",
      });
    } finally {
      first.close();
    }

    const second = new SqliteChatStore(path);
    try {
      const conversation = await second.get("c1");
      expect(conversation?.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(conversation?.messages[1]?.draft).toEqual(FAKE_GENERATED_DRAFT);
      expect(conversation?.messages[1]?.model).toBe("Anthropic/claude-sonnet-5");
      expect((await second.search("Grover")).map((row) => row.id)).toEqual(["c1"]);
    } finally {
      second.close();
    }
  });

  it("refuses a database written by a newer schema version", () => {
    const path = scratchPath();
    const raw = new DatabaseSync(path);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    expect(() => new SqliteChatStore(path)).toThrow(/newer than supported/);
  });

  it("leaves nothing behind in the search index after a delete", async () => {
    const path = scratchPath();
    const store = new SqliteChatStore(path);
    try {
      await store.create({ id: "c1", title: "Grover", createdAt: "2026-08-10T09:00:00.000Z" });
      await store.append("c1", {
        id: "m1",
        role: "user",
        text: "Estimate Grover search",
        draft: null,
        model: null,
        createdAt: "2026-08-10T09:01:00.000Z",
      });
      await store.delete("c1");
    } finally {
      store.close();
    }

    const raw = new DatabaseSync(path);
    try {
      const rows = raw.prepare("SELECT COUNT(*) AS count FROM chat_search").get();
      expect(Number(rows?.count)).toBe(0);
    } finally {
      raw.close();
    }
  });

  /**
   * The whole reason chat history is its own file: the run store's "no prompt
   * text on disk" property was checked by hand once, and this keeps it checked.
   */
  it("is a separate file from the run store", () => {
    const path = scratchPath();
    const store = new SqliteChatStore(path);
    try {
      const raw = new DatabaseSync(path);
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row["name"]));
      raw.close();
      expect(tables).toContain("conversations");
      expect(tables).not.toContain("run_records");
    } finally {
      store.close();
    }
  });

  it("rolls an append back whole when part of it fails", async () => {
    const path = scratchPath();
    const store = new SqliteChatStore(path);
    try {
      await store.create({ id: "c1", title: "Grover", createdAt: "2026-08-10T09:00:00.000Z" });
      const message = {
        id: "m1",
        role: "user" as const,
        text: "Estimate Grover search",
        draft: null,
        model: null,
        createdAt: "2026-08-10T09:01:00.000Z",
      };
      await store.append("c1", message);
      await expect(store.append("c1", { ...message, text: "different" })).rejects.toThrow();

      // The duplicate was refused after `updated_at` would have moved, so a
      // leaked partial write shows up as a bumped timestamp or a stray FTS row.
      expect(await store.list()).toEqual([
        expect.objectContaining({ updatedAt: "2026-08-10T09:01:00.000Z", messageCount: 1 }),
      ]);
      expect(await store.search("different")).toEqual([]);
    } finally {
      store.close();
    }
  });
});
