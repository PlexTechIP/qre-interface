/**
 * The `ChatStore` contract, as one suite run against every implementation.
 *
 * `SqliteRunStore` and `InMemoryRunStore` are "kept behaviourally aligned" by
 * two separate test files that happen to assert similar things — which held
 * only for as long as someone remembered to edit both. The chat stores are held
 * to a single suite instead, so an implementation that drifts fails here rather
 * than in production, and a new rule is written once.
 *
 * Not exported from `testing/index.ts` on purpose: it imports vitest, and the
 * barrel is reachable from renderer code.
 */

import { afterEach, describe, expect, it } from "vitest";

import type { ChatStore, ChatMessage } from "../chatTypes";
import { FAKE_GENERATED_DRAFT } from "./fakeAgentService";

export interface ChatStoreHarness {
  store: ChatStore;
  /** Release a database handle / temp directory, if the implementation has one. */
  close?: () => void;
}

const at = (minute: number): string =>
  `2026-08-10T09:${String(minute).padStart(2, "0")}:00.000Z`;

function userMessage(id: string, text: string, createdAt: string): ChatMessage {
  return { id, role: "user", text, draft: null, model: null, createdAt };
}

function assistantMessage(
  id: string,
  text: string,
  createdAt: string,
  draft: ChatMessage["draft"] = null,
): ChatMessage {
  return { id, role: "assistant", text, draft, model: "Anthropic/claude-sonnet-5", createdAt };
}

export function describeChatStoreContract(
  label: string,
  createHarness: () => ChatStoreHarness | Promise<ChatStoreHarness>,
): void {
  describe(`${label} (ChatStore contract)`, () => {
    const open = new Set<ChatStoreHarness>();

    afterEach(() => {
      for (const harness of open) harness.close?.();
      open.clear();
    });

    const newStore = async (): Promise<ChatStore> => {
      const harness = await createHarness();
      open.add(harness);
      return harness.store;
    };

    /** One conversation, two turns, the assistant's carrying a draft. */
    const seeded = async (): Promise<ChatStore> => {
      const store = await newStore();
      await store.create({ id: "c1", title: "Grover on a gate-based QPU", createdAt: at(0) });
      await store.append("c1", userMessage("m1", "Estimate Grover search", at(1)));
      await store.append(
        "c1",
        assistantMessage("m2", "Here is a starting point.", at(2), FAKE_GENERATED_DRAFT),
      );
      return store;
    };

    it("lists a new conversation with no messages and updatedAt at creation", async () => {
      const store = await newStore();
      await store.create({ id: "c1", title: "Shor 2048", createdAt: at(0) });
      expect(await store.list()).toEqual([
        {
          id: "c1",
          title: "Shor 2048",
          createdAt: at(0),
          updatedAt: at(0),
          messageCount: 0,
          proposalCount: 0,
        },
      ]);
    });

    /**
     * The columns the list view shows instead of a bare title. Derived per row
     * rather than by loading transcripts, so they have to be right in both
     * implementations or the table quietly reports different numbers depending
     * on whether it is running against SQLite or the twin.
     */
    it("summarises how many turns there are and how many carried a proposal", async () => {
      const store = await seeded();
      await store.append(
        "c1",
        assistantMessage("m3", "And here is a tighter one.", at(3), FAKE_GENERATED_DRAFT),
      );
      await store.append("c1", userMessage("m4", "Thanks, that is what I needed", at(4)));

      expect(await store.list()).toEqual([
        expect.objectContaining({
          messageCount: 4,
          proposalCount: 2,
        }),
      ]);
    });

    it("carries the same summary through search as through list", async () => {
      const store = await seeded();
      const [listed] = await store.list();
      const [found] = await store.search("Grover");
      expect(found).toEqual(listed);
    });

    it("rejects a duplicate conversation id", async () => {
      const store = await newStore();
      await store.create({ id: "c1", title: "First", createdAt: at(0) });
      await expect(
        store.create({ id: "c1", title: "Second", createdAt: at(1) }),
      ).rejects.toThrow(/already exists/i);
    });

    it("rejects appending to an unknown conversation", async () => {
      const store = await newStore();
      await expect(
        store.append("missing", userMessage("m1", "hello", at(1))),
      ).rejects.toThrow(/missing/);
    });

    it("rejects a duplicate message id", async () => {
      const store = await seeded();
      await expect(
        store.append("c1", userMessage("m1", "again", at(3))),
      ).rejects.toThrow(/already exists/i);
    });

    it("round-trips a transcript oldest-first, drafts and attribution intact", async () => {
      const store = await seeded();
      const conversation = await store.get("c1");
      expect(conversation).toMatchObject({ id: "c1", createdAt: at(0), updatedAt: at(2) });
      expect(conversation?.messages).toEqual([
        userMessage("m1", "Estimate Grover search", at(1)),
        assistantMessage("m2", "Here is a starting point.", at(2), FAKE_GENERATED_DRAFT),
      ]);
    });

    it("returns null for an unknown conversation", async () => {
      const store = await newStore();
      expect(await store.get("nope")).toBeNull();
    });

    it("hands back a copy, so a caller cannot mutate stored state", async () => {
      const store = await seeded();
      const first = await store.get("c1");
      (first?.messages as ChatMessage[])[0] = userMessage("m1", "TAMPERED", at(1));
      expect((await store.get("c1"))?.messages[0]?.text).toBe("Estimate Grover search");
    });

    it("advances updatedAt to the appended message's timestamp", async () => {
      const store = await seeded();
      expect(await store.list()).toEqual([
        expect.objectContaining({ id: "c1", updatedAt: at(2), messageCount: 2 }),
      ]);
    });

    it("orders the rail by most recent activity, not creation", async () => {
      const store = await newStore();
      await store.create({ id: "older", title: "Older", createdAt: at(0) });
      await store.create({ id: "newer", title: "Newer", createdAt: at(5) });
      await store.append("older", userMessage("m1", "revived", at(9)));
      expect((await store.list()).map((row) => row.id)).toEqual(["older", "newer"]);
    });

    it("renames without reordering the rail", async () => {
      const store = await seeded();
      await store.rename("c1", "Grover, 20 qubits");
      expect(await store.list()).toEqual([
        expect.objectContaining({ title: "Grover, 20 qubits", updatedAt: at(2) }),
      ]);
    });

    it("rejects renaming an unknown conversation", async () => {
      const store = await newStore();
      await expect(store.rename("missing", "New name")).rejects.toThrow(/missing/);
    });

    it("deletes a conversation and its transcript", async () => {
      const store = await seeded();
      await store.delete("c1");
      expect(await store.get("c1")).toBeNull();
      expect(await store.list()).toEqual([]);
    });

    it("treats deleting an unknown conversation as a no-op", async () => {
      const store = await newStore();
      await expect(store.delete("never-existed")).resolves.toBeUndefined();
    });

    it("clears every conversation", async () => {
      const store = await seeded();
      await store.create({ id: "c2", title: "Another", createdAt: at(4) });
      await store.clear();
      expect(await store.list()).toEqual([]);
    });

    describe("search", () => {
      it("returns everything for a blank query, in list order", async () => {
        const store = await seeded();
        await store.create({ id: "c2", title: "Another", createdAt: at(4) });
        const [byList, bySearch] = [await store.list(), await store.search("   ")];
        expect(bySearch.map((row) => row.id)).toEqual(byList.map((row) => row.id));
      });

      it("matches a word inside a message", async () => {
        const store = await seeded();
        expect((await store.search("Grover")).map((row) => row.id)).toEqual(["c1"]);
      });

      it("matches a prefix, not a mid-word substring", async () => {
        const store = await seeded();
        expect(await store.search("grov")).toHaveLength(1);
        expect(await store.search("rover")).toHaveLength(0);
      });

      it("is case-insensitive", async () => {
        const store = await seeded();
        expect(await store.search("GROVER")).toHaveLength(1);
      });

      /**
       * The case this suite was blind to. Every fixture above is ASCII, and
       * FTS5's `unicode61` tokenizer folds diacritics while a naive JS
       * tokenizer does not — so the two implementations disagreed about
       * "naive" vs "naïve" and nothing here could see it. Non-ASCII text is
       * now part of the contract rather than an assumption about it.
       */
      it("folds diacritics, in both directions", async () => {
        const store = await newStore();
        await store.create({ id: "c9", title: "Naïve baseline", createdAt: at(0) });
        await store.append("c9", userMessage("m9", "An estimate over café data", at(1)));

        expect((await store.search("naive")).map((row) => row.id)).toEqual(["c9"]);
        expect((await store.search("cafe")).map((row) => row.id)).toEqual(["c9"]);
        // ...and the accented spelling still finds it.
        expect((await store.search("café")).map((row) => row.id)).toEqual(["c9"]);
        expect((await store.search("naïve")).map((row) => row.id)).toEqual(["c9"]);
      });

      it("requires every term", async () => {
        const store = await seeded();
        expect(await store.search("Grover search")).toHaveLength(1);
        expect(await store.search("Grover factoring")).toHaveLength(0);
      });

      it("matches a renamed title even when no message mentions it", async () => {
        const store = await seeded();
        await store.rename("c1", "Weekly baseline");
        expect((await store.search("baseline")).map((row) => row.id)).toEqual(["c1"]);
      });


      it("treats query syntax as ordinary text", async () => {
        const store = await seeded();
        // Each of these is FTS5 syntax that would otherwise change the meaning
        // of the search or fail it with a parse error.
        for (const query of ['"grover', "AND", "grover*", "NOT search", "^ (", "-"]) {
          await expect(store.search(query)).resolves.toBeInstanceOf(Array);
        }
      });

      it("stops matching a deleted conversation", async () => {
        const store = await seeded();
        await store.delete("c1");
        expect(await store.search("Grover")).toEqual([]);
      });

      it("stops matching after a clear", async () => {
        const store = await seeded();
        await store.clear();
        expect(await store.search("Grover")).toEqual([]);
      });
    });
  });
}
