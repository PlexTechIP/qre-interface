import { describe, expect, it } from "vitest";

import { InMemoryChatStore } from "./chatStore";
import { describeChatStoreContract } from "./testing/chatStoreContract";
import {
  matchesSearchTerms,
  parseSearchTerms,
  titleFromFirstMessage,
  toChatTurns,
  UNTITLED_CONVERSATION,
  type ChatMessage,
} from "./chatTypes";
import { FAKE_GENERATED_DRAFT } from "./testing/fakeAgentService";

describeChatStoreContract("InMemoryChatStore", () => ({ store: new InMemoryChatStore() }));

describe("parseSearchTerms", () => {
  it("splits on everything that is not a letter, digit or underscore", () => {
    expect(parseSearchTerms("Grover's search, 20-qubit!")).toEqual([
      "grover",
      "s",
      "search",
      "20",
      "qubit",
    ]);
  });

  it("yields no terms for a blank or punctuation-only query", () => {
    expect(parseSearchTerms("   ")).toEqual([]);
    expect(parseSearchTerms('" AND * ^')).toEqual(["and"]);
  });
});

describe("matchesSearchTerms", () => {
  it("matches every term as a token prefix", () => {
    expect(matchesSearchTerms("Grover search", ["grov", "sea"])).toBe(true);
    expect(matchesSearchTerms("Grover search", ["rover"])).toBe(false);
  });

  /** It used to fold the haystack and not the needle, so this returned false. */
  it("folds the terms too, not only the text", () => {
    expect(matchesSearchTerms("Grover search", ["Grover"])).toBe(true);
    expect(matchesSearchTerms("naïve estimate", ["NAIVE"])).toBe(true);
  });

  it("requires all terms, not any", () => {
    expect(matchesSearchTerms("Grover search", ["grover", "shor"])).toBe(false);
  });

  it("matches everything when there are no terms", () => {
    expect(matchesSearchTerms("anything", [])).toBe(true);
  });
});

describe("titleFromFirstMessage", () => {
  it("collapses whitespace and keeps a short opening line whole", () => {
    expect(titleFromFirstMessage("  Estimate\n  Grover  search ")).toBe(
      "Estimate Grover search",
    );
  });

  it("falls back when the message is blank", () => {
    expect(titleFromFirstMessage("   \n ")).toBe(UNTITLED_CONVERSATION);
  });

  /**
   * `slice(0, 60)` counts UTF-16 code units, so a cut landing inside a
   * surrogate pair left a lone surrogate that renders as U+FFFD. It needs the
   * no-space-after-40 branch, which is the ordinary case for CJK.
   */
  it("never cuts a surrogate pair in half", () => {
    // 61 astral code points, no spaces: the raw-cut branch, cutting where the
    // old code-unit slice would land between the halves of a pair.
    const title = titleFromFirstMessage("𝜓".repeat(61));

    expect(title).not.toContain("�");
    expect([...title].every((point) => point === "𝜓" || point === "…")).toBe(true);
    expect([...title]).toHaveLength(61);
  });

  it("measures the 60-point limit in code points, not code units", () => {
    // 40 astral points is 80 code units — under the limit by one measure and
    // over it by the other.
    expect(titleFromFirstMessage("𝜓".repeat(40))).toBe("𝜓".repeat(40));
  });

  it("truncates on a word boundary", () => {
    const title = titleFromFirstMessage(
      "Estimate the physical qubit count for Shor factoring of a 2048-bit modulus on a Majorana architecture",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title).not.toMatch(/\s…$/);
  });
});

describe("toChatTurns", () => {
  const message = (over: Partial<ChatMessage>): ChatMessage => ({
    id: "m",
    role: "user",
    text: "",
    draft: null,
    model: null,
    createdAt: "2026-08-10T09:00:00.000Z",
    ...over,
  });

  it("sends a user turn as its prose", () => {
    expect(toChatTurns([message({ text: "Estimate Grover" })])).toEqual([
      { role: "user", content: "Estimate Grover" },
    ]);
  });

  /**
   * The load-bearing one. Replaying only the prose would drop the proposal, and
   * a model asked to change one field with no configuration in its context
   * re-derives the whole thing — silently moving fields the analyst had settled.
   */
  it("replays an assistant turn with its proposal attached", () => {
    const turns = toChatTurns([
      message({
        role: "assistant",
        text: "Here is a starting point.",
        draft: FAKE_GENERATED_DRAFT,
        model: "Anthropic/claude-sonnet-5",
      }),
    ]);

    // The draft travels as a value, not serialised into `content`. Each
    // provider represents a past proposal as its own flavour of tool call, so
    // the adapters need it as data to lower it — stringifying here would make
    // each of them parse prose looking for JSON this function just wrote.
    expect(turns).toEqual([
      {
        role: "assistant",
        content: "Here is a starting point.",
        draft: FAKE_GENERATED_DRAFT,
      },
    ]);
  });

  it("carries no id, timestamp or model attribution to the provider", () => {
    const wire = JSON.stringify(
      toChatTurns([
        message({
          id: "m-secret-id",
          role: "assistant",
          text: "ok",
          model: "Anthropic/claude-sonnet-5",
          createdAt: "2026-08-10T09:00:00.000Z",
        }),
      ]),
    );
    expect(wire).not.toContain("m-secret-id");
    expect(wire).not.toContain("2026-08-10");
    expect(wire).not.toContain("claude-sonnet-5");
  });
});

describe("InMemoryChatStore", () => {
  it("seeds from existing conversations", async () => {
    const store = new InMemoryChatStore([
      {
        id: "c1",
        title: "Seeded",
        createdAt: "2026-08-10T09:00:00.000Z",
        updatedAt: "2026-08-10T09:05:00.000Z",
        messages: [],
      },
    ]);
    expect(await store.list()).toEqual([expect.objectContaining({ id: "c1" })]);
  });
});
