# Week 6 — Team 2 (Melody + Rishabh) — Definition of Done: The MCP Server

The bar for **Wed Aug 12 EOD**. Demoed from `main`, not a branch.

> Graded against **three** deliverables, not against §6's v1 tool surface. v1 is
> ~15–20 dev-days in the design's own estimate and you have ~2. A complete first
> slice is the deliverable; a partial v1 is not.

## The concurrency spike (§4)

- [ ] **Two processes were actually run against one `run-history.sqlite`**, and
      the behaviour was observed rather than reasoned about
- [ ] **Concurrent reads** measured
- [ ] **A read during a write** measured
- [ ] **Two writers** measured — what the 5 s busy timeout does in practice
- [ ] **§4.1's concurrent-open-with-pending-migration case measured** — two
      processes opening a database one `user_version` behind, at once. This is the
      case the design explicitly could not establish
- [ ] **All four run under default rollback-journal mode AND under WAL**
- [ ] **A write-up exists** stating what was observed, with the numbers. Anything
      inferred rather than measured is labelled as inferred
- [ ] **The spike scripts are committed** and run on a clean checkout

## The scaffold and one tool

- [ ] **A non-Electron Node entry point exists** and completes an MCP
      `initialize` handshake over stdio
- [ ] **`@modelcontextprotocol/sdk` is in `app/package.json`** and the lockfile
- [ ] **A build entry exists** alongside main / preload / renderer, following the
      pattern the existing three use
- [ ] **Exactly one tool is served: `qre_list_benchmarks`**, backed by the real
      `app/src/main/engine/benchmarkRegistry.ts` — not a fixture and not a copy
- [ ] **The tool name is prefixed** (`qre_list_benchmarks`, not
      `list_benchmarks`), per §6
- [ ] **The entry point imports nothing from `electron`.** Grep-checkable, and
      grepped — the result is in the PR
- [ ] **Nothing writes to stdout.** Logging goes to stderr; the import graph was
      checked for stray `console.log`
- [ ] **A real MCP client connected to it once** and listed the tool, with a
      transcript or screenshot in the PR. Not "it should work"

## Three open items closed

- [ ] **OPEN-1** — a position on the "never migrates; refuses on version
      mismatch" rule, informed by the spike
- [ ] **OPEN-2** — WAL enabled in `SqliteRunStore`, or a recorded decision not to.
      If enabled, a PM reviewed the change
- [ ] **OPEN-3** — a decision on the `ConfigDraft` shape: raw `FormState` or a
      flattened projection
- [ ] **All three are appended to `mcp-server-design.md`**, dated and signed, in
      its existing `[VERIFIED]` / `[INFERENCE]` register
- [ ] **No second document was created.** One copy of this content, in the file
      that already holds it
- [ ] **The `dataDir.ts` / `main.ts` path bug was filed in the channel**, not
      fixed. `main.ts` is not this team's file this week

## Testing

> The section that did not happen last week, for this team specifically. Every
> line here is cheap.

- [ ] **`npm run typecheck` is clean on the merge commit.** If it went red at any
      point, both projects were run separately — the `&&` short-circuits and an
      error count on a red tree is a floor, not a total
- [ ] **`npm test` is green on the merge commit**, not on an earlier commit
- [ ] **`qre_list_benchmarks` has a test** that exercises the tool handler and
      asserts it returns the real registry's benchmarks — one that fails if the
      handler is pointed at a fixture
- [ ] **The no-Electron property is covered** by a test, or by a grep result
      recorded in the PR
- [ ] **No test was skipped, `.only`'d, or deleted** to make the suite pass

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] The server's error convention is stated somewhere a reader will find it —
      §3 of the design settles it as tool results with `isError: true`, with
      JSON-RPC protocol errors reserved for unknown tools and pre-execution schema
      failures. If you departed from that, say why
- [ ] The PR describes what was built, what was measured, and what was left —
      precisely enough that next week starts from it rather than re-deriving it

## Process

- [ ] **Worked on `week-6/team-2`**, the branch the PMs created off `b6a5091` —
      not a branch of your own, and not one based on week 5
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **Halfway gate honored** — by Tuesday's checkpoint, either the scaffold was
      on track or an escalation was posted. The spike plus the open items plus a
      written account of where the scaffold stuck is a complete week and will be
      graded as one
- [ ] **Scope was not grown.** No second tool, no write tool, no elicitation, no
      "Copy MCP config" action
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Wed Aug 12 EOD**; teammate reviews first, and a PM
      reviews the store access. A PR opened Wednesday evening is not a delivery

## Explicitly NOT required

- **`qre_run_estimate`, or any write tool** — no exceptions; it is 2–3 days on its
  own plus 1–2 for the Tasks extension, and §7.2's gate is the subtlest part of the
  design · **`qre_validate_config`, `qre_list_runs`, `qre_get_run`,
  `qre_draft_from_run`, `qre_compare_runs`** — all next week · **the elicitation
  flow, rate limiting, output sanitization, the invocation log** — all of §7's
  machinery · **the Tasks extension** (§6.3) · **the "Copy MCP server config"
  action in the app** (§5.1) — right answer, wrong week · **MCP resources** (§13) ·
  **anything under `renderer/`** — this track has no UI · **`renderer/agent/`,
  `main/agentHandler.ts`, `main/credential*`** (Team 1) · **the open-source
  question** (Team 3) · **fixing the `dataDir.ts` path bug** — file it · **a
  contract-change PR** — v1.4.0 stands; `RunSummary` and `ConfigDraft` are
  TypeScript types, not contract changes · **packaging or installers** — deferred
  to week 7+ · **resolving §9's adoption question** — it is Microsoft's to answer.
