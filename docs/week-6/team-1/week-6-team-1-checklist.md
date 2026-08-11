# Week 6 — Team 1 (Sun Min + Emma) — Checklist: Deployment Readiness

**Due: Tuesday Aug 18 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the mid-point checkpoint.
Read first: `../week-6-overview.md`, `week-6-team-1-technical-brief.md`, then
`.github/workflows/ci.yml`, `app/src/main/main.ts`, and
`app/src/main/preload.ts`.
Check items off as you go (edit + commit).

Your mission in one line: **if week 5 happened again, the pipeline would catch
it.**

**No packaging.** No electron-builder, no installers, no code signing.

**Work split — fill this in at kickoff and commit it:**

- Sun Min: _______________________
- Emma: _______________________
- Shared / pairing on: _______________________

> Weeks 3 and 5 both shipped from one of you. This track splits cleanly —
> §B/§C (CI and dependencies) and §D (security review) are close to independent.

## A. Day 0

- [ ] `git fetch && git switch week-6/team-1` — **the PMs created it off `main`
      at `b6a5091`.** Do not create your own team branch
- [ ] **Do not commit directly to the team branch.** Every piece of work gets its
      own branch off it, named `week-6/team-1-<thing>`, which PRs back in. For this
      track that is roughly:
      `week-6/team-1-ci-triggers` · `week-6/team-1-audit-fix` ·
      `week-6/team-1-security-review` · `week-6/team-1-venv-guard` ·
      `week-6/team-1-setup-guide`.
      **Keep the `week-6/` prefix** — once you fix the CI triggers to match
      `week-6/**`, correctly-named branches get CI and others silently do not
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — **green before you change anything.**
      654 tests across 58 files is the number you should see
- [ ] `npm run build` — confirm it succeeds today, so you know any later break is
      yours
- [ ] Read `.github/workflows/ci.yml` end to end. It is 60 lines and it is the
      subject of your first two days
- [ ] Message Team 3 in the channel. **You review the code; they review the
      history.** Agree the boundary now, and agree that your findings go into
      their document

## B. CI — do the trigger fix first, before anything else

- [ ] **Add the team branches to the CI triggers.** `week-6/**` at minimum;
      consider `week-*/**` so this never expires again. **Remove
      `week-2/team-3`** — it is four weeks stale
- [ ] **Prove it.** Push a deliberately broken commit to a scratch branch and
      watch CI go red. A pipeline nobody has seen fail is a pipeline nobody has
      tested. Paste the failing run's link in the PR
- [ ] **Add a build step.** `npm run build` is never verified in CI today
- [ ] **Lint: wire it up or remove it.** `eslint@10.6.0` and
      `typescript-eslint@8.63.0` are installed with **no config file and no
      `lint` script**. Either add config + script + CI step, or drop both
      dependencies. Leaving it as-is is the one option that is not acceptable
- [ ] **Decide the OS matrix** — full, fast-job-only, or ubuntu-only. Any is fine;
      write the reason in the workflow as a comment
- [ ] **Fix the `typecheck` script's short-circuit** so a local run reports both
      projects, not just the first to fail
- [ ] Keep the `real-engine-checks` job working. It is more than most projects
      have and it would be easy to break while restructuring

## C. Dependencies

- [ ] `npm audit --omit=dev` — we saw **1 high** (`fast-uri`, in the production
      tree, transitively under Ajv). Confirm and record what you see
- [ ] `npm audit` — we saw **5 total** (1 moderate, 4 high), `undici` among them
- [ ] `npm audit fix`, then **verify nothing broke**: `npm run typecheck`,
      `npm test`, `npm run test:engine`, `npm run build`. A transitive bump under
      Ajv can change validation behaviour — the engine suite is what proves it
      did not
- [ ] Anything `audit fix` cannot resolve gets a line in the security review:
      what it is, why it is unresolved, and whether it is reachable from our code
- [ ] **Check Electron's currency.** We are on 43.1.0; find out what the current
      security release is and recommend
- [ ] **Pick a recurrence guard and implement it** — CI audit step, scheduled
      workflow, Dependabot, or a documented manual cadence. Or write down why none
      is right yet

## D. Security review

- [ ] **Verify and record what is already right.** `main.ts:24-29` has
      `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Confirm
      it yourself and say so — a review that only lists problems is not a review
- [ ] **Content Security Policy** — there is none. Not a `<meta>` tag, not a
      header. Decide the policy and implement it. Note the inline theme script in
      `index.html` interacts with a strict `script-src`
- [ ] **Navigation guards** — no `setWindowOpenHandler`, no `will-navigate`
      anywhere in `src/main/`. Deny new windows by default; send external
      navigation to the system browser
- [ ] **Audit all five preload surfaces** — `estimator`, `uploads`, `store`,
      `agent`, `files` (`preload.ts:101-105`). For each channel: what the handler
      receives, whether it validates before acting, and the worst thing a
      compromised renderer could ask for
- [ ] *(While you are there: the MCP design doc says there are four preload
      surfaces. It predates `agent`. **Tell Team 2** — they are building against
      that document)*
- [ ] **The subprocess surface** — `QreEngine` spawns Python with arguments
      derived from a `RunConfig`. Reviewed as a feature, never as a surface
- [ ] **The network surface** — the agent path sends analyst prose to a
      third-party provider. **Read it, do not change it**; those files are PM-owned
      this week
- [ ] Write `docs/week-6/team-1/security-review.md`. **Every finding: severity,
      file and line, and a disposition — fixed, filed, or accepted with a reason**
- [ ] **Fix what is cheap and low-risk. File what is not.** A review that becomes
      a refactor is a review that does not finish

## E. The two day-one blockers

- [ ] **`setup_venv.sh` deletes `.venv` before it checks the Python version.**
      Reorder it so the check comes first. This is a destructive failure in the
      first script a contributor runs
- [ ] Decide whether the **3.13.14 pin** should be exact or a floor, and make the
      failure message say what to do about it
- [ ] **`npm run test:engine` on a fresh checkout** — make it either work or fail
      with a message that explains itself, rather than reporting ~135 instant
      false failures
- [ ] **Execute `setup-and-troubleshooting.md` start to finish on a machine that
      has not built this project.** Write down what broke
- [ ] Fix the guide, and update line 189 — *"Guide executed on clean environment:
      **not yet**"* — to say who ran it, on what, and what it caught. Open since
      week 4

## F. Release hygiene — this is the part that flexes

> Cut this first if you are behind. Say so in the channel rather than silently
> dropping it.

- [ ] `app/package.json` is `version: 0.0.0`, `private: true`, with no `author` or
      `repository`. Recommend what it should be and when the version moves
- [ ] **Do not add a `license` field.** The license choice is Team 3's
      recommendation and the PMs' decision
- [ ] Coordinate with Team 3 so you are not both proposing versioning schemes
- [ ] Write it as a short section in `security-review.md`, not a separate file

## G. What else did you find — required, and not a formality

> Everything in §B–§F is something the PMs found from the outside, in an
> afternoon, without running the app. You will be inside this codebase for two
> weeks. **If nothing turns up that we missed, the most likely explanation is that
> nobody looked.**
>
> Using a coding agent for this is fine — **point it here too.** *"What else in
> this codebase is a security risk or a deployment blocker that is not on this
> list?"* is the prompt nobody runs. Use your own judgment on the answer; you are
> accountable for what lands.

- [ ] **Sweep the error and crash paths** — Python subprocess dies mid-run, DB
      locked, provider request times out, uploaded file disappears between
      selection and read
- [ ] **Sweep what the app writes to disk and where** — run store, credential
      blob, caches, temp files. Check file permissions on each;
      `credentialStore.ts` sets `0o600`, and nothing else has been checked
- [ ] **Sweep what the app logs.** Once the repo is public, a log line is
      something strangers read about. Does anything log a config, a prompt, a
      path, or an error body with data in it?
- [ ] **Sweep the upload path** — `uploads` and `files` touch the filesystem for
      the renderer. Path traversal, symlinks, size limits, a file that is not what
      its extension claims
- [ ] **Sweep for what would embarrass us in a public repo** — named `TODO`s,
      hardcoded paths, commented-out experiments, tests that assert nothing
- [ ] **Write it up as a section in `security-review.md`:** everything you found
      that we did not name, and for each — **fixed, filed, or deliberately left
      with a reason**
- [ ] **Implement what is safe and inside your boundaries. File the rest**
- [ ] **An empty list is acceptable if it is argued.** "We swept X, Y and Z and
      found nothing" is a finding; silence is not
- [ ] **§B–§F come first.** If you are behind, cut the extra *implementation* —
      the list of what you *found* still ships

## H. Reviews — on your own work, every merge

- [ ] **Read your own diff top to bottom before your teammate does**, as though
      someone else wrote it
- [ ] **Your teammate reviews every merge**, not just the last one. This track
      lands in pieces and each piece is a review
- [ ] **A PM reviews the security write-up** and anything security-adjacent you
      changed
- [ ] If you use an agent for a review pass, that is fine and encouraged — **it is
      not a substitute for a human reading the security changes.** The agent that
      wrote a fix is the worst possible judge of whether it is right

## I. Testing — do this last, and do not skip it

> This section is last because it happens last. Week 5 submitted a branch that
> did not compile. Your track is the one that makes that impossible next time —
> which makes it the worst possible track to be sloppy on.

- [ ] `npm run typecheck` — clean. **If it is red, run both projects separately**
      until your own fix lands:
      `npx tsc --noEmit -p tsconfig.json ; npx tsc --noEmit -p tsconfig.node.json`
- [ ] `npm test` — green, **on the commit you are merging**, not an earlier one
- [ ] `npm run test:engine` — green. **You are the team that made this runnable**,
      so you have no excuse for not running it
- [ ] `npm run build` — succeeds
- [ ] **CI is green on the merge commit, and you have seen it go red on purpose
      at least once**
- [ ] Every security fix has a test where a test makes sense — a CSP or a
      navigation guard is assertable
- [ ] No test was skipped, `.only`'d, or deleted to make the suite pass
- [ ] **The acceptance question, answered in the PR:** if week 5's branch —
      3 typecheck errors, 1 failing test, on a team branch — were pushed today,
      would this pipeline catch it? Say yes or no and why
- [ ] Walk through `week-6-team-1-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] **Merged to `main` by Tue Aug 18 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Merge in pieces.** The CI trigger fix should land on `main` in the first day
  or two — every other team benefits from it immediately, and there is no reason
  it should wait for the security review. **A team that merges four times this
  week cannot fail at the deadline.**
- **Mid-point gate — Tue Aug 11.** Come to the checkpoint with CI running on team
  branches. That one change is the week's highest-value item and it is measured in
  minutes, not days.
- **If the security review turns up something serious, escalate immediately** —
  channel, tagged to both PMs, before it goes in the document. Do not sit on it
  until Tuesday.
- **If a finding is in a PM-owned file** (`renderer/agent/`, `agentHandler.ts`,
  `credential*`, `*DraftGenerator.ts`, `useRunFlow.ts`), **report it, do not fix
  it.**
- **Merged, not opened.** A PR opened Tuesday evening is not a delivery.
- **Below the line this week:** packaging, installers, code signing · the LLM
  interface (PMs) · the git history scan and licensing (Team 3) · the MCP server
  (Team 2) · contract changes.
