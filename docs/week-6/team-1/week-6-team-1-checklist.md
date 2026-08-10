# Week 6 — Team 1 (Sun Min + Emma) — Checklist: Improve the LLM Interface

**Due: Wednesday Aug 12 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the checkpoint meeting.
Read first: `../week-6-overview.md`, `week-6-team-1-technical-brief.md`, then the
code you inherited — `renderer/agent/AgentInterface.tsx` (start at the comment on
line 55), `renderer/agent/draftToFormState.ts`, and `main/agentHandler.ts`.
Also worth ten minutes: `docs/week-5/team-2/week-5-team-2-checklist.md`, which is
the closest thing this track has to a handover note — the unchecked boxes and
their annotations are where week 5 knew it had stopped.
Check items off as you go (edit + commit).

Your mission in one line: **make the LLM interface something you would put in
front of an analyst.**

**Work split — fill this in at kickoff and commit it:**

- Sun Min: _______________________
- Emma: _______________________
- Shared / pairing on: _______________________

> Weeks 3 and 5 both shipped from one of you. Filling this in is not a formality
> this week — if the split stops being true mid-week, change it in a commit.

## A. Day 0

- [ ] `git fetch && git switch week-6/team-1` — **the PMs created it off `main`
      at `b6a5091`.** Do not create your own; do not branch off week 5
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — **green before you change anything.**
      654 tests across 58 files is the number you should see
- [ ] `npm run dev` and use the feature as an analyst would, before reading any
      of its code. Write down the three things that annoyed you most — one of
      them is probably Part B
- [ ] Read `AgentInterface.tsx`, `draftToFormState.ts`, `agentHandler.ts`,
      `credentialStore.ts`. **Budget real time for this.** You did not write it

## B. The defect list — all five, and they are small

- [ ] **Defect 1 · Provenance inside the gate.** Thread provenance through
      `toRunConfig`'s stamp instead of `useRunFlow.ts:89`'s post-hoc mutation, so
      the validated object and the executed object are the same object
- [ ] A test that fails without it: provenance is present in the object handed to
      `validateRunConfigSchema`, not only in the one handed to `execute`
- [ ] **Defect 2 · `demoAgentService`.** Either delete it and inject the fake in
      the tests that need it, or make the fallback explicit and unhittable. Say
      in the PR which you chose and why
- [ ] **Defect 3 · The two `#22a06b`** at `styles.css:365-366` become a token,
      checked in light **and** dark
- [ ] **Defect 4 · Offline, actually run.** No key configured, network off:
      configure → run → History → compare two → export. Record what you saw
- [ ] **Defect 5 · The end-to-end walkthrough, actually performed.** No key → app
      usable → key entered and validated → prose in → draft → edit in the form →
      Run → provenance in the record → key unreadable from the renderer
- [ ] Within Defect 5: a **wrong or expired key** produces a clear message, not a
      crash. `providerErrorBody.ts` exists for this — confirm it works

## C. The improvement — one, chosen and announced

- [ ] **Post your choice in the channel before you build it**, with a sentence on
      why. Candidate 1 (the draft discards the analyst's work / the review step
      cannot show what changed) and Candidate 2 (no way to refine a proposal) are
      in the brief; a third of your own is fine if you argue it first
- [ ] Build it
- [ ] **The week-5 constraints still hold and are not design choices:** key never
      in the renderer · draft `FormState`, never a `RunConfig` · existing
      validation is the only execution gate · the analyst sees the literal payload
      before it is sent · the app is fully usable with no provider configured
- [ ] **Halfway gate — Tue Aug 11, before the checkpoint.** If Part A is not done
      by then, drop Part B and say so in the channel. Part A is the required
      half; the improvement is the part that flexes. Raising this on Tuesday is a
      good outcome and will be treated as one

## D. Do not weaken the drift test

- [ ] `runconfigGenerationCoverage.ts` still asserts set equality against
      `runconfig.schema.json`, with the uniqueness check intact
- [ ] If your change makes it fail, **classify the field** — do not relax the
      assertion. If you find yourself editing the test to make it pass, stop and
      post in the channel

## E. Testing — do this last, and do not skip it

> This section is last because it happens last. Week 5's branch for this track
> did not compile and failed one of its own tests. Nothing below takes long.

- [ ] `npm run typecheck` — clean. **If it is red, run both projects separately**;
      the `&&` short-circuits and hides every main-process error behind the first
      renderer one:
      `npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json`
- [ ] `npm test` — green, **on the commit you are merging**, not on an earlier one
- [ ] Every behaviour you changed has a test that **fails if your change is
      reverted**. Check this by actually reverting one and watching it go red
- [ ] No test was skipped, `.only`'d, or deleted to make the suite pass
- [ ] Keyboard pass on every surface you touched; legible in both themes
- [ ] Walk through `week-6-team-1-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] PR describes the improvement you chose and the reasoning. This was your
      call, so the reasoning belongs in writing
- [ ] **Merged to `main` by Wed Aug 12 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **If the inherited code does not explain itself, say so and name the file.**
  That is a finding about our documentation, not a failure of yours, and it is
  one of the things this rotation exists to measure.
- **Do not grow the scope.** The defect list is closed at five. A sixth thing you
  spot goes in the channel as a note. Four weeks running, the thing that got cut
  at the end was testing and merging — the fix is a smaller list, finished.
- **Merged, not opened.** A PR opened Wednesday evening is not a delivery. If
  your teammate has not reviewed by Tuesday, say so and a PM will.
- **Below the line this week:** MCP and anything under `main/mcp/` (Team 2) · the
  open-source question (Team 3) · packaging · automated circuit creation ·
  consumer OAuth · contract changes.
