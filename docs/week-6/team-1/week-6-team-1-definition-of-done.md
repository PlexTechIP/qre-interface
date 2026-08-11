# Week 6 — Team 1 (Sun Min + Emma) — Definition of Done: Deployment Readiness

The bar for **Tue Aug 18 EOD**. Verified from `main`, not a branch.

## CI

- [ ] **CI runs on team branches.** `week-6/**` at minimum; `week-2/team-3` is
      gone from the triggers
- [ ] **CI has been seen to fail on purpose.** A deliberately broken commit was
      pushed to a scratch branch, CI went red, and the run is linked in the PR
- [ ] **There is a build step.** `npm run build` runs in CI
- [ ] **Lint is either wired up or removed.** Config + script + CI step, or
      `eslint` and `typescript-eslint` dropped from `devDependencies`. Not left
      installed-and-unrunnable
- [ ] **The OS matrix decision is made and written down** as a comment in the
      workflow — full, fast-job-only, or ubuntu-only with a reason
- [ ] **`npm run typecheck` no longer short-circuits.** A local run reports both
      projects, not only the first to fail
- [ ] **The `real-engine-checks` job still works.** It was not broken while
      restructuring
- [ ] **CI is green on the merge commit**

## Dependencies

- [ ] **`npm audit --omit=dev` is clean**, or every remaining item is explained in
      the security review with a reachability assessment
- [ ] **`npm audit` (including dev) is clean or explained**
- [ ] **The fix was verified, not assumed** — `npm run typecheck`, `npm test`,
      `npm run test:engine`, and `npm run build` all run after the bump. The engine
      suite specifically, because the high-severity item sits under Ajv
- [ ] **Electron's currency was checked** and a recommendation recorded
- [ ] **A recurrence guard exists** — CI audit step, scheduled workflow,
      Dependabot, or a documented cadence — or a written reason why none is right
      yet

## Security review

- [ ] **`docs/week-6/team-1/security-review.md` is on `main`**
- [ ] **Every finding has a severity, a file and line, and a disposition** —
      fixed, filed, or accepted with a reason
- [ ] **What is already correct is recorded**, not just what is wrong —
      `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, verified by
      you at `main.ts:24-29`
- [ ] **A Content Security Policy exists**, or its absence is an explicit accepted
      finding with a reason. The interaction with the inline theme script in
      `index.html` is addressed either way
- [ ] **Navigation guards exist** — `setWindowOpenHandler` and `will-navigate` —
      or their absence is an explicit accepted finding
- [ ] **All five preload surfaces are audited** — `estimator`, `uploads`, `store`,
      `agent`, `files` — each with what the handler receives, whether it validates,
      and the worst case
- [ ] **The Python subprocess surface is assessed**
- [ ] **The provider network surface is assessed** — read, not changed
- [ ] **Cheap fixes were made; expensive ones were filed.** The review did not
      turn into a refactor
- [ ] **Anything found in a PM-owned file was reported, not fixed**
- [ ] **Team 3 has the findings** and can cite them in their document

## Contributor day-one blockers

- [ ] **`setup_venv.sh` checks the Python version before deleting `.venv`.** The
      destructive-failure ordering is fixed
- [ ] **The Python pin decision is made** — exact or floor — and the failure
      message tells the reader what to do
- [ ] **`npm run test:engine` on a fresh checkout** either works or fails with a
      message that explains itself. No more ~135 instant false failures
- [ ] **`setup-and-troubleshooting.md` was executed start to finish** on a machine
      that had not built this project
- [ ] **The guide was fixed** based on what that caught, and **line 189 now names
      who ran it, on what, and what it caught** — open since week 4

## Release hygiene (flexes — cut this first if behind)

- [ ] A versioning recommendation exists for `app/package.json`
      (`version: 0.0.0`, `private: true` today)
- [ ] **No `license` field was added** — that is Team 3's recommendation and the
      PMs' decision
- [ ] It was coordinated with Team 3 so two versioning schemes were not proposed
- [ ] It lives as a section in `security-review.md`, not a separate file

## What else you found

> Not a formality. Everything above is what the PMs found from the outside in an
> afternoon; you were inside the codebase for two weeks.

- [ ] **`security-review.md` has a section listing what you found that we did not
      name**
- [ ] **Each item says what happened to it** — fixed, filed, or deliberately left
      with a reason
- [ ] **The five sweeps were actually done** — error and crash paths, what the app
      writes to disk and with what permissions, what it logs, the upload path, and
      anything that would embarrass us in a public repository
- [ ] **What was safe and in scope was implemented.** What was not was filed
- [ ] **If the list is empty, it is argued** — which areas were swept and what was
      concluded. Silence does not count
- [ ] **The required deliverables were not sacrificed for it.** Discovery did not
      come at the cost of an unfinished pipeline

## Reviews

- [ ] **Every merge was reviewed by the teammate**, not only the final one
- [ ] **The author read their own diff first**, cold, before requesting review
- [ ] **A PM reviewed the security write-up** and the security-adjacent changes
- [ ] **Any agent-assisted review was backed by a human reading the security
      changes** — an agent reviewing its own fix is not a review

## Testing

> Your track is the one that makes week 5 impossible to repeat, which makes it
> the worst possible track to be sloppy on.

- [ ] **`npm run typecheck` clean on the merge commit**
- [ ] **`npm test` green on the merge commit**, not an earlier one
- [ ] **`npm run test:engine` green** — you are the team that made it runnable
- [ ] **`npm run build` succeeds**
- [ ] **Security fixes are tested where a test makes sense** — a CSP and a
      navigation guard are both assertable
- [ ] **No test was skipped, `.only`'d, or deleted** to make the suite pass
- [ ] **The acceptance question is answered in the PR:** if week 5's branch —
      3 typecheck errors and 1 failing test on a team branch — were pushed today,
      would this pipeline catch it? Yes or no, and why

## Process

- [ ] **Worked under `week-6/team-1`**, the branch the PMs created off `b6a5091`
- [ ] **Each piece of work had its own `week-6/team-1-<thing>` branch** that PR'd
      into the team branch. Nothing was committed straight to the team branch, and
      every feature branch kept the `week-6/` prefix so CI picked it up
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **The CI trigger fix landed early**, not bundled into one Tuesday merge.
      Every other team benefits from it the day it lands
- [ ] **Work was merged in pieces** rather than as a single end-of-week drop
- [ ] **Mid-point gate honored** — CI running on team branches by the Tue Aug 11
      checkpoint, or an escalation posted
- [ ] **Anything serious found in the review was escalated immediately**, not held
      until the deadline
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Tue Aug 18 EOD**; teammate reviews first, and a PM
      reviews the security write-up. A PR opened Tuesday evening is not a delivery

## Explicitly NOT required

- **Packaging, installers, or code signing** — no electron-builder, no
  electron-forge, not even a spike. Deferred to week 7+ by decision ·
  **any LLM interface work** — `renderer/agent/`, `main/agentHandler.ts`,
  `main/credential*`, `main/*DraftGenerator.ts`, `renderer/state/useRunFlow.ts`
  are PM-owned this week; read them for the audit, change nothing · **the git
  history secret scan, licensing, community files, or governance** (Team 3) ·
  **adding `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`** —
  Team 3 recommends, PMs decide · **making the repository public or changing any
  repo setting** — not reversible · **the MCP entry point or
  `main/sqliteRunStore.ts`** (Team 2) · **the Results-page `qreVersion`
  regression**, **the History compare/delete selection change**, and **the
  `MEMORY_OPTIMIZATION_SECTION` copy drift** — all three already known from the
  PR #22 review and all three PM items · **a contract-change PR** — v1.4.0 stands ·
  **a full penetration test or a formal threat model** — this is a review of a
  codebase by the people who work on it, not an external assessment · **fixing
  every finding** — filed with a severity and a reason is a complete outcome.
