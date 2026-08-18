import Ajv, { type ErrorObject } from "ajv";

import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
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
  if (validate(value)) {
    return { ok: true, draft: value as GeneratedRunDraft };
  }
  return { ok: false, reason: describe(validate.errors) };
}

/**
 * The most specific failures, as `path: message`.
 *
 * `errorsText` over the raw list is unusable here because the schema is a tree
 * of `anyOf` branches: one wrong architecture field produces a failure for every
 * branch it isn't, plus the parent "must match a schema in anyOf". Depth is the
 * discriminator that survives — the deepest `instancePath` is the branch the
 * model actually chose, and it is the only one whose message names a field the
 * reply really carries.
 */
function describe(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return "it did not match the generation contract";

  const deepest = errors.reduce(
    (depth, error) => Math.max(depth, error.instancePath.split("/").length),
    0,
  );
  const specific = errors.filter(
    (error) => error.instancePath.split("/").length === deepest,
  );

  const seen = new Set<string>();
  for (const error of specific) {
    const path = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
    seen.add(path.length > 0 ? `${path} ${error.message}` : `${error.message}`);
  }
  // Three is enough to spot a pattern and short enough to sit in one sentence.
  return [...seen].slice(0, 3).join("; ");
}
