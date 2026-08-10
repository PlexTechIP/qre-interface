# Week 6 — Team 2 (Melody + Rishabh) — Checklist: Start Building the MCP Server

**Due: Wednesday Aug 12 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the checkpoint meeting.
Read first: `../week-6-overview.md`, `week-6-team-2-technical-brief.md`, then
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
— **§0, §3, §4, §5.1, §6, §6.1, §14**. It is 1,203 lines; those sections are the
ones you need before you type.
Check items off as you go (edit + commit).

Your mission in one line: **prove the design runs, by making the smallest piece of
it real.**

**Work split — fill this in at kickoff and commit it:**

- Melody: _______________________
- Rishabh: _______________________
- Shared / pairing on: _______________________

> The spike (§B) and the scaffold (§C) are genuinely independent. Splitting them
> one each is the obvious move and it is probably the right one.

## A. Day 0

- [ ] `git fetch && git switch week-6/team-2` — **the PMs created it off `main`
      at `b6a5091`.** Do not create your own; do not branch off week 5
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — **green before you change anything.**
      654 tests across 58 files is the number you should see
- [ ] Read the design sections listed above. **§10's cost table is the one to
      read twice** — v1 is ~15–20 dev-days and you have ~2. The scope below is
      already cut to fit; you do not need to cut it further
- [ ] Confirm the feasibility claim yourself before you build on it:
      `grep -rln 'from "electron"' app/src/main/` — `QreEngine`,
      `SqliteRunStore`, and `benchmarkRegistry` should not be in the result

## B. The concurrency spike — do this first

- [ ] Two Node processes, one temp `run-history.sqlite`, one writing in a loop
      while the other reads and writes. No MCP, no SDK, no Electron
- [ ] Measure **concurrent reads**
- [ ] Measure **a read during a write**
- [ ] Measure **two writers** — what actually happens at the 5 s busy timeout
- [ ] Measure **§4.1's case: two processes opening a database one `user_version`
      behind, at the same time.** The store runs schema DDL at open, so this is
      the one nobody has looked at
- [ ] Run all four **under default rollback-journal mode and under WAL**
- [ ] Write up what you observed — numbers you measured, not numbers you reasoned
      to. **A result that says "this corrupts" is the best outcome of the week**
      and changes the design; say so plainly if you see it
- [ ] Commit the spike scripts. They are evidence, and the next person to ask this
      question should not start from zero

## C. The scaffold, plus exactly one tool

- [ ] Add `@modelcontextprotocol/sdk` to `app/package.json` — it is not there today
- [ ] New build entry alongside main / preload / renderer (§10 suggests
      `vite.mcp.config.ts`); follow the pattern the existing three use
- [ ] The server starts and completes an MCP `initialize` handshake over stdio
- [ ] It serves **exactly one** tool: **`qre_list_benchmarks`**, backed by the
      real `app/src/main/engine/benchmarkRegistry.ts` — not a fixture, not a copy
- [ ] **Prefixed name.** `qre_list_benchmarks`, not `list_benchmarks` (§6)
- [ ] **Nothing writes to stdout.** stdout *is* the protocol channel; one stray
      `console.log` corrupts the stream and looks like a client disconnect. Route
      logging to stderr, and grep the entry point's import graph for `console.log`
      before you call it done
- [ ] **The entry point imports nothing from `electron`** — grep it, and say in
      the PR that you did. This is the thesis of the whole design
- [ ] Connect a real MCP client to it once and see the tool listed. **Screenshot
      or paste the transcript into the PR** — "it should work" is what week 5 was
      made of

## D. Close three open items, in writing

- [ ] **OPEN-1** — the "never migrates; refuses on version mismatch" rule (§4.1).
      Your spike is what says whether this is necessary or merely prudent
- [ ] **OPEN-2** — WAL: enable it in `SqliteRunStore`, or record the decision not
      to. **If the spike says enable it, the one-line change is yours** — say so
      in the PR and get a PM on the review
- [ ] **OPEN-3** — `ConfigDraft` shape: raw `FormState` or a flattened projection
      (§6.1). Every remaining tool schema depends on this
- [ ] Append the answers to `mcp-server-design.md` as a dated, signed section, in
      its existing `[VERIFIED]` / `[INFERENCE]` register. **Do not start a second
      document** — two copies of this content is the exact drift week 5's review
      flagged on this file
- [ ] **File, do not fix:** `main.ts:62` and `dataDir.ts:17` still resolve
      different default DB paths. Post it in the channel as a ticket

## E. Testing — do this last, and do not skip it

> This section is last because it happens last. Week 5's branch for this track
> did not typecheck and failed one of its own tests. Nothing below takes long.

- [ ] `npm run typecheck` — clean. **If it is red, run both projects separately**;
      the `&&` short-circuits and hides every main-process error behind the first
      renderer one:
      `npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json`
- [ ] `npm test` — green, **on the commit you are merging**, not on an earlier one
- [ ] **`qre_list_benchmarks` has a test** that calls the tool handler and asserts
      it returns the real registry's benchmarks — one that fails if the handler is
      pointed at a fixture
- [ ] **A test that the entry point imports no Electron**, if you can express one
      cheaply. If not, the grep result goes in the PR instead
- [ ] The spike scripts run and produce their output on a clean checkout
- [ ] No test was skipped, `.only`'d, or deleted to make the suite pass
- [ ] Walk through `week-6-team-2-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] **Merged to `main` by Wed Aug 12 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Halfway gate — Tue Aug 11, before the checkpoint.** If the scaffold is
  fighting you, **stop and say so.** Deliverable B (the spike) plus D (the three
  open items) plus a written account of where the scaffold got stuck is a
  complete, useful week. Half a scaffold with no spike is not. Raising this on
  Tuesday will be treated as good judgment — week 5's brief offered the same
  hatch to this team and nobody reached for it.
- **If the design document does not say enough to build from, name the section in
  the channel.** It was written to be built from without asking a question. Whether
  that is true is genuinely useful information, and reporting it is not a
  complaint.
- **Do not grow the scope.** Three deliverables. A fourth tool, the elicitation
  flow, or the "Copy MCP config" action all look close and none of them is.
- **Merged, not opened.** A PR opened Wednesday evening is not a delivery. If your
  teammate has not reviewed by Tuesday, say so and a PM will.
- **Below the line this week:** every write tool · the other five read tools ·
  rate limiting, sanitization, the invocation log · the app-side config action ·
  anything under `renderer/` · packaging · contract changes.
