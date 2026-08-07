# MCP Server Design — Exposing the QRE Dashboard to an Analyst's Agent

**Team 1 (Sun Min) · Week 5**
**Verified against commit:** `ed52411`
**Date:** 2026-08-02
**Status:** DRAFT — content complete; pending reader sign-off (App. B), Google Doc mirror, and merge to `main`

> The repository copy of this document is **canonical**. The Google Doc mirror is
> a convenience copy and may drift; when the two disagree, this file wins.

**Conventions used in this document**
- Every architectural claim names the file it lives in and is pinned to commit `ed52411`.
- Claims marked **[VERIFIED]** were checked directly in the code at that commit.
- Claims marked **[INFERENCE]** are reasoned conclusions we did *not* execute or prove.
- Claims marked **[EXTERNAL]** describe how MCP or another tool behaves and must
  link to that tool's own documentation.
- **[TODO]** marks a decision or section still owed.

Related documents (relative paths):
- Technical brief: [`week-5-team-1-technical-brief.md`](./week-5-team-1-technical-brief.md)
- Checklist: [`week-5-team-1-checklist.md`](./week-5-team-1-checklist.md)
- Definition of done: [`week-5-team-1-definition-of-done.md`](./week-5-team-1-definition-of-done.md)
- Prior research: [`../../agentic-integration-research.md`](../../agentic-integration-research.md) (§6 = MCP option, §12 = superseded recommendation)
- Team 3 memo: [`../../week-4/team-3/agentic-integration-design-memo.md`](../../week-4/team-3/agentic-integration-design-memo.md)
- Format model: [`../../week-2/team-3/route-decision-memo.md`](../../week-2/team-3/route-decision-memo.md)

---

## 0. Recommendation (write this LAST, put it FIRST)

**Build it.** Ship a single-stage v1 MCP server that exposes the QRE dashboard's
capabilities to an analyst's existing agent. v1 includes **six tools**: four
read-only (`list_benchmarks`, `validate_config`, `list_runs` / `get_run`,
`compare_runs`) and two gated writes (**`run_estimate`** and **`delete`**).

We recommend including the writes from day one rather than phasing them in, because
each has a real analyst workflow: `run_estimate` delivers what Microsoft actually
asked for at the Jul 24 POC (an agent that can *drive* an estimation, not merely
read history), and `delete` covers the everyday "remove the run I just created by
mistake" case. Both risks are manageable in v1:
- **Write concurrency** (§4): the worst realistic failure is a recoverable
  `SQLITE_BUSY`, not corruption, and enabling WAL removes most reader/writer
  friction.
- **Security / trust inversion** (§7): both writes are gated by **explicit per-call
  user approval in the MCP client**, enforced in the tool handler (not in prompt
  text). `delete` is gated harder — declared `destructiveHint`, restricted to a
  single explicit run id (no bulk delete), because its worst case is permanent data
  loss where `run_estimate`'s is only wasted compute (§6).

Why this is a low-regret bet: it is cheap to build (the engine and store are
Electron-free — §3), it does not conflict with Team 2's in-app interface, and the
single largest risk is an *external* question, not a technical one (§9).

**The one condition that would reverse this recommendation:**
- **If Microsoft tells us that few of their target analysts run an AI agent**, this
  becomes a power-user side door rather than the natural-language interface they
  asked for — in which case Team 2's in-app interface should take priority and this
  should be deferred. We do not resolve this ourselves; we ask it (§11). Everything
  else we found argues *for* building.

---

## 1. What an analyst actually does (one session, start to finish)

Meet the analyst: they estimate physical-resource costs for quantum algorithms and
already use Claude Desktop day to day. **Once, weeks ago,** they added the QRE
server to their Claude Desktop MCP config (§5, step 1) — a one-time edit they have
not thought about since.

Today they are scoping a surface-code estimate. The dashboard app happens to be
open on a second monitor, showing their run history.

1. **They open Claude Desktop.** The agent reads its config and spawns the QRE MCP
   server as a child process over stdio (§5, step 2). Nothing visible happens; the
   server is just ready.

2. **"What benchmarks can QRE estimate?"** The agent calls **`list_benchmarks`**
   (read). The server returns the registry; the agent lists them in plain English.
   *No approval prompt — it's a read.*

3. **"Draft a surface-code estimate for the Ising-model benchmark at max error 1e-3,
   and check it's valid before running."** The agent assembles a `RunConfig` and
   calls **`validate_config`** (read, Ajv). The schema flags a missing field; the
   agent fixes it and re-validates until it passes. The analyst sees "config is
   valid" without having touched the form.

4. **"Run it."** The agent calls **`run_estimate`** (write). **Claude Desktop shows
   its tool-approval prompt** — "Allow QRE to run an estimate?" The analyst clicks
   Approve. Only now does the server's handler (the gate, §7) invoke
   `QreEngine.run()`, which spawns the Python subprocess. A `RunRecord` is saved
   with `provenance.authoredBy = "model_assisted"` (§8), because the agent authored
   the config. The agent reports the headline numbers — physical qubits, runtime,
   factory count.

5. **On the second monitor, the dashboard updates.** The new run appears in history.
   This is the one moment two processes touch `run-history.sqlite` at once — the
   server writes, the dashboard reads — and it resolves under the busy timeout / WAL
   story in §4. *(Had the dashboard been closed, the server would be the only writer
   and there'd be no contention at all.)*

6. **"How does that compare to yesterday's surface-code run?"** The agent calls
   **`list_runs`** to find both, then **`compare_runs`** (both reads). It explains
   the delta — "today's config needs ~12% fewer physical qubits because the error
   budget is looser."

7. **Under the hood, every call left an audit line.** The invocation log (§7) now
   has one JSON-Lines entry per call, including that step 4 was `user_approved:
   true` and `channel: "mcp"`.

8. **The analyst closes Claude Desktop.** The agent terminates the server child
   process (§5, step 4). The dashboard keeps running, untouched.

**What the analyst never did:** open a terminal mid-task, paste an API key, or leave
the dashboard. **What they needed once:** the ability and willingness to edit an
agent config (step 0) — which is exactly the population question in §9 and §11.

---

## 2. Background & the claim under test

Microsoft raised agentic integration at the Jul 24 POC (natural-language
interface, LLM connectivity, automated circuit creation). The prior research doc
(§6) proposed exposing this app as an **MCP server** so the analyst's *existing*
agent drives it, rather than embedding an LLM in the app. **Team 2 is building the
opposite bet** (in-app LLM interface); the two tracks together answer "should an
agent drive us, or should we drive a model."

This document proves or breaks the MCP claim. Both prior documents are inputs, not
conclusions.

---

## 3. Feasibility — is the code even shaped for this?

**[VERIFIED · `ed52411`] The core modules are Electron-free.**
`grep -rln 'from "electron"' app/src/main/` returns only:
`main.ts`, `estimatorHandler.ts`, `uploadHandler.ts`, `storeHandler.ts`,
`preload.ts` (plus test/conformance files). **`QreEngine`
(`app/src/main/engine/qreEngine.ts`) and `SqliteRunStore`
(`app/src/main/sqliteRunStore.ts`) import nothing from Electron.** A second,
non-Electron Node entry point can `import { QreEngine }` and
`new SqliteRunStore(dbPath)` and reuse both unchanged. This is what makes the idea
cheap.

**[VERIFIED · `ed52411`] There are four preload surfaces, not three.**
`app/src/main/preload.ts` lines 63–66 call `contextBridge.exposeInMainWorld` for:
`estimator`, `uploads`, `store`, `files`. (The prior research doc says three; it
is wrong.) **Lesson:** a design doc written against a moving codebase rots in a
week — hence the SHA stamp at the top.

**[VERIFIED · `ed52411`] The handler layer is already a thin adapter.**
`storeHandler.ts` / `estimatorHandler.ts` each take an injected module and expose
its methods over Electron IPC. An MCP server is the same shape over a different
transport. Public surfaces we'd wrap:
- `QreEngine.run(config): Promise<RunResult>` (`qreEngine.ts:20`)
- `SqliteRunStore`: `save` / `list` / `get` / `query` / `delete` (`sqliteRunStore.ts:113–185`)

**[VERIFIED · `ed52411`] Handler error-convention asymmetry — the MCP surface must
pick one.** The estimator **never rejects**: `estimatorHandler.ts` catches and
returns a resolved `failedBoundaryResult` with `status: "failed"` (failures as
data). The store **rejects**: `SqliteRunStore.save` throws `RunRecordExistsError`
on a duplicate id.

**Recommendation: unify on MCP tool-result errors (`isError: true`), not JSON-RPC
protocol errors, for anything the agent could act on.** MCP distinguishes two error
channels **[EXTERNAL — MCP spec, Tools › error handling; *verify permalink*]**:
protocol-level JSON-RPC errors (for unknown tool, malformed arguments, server
faults) versus *tool execution* errors returned inside the result with
`isError: true` and a human-readable message. The spec's guidance is that execution
failures the model might recover from belong in the result, not the protocol
channel — so the agent can see what went wrong and retry.

Applied here, this resolves the asymmetry by making the whole surface uniform:
- `run_estimate` already produces failures **as data** (`status: "failed"`); surface
  that as a tool result with `isError: true` — a direct match for
  `estimatorHandler`'s existing convention.
- The store's **rejections** (`RunRecordExistsError`, a failed `delete`) are caught
  at the tool boundary and converted into the same `isError: true` result shape, so
  the agent sees one consistent error model regardless of which module threw.
- Reserve genuine JSON-RPC protocol errors for unknown tools and
  arguments that fail schema validation *before* execution.

---

## 4. The concurrency question — two processes, one SQLite file

*This is the single most important technical question of the week (per the brief).*

An MCP stdio server is a **separate process the agent spawns** — not our app. If
the dashboard is open **and** the agent has spawned the server, two processes hold
`run-history.sqlite`.

**[VERIFIED · `ed52411`] What the code does today:**
- `sqliteRunStore.ts:101` opens the DB as
  `new DatabaseSync(databasePath, { timeout: 5_000 })` → a **5-second busy
  timeout** is set.
- The only pragma set anywhere in `app/src/main/` is `PRAGMA user_version`
  (schema versioning, `sqliteRunStore.ts:237,269`). **WAL is never enabled** →
  the DB runs in SQLite's default rollback-journal mode.

**[EXTERNAL] Expected behaviour in default mode** (sources:
[SQLite file locking](https://www.sqlite.org/lockingv3.html),
[`SQLITE_BUSY` result code](https://www.sqlite.org/rescode.html#busy),
[`node:sqlite` `DatabaseSync` + `timeout`](https://nodejs.org/api/sqlite.html)):
- Two readers: fine.
- Reader + writer: brief mutual blocking during the write; the loser waits up to
  the 5s timeout, then throws `SQLITE_BUSY`.
- Two writers: serialized the same way.
- **Corruption is not the expected failure on a local disk** — SQLite's file
  locking prevents it; corruption risk is associated with network filesystems.
  Realistic failure mode = a recoverable `SQLITE_BUSY`, not data loss.

**[INFERENCE] A read-only server would dissolve most of the problem** and bounds how
bad it can get: with the server reading only, readers coexist and the sole friction
is a brief block while the app writes. We don't ship read-only (we include the gated
writes, §6) — it's the *fallback* posture, not v1 — but it means reads are always
safe and only our two gated, low-frequency, user-approved tools ever write.

**[INFERENCE] WAL is cheap insurance on top.**
[`PRAGMA journal_mode=WAL`](https://www.sqlite.org/wal.html) lets readers and the
writer proceed concurrently, removing even the reader/writer block. Caveats: one
writer still serialized; `-wal`/`-shm` sidecar files appear (packaging/backup
impact); local-disk only.

**Our position:** v1 includes the two gated writes, so we do not rely on read-only
for safety. Instead: (a) writes are infrequent and user-approved, so contention is
rare by construction; (b) the failure mode when it does occur is a recoverable
`SQLITE_BUSY` under the existing 5s timeout, not corruption; (c) we **recommend
enabling WAL** on the run-history DB to remove reader/writer blocking outright. Our
judgment is that concurrent access is low-frequency *and* fails safe, so we scope
and mitigate rather than over-engineer. **[INFERENCE — the frequency claim is
reasoned, not measured; see §12 for the condition that would reverse it.]**

**Established / could not establish** (per the checklist — an honest boundary):
- **Established (by reading code at `ed52411`):** the store opens with a 5s busy
  timeout; no WAL pragma is set anywhere, so the DB is in default rollback-journal
  mode; the only pragma in use is `user_version`.
- **Established (from vendor docs):** default-mode contention resolves as a
  waiting-then-`SQLITE_BUSY` failure, and corruption is not the expected outcome on
  a local disk.
- **Could NOT establish (not tested):** we did **not** run two processes against one
  `run-history.sqlite` and observe the behaviour empirically. The claims above rest
  on SQLite/`node:sqlite` documentation, not on a test we executed.
- **What it would take to close the gap:** a short spike — two Node processes, one
  DB, one writing in a loop while the other reads/writes — measured under both
  default and WAL modes. Per the assignment this is a **week-6** task, not this
  week's; we flag it as the first thing to verify before shipping `run_estimate`.

---

## 5. Path resolution & lifecycle outside Electron

**[VERIFIED · `ed52411`] `app.getPath` is used in exactly one place for the DB:**
`main.ts:56` → `path.join(app.getPath("userData"), "run-history.sqlite")`, with a
`QRE_DB_PATH` env override checked first (`main.ts:52`). A spawned non-Electron
process cannot call `app.getPath`.

**[VERIFIED · `ed52411`] The Python venv is already Electron-independent.**
`engine/pythonBin.ts` resolves the interpreter relative to its own module
location (`import.meta.url` → `python/.venv/bin/python3`), with a `QRE_PYTHON_BIN`
override. No `app.getPath` involved → a non-Electron process finds the venv fine
if the file layout is preserved. **One of the two path problems is effectively
already solved.**

**[VERIFIED · `ed52411`] Gotcha: two default DB locations that disagree.**
- `main.ts` (Electron) → `app.getPath("userData")/run-history.sqlite`
  (macOS: `~/Library/Application Support/<app>/…`).
- `dataDir.ts` `resolveDefaultDatabasePath()` (non-Electron helper) →
  `~/.qre-dashboard/run-history.sqlite`.
A naive MCP server reusing `resolveDefaultDatabasePath()` would open a **different
file** than the running app. **This is a week-6 packaging dependency — write the
chosen answer clearly.**

**Decision: Option C — standardize on the existing `QRE_DB_PATH` seam.** The MCP
server resolves its database path from `QRE_DB_PATH`, and packaging (week 6) sets
that variable so the server and the Electron app point at the identical file. We
chose this over the alternatives because:
- It reuses an override **both** `main.ts:52` and `dataDir.ts:15` already honor —
  no new mechanism, and the two entry points provably agree because they read the
  same variable.
- Option 1 (replicate the OS `userData` convention) is brittle: it must exactly
  match Electron's internal appName logic, and any drift silently reopens the
  wrong-file bug.
- Option 2 (app writes a config file the server reads) is robust but adds a
  handshake and a failure mode (stale/missing config) for no gain over C.

Considered and rejected: 1 (brittle), 2 (unnecessary handshake). **[INFERENCE]** —
we have not yet confirmed how the week-6 installer will set a persistent env var
on each OS; that is a packaging detail to hand off, not a blocker for this design.

**Lifecycle.** The server is a child process of the analyst's agent, not of our
app:
1. **One-time setup:** the analyst adds an entry to their agent's MCP config (e.g.
   Claude Desktop's config file) naming the command that launches our server. This
   manual step is the practical reason the feature only reaches analysts who
   already run an agent (§9). **[EXTERNAL]** MCP client config format:
   [modelcontextprotocol.io — connect to local servers / quickstart](https://modelcontextprotocol.io/quickstart/user)
   *(verify current permalink; also link Claude Desktop's config-file docs).*
2. **Start:** when the agent starts (or first needs a QRE tool), it spawns the
   server as a child process and connects over stdio.
3. **Run:** the server is long-lived for the whole agent session, handling tool
   calls as they arrive.
4. **Stop:** when the analyst closes the agent, the agent terminates the child
   process.
5. **App closed / not installed:** the server is independent of the dashboard, so
   it runs fine when the dashboard is closed — and then it is the *only* process on
   the database, so the concurrency question (§4) does not arise. If the app was
   never installed (no database, no venv), the server **fails fast with a clear
   error** rather than creating an empty database — silently creating one would be
   the wrong-file trap in reverse.

---

## 6. The v1 tool surface, split by trust

| Tool | Backed by | Reads / Writes | In v1? |
|---|---|---|---|
| `list_benchmarks` | `engine/benchmarkRegistry.ts` | Read | **Yes** |
| `validate_config` | `renderer/state/schemaValidation.ts` (Ajv) | Read | **Yes** |
| `list_runs` / `get_run` | `SqliteRunStore` | Read | **Yes** |
| `compare_runs` | `renderer/history/comparisonModel.ts` | Read | **Yes** |
| `run_estimate` | `QreEngine.run()` | **Write** (spawns Python, writes a record) | **Yes — gated** |
| `delete` | `SqliteRunStore.delete` (`sqliteRunStore.ts:181`) | **Write** (destructive) | **Yes — gated, `destructiveHint`** |

**Where we drew the v1 line and why.** The four read tools are safe by
construction — they cannot alter state, so they carry neither the concurrency risk
(§4) nor the trust-inversion risk (§7). They ship without special handling. The two
writes ship **behind gates** rather than being deferred, because each has a real
analyst workflow: `run_estimate` is the constructive write that makes the feature
worth building, and `delete` covers the common "remove the run I just created by
accident" case. The gates differ by severity (below).

**`run_estimate` — IN v1, gated.** It inverts the app's current trust direction:
today nothing outside the app can start a run, and `run_estimate` lets an agent —
possibly acting on text from an untrusted file — spawn a Python subprocess and
write a `RunRecord`. We include it because it delivers Microsoft's actual ask, and
we gate it with **explicit per-call user approval in the MCP client** (the analyst
approves each invocation before the subprocess starts). **[EXTERNAL]** The
client-side approval gate is a real mechanism, not an assumption — see the MCP
spec's tools + user-consent guidance
([modelcontextprotocol.io — specification, Tools](https://modelcontextprotocol.io/specification))
*(verify current permalink; also link Claude Desktop's tool-approval docs).*
Enforcement lives in the tool handler wrapping `QreEngine.run()`
(§7), not in prompt text.

**`delete` — IN v1, gated harder than `run_estimate`.** `SqliteRunStore.delete`
exists (`sqliteRunStore.ts:181`). We include it because there is a real, everyday
workflow: an analyst tells the agent "delete the run I just created by mistake."
Excluding it would force them back to the dashboard for a routine cleanup, undercutting
the point of an agent-driven flow. Including destructive tools is conventional in
MCP servers **[EXTERNAL]** (MCP tool annotations — `destructiveHint` / `readOnlyHint`:
[modelcontextprotocol.io — specification, Server › Tools › Annotations](https://modelcontextprotocol.io/specification); *verify current permalink*) provided they are
declared and gated. Our gate is deliberately stricter than `run_estimate`'s, because
the asymmetry is real — `run_estimate`'s worst case is wasted compute, `delete`'s is
permanent data loss (there is no trash or undo in the store):
- **Declared `destructiveHint: true`** so the client treats it with extra caution.
- **Explicit per-call user approval** (same mechanism as `run_estimate`).
- **Single-id only in v1 — no bulk or filter-based delete.** The tool takes one
  explicit run id; it cannot "delete all runs matching X." This bounds the blast
  radius of a poisoned instruction to exactly one record the user names.
- **[TODO — optional] Surface the run's name/id in the approval prompt** so the
  analyst approves a *specific* deletion, not a blank "allow delete?" — mitigates
  approval fatigue on the one irreversible action.

Enforcement lives in the tool handler wrapping `SqliteRunStore.delete` (§7), not in
prompt text. Bulk deletion (which the dashboard UI offers) is intentionally left out
of v1; if it's wanted later it returns through its own design pass.

---

## 7. Security model, translated into our system

Our users are government/industry analysts; tool poisoning and indirect prompt
injection are live attack classes against MCP servers. Public guidance converges on:
least privilege, explicit user control, access control enforced at the **tool
execution layer** (not in a prompt), and logging every invocation.

**[EXTERNAL] Sources:**
- **OWASP MCP Top 10** — [project page](https://owasp.org/www-project-mcp-top-10/)
  and the [MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html);
  the OWASP GenAI Security Project's
  [practical guide for securely using third-party MCP servers](https://genai.owasp.org/resource/cheatsheet-a-practical-guide-for-securely-using-third-party-mcp-servers-1-0/).
  Tool poisoning (rug-pulls, schema poisoning, tool shadowing) is defined here, and
  the core mitigation — *treat tool return values as data, not instructions* — is
  exactly the trust boundary this document enforces at the handler layer.
- **NSA (June 2026):** *Security Design Considerations for AI-Driven Automation
  Leveraging the Model Context Protocol*
  ([NSA press release](https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/4496698/nsa-releases-security-design-considerations-for-ai-driven-automation-leveraging/)).
  Companion CISA agentic-AI guidance from the same period:
  [CISA — Artificial Intelligence](https://www.cisa.gov/ai).
  *(Author: skim the NSA PDF linked from that page and pull the one or two
  recommendations that most directly back the execution-layer + logging stance
  below, so the citation is specific rather than decorative.)*

Translate, don't restate:
- **"Enforced at the execution layer" for us:** the only tool that can act is
  `run_estimate`, and its gate lives in the **tool handler that wraps
  `QreEngine.run()`** — the same adapter position `estimatorHandler.ts` occupies
  for the Electron IPC path (§3). The handler is where the per-call user-approval
  requirement is enforced and where config is validated (via the same Ajv
  `validate_config` path) before any subprocess spawns. Nothing in the tool's
  *description* or the agent's prompt is trusted to enforce this — a poisoned tool
  description or an injected instruction cannot bypass a check that lives in code
  the agent never sees. The four read tools need no such gate.
- **Invocation log — decided.** Every tool call records
  `{ tool, args, timestamp, result status, whether the call was user-approved, and
  the execution channel (mcp) }`. The last field is where the MCP-vs-in-app
  distinction lives, since provenance deliberately won't carry it (§8).

  Two conventions govern how MCP servers log, and they are different concerns:
  1. **[EXTERNAL]** ([MCP transports spec — stdio](https://modelcontextprotocol.io/specification); *verify permalink*) **The stdio rule: never write to stdout.** On a
     stdio server, stdout *is* the JSON-RPC protocol channel; any stray write
     corrupts the message stream. Operational logging goes to **stderr** or a file,
     never stdout. This is the primary logging convention for stdio MCP servers and
     the easiest one to get wrong.
  2. **[EXTERNAL]** ([MCP logging utility spec](https://modelcontextprotocol.io/specification); *verify permalink*) **Protocol-level logging** exists too: servers may
     send `notifications/message` at standard levels (debug/info/warning/error) that
     the client surfaces to the user. That is for *operational* messages, not a
     durable audit trail.

  **Our audit log is a third thing** — a durable, security-motivated record of who
  invoked what — and MCP does not standardize its format. We put it in a **separate
  append-only file, not the run DB** (keeps the trail readable when the DB is
  contended per §4, and avoids a second writer to `run-history.sqlite`), in
  **JSON Lines (`.log`)** format — one JSON object per line, appendable and
  machine-readable — in the app data dir, path anchored to the same `QRE_DB_PATH`
  logic as §5 ([JSON Lines format](https://jsonlines.org/)).
  **[VERIFIED · `ed52411`]** The app has no file-logging convention of its own to
  reuse: it only uses `console.log` / `console.error` (`harness.ts:69,165`).

---

## 8. Provenance — does v1.4.0 serve an MCP-driven run?

**[VERIFIED · `ed52411`] v1.4.0 has landed on `main`; the provenance field
exists.** `app/src/shared/types.ts:413` defines:
```ts
export const CONFIG_AUTHORS = ["human", "model_assisted"] as const;
export interface RunProvenance {
  authoredBy: ConfigAuthor;      // "human" | "model_assisted"
  model?: string;                // provider/model id, informational; never the prompt
}
```
and `RunConfig.provenance?` (`types.ts:468`) carries it. Absent means human-authored.

**Finding: it partially serves an MCP-driven run, with one deliberate limit.**
- **What it does cover:** the field answers "was a model in the loop when this
  configuration was authored?" For an MCP `run_estimate` where the agent built the
  config, `authoredBy: "model_assisted"` (optionally `model` = the agent's model
  id) is exactly the right value. So the audit question "did a model help make this
  estimate?" is answerable for MCP runs today — **no contract change needed.**
- **What it does NOT cover:** it records config *authorship*, not the *execution
  channel*. It cannot distinguish "a human used Team 2's in-app LLM to draft this"
  from "an external agent drove it over MCP" — both are just `model_assisted`. And
  the schema is deliberately **closed** (`additionalProperties: false`, and the
  type comment states the closure is intentional so a prompt can't be smuggled in),
  so we **cannot** add an "MCP-triggered" marker without a PM-owned contract change.
- **[INFERENCE] This is fine for v1.** The provenance field's job is "was a model
  involved," and MCP runs answer it correctly. The distinct question "which channel
  triggered this run" belongs in the **invocation log (§7)**, not the run record —
  which is where provenance's authors intended audit-of-channel to live anyway. We
  do **not** request a contract change.

**Rule for the server:** set `authoredBy: "model_assisted"` only when the agent
actually authored/modified the config; a verbatim re-run of a human-authored config
stays `"human"` (mirrors the field's own "travels with Rerun" semantics,
`types.ts:465`).

---

## 9. The objection we must not argue away

**An MCP server only helps analysts who already run an agent.** Our stated users
may never open a terminal. If that's most of them, this is a power-user side door,
not the natural-language interface Microsoft described.

We do **not** resolve this by assumption. It is an empirical question for Microsoft
(see §11).

---

## 10. Cost to build, in days, split by tool

**[INFERENCE — engineering estimates, not measured. One dev, assumes the Electron-free
reuse in §3 holds.]**

| Item | Est. days | Notes |
|---|---|---|
| MCP scaffold + `@modelcontextprotocol/sdk` wiring + new build entry (`vite.mcp.config.ts`) | **2–3** | SDK not in `package.json` today; new entry point alongside main/preload/renderer |
| Path resolution — Option C `QRE_DB_PATH` wiring (server side) | **0.5–1** | packaging half of §5 is week-6, not counted here |
| `list_benchmarks` | **0.5** | thin read over `benchmarkRegistry.ts` |
| `validate_config` | **0.5** | reuse the Ajv path |
| `list_runs` / `get_run` | **0.5–1** | direct `SqliteRunStore` reads |
| `compare_runs` | **1** | reuse `comparisonModel.ts` |
| `run_estimate` (gated) | **2–3** | approval-gate wiring + config validation + subprocess handling |
| Invocation logging (§7) | **1** | append-only JSON-Lines `.log` |
| **Total** | **~8–11 days** | dominated by scaffold + `run_estimate`; the four reads are ~2.5 days combined |

---

## 11. What to ask Microsoft

The one question that changes the build:
- **"What fraction of your target analysts already run an AI agent (Claude Desktop,
  Claude Code, or similar) in their workflow?"** — high → MCP is the natural fit and
  §0 stands; low → this is a power-user side door and Team 2's in-app interface
  should take priority (the §0 reversal condition).

Supporting questions — answers shape scope, not go/no-go:
- **Which agent / MCP client do they use?** Determines the config format we document
  (§5 lifecycle) and which client's approval-prompt behavior we rely on for the
  `run_estimate` gate (§7).
- **Can they give us one test analyst who runs an agent?** Needed to validate the
  end-to-end flow in week 6 without guessing.
- **What are the security constraints on the analyst's machine?** Specifically: is an
  agent permitted to spawn local subprocesses (stdio MCP servers) at all? If not,
  `run_estimate` — and possibly the whole approach — is blocked, independent of the
  adoption question.
- **Do they want run-triggering in the first cut, or read-only first?** If they'd
  rather not have an agent start runs initially, we ship the read tools and hold
  `run_estimate` — a cheap scope change, not a redesign.

---

## 12. What would make this a bad idea

The honest failure conditions for the recommendation in §0:

- **Few target analysts run an agent.** The dominant risk (§9). If Microsoft's
  answer to §11 is "hardly any," this is a side door and Team 2's interface should
  come first. This alone reverses the recommendation.
- **Security review rejects an externally-triggerable `run_estimate`**, even behind
  per-call approval — e.g. if the analyst machine's threat model can't tolerate an
  agent spawning subprocesses at all. Fallback: ship read-only (drop
  `run_estimate`), which still delivers the read tools with zero write risk.
- **Packaging can't reliably make the two processes agree on the DB path** (§5). If
  the `QRE_DB_PATH` seam can't be pinned at install time and the OS-convention
  replication proves brittle, the server may silently read a *different* database
  than the running app — a correctness failure worse than an error.
- **The write-concurrency story turns out worse than the docs suggest.** Our §4
  claim (`SQLITE_BUSY`, not corruption; WAL mitigates) rests on SQLite/`node:sqlite`
  documentation, not on a test we ran. If real behavior under two writers is worse,
  `run_estimate` should drop back out of v1 until it's established.

**[TODO — add anything else that surfaces during the write-up.]**

---

## Appendix A — Verification log

Commands run against `ed52411`:
- `grep -rln 'from "electron"' app/src/main/` → confirmed engine/store Electron-free (§3).
- `grep -n "exposeInMainWorld" app/src/main/preload.ts` → 4 surfaces (§3).
- Read `sqliteRunStore.ts` constructor → `timeout: 5_000`, no WAL (§4).
- `grep` pragmas across `app/src/main/` → only `user_version` (§4).
- `grep -rn "getPath" app/src/` → DB path only at `main.ts:56` (§5).
- Read `engine/pythonBin.ts` → venv resolved via `import.meta.url`, Electron-free (§5).
- Read `dataDir.ts` vs `main.ts` → conflicting default DB locations (§5).

## Appendix B — Reader sign-off

**[TODO]** Per the definition of done: a reader from Team 2 or Team 3 has read
this and can say what they'd build first. Record who and when.
- Reader: __________  Date: __________  "Would build first: __________"
