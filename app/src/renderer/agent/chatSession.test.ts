import { describe, expect, it } from "vitest";

import { toChatTurns, type ChatMessage } from "../../shared/chatTypes";
import { FAKE_GENERATED_DRAFT } from "../../shared/testing/fakeAgentService";
import {
  assistantTurn,
  awaitingReply,
  buildChatRequest,
  startConversation,
  userTurn,
} from "./chatSession";

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  role: "user",
  text: "",
  draft: null,
  model: null,
  createdAt: "2026-08-10T09:00:00.000Z",
  ...over,
});

describe("userTurn", () => {
  it("carries no draft and no model attribution", () => {
    const turn = userTurn("Estimate Grover search");
    expect(turn).toMatchObject({ role: "user", text: "Estimate Grover search", draft: null, model: null });
    expect(turn.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("assistantTurn", () => {
  /**
   * Attribution is per MESSAGE, not per conversation: the picker is live, so an
   * analyst can start on Haiku and switch to Opus mid-thread. It is also the
   * exact string `draftToFormState` stamps as run provenance, so a saved run and
   * the turn that proposed it name the same model the same way.
   */
  it("records which model produced it, in provenance form", () => {
    expect(
      assistantTurn({
        ok: true,
        reply: "Here is a starting point.",
        draft: FAKE_GENERATED_DRAFT,
        provider: "Anthropic",
        model: "claude-sonnet-5",
      }),
    ).toMatchObject({
      role: "assistant",
      text: "Here is a starting point.",
      draft: FAKE_GENERATED_DRAFT,
      model: "Anthropic/claude-sonnet-5",
    });
  });

  it("keeps a turn that proposed nothing", () => {
    expect(
      assistantTurn({
        ok: true,
        reply: "Which error budget?",
        draft: null,
        provider: "OpenAI",
        model: "gpt-5.6-terra",
      }),
    ).toMatchObject({ text: "Which error budget?", draft: null });
  });
});

describe("startConversation", () => {
  it("titles the conversation from the opening message", () => {
    const { conversation, message: opening } = startConversation("  Estimate\n Grover search ");
    expect(conversation.title).toBe("Estimate Grover search");
    expect(conversation.createdAt).toBe(opening.createdAt);
    expect(conversation.id).not.toBe(opening.id);
  });
});

describe("buildChatRequest", () => {
  /**
   * THE invariant of this module. The preview builds from the stored transcript
   * plus the composer's text; `send` builds from the transcript with that turn
   * already appended. If those two ever differ, the analyst approves payload A
   * and payload B goes out — the exact bug a separate `reviewing` boolean
   * produced on the surface this replaces.
   */
  it("previews the request send would actually make", () => {
    const transcript = [
      message({ id: "m1", text: "Grover, 20 qubits" }),
      message({
        id: "m2",
        role: "assistant",
        text: "Here it is.",
        draft: FAKE_GENERATED_DRAFT,
        model: "Anthropic/claude-sonnet-5",
      }),
    ];
    const pending = "make the gate time 80";

    const previewed = buildChatRequest(transcript, "anthropic", "claude-sonnet-5", pending);
    const sent = buildChatRequest(
      [...transcript, message({ id: "m3", text: pending })],
      "anthropic",
      "claude-sonnet-5",
    );

    expect(previewed).toEqual(sent);
  });

  it("ignores a composer holding only whitespace", () => {
    const transcript = [message({ id: "m1", text: "Grover" })];
    expect(buildChatRequest(transcript, "anthropic", "claude-sonnet-5", "   ").messages).toEqual(
      toChatTurns(transcript),
    );
  });

  it("stamps the generation contract and the live provider selection", () => {
    expect(buildChatRequest([], "openai", "gpt-5.6-terra")).toMatchObject({
      generationSchema: "runconfig-generation-v1.4.0",
      provider: "openai",
      model: "gpt-5.6-terra",
    });
  });
});

describe("awaitingReply", () => {
  it("is true when the transcript ends on the analyst", () => {
    expect(awaitingReply([message({ id: "m1", text: "Grover" })])).toBe(true);
  });

  it("is false once the model has answered, and on an empty transcript", () => {
    expect(
      awaitingReply([
        message({ id: "m1", text: "Grover" }),
        message({ id: "m2", role: "assistant", text: "Here it is." }),
      ]),
    ).toBe(false);
    expect(awaitingReply([])).toBe(false);
  });
});
