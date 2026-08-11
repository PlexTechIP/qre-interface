import { describe, expect, it } from "vitest";

import type { Conversation } from "../../shared/chatTypes";
import { FAKE_GENERATED_DRAFT } from "../../shared/testing/fakeAgentService";
import { markdownFilename } from "../downloadMarkdown";
import { buildConversationMarkdown } from "./exportConversation";

const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  title: "Grover, 20 search qubits",
  createdAt: "2026-08-11T09:00:00.000Z",
  updatedAt: "2026-08-11T09:04:00.000Z",
  messages: [
    {
      id: "m1",
      role: "user",
      text: "Estimate Grover search over 20 qubits.",
      draft: null,
      model: null,
      createdAt: "2026-08-11T09:01:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      text: "Here is a starting point.\n\nTell me if your hardware quotes a two-qubit gate time.",
      draft: FAKE_GENERATED_DRAFT,
      model: "Anthropic/claude-sonnet-5",
      createdAt: "2026-08-11T09:02:00.000Z",
    },
  ],
  ...over,
});

describe("buildConversationMarkdown", () => {
  it("leads with the title and what the conversation contains", () => {
    const md = buildConversationMarkdown(conversation());

    expect(md.startsWith("# Grover, 20 search qubits")).toBe(true);
    expect(md).toContain("- **Messages:** 2");
    expect(md).toContain("- **Proposals:** 1");
    expect(md).toContain("- **Started:** 2026-08-11T09:00:00.000Z");
    expect(md).toContain("- **Last updated:** 2026-08-11T09:04:00.000Z");
  });

  it("keeps the turns in order, attributed", () => {
    const md = buildConversationMarkdown(conversation());

    expect(md.indexOf("## You")).toBeLessThan(md.indexOf("## Anthropic/claude-sonnet-5"));
    expect(md).toContain("Estimate Grover search over 20 qubits.");
    // Paragraph breaks in model prose survive the round trip.
    expect(md).toContain("Here is a starting point.\n\nTell me if your hardware");
  });

  /**
   * The load-bearing one. An export of a conversation *about configurations*
   * that dropped the configurations would keep the least useful half.
   */
  it("inlines every proposal as the JSON the model produced", () => {
    const md = buildConversationMarkdown(conversation());

    expect(md).toContain("### Proposed configuration");
    expect(md).toContain(JSON.stringify(FAKE_GENERATED_DRAFT, null, 2));
    // Fenced, so a reader can lift it straight out.
    expect(md).toContain("```json");
  });

  /**
   * Model prose routinely contains its own fenced snippet. At three backticks
   * the proposal's opener was closed by the prose's stray fence, after which
   * the configuration JSON rendered as body text and everything below it
   * inherited the confusion.
   */
  it("fences a proposal so prose containing a fence cannot close it", () => {
    const md = buildConversationMarkdown(
      conversation({
        messages: [
          {
            id: "m1",
            role: "assistant",
            text: "Set it like this:\n\n```\nerrorRate: 1e-4\n```\n\nThat is the starting point.",
            draft: FAKE_GENERATED_DRAFT,
            model: "Anthropic/claude-sonnet-5",
            createdAt: "2026-08-11T09:01:00.000Z",
          },
        ],
      }),
    );

    expect(md).toContain("````json");
    // The prose's own fence survives as the author wrote it.
    expect(md).toContain("```\nerrorRate: 1e-4\n```");
    // ...and the proposal is still a complete, balanced block.
    const opens = md.split("````json").length - 1;
    expect(opens).toBe(1);
    expect(md.split("````").length - 1).toBe(2);
  });

  it("attributes an assistant turn that has no model recorded", () => {
    const md = buildConversationMarkdown(
      conversation({
        messages: [
          {
            id: "m1",
            role: "assistant",
            text: "Anonymous.",
            draft: null,
            model: null,
            createdAt: "2026-08-11T09:01:00.000Z",
          },
        ],
      }),
    );

    expect(md).toContain("## Assistant");
  });

  it("says so rather than emitting a bare header for an empty conversation", () => {
    const md = buildConversationMarkdown(conversation({ messages: [] }));

    expect(md).toContain("- **Messages:** 0");
    expect(md).toContain("_This conversation has no messages._");
  });
});

describe("markdownFilename", () => {
  it("slugs a title into something a filesystem accepts", () => {
    expect(markdownFilename("Grover, 20 search qubits")).toBe("grover-20-search-qubits");
    expect(markdownFilename("Shor / 2048-bit \"modulus\"")).toBe("shor-2048-bit-modulus");
  });

  /** Conversation titles are free text, so this is reachable, not theoretical. */
  it("falls back rather than producing a file called .md", () => {
    expect(markdownFilename("···")).toBe("qre-export");
    expect(markdownFilename("", "qre-conversation")).toBe("qre-conversation");
  });

  /**
   * The run export used "qre-run" before this helper was extracted out of it;
   * a shared helper must not quietly rename anyone else's downloads.
   */
  it("lets each caller keep its own fallback", () => {
    expect(markdownFilename("!!!", "qre-run")).toBe("qre-run");
  });
});
