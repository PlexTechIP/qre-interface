import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };

/**
 * The generation schema, split into the two things a provider needs it to be.
 *
 * Structured-output schemas are compiled into a decoding grammar, and that
 * grammar has a size ceiling: past it the request is rejected with 400 before
 * the model sees anything. `description` strings count toward it. Ours carry
 * every numeric bound and cross-field rule the lowered schema cannot express as
 * keywords — that is the entire lowering strategy — so deleting them to fit is
 * not an option, and neither is shipping a schema that will not compile.
 *
 * So the descriptions travel in the system prompt instead, where they cost
 * ordinary input tokens and nothing else, while the wire schema carries only
 * structure. The model receives exactly the same guidance either way.
 *
 * **Both halves are derived from the same file, in this module, at import time.**
 * That is the point: a description added to the schema appears in the prompt
 * automatically, and there is no second copy to forget. Hand-maintaining the
 * prose next to a stripped schema would drift within a release.
 */

type JsonRecord = Record<string, unknown>;

const DESCRIPTIVE_KEYS = new Set(["description", "title"]);

/** Structure only — what the grammar compiler actually needs. */
export const WIRE_GENERATION_SCHEMA = stripDescriptive(generationSchema) as JsonRecord;

/**
 * The one tool the model is given: attach a configuration proposal to a turn.
 *
 * This is what replaced the `{reply, draft}` envelope, and the reason the whole
 * conversation reads differently now. Under the envelope every reply was a
 * string field inside strict JSON, which forced three things at once: nothing
 * could stream (the JSON has to close before any of it parses), the prose could
 * not use markdown (it was a JSON string value), and the model wrote in the
 * clipped register of something filling in a form. As a tool call the prose is
 * just prose — streamed, formatted, addressed to a person — and the draft
 * arrives beside it as structured arguments.
 *
 * The input schema is `WIRE_GENERATION_SCHEMA` unchanged. The committed
 * contract did not move, the drift test that pins it did not move, and a draft
 * is still all-or-nothing: `additionalProperties: false` with every property
 * required, which is exactly the strict-tool-parameter subset both providers
 * want. What changed is where it rides.
 */
export const PROPOSE_RUN_CONFIG_TOOL = {
  name: "propose_run_config",
  description: [
    "Attach a complete quantum-resource-estimation configuration to your reply.",
    "Call this as soon as you can propose a plausible configuration — the analyst reviews and edits every field before anything runs, so a complete draft they can correct beats a question they have to answer first.",
    "Call it again with the WHOLE configuration, amended, whenever they ask for a change: there is no partial update, and a field you leave out is a field you have silently reset.",
    "Do not call it when the request is genuinely ambiguous in a way no sensible default settles, or when they asked something that is not a configuration change — say so in prose instead.",
  ].join(" "),
  schema: WIRE_GENERATION_SCHEMA,
} as const;

/** The same prose, addressed to the model as `path — description` lines. */
export const GENERATION_FIELD_GUIDE = collectDescriptions(generationSchema as JsonRecord);

/**
 * The system prompt every adapter sends on every turn, built from the guide above.
 *
 * It lives here, beside the guide it ends with, because it was previously
 * copy-pasted byte-for-byte into both adapters — the exact second copy this
 * module's docstring exists to argue against. A prompt that says one thing to
 * Anthropic and another to OpenAI would make the two providers silently
 * incomparable, which is worse than either wording alone.
 *
 * The model owns field *values*. It is told nothing about run identity, and the
 * lowered schema gives it nowhere to put one even if it tried — `id`,
 * `createdAt`, `schemaVersion`, `qecCode` and `qreVersion` are absent from the
 * schema and rejected by `additionalProperties: false`.
 */
export const CHAT_SYSTEM_PROMPT = [
  "You are a quantum resource estimation specialist, helping an analyst arrive at a run configuration by talking it through.",
  "",
  "Talk like a colleague, not a form. Your prose goes straight to a person, so it is ordinary writing — you may use markdown for emphasis, short lists, and inline `code` where it genuinely helps read a value. Keep it brief: two or three sentences is usually right, and never restate the draft field by field, which they can already see beside your message.",
  "",
  "Attach a configuration by calling the `propose_run_config` tool. The prose and the proposal are two halves of one turn: say why you chose what you chose — which architecture, which error budget, and what trade-off that reflects — and let the tool carry the values.",
  "",
  "Ask before guessing when the request is genuinely ambiguous in a way no sensible default settles. A single focused question beats a confident configuration built on an assumption they did not make. Ask it in prose, with no tool call, and suggest what you would pick if they have no preference.",
  "Offer a natural next step once you have proposed something — the field most worth revisiting, or the comparison that would tell them something.",
  "",
  "Never invent a benchmark, architecture, or factory that is not in the schema's enums.",
  "When the request does not mention a field, choose the value a domain expert would default to and leave optional fields null rather than guessing a specific number.",
  "You are proposing configuration only. You never decide when a run executes, and you never author run identity or timestamps — the application owns those.",
  "",
  // The bounds and cross-field rules the lowered schema cannot express as
  // keywords. They live here rather than as schema descriptions because
  // descriptions are compiled into the decoding grammar and push it over the
  // provider's size ceiling; as prompt text they cost only input tokens.
  "Field guidance — the schema cannot express these bounds, so respect them:",
  GENERATION_FIELD_GUIDE,
].join("\n");

/**
 * The analyst's half-filled form, addressed to the model.
 *
 * Appended to the system prompt per request rather than baked into it, because
 * it changes on every send while the rest of the prompt never does.
 *
 * Without this the model authors from defaults and the proposal silently resets
 * work already done — the analyst picks an error budget, asks for "Grover over
 * 20 qubits", and gets back a draft that overwrites the budget they had just
 * chosen. The fields are named by their schema path, which is the same
 * vocabulary the field guide above uses, so no translation is needed at either
 * end.
 */
export function formContextPrompt(
  entries: readonly { readonly field: string; readonly value: string }[],
): string {
  if (entries.length === 0) return "";
  return [
    "",
    "The analyst has already set these fields in the run form. Carry every one of them into your proposal unchanged unless they ask for a change or it contradicts something they just said — and if you do change one, say which and why:",
    ...entries.map((entry) => `- ${entry.field}: ${entry.value}`),
  ].join("\n");
}

function stripDescriptive(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDescriptive);
  if (typeof node !== "object" || node === null) return node;

  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(node as JsonRecord)) {
    if (DESCRIPTIVE_KEYS.has(key)) continue;
    out[key] = stripDescriptive(value);
  }
  return out;
}

/**
 * Walks the schema in document order, emitting one line per described field.
 *
 * Union branches are addressed by their discriminating `type` value where one
 * exists (`architecture(majorana).operationTime`) so the model can tell which
 * variant a bound belongs to — without that, three architectures' worth of
 * "measurement time" guidance reads as contradictory.
 */
function collectDescriptions(schema: JsonRecord): string {
  const lines: string[] = [];

  // The root's own description explains what this object is and is not — that
  // it is not a RunConfig and cannot be executed. It has no field path, so it
  // leads as a preamble rather than being dropped on the floor.
  const preamble = schema["description"];
  if (typeof preamble === "string") lines.push(preamble);

  const walk = (node: unknown, path: string): void => {
    if (typeof node !== "object" || node === null) return;
    const record = node as JsonRecord;

    const description = record["description"];
    if (typeof description === "string" && path.length > 0) {
      lines.push(`- ${path}: ${description}`);
    }

    for (const [key, value] of Object.entries(
      (record["properties"] as JsonRecord | undefined) ?? {},
    )) {
      walk(value, path.length > 0 ? `${path}.${key}` : key);
    }

    const branches = record["anyOf"];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        walk(branch, `${path}(${discriminatorOf(branch) ?? "variant"})`);
      }
    }

    if (record["items"] !== undefined) walk(record["items"], `${path}[]`);
  };

  walk(schema, "");
  return lines.join("\n");
}

/**
 * How a union branch is named inside a field path.
 *
 * The `type: {enum: ["gateBased"]}` discriminator first, because that is the
 * value the model actually has to emit for the branch it picks.
 *
 * Falling back to the branch DESCRIPTION is what makes this function do its job
 * on `parameters`. That union has no `type` field — its six branches are told
 * apart by which properties are present — so every one of them fell through to
 * the literal "variant", producing exactly the ambiguity the walker's docstring
 * says this exists to remove. `parameters(variant).generator` appeared twice
 * with two different meanings (Shor's and Ekera-Hastad's), and the bound on
 * `searchQubits` read as though it constrained all six benchmarks rather than
 * Grover alone. The descriptions are already short noun phrases written for
 * exactly this ("Grover's search."), so the trailing period is all that needs
 * removing.
 */
function discriminatorOf(branch: unknown): string | null {
  if (typeof branch !== "object" || branch === null) return null;
  const record = branch as JsonRecord;
  const properties = record["properties"] as JsonRecord | undefined;
  const discriminator = properties?.["type"] as JsonRecord | undefined;
  const values = discriminator?.["enum"];
  if (Array.isArray(values) && typeof values[0] === "string") return values[0];

  const description = record["description"];
  return typeof description === "string" && description.length > 0
    ? description.replace(/\.$/, "")
    : null;
}
