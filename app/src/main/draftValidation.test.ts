// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { validateChatReply, validateGeneratedDraft } from "./draftValidation.js";
import { WIRE_CHAT_SCHEMA } from "./generationSchemaWire.js";

/**
 * These pin the three failures that made "the real gate is downstream" the
 * wrong call. All three were reproduced against the shipped mapping before this
 * check existed; each `it` says which one it is.
 */
describe("validateGeneratedDraft", () => {
  it("accepts the draft shape the adapters are built to receive", () => {
    const result = validateGeneratedDraft(structuredClone(FAKE_GENERATED_DRAFT));

    expect(result).toMatchObject({ ok: true });
  });

  /**
   * The dead end. `errorRate: "1e-3"` mapped cleanly: `draftToFormState`
   * returned ok, the proposal panel listed "Error rate 1e-3", `validateForm`
   * reported `{}` — no field flagged anywhere — and `isConfigValid` returned
   * false. A form that looked perfect, no message on any control, and a Run
   * button that would never enable.
   */
  it("refuses a number-shaped field that arrived as a string, and names it", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      architecture: {
        type: "gateBased",
        errorRate: "1e-3",
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
    });

    expect(result.ok).toBe(false);
    // The path is the whole point: "invalid draft" would leave whoever the
    // analyst escalates to exactly where the silent version did.
    expect(result.ok === false && result.reason).toMatch(/architecture\.errorRate/);
  });

  /**
   * The wrong diagnosis. An empty reply reached `unsupportedFields` first,
   * where `undefined !== "none"` announced "the proposal sets fields this draft
   * path does not carry into the form: Memory Optimization" — about a reply
   * that set nothing at all.
   */
  it("refuses an empty object without blaming a field it never mentioned", () => {
    const result = validateGeneratedDraft({});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).not.toMatch(/Memory Optimization/);
    expect(result.ok === false && result.reason).toMatch(/required/i);
  });

  /**
   * The raw throw. A reply missing `traceTransform` produced
   * `Cannot read properties of undefined (reading 'tStatesPerRotation')`,
   * caught by `send()` and shown verbatim in the error paragraph.
   */
  it("refuses a reply missing a required section instead of letting it throw downstream", () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    delete draft["traceTransform"];

    const result = validateGeneratedDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/traceTransform/);
  });

  it("refuses a benchmark that is not in the enum", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      application: { type: "benchmark", benchmarkId: "not-a-benchmark" },
    });

    expect(result.ok).toBe(false);
  });

  it("refuses a value that is not an object at all", () => {
    expect(validateGeneratedDraft(null).ok).toBe(false);
    expect(validateGeneratedDraft([]).ok).toBe(false);
    expect(validateGeneratedDraft("draft").ok).toBe(false);
  });

  /**
   * The reason lands in a UI paragraph, so it has to stay one sentence's worth.
   * Depth-filtering exists because the schema is a tree of `anyOf` branches and
   * one wrong field fails every branch it is not.
   */
  it("reports the deepest failures rather than every branch the reply is not", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      architecture: {
        type: "gateBased",
        errorRate: "1e-3",
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.split(";").length).toBeLessThanOrEqual(3);
    expect(result.reason).not.toMatch(/anyOf/);
  });
});

/**
 * The envelope check. A turn is accepted or refused whole: rendering the prose
 * from a reply whose draft is malformed would put "here is a configuration for
 * Grover" in the transcript above a card that cannot be opened, and the
 * conversation would carry on from a proposal that was never made.
 */
describe("validateChatReply", () => {
  const draft = (): unknown => structuredClone(FAKE_GENERATED_DRAFT);

  it("accepts prose with a proposal", () => {
    expect(validateChatReply({ reply: "Here is a starting point.", draft: draft() })).toEqual({
      ok: true,
      reply: "Here is a starting point.",
      draft: FAKE_GENERATED_DRAFT,
    });
  });

  it("accepts prose with no proposal — a turn may be a question", () => {
    expect(validateChatReply({ reply: "Which error budget?", draft: null })).toEqual({
      ok: true,
      reply: "Which error budget?",
      draft: null,
    });
  });

  it.each([
    ["a missing reply", { draft: null }],
    ["a non-string reply", { reply: 7, draft: null }],
    ["a missing draft key", { reply: "hello" }],
    ["an unknown extra field", { reply: "hello", draft: null, confidence: 0.9 }],
    ["a bare draft with no envelope", FAKE_GENERATED_DRAFT],
  ])("refuses %s", (_label, value) => {
    expect(validateChatReply(value)).toMatchObject({ ok: false });
  });

  it("names the offending field inside a malformed draft", () => {
    const result = validateChatReply({
      reply: "Here is a Grover setup.",
      draft: { ...structuredClone(FAKE_GENERATED_DRAFT), maxError: "very small" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("maxError");
  });

  /**
   * The wire copy and the validating copy are both derived from the committed
   * contract, so they cannot say different things about what a turn is. This is
   * the assertion that keeps that true if one of them is edited.
   */
  it("validates the same envelope shape the provider is asked for", () => {
    expect(WIRE_CHAT_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["reply", "draft"],
    });
    // Descriptions are stripped for the grammar compiler; structure is not.
    expect(JSON.stringify(WIRE_CHAT_SCHEMA)).not.toContain("description");
  });
});
