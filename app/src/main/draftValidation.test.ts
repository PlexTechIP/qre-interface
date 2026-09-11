// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FAKE_GENERATED_DRAFT } from "../shared/testing/fakeAgentService.js";
import { validateGeneratedDraft } from "./draftValidation.js";

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
   * Branch resolution exists because the schema is a tree of `anyOf` branches
   * and one wrong field fails every branch it is not.
   */
  it("reports the chosen branch's failures rather than every branch the reply is not", () => {
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

  /**
   * The dead end an MCP agent hit. A gate-based draft missing
   * `twoQubitGateTime` fails its own branch with `required` at `/architecture`
   * and the other two branches with `enum` at `/architecture/type`. Picking the
   * deepest errors picked the other branches, so every from-scratch draft was
   * told "architecture.type must be equal to one of the allowed values" about a
   * type that was valid — and nothing an agent changed could make that go away.
   */
  it("blames the missing field, not the type that selected the branch", () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    draft["architecture"] = {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
    };

    const result = validateGeneratedDraft(draft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/architecture must have required property 'twoQubitGateTime'/);
    expect(result.reason).not.toMatch(/architecture\.type/);
  });

  it("names the allowed types when no branch matches the declared one", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      architecture: { type: "ionTrap" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/architecture\.type must be one of: gateBased, majorana, neutralAtom/);
  });

  it("spells out an enum instead of saying 'one of the allowed values'", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      architecture: { type: "majorana", errorRate: 0.001, operationTime: 1000 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/architecture\.errorRate must be one of: 0\.0001, 0\.00001, 0\.000001/);
  });

  it("names the extra key a strict object refused", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      qecCode: "surface_code",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/must NOT have additional property 'qecCode'/);
  });

  /**
   * `parameters` has no discriminator inside it — its six variants differ only
   * by key set — but the contract names one in prose: "Parameters for the
   * benchmark named in application.benchmarkId". So the benchmark decides, and
   * an empty parameter set is answered with that benchmark's own missing keys.
   */
  it("names the keys of the benchmark the draft asked for", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      parameters: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // FAKE_GENERATED_DRAFT is a Grover draft.
    expect(result.reason).toMatch(/parameters must have required property 'searchQubits'/);
    expect(result.reason).not.toMatch(/bitSize/);
  });

  /**
   * The loop this replaced. `generator` belongs to BOTH factoring variants, so
   * key overlap tied them and the lower index won: an Ekerå-Håstad draft was
   * told to add Shor's `bitSize`, the next stage refused it as "not a parameter
   * of the ekera-hastad-factoring benchmark", removing it brought the first
   * message back, and nothing ever said `rsaInstance`.
   */
  it("blames the named benchmark's missing key, not another benchmark's", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      application: { type: "benchmark", benchmarkId: "ekera-hastad-factoring" },
      parameters: { generator: 7 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parameters must have required property 'rsaInstance'/);
    expect(result.reason).not.toMatch(/bitSize/);
  });

  it("points a manual-counts draft at the 'none' variant", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      application: {
        type: "manualCounts",
        numQubits: 100,
        tCount: 10,
        rotationCount: 0,
        rotationDepth: 0,
        cczCount: 0,
        ccixCount: 0,
        measurementCount: 1,
      },
      parameters: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parameters must have required property 'none'/);
  });

  /**
   * With no benchmark named there is nothing to resolve the variant with, so
   * the alternatives themselves are the answer — separated by something other
   * than the "; " that divides one failure from the next, which made each
   * variant read as another complaint.
   */
  it("lists the variants, separated from one another, when none is identifiable", () => {
    const draft: Record<string, unknown> = structuredClone(FAKE_GENERATED_DRAFT);
    delete draft["application"];
    draft["parameters"] = {};

    const result = validateGeneratedDraft(draft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parameters must be one of:/);
    expect(result.reason).toMatch(/searchQubits/);
    expect(result.reason).toMatch(/none/);
    expect(result.reason).toMatch(/\{bitSize, generator\} \| /);
  });

  it("resolves a parameter variant from the keys the reply used", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      parameters: { searchQubits: "20" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parameters\.searchQubits must be integer/);
    expect(result.reason).not.toMatch(/bitSize/);
  });

  /**
   * A whole field being the wrong SHAPE is both the most useful thing to fix
   * and the thing no per-field message implies, so it is reported first.
   * Appended last, it was the first casualty of the report cap: a draft with
   * an unrecognised architecture type and five scalar mistakes was answered
   * with the five scalars and not a word about the architecture.
   */
  it("reports a wrong-shaped field ahead of ordinary field errors", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      architecture: { type: "ionTrap" },
      maxError: "1",
      memoryOptimization: "lots",
      magicStateFactories: "round_based",
      secondaryFactories: "none",
      traceTransform: { tStatesPerRotation: "20", ccxMagicStates: false },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/^architecture\.type must be one of:/);
  });

  /**
   * The reason is capped again by both consumers, and a cap applied there cuts
   * mid-sentence: a 593-character reason reached an agent as 500 characters
   * ending in an ellipsis, two of the six `parameters` variants gone. Budgeting
   * at the source means whatever is reported is reported whole.
   */
  it("stays within a budget rather than being truncated downstream", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      application: { type: "benchmark", benchmarkId: "rsa-2048" },
      parameters: { keySize: 2048 },
      architecture: { type: "gateBased", errorRate: 0.001, gateTime: 50 },
      qecCode: "surface_code",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.length).toBeLessThanOrEqual(1200);
    expect(result.reason).not.toMatch(/…/);
    // Whatever it does report, it reports whole: no half-listed variant.
    expect(result.reason).toMatch(/\{none\}/);
  });

  /**
   * The one key where this gate and the MCP tool saw different bytes. zod
   * discards a key named `__proto__` while rebuilding a parsed object, so
   * `qre_validate_config` never saw it and answered `valid: true` for a draft
   * this function refused with "must NOT have additional property". They agree
   * by ignoring it, which is what everything downstream does anyway.
   */
  it("ignores a key named __proto__ rather than refusing the draft", () => {
    const wire = JSON.parse(
      JSON.stringify(structuredClone(FAKE_GENERATED_DRAFT)).replace(
        /^\{/,
        '{"__proto__":{"polluted":true},',
      ),
    ) as Record<string, unknown>;
    expect(Object.hasOwn(wire, "__proto__")).toBe(true);

    const result = validateGeneratedDraft(wire);

    expect(result.ok).toBe(true);
    // Ignored, not carried: nothing downstream should meet the key either.
    expect(result.ok && Object.hasOwn(result.draft, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(result.ok ? result.draft : {})).toBe(Object.prototype);
  });

  it("describes a scalar alternative by its types", () => {
    const result = validateGeneratedDraft({
      ...structuredClone(FAKE_GENERATED_DRAFT),
      name: 42,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/name must be string or null/);
  });
});

/**
 * The envelope check. A turn is accepted or refused whole: rendering the prose
 * from a reply whose draft is malformed would put "here is a configuration for
 * Grover" in the transcript above a card that cannot be opened, and the
 * conversation would carry on from a proposal that was never made.
 */
