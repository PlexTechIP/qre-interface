# Week 6 — Team 2 (Melody + Rishabh) — Checklist: The MCP Server's Read Half

**Due: Tuesday Aug 18 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the mid-point checkpoint.
Read first: `../week-6-overview.md`, `week-6-team-2-technical-brief.md`, then
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
— **§0, §3, §4, §5.1, §6, §6.1, §14**. It is 1,203 lines; those are the sections
you need before you type.
Check items off as you go (edit + commit).

Your mission in one line: **prove the design runs, then build its read half.**

**No write tools.** Not one, not gated, not behind a flag.

**Work split — fill this in at kickoff and commit it:**

- Melody: _______________________
- Rishabh: _______________________
- Shared / pairing on: _______________________

> §B (the spike) and §C (the scaffold) are genuinely independent and both are
> day-one work. Splitting them one each is the obvious move and it is the right
> one.

## A. Day 0

- [ ] `git fetch && git switch week-6/team-2` — **the PMs created it off `main`
      at `b6a5091`.** Do not create your own team branch; do not branch off week 5
- [ ] **Do not commit directly to the team branch.** Every piece of work gets its
      own branch off it, named `week-6/team-2-<thing>`, which PRs back in. For this
      track that is roughly:
      `week-6/team-2-concurrency-spike` · `week-6/team-2-mcp-scaffold` ·
      `week-6/team-2-tool-list-benchmarks` · `week-6/team-2-tool-runs` ·
      `week-6/team-2-open-items`.
      **Keep the `week-6/` prefix** — Team 1 is fixing the CI triggers to match
      `week-6/**`, and differently-named branches silently get no CI
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — **green before you change anything.**
      654 tests across 58 files is the number you should see
- [ ] Read the design sections above. **§10's cost table twice** — v1 is ~15–20
      dev-days and you have ~4.5–6. The scope here is already cut to fit
- [ ] Confirm the feasibility claim yourself before building on it:
      `grep -rln 'from "electron"' app/src/main/` — `QreEngine`, `SqliteRunStore`,
      and `benchmarkRegistry` should not appear
- [ ] Note in the channel that you need `app/package.json` for the SDK dependency
      while Team 1 is editing its scripts. Different keys, same file — coordinate,
      don't block

## B. The concurrency spike — first

- [ ] Two Node processes, one temp `run-history.sqlite`, one writing in a loop
      while the other reads and writes. No MCP, no SDK, no Electron
- [ ] Measure **concurrent reads**
- [ ] Measure **a read during a write**
- [ ] Measure **two writers** — what actually happens at the 5 s busy timeout
- [ ] Measure **§4.1's case: two processes opening a database one `user_version`
      behind, at the same time.** The store runs schema DDL at open, so this is the
      one nobody has looked at
- [ ] Run all four **under default rollback-journal mode and under WAL**
- [ ] Write up what you observed — numbers you measured, not numbers you reasoned
      to. **A result that says "this corrupts" is the best outcome of the month**
      and changes the design; say so plainly if you see it
- [ ] Commit the spike scripts. They are evidence, and the next person to ask this
      question should not start from zero
- [ ] **Land this on `main` on its own**, before the scaffold is finished. It is
      independently valuable and there is no reason it should wait

## C. The scaffold

- [ ] Add `@modelcontextprotocol/sdk` to `app/package.json` — not there today
- [ ] New build entry alongside main / preload / renderer (§10 suggests
      `vite.mcp.config.ts`); follow the pattern the existing three use
- [ ] The server starts and completes an MCP `initialize` handshake over stdio
- [ ] **Nothing writes to stdout.** stdout *is* the protocol channel; one stray
      `console.log` corrupts the stream and looks like a client disconnect. Route
      logging to stderr, and grep the entry point's import graph before you call
      it done
- [ ] **The entry point imports nothing from `electron`** — grep it, and say in
      the PR that you did. This is the thesis of the whole design
- [ ] Connect a real MCP client once and see the handshake succeed. **Paste the
      transcript or a screenshot in the PR** — "it should work" is what week 5 was
      made of

## D. Four read tools — land them one at a time

- [ ] **`qre_list_benchmarks`** — backed by the real
      `main/engine/benchmarkRegistry.ts`, not a fixture, not a copy
- [ ] **`qre_list_runs`** — with **pagination** and a new `RunSummary` type in
      `app/src/shared/types.ts`. Returning whole `RunRecord`s floods the agent's
      context
- [ ] **`qre_get_run`**
- [ ] **`qre_draft_from_run`** — direct reuse of `formState.formStateFromRunConfig`
- [ ] **Every tool name is prefixed** — `qre_list_benchmarks`, not
      `list_benchmarks` (§6)
- [ ] **§7.3 — the store is an injection path.** Run names are user-authored free
      text and `qre_list_runs` returns them into the agent's context. Note in the
      PR how you handled it, even if the answer is "we didn't, here's the ticket"
- [ ] **§7.4 — read tools move data off the machine.** Note that you read it and
      what it implies for the analyst setup documentation
- [ ] **Merge each tool as it goes green.** Four merges beats one

## E. Close three open items, in writing

- [ ] **OPEN-1** — the "never migrates; refuses on version mismatch" rule (§4.1),
      informed by your spike
- [ ] **OPEN-2** — WAL: enable it in `SqliteRunStore`, or record the decision not
      to. **If the spike says enable it, the one-line change is yours** — say so in
      the PR and get a PM on the review
- [ ] **OPEN-3** — `ConfigDraft` shape: raw `FormState` or a flattened projection
      (§6.1). **Decide this even if §F gets cut**
- [ ] Append the answers to `mcp-server-design.md` as a dated, signed section in
      its existing `[VERIFIED]` / `[INFERENCE]` register. **Do not start a second
      document**
- [ ] **Correct §3's preload count while you are there.** It says four; there are
      now **five** — `estimator`, `uploads`, `store`, `agent`, `files`
      (`preload.ts:101-105`). `agent` landed after the document was written
- [ ] **File, do not fix:** `main.ts:62` and `dataDir.ts:17` still resolve
      different default DB paths. Post it in the channel as a ticket

## F. What else did you find — required, and not a formality

> The design is 1,203 lines and it is still a document — written by someone
> reading the code, not running a server against it. **You are the first people to
> build this**, which makes you the first people who can find what it got wrong.
> You have one example already: §3 says four preload surfaces, there are five.
>
> Using a coding agent for this is fine — **point it here too.** *"What is wrong
> or missing in this design, and what could go wrong with these handlers that §7
> does not cover?"* is the prompt nobody runs.

**Where the design is wrong or stale:**

- [ ] Check the design's line anchors against `b6a5091` — they were pinned to
      `ed52411` and the codebase has moved twice since
- [ ] Note anywhere §6.1's seam does not survive contact with the actual types
- [ ] Note anything a week-7 implementer would waste a day on
- [ ] **Append these to the design document**, in the same section where you
      answer OPEN-1 through OPEN-3, with the same labelling convention

**Risks in what you are building** — §7 is thorough on write tools and light on
read ones, which is backwards from where you are:

- [ ] **The store in an unexpected state** — a corrupt record, a `schemaVersion`
      from the future, a result JSON that does not parse. Does the server crash,
      return a protocol error, or leak a stack trace with a filesystem path?
- [ ] **Unbounded output** — `qre_get_run` returns a whole `RunRecord` including
      `result.raw`. How big can that get, and what does it do to an agent's
      context?
- [ ] **Errors as an egress path** — a message carrying a database path, a home
      directory, or a config fragment goes straight into the agent's context and
      off the machine (§7.4)
- [ ] **Self-inflicted DoS** — no rate limiting exists (out of scope), but an
      agent looping on `qre_list_runs` interacts with your own §4 findings. Worth
      a sentence even if the fix is next week's
- [ ] **Implement what is safe and inside your boundaries. File the rest.** The
      write-tool line does not move because you found a good argument for one
- [ ] **An empty list is acceptable if argued** — "we checked the anchors and they
      hold, we considered these four failure modes, here is what we concluded."
      Silence is not
- [ ] **§B–§E come first.** If behind, cut the extra *implementation* — the list
      of what you *found* still ships

## G. Reviews — on your own work, every merge

- [ ] **Read your own diff top to bottom before your teammate does**, cold
- [ ] **Your teammate reviews every merge.** This track lands in at least four
      pieces and each one is a review
- [ ] **A PM reviews anything touching `SqliteRunStore`**, including the WAL
      change if you make it
- [ ] If you use an agent for a review pass, that is fine and encouraged — **it
      does not replace a human reading the store access.** The agent that wrote
      the code is the worst possible judge of whether it is right

## H. `qre_validate_config` — this is the part that flexes

> Cut this first if you are behind, and **say so in the channel** rather than
> silently dropping it. OPEN-3's decision is required either way.

- [ ] `ConfigDraft` → `normalizeFormState` → `toRunConfig` →
      `validateRunConfigSchema`, reusing the existing seams
- [ ] **Nothing is persisted.** Validation returns `{ valid, errors }` and writes
      no record
- [ ] It applies the form-level coupling rules, not just Ajv — `deriveQecCode`,
      `isLitinski19AllowedInForm`, `isGsj24AllowedInForm`, `isPrimaryFactoryAllowed`
      (`formState.ts:484`, `:550`, `:560`, `:570`). An agent that passes Ajv alone
      can still produce a config the form would refuse
- [ ] **No `id`, no `createdAt` anywhere in the input type.** A model must not mint
      run identity — `toRunConfig.ts:43` states the invariant

## I. Testing — do this last, and do not skip it

> This section is last because it happens last. Week 5's branch for this track
> did not typecheck and failed one of its own tests. Nothing below takes long.

- [ ] `npm run typecheck` — clean. **If it is red, run both projects separately**
      until Team 1's fix lands:
      `npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json`
- [ ] `npm test` — green, **on the commit you are merging**, not an earlier one
- [ ] **Every tool has a test** that calls its handler and asserts it returns real
      data — one that fails if the handler is pointed at a fixture
- [ ] **A test that the entry point imports no Electron**, if you can express one
      cheaply. If not, the grep result goes in the PR instead
- [ ] The spike scripts run and produce their output on a clean checkout
- [ ] No test was skipped, `.only`'d, or deleted to make the suite pass
- [ ] **Confirm no write path exists.** Grep your own diff for `.save(`,
      `.delete(`, and `QreEngine` — a read-only server that can write is the one
      way this deliverable fails badly
- [ ] Walk through `week-6-team-2-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] **Merged to `main` by Tue Aug 18 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Merge in pieces.** The spike, the scaffold, and each tool are four or more
  independent merges. **A team that merges four times this week cannot fail at
  the deadline** — and week 5 failed at the deadline.
- **Mid-point gate — Tue Aug 11.** Come to the checkpoint with the spike done or
  the scaffold handshaking. "I have read the design" is not a checkpoint state on
  day five of twelve.
- **If the scaffold fights you, say so early.** The spike plus the open items plus
  a written account of where the scaffold stuck is a complete, useful week.
  Raising it Thursday Aug 13 will be treated as good judgment — week 5's brief
  offered this team the same hatch and nobody reached for it.
- **If the design does not say enough to build from, name the section in the
  channel.** It was written to be built from without asking a question. Whether
  that is true is genuinely useful information, and saying so is not a complaint.
- **Merged, not opened.** A PR opened Tuesday evening is not a delivery.
- **Below the line this week:** every write tool · `qre_compare_runs` · rate
  limiting, sanitization, the invocation log, elicitation, the Tasks extension ·
  the app-side "Copy MCP config" action · anything under `renderer/` · the LLM
  interface (PMs) · packaging · contract changes.
