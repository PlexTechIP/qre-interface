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
 * The envelope every assistant turn is decoded into: prose, and a proposal when
 * there is one.
 *
 * Structured output is all-or-nothing — a schema of `GeneratedRunDraft` alone
 * left the model no way to say anything except a complete configuration, so
 * "which error budget do you want?" was unrepresentable and it guessed instead.
 * Wrapping rather than loosening keeps the guarantee that made structured
 * output worth using: when a draft IS present it is schema-valid, and the only
 * new degree of freedom is `null`.
 *
 * Built HERE, at the wire layer, from the committed contract. The contract file
 * is not edited and the drift test that pins it is untouched: this is a shape
 * the provider is asked for, not a change to what a draft is.
 */
export const WIRE_CHAT_SCHEMA: JsonRecord = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "draft"],
  properties: {
    reply: { type: "string" },
    // One more union at the top level. The provider caps a structured-output
    // schema at 16 union-typed parameters — the reason `parameters` is one
    // variant per benchmark rather than every key nulled — so the budget is
    // spent deliberately, once, on the field that makes conversation possible.
    draft: { anyOf: [WIRE_GENERATION_SCHEMA, { type: "null" }] },
  },
};

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
  "You help an analyst arrive at a quantum-resource-estimation configuration by talking it through.",
  "",
  "Every reply is one JSON object with two fields. `reply` is what you say to the analyst, as plain prose — no markdown, no JSON, and never a restatement of the draft field by field, which they can already see. `draft` is a complete configuration proposal, or null.",
  "",
  "Propose a draft as soon as you can propose a plausible one. The analyst reviews and edits every field before anything runs, so a complete draft they can correct beats a question they have to answer first. Use null only when the request is genuinely ambiguous in a way no sensible default settles, or when they asked something that is not a configuration change.",
  "When they ask you to change something you already proposed, repeat the WHOLE draft with that change applied, carrying every other field through unchanged. A draft is always complete; there is no partial update, and a field you drop is a field you have silently reset.",
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

/** The `type: {enum: ["gateBased"]}` discriminator these branches all carry. */
function discriminatorOf(branch: unknown): string | null {
  if (typeof branch !== "object" || branch === null) return null;
  const properties = (branch as JsonRecord)["properties"] as JsonRecord | undefined;
  const discriminator = properties?.["type"] as JsonRecord | undefined;
  const values = discriminator?.["enum"];
  return Array.isArray(values) && typeof values[0] === "string" ? values[0] : null;
}
