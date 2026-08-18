import type { RunConfig, RunResult } from "../../shared/types";

/**
 * The round trip between a conversation and a run.
 *
 * A model-authored configuration used to be a one-way street: the analyst
 * carried a draft into the form, ran it, and whatever came back — a frontier or
 * an engine crash — stayed on the Results page. The one participant who could
 * explain a failure, or suggest what to change about a success, had no idea the
 * run had happened.
 *
 * Two pieces close that loop, and both live here because both are pure string
 * work that is easier to argue about with a test than with a screenshot.
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
 */
export function withAgentPrefix(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(AGENT_NAME_PREFIX)) return trimmed;
  return trimmed.length === 0 ? AGENT_NAME_PREFIX : `${AGENT_NAME_PREFIX} ${trimmed}`;
}

/**
 * What to say to the model about a run it authored.
 *
 * Written into the composer rather than sent, because the analyst is the one
 * having the conversation: they may want to add what they were actually trying
 * to do, or delete the question and ask something else entirely. A message that
 * sent itself would also make a failed run cost a provider request nobody asked
 * for.
 *
 * It carries the outcome and nothing about the configuration. The model
 * proposed that configuration earlier in this same conversation and the
 * transcript replays it on every turn, so restating it here would spend tokens
 * telling the model what it already said — and would go stale the moment the
 * analyst edits a field before running.
 */
export function describeRunForAgent(config: RunConfig, result: RunResult): string {
  if (result.status === "failed") {
    const error = result.error;
    return [
      `The run from this configuration failed.`,
      ``,
      `Run: ${config.name}`,
      error === null
        ? `The engine reported no error detail.`
        : `Error (${error.code}): ${error.message}`,
      ``,
      `What in the configuration would cause that, and what should I change?`,
    ].join("\n");
  }

  return [
    `That configuration ran successfully.`,
    ``,
    `Run: ${config.name}`,
    describeFrontier(result),
    ``,
    `What would you change here?`,
  ].join("\n");
}

/**
 * The frontier as a range rather than as a single row.
 *
 * A Pareto frontier has no "the" answer — picking one row to report would be
 * this function inventing a ranking the engine deliberately did not supply.
 * The span between its cheapest and most expensive point is the thing the
 * frontier actually says, and it is what a follow-up question is usually about.
 */
function describeFrontier(result: RunResult): string {
  const rows = result.frontier ?? [];
  if (rows.length === 0) return "The engine returned no frontier points.";

  const sorted = [...rows].sort(
    (a, b) => a.physicalQubits.value - b.physicalQubits.value,
  );
  const cheapest = sorted[0];
  const largest = sorted[sorted.length - 1];
  if (cheapest === undefined || largest === undefined) {
    return "The engine returned no frontier points.";
  }
  if (rows.length === 1) {
    return `One frontier point: ${cheapest.physicalQubits.display} physical qubits, ${cheapest.runtime.display} runtime.`;
  }
  return `${rows.length} frontier points, from ${cheapest.physicalQubits.display} to ${largest.physicalQubits.display} physical qubits.`;
}
