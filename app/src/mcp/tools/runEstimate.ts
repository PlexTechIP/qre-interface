/**
 * MCP tool: qre_run_estimate
 *
 * The one tool here that acts. It validates a draft, runs the Python engine on
 * the analyst's machine, and appends the record to the dashboard's history —
 * with no click in the dashboard and no prompt at call time. The dashboard
 * becomes a viewer of runs it did not make.
 *
 * Three things carry that weight, and none of them is inside this file:
 *
 *  - registration. The tool exists only when `QRE_MCP_ALLOW_RUNS=1` is in the
 *    server's environment, which is set where the client is configured — a file
 *    the analyst controls and the model cannot reach. See `engineAccess.ts`.
 *  - the budget. One engine at a time, a queue of one, five a minute, fifty a
 *    session. See `runBudget.ts`.
 *  - the store. It appends and cannot migrate, and it is a different object
 *    from the one the read tools hold. See `sqliteAppendRunStore.ts`.
 *
 * What this file owns is the ORDER, and the order is mostly about not wasting
 * two minutes: the draft is checked, the engine is resolved, and the database
 * is opened — all before anything spawns. A run refused after it finished would
 * be the worst of both.
 *
 * And the rule that outranks the rest: a finished estimate is never discarded.
 * If the save fails, the result comes back anyway with `saved: false` and a
 * warning saying why. The analyst's laptop already spent the two minutes.
 */

import { randomUUID } from "node:crypto";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  getEngine,
  getRunGate,
  isShuttingDown,
} from "../engineAccess.js";
import {
  appendInvocation,
  digestArguments,
  type InvocationRecord,
} from "../invocationLog.js";
import { toFrontierSpan, toRunDetail } from "../projections.js";
import {
  getAppendStore,
  isStoreAccessError,
  type StoreAccessErrorCode,
} from "../runStoreAccess.js";
import { isSqliteBusy } from "../../main/sqliteRunStoreWriter.js";
import {
  isToolErrorCode,
  readToolFailure,
  runTool,
  toolFailure,
  toolSuccess,
  type ToolErrorCode,
} from "../toolResult.js";
import { boundErrors, prepareDraft } from "./prepareDraft.js";
import { toRunConfig } from "../../renderer/state/toRunConfig.js";
import { makeRunRecord, type RunProvenance } from "../../shared/types.js";

/**
 * What every run this tool starts is recorded as.
 *
 * `model_assisted` and no `model` key. The server cannot know which model is
 * driving the client — `getClientVersion()` names the CLIENT ("claude-code",
 * "codex"), not the model behind it — and a `model` field holding the client's
 * name would be a plausible-looking wrong answer in a field an analyst later
 * filters on. Absent is honest; the client name goes in the invocation log,
 * where it is labelled as what it is.
 */
export const RUN_PROVENANCE: RunProvenance = { authoredBy: "model_assisted" };

export interface RunEstimateInput {
  /** Untrusted until `prepareDraft` says otherwise — see `ValidateConfigInput`. */
  draft: unknown;
}

export interface RunEstimateContext {
  client: { name: string; version: string } | undefined;
}

type SaveWarning = { code: StoreAccessErrorCode | "SAVE_FAILED"; message: string };

/**
 * Why the run is not in the history, in words the analyst can act on.
 *
 * A store-access failure already carries a message this codebase wrote, so it
 * is forwarded. A busy database gets its own sentence because it is the one
 * case where the right next step is "just run it again" — and the one where
 * losing the result would be most galling, since nothing was wrong with it.
 */
function describeSaveFailure(error: unknown): SaveWarning {
  if (isStoreAccessError(error)) {
    return { code: error.code, message: error.message };
  }
  if (isSqliteBusy(error)) {
    return {
      code: "DB_LOCKED",
      message:
        "The run finished but the dashboard held the database for too long to " +
        "save it. Re-run it, or keep the result from this reply.",
    };
  }
  return {
    code: "SAVE_FAILED",
    message: "The run finished but could not be saved to the dashboard's history.",
  };
}

/**
 * Tool handler for qre_run_estimate.
 *
 * Every exit writes a line to the invocation log, including the refusals —
 * those are the ones History cannot show, and they are what makes a runaway
 * agent visible after the fact.
 */
export async function handleRunEstimate(
  input: RunEstimateInput,
  context: RunEstimateContext,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  const client = context.client ?? null;
  const argsDigest = digestArguments(input.draft);
  let logged = false;
  /**
   * The id of a run that actually reached the engine, if one did.
   *
   * Set the moment identity is minted, so that every later exit — the shutdown
   * refusal, and anything `runTool` has to answer for — can say WHICH run
   * burned the analyst's two minutes. Without it those lines read
   * `runId: null`, which in an audit log is indistinguishable from a call that
   * never started one.
   */
  let executedRunId: string | null = null;

  const log = (
    outcome: Pick<InvocationRecord, "status" | "saved"> &
      Partial<Pick<InvocationRecord, "code" | "runId">>,
  ): void => {
    logged = true;
    appendInvocation({
      ts: new Date().toISOString(),
      tool: "qre_run_estimate",
      client,
      gate: "env_opt_in",
      consent: "not_elicited",
      argsDigest,
      runId: outcome.runId ?? null,
      status: outcome.status,
      ...(outcome.code === undefined ? {} : { code: outcome.code }),
      saved: outcome.saved,
      durationMs: Date.now() - startedAt,
    });
  };

  /** Refuse, and record the refusal under the code the client will see. */
  const refuse = (
    code: ToolErrorCode,
    message: string,
    details?: unknown,
  ): CallToolResult => {
    log({ status: "refused", code, saved: false, runId: executedRunId });
    return toolFailure(code, message, details);
  };

  const result = await runTool(
    "runEstimate",
    { code: "RUN_FAILED", message: "The estimate could not be run." },
    async () => {
      // 1. Would it run? The same walk `qre_validate_config` reports on, so the
      //    two tools cannot disagree — including the round-trip backstop, which
      //    means a draft the pipeline would silently change is refused rather
      //    than run as something else.
      const prepared = prepareDraft(input.draft, { provenance: RUN_PROVENANCE });
      if (!prepared.ok) {
        return refuse(
          "DRAFT_INVALID",
          "The draft would not run; nothing was started. Fix the listed fields " +
            "or check it with qre_validate_config.",
          { errors: boundErrors(prepared.errors) },
        );
      }

      // 2. Is there an interpreter? Before the queue, so a machine with no
      //    Python says so immediately rather than after someone else's run.
      const engine = getEngine();
      if (!engine.ok) return refuse(engine.code, engine.message);

      // 3. Can the history be written at all? A preflight, because spending two
      //    minutes on a database that will refuse the INSERT is the one failure
      //    this tool can see coming. A StoreAccessError thrown here is forwarded
      //    by `runTool` with its own code, which is why it is not caught.
      getAppendStore();

      // 4. Is there room to run? Checked last of the four, because it is the
      //    only one whose answer changes while you wait.
      const admission = getRunGate().admit();
      if (!admission.ok) return refuse(admission.code, admission.message);

      await admission.ready;

      let record;
      try {
        // Inside the `try`, so the slot is released either way.
        //
        // Checked HERE and not only after the run: this call may have been the
        // queued one, handed the slot by a run that `stopEngineForShutdown()`
        // had just killed. Spawning at that point produces a Python child that
        // `killLiveEngineProcesses()` has already swept past — it outlives the
        // two-second shutdown grace, is reparented when the process exits, and
        // runs a full estimate with nothing left to stop it.
        if (isShuttingDown()) {
          return refuse(
            "RUN_FAILED",
            "The server is shutting down; nothing was started.",
          );
        }

        // Identity is minted HERE, by the server, at the moment of execution —
        // never taken from the draft. `prepareDraft`'s config carries a
        // placeholder stamp, so this is the config that actually runs.
        const config = toRunConfig(prepared.normalized, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          provenance: RUN_PROVENANCE,
        });
        if (config === null) {
          // Defensive: `prepareDraft` returned ok, so the same call succeeded
          // moments ago. Refusing beats running something half-assembled.
          return refuse(
            "DRAFT_INVALID",
            "The draft could not be serialised to a run configuration; nothing was started.",
          );
        }

        // From here on the analyst's machine is doing work on this run's
        // behalf, so every later log line can name it.
        executedRunId = config.id;

        const runResult = await engine.engine.run(config);
        record = makeRunRecord(config, runResult, new Date().toISOString());
      } finally {
        admission.release();
      }

      // 5. Did we only finish because the process is being killed? A SIGKILLed
      //    child reports ENGINE_CRASH, and saving that would put a failure in
      //    History that the analyst caused by quitting.
      if (isShuttingDown()) {
        return refuse("RUN_FAILED", "The server is shutting down; the run was stopped.");
      }

      // 6. Save — and keep the result either way. A failed ESTIMATE is a normal
      //    result with `status: "failed"`, saved exactly as the dashboard saves
      //    a failure; a failed SAVE is a warning on a result that still stands.
      let saved = false;
      let warning: SaveWarning | undefined;
      try {
        await getAppendStore().save(record);
        saved = true;
      } catch (error) {
        warning = describeSaveFailure(error);
      }

      log({
        status: record.result.status === "succeeded" ? "succeeded" : "failed",
        runId: record.id,
        saved,
        ...(warning === undefined ? {} : { code: warning.code }),
      });

      // The run IN FULL — the same projection `qre_get_run` returns, plus the
      // span. The first live test came back with qubits and runtime and
      // nothing else, because the summary was all this carried; an agent that
      // has just spent the analyst's two minutes should be able to report the
      // whole result from this reply.
      return toolSuccess({
        run: toRunDetail(record),
        frontier: toFrontierSpan(record.result.frontier),
        saved,
        ...(warning === undefined ? {} : { warning }),
      });
    },
  );

  // `runTool` answers for anything that escaped — a store-access failure from
  // the preflight, or a genuine bug — and those paths have logged nothing.
  if (result.isError === true && !logged) {
    const failure = readToolFailure(result);
    log({
      status: "refused",
      saved: false,
      // Narrowed rather than cast: this code came back out of a serialised
      // result, so it is a string until something checks it.
      ...(isToolErrorCode(failure?.code) ? { code: failure.code } : {}),
      runId: executedRunId,
    });
  }

  return result;
}
