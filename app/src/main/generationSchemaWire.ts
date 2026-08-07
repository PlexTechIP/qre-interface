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

/** The same prose, addressed to the model as `path — description` lines. */
export const GENERATION_FIELD_GUIDE = collectDescriptions(generationSchema as JsonRecord);

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
