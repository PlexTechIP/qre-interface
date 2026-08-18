/**
 * How a run says who authored it.
 *
 * Lives beside `toRunConfig`, which is its only caller, rather than in the
 * agent feature it describes. A core serializer importing from a feature
 * directory made the dependency between the two mutual — `agent/` already
 * imports `state/formState` — and nothing here knows anything about models
 * beyond the marker text.
 */

/** Marks a run the model authored, in the one place an analyst always sees. */
export const AGENT_NAME_PREFIX = "(agent)";

/**
 * Tag a run name as model-authored.
 *
 * The persisted record already says so — `RunProvenance.authoredBy` has carried
 * `model_assisted` since v1.4.0 — but provenance is not on screen in Run
 * History, the comparison table, or an exported Markdown report. The name is,
 * everywhere, which makes it the honest place to say where a configuration came
 * from.
 *
 * Idempotent, because a Rerun loads a saved name that already carries the
 * prefix and stamps provenance again. Without the guard, running the same
 * model-authored configuration three times would name it "(agent) (agent)
 * (agent) Grover search".
 *
 * The separator is normalised rather than assumed. A name arriving as
 * "(agent)Grover" is already prefixed by any prefix test, but rendering it
 * unchanged runs the marker into the name — so the marker is stripped and
 * reapplied instead of being detected and left alone.
 */
export function withAgentPrefix(name: string): string {
  const trimmed = name.trim();
  const bare = trimmed.startsWith(AGENT_NAME_PREFIX)
    ? trimmed.slice(AGENT_NAME_PREFIX.length).trim()
    : trimmed;
  return bare.length === 0 ? AGENT_NAME_PREFIX : `${AGENT_NAME_PREFIX} ${bare}`;
}
