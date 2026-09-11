import Ajv, { type ErrorObject } from "ajv";

import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
import { BENCHMARK_PARAMS } from "../shared/benchmarkParams.js";
import type { GeneratedRunDraft } from "../shared/agentTypes.js";

/**
 * Checks a provider's parsed reply against the generation schema before anyone
 * downstream treats it as a `GeneratedRunDraft`.
 *
 * The adapters used to cast the parsed JSON straight across, on the reasoning
 * that the real gate is downstream and stricter. The gate *is* stricter — but it
 * is silent, and that is what made the reasoning fail. A reply carrying
 * `errorRate: "1e-3"` (a string where the schema says number) mapped cleanly:
 * `draftToFormState` returned ok, the proposal panel listed "Error rate 1e-3",
 * `validateForm` reported no field error anywhere, and `isConfigValid` returned
 * false — so the analyst got a form that looked completely valid, no message on
 * any control, and a Run button that would never enable again. Nothing wrong
 * could execute, but nothing could be fixed either.
 *
 * Two nearer-term shapes were just as bad. An empty object reached
 * `unsupportedFields` first, where `undefined !== "none"` reported *"the
 * proposal sets fields this draft path does not carry into the form: Memory
 * Optimization"* about a reply that set nothing at all; a reply missing
 * `traceTransform` threw a raw `Cannot read properties of undefined` into the
 * error paragraph.
 *
 * Structured output makes all three unlikely — that is the point of sending a
 * schema — but "unlikely" is the wrong bar for the one failure whose symptom is
 * a dead end with no diagnosis. This is the cheap check that turns every one of
 * them into a sentence naming the offending field.
 *
 * Validated against the schema WITH its descriptions: they are inert to Ajv, and
 * reusing the committed artifact means there is no second copy of the contract
 * here to drift from `WIRE_GENERATION_SCHEMA`.
 */

// `strict: false` matches the renderer's Ajv setup: the committed contracts use
// keywords (`title`, prose `description`) that strict mode flags as unknown in
// some positions, and disagreeing with the other validator about which schemas
// are loadable would be its own bug.
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(generationSchema);

export type DraftValidationResult =
  | { ok: true; draft: GeneratedRunDraft }
  | { ok: false; reason: string };

export function validateGeneratedDraft(value: unknown): DraftValidationResult {
  const candidate = withoutPrototypeKey(value);
  if (validate(candidate)) {
    return { ok: true, draft: candidate as GeneratedRunDraft };
  }
  return { ok: false, reason: describe(validate.errors, candidate) };
}

/**
 * Drop a key named `__proto__`, which the two gates have to agree about.
 *
 * The MCP tool's arguments are parsed by zod before its handler runs, and zod's
 * object parser silently DISCARDS a key called `__proto__` while rebuilding the
 * value — it cannot store one without rewiring the object's prototype. So Ajv
 * never saw that key on that path, and `qre_validate_config` answered
 * `valid: true` for the very bytes this function refused with "must NOT have
 * additional property '__proto__'": one key, two verdicts, and a tool whose
 * promise is that a draft it calls valid is one the analyst can run.
 *
 * They agree by ignoring it, which is what the rest of the pipeline does
 * anyway: the adapters copy named fields, nothing reads a draft's prototype,
 * and the key cannot survive an analyst re-entering the configuration in the
 * form. Ignoring is also the safe direction — the value is never assigned
 * through, so no prototype is ever polluted.
 */
function withoutPrototypeKey(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  if (!Object.hasOwn(value, "__proto__")) return value;

  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__") continue;
    copy[key] = entry;
  }
  return copy;
}

/** Enough to see every missing section of a draft at once, still one sentence. */
const MAX_REPORTED = 5;

/**
 * A ceiling on the whole reason, held BELOW what either consumer will cut.
 *
 * The reason is capped again downstream — `qre_validate_config` bounds a
 * structural message and the chat surface puts it in a paragraph — and a cap
 * applied there lands mid-sentence. Five spelled-out messages could exceed it:
 * the `parameters` variant listing alone runs to ~330 characters, and a reason
 * of 593 was cut to 500 with an ellipsis, losing two of the six variants an
 * agent had to choose between. Budgeting here means whatever is reported is
 * reported whole.
 */
const MAX_REASON_CHARS = 900;

type JsonSchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  description?: string;
  anyOf?: JsonSchemaNode[];
};

/**
 * The most specific failures, as `path: message`.
 *
 * `errorsText` over the raw list is unusable here because the schema is a tree
 * of `anyOf` branches: one wrong architecture field produces a failure for every
 * branch it isn't, plus the parent "must match a schema in anyOf". The first
 * version of this picked the deepest `instancePath` on the theory that depth was
 * the branch the reply had chosen. It was not. A gate-based draft missing
 * `twoQubitGateTime` fails its own branch at `/architecture` (`required`) and the
 * other two branches at `/architecture/type` (`enum`) — so the deepest errors
 * were the other branches', and every from-scratch draft was told
 * *"architecture.type must be equal to one of the allowed values"* about a type
 * that was perfectly valid. An agent given that message cannot get out of it.
 *
 * So each `anyOf` group is resolved to the branch the instance actually chose
 * before anything is reported. Where a branch set is discriminated by `type`,
 * the instance's `type` picks it; where it is not (`parameters`, whose variants
 * differ only by key set), the branch sharing the most keys with the instance
 * is the one being attempted; and where nothing identifies a branch, the
 * alternatives themselves are the message. Only that branch's failures are
 * reported, with the values Ajv already knows — the allowed enum, the offending
 * extra key — spelled out rather than left as "one of the allowed values".
 */
function describe(errors: ErrorObject[] | null | undefined, value: unknown): string {
  if (!errors || errors.length === 0) return "it did not match the generation contract";

  const { remaining, synthesized } = resolveBranches(errors, value);

  const sorted = [...remaining].sort(
    (a, b) => depthOf(a.instancePath) - depthOf(b.instancePath),
  );

  // Branch-level messages FIRST. They say that a whole field is the wrong
  // shape — an unrecognised `architecture.type`, a `parameters` set matching no
  // variant — which is both the most useful thing to fix and the thing no other
  // message implies. Appended last, they were what the cap dropped: a draft
  // with `type: "ionTrap"` and five scalar mistakes was answered with the five
  // scalars and never a word about the architecture, so the agent fixed all
  // five and only then learned the shape was wrong.
  const ordered = [
    ...synthesized,
    ...mergeMissingProperties(sorted).map((error) => render(error)),
  ];

  const chosen: string[] = [];
  let used = 0;
  for (const message of new Set(ordered)) {
    if (chosen.length >= MAX_REPORTED) break;
    const cost = chosen.length === 0 ? message.length : message.length + 2;
    // The first message is always reported, whatever it costs; a budget that
    // can return nothing would be worse than one that overruns.
    if (chosen.length > 0 && used + cost > MAX_REASON_CHARS) break;
    chosen.push(message);
    used += cost;
  }

  return chosen.join("; ");
}

/**
 * One line per object for its missing keys, not one per key.
 *
 * A neutral-atom draft with two of its twelve fields produced ten `required`
 * errors on `/architecture`, and the cap kept five of them — so the caller was
 * told about half of what was missing and found the rest on the next attempt.
 * Folding them into "must have required properties 'a', 'b', …" says it once.
 */
function mergeMissingProperties(errors: ErrorObject[]): ErrorObject[] {
  const merged: ErrorObject[] = [];
  const missingAt = new Map<string, string[]>();

  for (const error of errors) {
    if (error.keyword !== "required") {
      merged.push(error);
      continue;
    }
    const missing = String((error.params as { missingProperty?: unknown }).missingProperty);
    const list = missingAt.get(error.instancePath);
    if (list === undefined) {
      missingAt.set(error.instancePath, [missing]);
      merged.push(error);
    } else {
      list.push(missing);
    }
  }

  return merged.map((error) => {
    const missing = missingAt.get(error.instancePath);
    if (error.keyword !== "required" || missing === undefined || missing.length < 2) {
      return error;
    }
    const quoted = missing.map((name) => `'${name}'`).join(", ");
    return { ...error, message: `must have required properties ${quoted}` };
  });
}

function depthOf(instancePath: string): number {
  return instancePath.split("/").length;
}

/** `/architecture/errorRate` as `architecture.errorRate`; the root as `draft`. */
function displayPath(instancePath: string): string {
  const path = instancePath.replace(/^\//, "").replace(/\//g, ".");
  return path.length > 0 ? path : "";
}

function withPath(instancePath: string, message: string): string {
  const path = displayPath(instancePath);
  return path.length > 0 ? `${path} ${message}` : message;
}

/** Ajv's message, with the specifics it puts in `params` folded back in. */
function render(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case "additionalProperties":
      return withPath(
        error.instancePath,
        `must NOT have additional property '${String(params.additionalProperty)}'`,
      );
    case "enum": {
      const allowed = Array.isArray(params.allowedValues)
        ? params.allowedValues.map((entry) => formatValue(entry)).join(", ")
        : null;
      return withPath(
        error.instancePath,
        allowed === null ? (error.message ?? "is not an allowed value") : `must be one of: ${allowed}`,
      );
    }
    default:
      return withPath(error.instancePath, error.message ?? "is invalid");
  }
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Collapse every `anyOf` group in the error list to the branch that applies.
 *
 * Groups are walked outermost first, because choosing an outer branch discards
 * the errors of the branches not taken — including any inner group inside them,
 * which then never needs resolving.
 */
function resolveBranches(
  errors: ErrorObject[],
  value: unknown,
): { remaining: ErrorObject[]; synthesized: string[] } {
  let remaining = [...errors];
  const synthesized: string[] = [];

  const groups = errors
    .filter((error) => error.keyword === "anyOf")
    .sort((a, b) => a.schemaPath.length - b.schemaPath.length);

  for (const group of groups) {
    if (!remaining.includes(group)) continue;

    const prefix = `${group.schemaPath}/`;
    const members = remaining.filter(
      (error) =>
        error !== group &&
        error.schemaPath.startsWith(prefix) &&
        error.instancePath.startsWith(group.instancePath),
    );
    const byBranch = new Map<number, ErrorObject[]>();
    for (const member of members) {
      const index = Number.parseInt(member.schemaPath.slice(prefix.length), 10);
      if (Number.isNaN(index)) continue;
      const list = byBranch.get(index) ?? [];
      list.push(member);
      byBranch.set(index, list);
    }

    const branches = schemaAt(group.schemaPath);
    // A group whose branches cannot be read is left exactly as Ajv reported
    // it. Discarding the members and describing "the alternatives" without
    // any alternatives to describe produced a dangling `architecture must be `
    // and threw away every error that could have explained it; raw Ajv
    // messages are noisier but true. Reachable if the committed schema ever
    // moves a branch set behind an `$id`, which changes Ajv's schemaPath.
    if (!Array.isArray(branches) || branches.length === 0) continue;

    const instance = instanceAt(value, group.instancePath);
    const decision = chooseBranch(
      branches as JsonSchemaNode[],
      instance,
      group.instancePath,
      declaredKeysFor(value, group.instancePath),
    );

    remaining = remaining.filter((error) => error !== group && !members.includes(error));
    if (decision.kind === "branch") {
      remaining.push(...(byBranch.get(decision.index) ?? []));
    } else {
      synthesized.push(decision.message);
    }
  }

  return { remaining, synthesized };
}

type BranchDecision =
  | { kind: "branch"; index: number }
  | { kind: "message"; message: string };

function chooseBranch(
  branches: JsonSchemaNode[],
  instance: unknown,
  instancePath: string,
  /** The keys a sibling field says this group carries; see `declaredKeysFor`. */
  declared: readonly string[] | null,
): BranchDecision {
  const isObject =
    typeof instance === "object" && instance !== null && !Array.isArray(instance);

  // 1. A discriminated union: the instance's `type` names its branch.
  const discriminators = branches.map((branch) => allowedTypes(branch));
  if (discriminators.some((types) => types.length > 0)) {
    const declared = isObject ? (instance as Record<string, unknown>).type : undefined;
    const chosen = discriminators.findIndex((types) => types.includes(declared));
    if (chosen !== -1) return { kind: "branch", index: chosen };

    const options = discriminators.flat().map(formatValue).join(", ");
    const typePath = `${instancePath}/type`;
    if (!isObject) return { kind: "message", message: withPath(instancePath, "must be an object") };
    return {
      kind: "message",
      message: withPath(
        typePath,
        declared === undefined ? `is required and must be one of: ${options}` : `must be one of: ${options}`,
      ),
    };
  }

  // 2. Scalar alternatives (`string | null`): say which types are allowed.
  if (branches.every((branch) => branch.properties === undefined && typeof branch.type === "string")) {
    const types = branches.map((branch) => branch.type as string);
    return { kind: "message", message: withPath(instancePath, `must be ${types.join(" or ")}`) };
  }

  // 3. Object variants told apart only by their keys.
  if (isObject) {
    const branchKeys = branches.map((branch) => requiredKeys(branch));

    // 3a. A sibling field names the variant. This is the contract's own rule
    //     and it beats guessing from the keys the caller happened to send.
    if (declared !== null) {
      const named = onlyBest(branchKeys.map((keys) => shared(keys, declared)));
      if (named !== null) return { kind: "branch", index: named };
    }

    // 3b. Otherwise the instance's own keys — and only when ONE branch wins
    //     outright. A tie used to fall to the lower index, which is how a
    //     draft carrying `generator` was answered with Shor's missing
    //     `bitSize` while the caller had asked for Ekerå-Håstad.
    const instanceKeys = Object.keys(instance as Record<string, unknown>);
    const scores = branchKeys.map((keys) => shared(keys, instanceKeys));
    const winner = onlyBest(scores);
    if (winner !== null) return { kind: "branch", index: winner };

    // 4. No single variant is identifiable, so the alternatives are the
    //    answer — narrowed to the tied ones when the keys sent narrow it at
    //    all, because listing six variants to a caller who has clearly
    //    attempted one of two is a worse answer than naming those two.
    const best = Math.max(0, ...scores);
    const candidates =
      best > 0 ? branches.filter((_branch, index) => scores[index] === best) : branches;
    return {
      kind: "message",
      message: withPath(instancePath, `must be one of: ${variantList(candidates)}`),
    };
  }

  return {
    kind: "message",
    message: withPath(
      instancePath,
      `must be an object, one of: ${variantList(branches)}`,
    ),
  };
}

/** The required keys of a branch, or every key it declares if it requires none. */
function requiredKeys(branch: JsonSchemaNode): readonly string[] {
  return branch.required ?? Object.keys(branch.properties ?? {});
}

function shared(keys: readonly string[], against: readonly string[]): number {
  return keys.filter((key) => against.includes(key)).length;
}

/** The single highest score, or null when nothing scored or two branches tied. */
function onlyBest(scores: readonly number[]): number | null {
  let best: number | null = null;
  let bestScore = 0;
  let tied = false;
  scores.forEach((score, index) => {
    if (score > bestScore) {
      bestScore = score;
      best = index;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  });
  return tied ? null : best;
}

/**
 * The variants, separated by something the reason's own separator is not.
 *
 * `describe` joins distinct failures with "; ", so a variant list joined the
 * same way read as six more failures: "Eker\u00e5-H\u00e5stad factoring {rsaInstance,
 * generator}" looked like a complaint rather than an option.
 */
function variantList(branches: readonly JsonSchemaNode[]): string {
  return branches.map((branch) => describeVariant(branch)).join(" | ");
}

/**
 * The keys a sibling field says this group must carry, or null if none does.
 *
 * `parameters` is the one group the schema does not discriminate from inside:
 * its six variants differ only by key set, and the contract names the
 * discriminator in prose instead — "Parameters for the benchmark named in
 * application.benchmarkId. Choose the variant that matches it". Resolving the
 * group by key overlap alone ignored that sentence, and two variants share the
 * key `generator`: a draft for `ekera-hastad-factoring` carrying only
 * `generator` tied with Shor's, the lower index won, and the reason said to add
 * `bitSize` — which the next stage refused as "not a parameter of the
 * ekera-hastad-factoring benchmark". Remove it and the first message came back.
 * Nothing ever named `rsaInstance`, so no edit escaped the loop.
 *
 * `BENCHMARK_PARAMS` is the table the form and the engine already read, so
 * this asks the existing source which keys a benchmark has rather than
 * stating it again. A variant's `required` set is a subset of that table's
 * keys (Grover's `iterations` is computed and not proposable), so the variants
 * are ranked by overlap rather than matched exactly.
 */
function declaredKeysFor(
  value: unknown,
  instancePath: string,
): readonly string[] | null {
  if (instancePath !== "/parameters") return null;

  const application = readProperty(value, "application");
  // The schema's instruction for a run with no benchmark: "use the 'none'
  // variant for manual logical counts or when proposing no parameters".
  if (readProperty(application, "type") === "manualCounts") return ["none"];

  const benchmarkId = readProperty(application, "benchmarkId");
  if (typeof benchmarkId !== "string") return null;

  const params = (BENCHMARK_PARAMS as Record<string, readonly { key: string }[]>)[
    benchmarkId
  ];
  return params === undefined ? null : params.map((param) => param.key);
}

function readProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** The `type` values a branch admits, if it declares a discriminator at all. */
function allowedTypes(branch: JsonSchemaNode): unknown[] {
  const type = branch.properties?.type;
  if (type === undefined) return [];
  if (Array.isArray(type.enum)) return type.enum;
  if (type.const !== undefined) return [type.const];
  return [];
}

/** "Grover's search (searchQubits)" — the branch's own description and keys. */
function describeVariant(branch: JsonSchemaNode): string {
  const keys = (branch.required ?? Object.keys(branch.properties ?? {})).join(", ");
  const label = branch.description?.replace(/\.$/, "");
  return label ? `${label} {${keys}}` : `{${keys}}`;
}

/** Walk the committed schema by an Ajv `schemaPath` such as `#/properties/x/anyOf`. */
function schemaAt(schemaPath: string): unknown {
  let node: unknown = generationSchema;
  for (const segment of pointerSegments(schemaPath.replace(/^#/, ""))) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Walk the instance by an Ajv `instancePath` such as `/architecture/errorRate`. */
function instanceAt(value: unknown, instancePath: string): unknown {
  let node: unknown = value;
  for (const segment of pointerSegments(instancePath)) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function pointerSegments(pointer: string): string[] {
  return pointer
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}
