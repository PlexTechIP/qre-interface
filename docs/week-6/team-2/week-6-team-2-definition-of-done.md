# Week 6 — Team 2 (Melody + Rishabh) — Definition of Done: The MCP Server's Read Half

The bar for **Tue Aug 18 EOD**. Demoed from `main`, not a branch.

> Graded against the **read half**, not against §6's full v1 surface. v1 is ~15–20
> dev-days in the design's own estimate and you have ~4.5–6. A complete read half
> is the deliverable; a partial v1 is not.

## The concurrency spike (§4)

- [ ] **Two processes were actually run against one `run-history.sqlite`**, and
      the behaviour was observed rather than reasoned about
- [ ] **Concurrent reads** measured
- [ ] **A read during a write** measured
- [ ] **Two writers** measured — what the 5 s busy timeout does in practice
- [ ] **§4.1's concurrent-open-with-pending-migration case measured** — two
      processes opening a database one `user_version` behind, at once. The case the
      design explicitly could not establish
- [ ] **All four run under default rollback-journal mode AND under WAL**
- [ ] **A write-up exists** with the numbers. Anything inferred rather than
      measured is labelled as inferred
- [ ] **The spike scripts are committed** and run on a clean checkout

## The scaffold

- [ ] **A non-Electron Node entry point exists** and completes an MCP
      `initialize` handshake over stdio
- [ ] **`@modelcontextprotocol/sdk` is in `app/package.json`** and the lockfile
- [ ] **A build entry exists** alongside main / preload / renderer, following the
      pattern the existing three use
- [ ] **The entry point imports nothing from `electron`.** Grep-checkable, and
      grepped — the result is in the PR
- [ ] **Nothing writes to stdout.** Logging goes to stderr; the import graph was
      checked for stray `console.log`
- [ ] **A real MCP client connected to it**, with a transcript or screenshot in
      the PR. Not "it should work"

## Four read tools

- [ ] **`qre_list_benchmarks`** — backed by the real `benchmarkRegistry.ts`, not a
      fixture and not a copy
- [ ] **`qre_list_runs`** — with pagination and a `RunSummary` type defined in
      `app/src/shared/types.ts`
- [ ] **`qre_get_run`**
- [ ] **`qre_draft_from_run`** — reusing `formState.formStateFromRunConfig`
- [ ] **Every tool name is prefixed** (`qre_*`), per §6
- [ ] **The error convention is consistent** across all four — §3 settles it as
      tool results with `isError: true`, with JSON-RPC protocol errors reserved for
      unknown tools and pre-execution schema failures. If you departed from it, say
      why
- [ ] **§7.3's injection path is addressed** in the PR — user-authored run names
      reaching the agent's context — even if the answer is a ticket
- [ ] **§7.4's data-egress implication is acknowledged** in writing

## No write path exists

> The one way this deliverable fails badly.

- [ ] **No tool calls `QreEngine.run()`**
- [ ] **No tool calls `SqliteRunStore.save()` or `.delete()`**
- [ ] **This was verified by grepping the diff**, not by remembering

## Three open items closed

- [ ] **OPEN-1** — a position on the "never migrates; refuses on version mismatch"
      rule, informed by the spike
- [ ] **OPEN-2** — WAL enabled in `SqliteRunStore`, or a recorded decision not to.
      If enabled, a PM reviewed the change
- [ ] **OPEN-3** — a decision on the `ConfigDraft` shape, **made whether or not
      `qre_validate_config` shipped**
- [ ] **All three appended to `mcp-server-design.md`**, dated and signed, in its
      existing `[VERIFIED]` / `[INFERENCE]` register
- [ ] **§3's preload count corrected** — it says four; there are five
      (`estimator`, `uploads`, `store`, `agent`, `files`)
- [ ] **No second document was created.** One copy of this content, in the file
      that already holds it
- [ ] **The `dataDir.ts` / `main.ts` path bug was filed in the channel**, not
      fixed

## `qre_validate_config` (flexes — cut this first if behind)

- [ ] The seam is `ConfigDraft` → `normalizeFormState` → `toRunConfig` →
      `validateRunConfigSchema`, reusing existing code rather than reimplementing
- [ ] **Nothing is persisted** — it returns `{ valid, errors }` and writes no
      record
- [ ] **Form-level coupling rules are applied**, not just Ajv
- [ ] **No `id` or `createdAt` anywhere in the input type** — a model must not mint
      run identity
- [ ] If it was cut, **that was said in the channel**, not discovered at the
      deadline

## What else you found

> Not a formality. You are the first people to build against this design, which
> makes you the first who can find what it got wrong.

- [ ] **The design's line anchors were checked against `b6a5091`** — they were
      pinned to `ed52411` and the codebase has moved twice since
- [ ] **Anywhere the design is wrong, stale, or insufficient is appended to it**,
      in the same section as the OPEN items, with the same labelling convention
- [ ] **The four read-side risks were considered and written up** — the store in
      an unexpected state, unbounded output from `qre_get_run`, errors as an
      egress path, and self-inflicted DoS against the shared SQLite file
- [ ] **What was safe and in scope was implemented.** What was not was filed
- [ ] **The write-tool line did not move**, whatever was found
- [ ] **If the list is empty, it is argued** — what was checked and what was
      concluded. Silence does not count
- [ ] **The required deliverables were not sacrificed for it**

## Reviews

- [ ] **Every merge was reviewed by the teammate** — this track lands in at least
      four pieces, and each one is a review
- [ ] **The author read their own diff first**, cold, before requesting review
- [ ] **A PM reviewed anything touching `SqliteRunStore`**, including the WAL
      change if it was made
- [ ] **Any agent-assisted review was backed by a human reading the store
      access** — an agent reviewing its own code is not a review

## Testing

- [ ] **`npm run typecheck` clean on the merge commit.** If it went red at any
      point, both projects were run separately
- [ ] **`npm test` green on the merge commit**, not an earlier one
- [ ] **Every tool has a test** exercising its handler against real data — one
      that fails if the handler is pointed at a fixture
- [ ] **The no-Electron property is covered** by a test, or by a grep result
      recorded in the PR
- [ ] **No test was skipped, `.only`'d, or deleted** to make the suite pass

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] **The code reads as though a stranger will open it**, because one will —
      Microsoft wants this repository open-sourced and a new entry point with no
      prior art is the first thing they will look at
- [ ] The PR describes what was built, what was measured, and what was left —
      precisely enough that next week starts from it rather than re-deriving it

## Process

- [ ] **Worked under `week-6/team-2`**, the branch the PMs created off `b6a5091`
- [ ] **Each piece of work had its own `week-6/team-2-<thing>` branch** that PR'd
      into the team branch. Nothing was committed straight to the team branch, and
      every feature branch kept the `week-6/` prefix so CI picked it up
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **Work was merged in pieces** — the spike, the scaffold, and the tools are
      four or more independent merges, not one Tuesday drop
- [ ] **Mid-point gate honored** — by Tue Aug 11, the spike was done or the
      scaffold was handshaking, or an escalation was posted
- [ ] **The hard scope lines held.** No write tool, no `qre_compare_runs`, no
      elicitation, no app-side config action — whatever discovery turned up.
      *(Finding additional work is required; building past these lines is not the
      way to act on it. File it.)*
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Tue Aug 18 EOD**; teammate reviews first, and a PM
      reviews the store access. A PR opened Tuesday evening is not a delivery

## Explicitly NOT required

- **`qre_run_estimate`, or any write tool** — no exceptions, not gated, not behind
  a flag. Building it badly is worse than not building it, because the gate is the
  whole reason it is allowed to exist · **`qre_compare_runs`** — good tool, next
  week · **the elicitation flow, rate limiting, output sanitization, the invocation
  log** — all of §7's machinery · **the Tasks extension** (§6.3) · **the "Copy MCP
  server config" action in the app** (§5.1) — right answer, wrong week · **MCP
  resources** (§13) · **anything under `renderer/`** — this track has no UI ·
  **any LLM interface work** — `renderer/agent/`, `main/agentHandler.ts`,
  `main/credential*`, `main/*DraftGenerator.ts`, `renderer/state/useRunFlow.ts` are
  PM-owned this week · **`.github/`, `main.ts`, `preload.ts`, `setup_venv.sh`, or
  `package.json` scripts** (Team 1) · **the open-source question** (Team 3) ·
  **fixing the `dataDir.ts` path bug** — file it · **a contract-change PR** —
  v1.4.0 stands; `RunSummary` and `ConfigDraft` are TypeScript types, not contract
  changes · **packaging or installers** — deferred to week 7+ · **resolving §9's
  adoption question** — it is Microsoft's to answer.
