# Week 4 — Team 3 (Neil + Jessie) — Checklist: Engine Upgrade + Documentation

**Due: Wednesday Jul 29 EOD** — the single deadline for the week.
**Tue Jul 28** 5–6pm is the checkpoint meeting.
Read first: `../week-4-overview.md`, `week-4-team-3-technical-brief.md`,
your own `docs/week-2/team-3/route-decision-memo.md` (the register to write in),
and `docs/tech-stack.md` §Non-negotiables.
Check items off as you go (edit + commit).

**One code task — the qdk 1.30.0 bump — then documentation.** You are the only
pair who can explain this system; that's the problem you're fixing. **Team 1 is
blocked on the bump**, so it goes first.

**Work split — fill this in at kickoff and commit it:**

- Neil: _______________________
- Jessie: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] **Confirm `main` is current before branching.** The PMs land the week-3
      UI/UX polish merge at kickoff; wait for the go in the channel, then create
      `week-4/team-3` off `main`. It merges to `main` by **Wed Jul 29 EOD**
- [ ] `nvm use`, `npm ci`, `npm run typecheck && npm test` — you need the app
      running to document it truthfully
- [ ] Agree who covers **macOS** and who covers **Windows** for the setup guide
      — the install steps genuinely differ, so both need a real author
- [ ] Agree the split: one of you leads architecture docs, the other leads the
      setup guide; the agentic memo is written together (it needs both heads and
      it's the deliverable Microsoft will read)

## B. Upgrade the engine to qdk 1.30.0 — first

**Team 1 is building Neutral Atom, Manual Logical Counts, and a contract change
on top of whatever version is pinned.** Land it **before they encode Neutral
Atom's defaults in the contract**, so they aren't building against 1.29.1. If
it's going to take longer than you expect, tell them in the channel as soon as
you know — their week reshapes around it.

- [ ] `requirements.txt` → `qdk[qre]==1.30.0`; venv rebuilt; the pin in
      `docs/tech-stack.md` updated in the same PR. **No `.dev` builds**
      (`1.30.2.dev0` etc. exist — we don't use them)
- [ ] **`npm run test:engine` is the regression test** — run it and report what
      changed, if anything
- [ ] **Confirm in the channel, for Team 1:** the model exports still exist
      (`NeutralAtom`, `SurfaceCodeLowMove`, `GSJ24Factory`, `GSJ24CCXFactory`,
      `MagicUpToClifford`, the Yoked codes), and `QSharpApplication` still
      accepts a `LogicalCounts` as its `entry_expr` — their Manual Logical Counts
      feature rides on that
- [ ] **Check whether Neutral Atom's defaults in 1.30.0 match**
      the Features and Fields Google Doc's **QPU Specification** tab — if they've
      drifted, Team 1 needs to know before encoding defaults in the contract
- [ ] **Report whether 1.30.0 changes any of the four deferred contract
      questions** — especially Majorana `operationTime` still being inert and the
      sparse-fixture `tStatesPerRotation: 5` case. **Report only; the ruling is
      the PMs'**
- [ ] Landed as its **own dependency-standard PR** with PM review — it moves
      every team at once (`docs/tech-stack.md`)
- [ ] **If 1.30.0 breaks something material, stop and post in the channel.**
      Staying on 1.29.1 one more week is acceptable; a half-migrated engine is not

## C. Architecture documentation

- [ ] **The estimation path, end to end** — form state → `toRunConfig` → `useRunFlow`
      → IPC → `QreEngine` → `configToInvocation` → `execute` → `outputToResult` →
      `ResultsArea`. A reader can point at where a `RunConfig` becomes a Python
      invocation and where engine output becomes a `RunResult`
- [ ] **The IPC boundary** — the three preload surfaces, the
      `contextIsolation`/`sandbox`/`nodeIntegration` posture, and the deliberate
      asymmetry between them: the **estimator never rejects** (failures cross as
      resolved failed `RunResult`s) while the **store does reject** on duplicate
      ids. Someone adding a fourth surface can tell which convention applies
- [ ] **Persistence** — the `run_records` schema, why the full record is stored
      as JSON *and* denormalized into indexed columns, the write-once rule, and
      the `InMemoryRunStore` ↔ `SqliteRunStore` parity
- [ ] **The Python engine** — the route (link your week-2 memo, don't repeat it),
      `estimate.py`'s JSON-over-stdio contract, runtime `qreVersion` reading,
      timeouts, subprocess lifecycle/orphan prevention, and the `QRE_PYTHON_BIN` /
      `QRE_DB_PATH` overrides
- [ ] **The contract and what it costs to change** — what the schemas enforce
      that TypeScript doesn't, and the PM-owned change process. Reference Team 1's
      contract-change PR as the live worked example once it lands
- [ ] **Known issues** — including the four open contract questions from your own
      week-3 proposals doc, and the state of benchmark hyperparameters: Team 1 is
      serializing them into `RunConfig` this week, but they still don't influence
      the estimate because the Q# programs hardcode their sizes
- [ ] Existing module READMEs (`app/src/main/`, `app/src/main/engine/`) are
      **extended, not duplicated**; a project-level architecture doc under `docs/`
      ties them together and links out

## D. Setup + troubleshooting guide

- [ ] **macOS and Windows both covered** — not one with a note that the other is
      probably similar
- [ ] **Node 24.18.0 via nvm, and why it isn't optional** — `node:sqlite` does
      not exist on Node 22, and this has already bitten people
- [ ] `npm ci` in `app/` (not the repo root)
- [ ] **The Python environment** — `setup_venv.sh` / `setup_venv.ps1`, what they
      install, roughly how long it takes, and that the venv is **~428 MB** so
      nobody is surprised
- [ ] **Running it** — `npm run dev` and what the dev script actually does
- [ ] **The three test suites and when to use which** — `npm test` (fast, no
      Python), `npm run test:engine` (real QDK, needs the venv, serialized),
      `npm run test:all`, and *why* the engine suite is separate
- [ ] **Where state lives on disk** — the SQLite DB under the user-data dir, and
      `QRE_DB_PATH`
- [ ] **A troubleshooting section built from real failures**, each with the
      symptom **as it actually appears** and the fix — start with wrong Node
      version, missing venv, `resolvePythonBin` pointing at nothing, stale
      `dist-electron/`
- [ ] **Slippage flag:** the moment you know a section will not land, post in
      the channel — do not save it for the checkpoint meeting

## E. The agentic-integration design memo

**The design is yours.** The PMs have deliberately not sketched a shape — we
want your proposal, not ours with your name on it. The brief gives you
constraints and questions; the approach is your call, and a memo that changes
our mind is the best outcome available.

- [ ] Covers all three things Microsoft raised: **natural-language interface**,
      **bring-your-own-LLM connectivity** (token at onboarding), and **automated
      circuit creation**
- [ ] **Reckons explicitly with the product's non-negotiables** —
      `docs/tech-stack.md` says no network calls are required for core workflows;
      `docs/project-overview.md` says no accounts and no telemetry; our users are
      government and industry analysts. Whether that constrains the feature,
      reshapes it, or argues against building it is **your call to make and
      defend**
- [ ] **Grounded in the actual codebase** — you know the seams better than
      anyone. A design that names the file it would touch beats one that names a
      trend
- [ ] Answers the memo's open questions (see the technical brief): what each ask
      concretely does for a user, where the local/remote boundary sits, what
      stands between generated output and execution, what the user sees and
      agrees to, rough build cost and smallest shippable version, what to ask
      Microsoft, and what would change your mind
- [ ] **Carries an explicit recommendation.** "It depends" is not a deliverable.
      If the recommendation is *don't build this*, say so and say why
- [ ] **No implementation** — no LLM SDK added, no token UI, no network call
      anywhere in the app

## F. Validate the docs + acceptance prep

- [ ] **You ran your own setup guide on a clean environment** — fresh clone,
      different machine, or fresh user account — following it literally without
      using anything you already know. Every failure fixed; note in the doc that
      it was executed and on what
- [ ] **A real reader tested the architecture doc:** someone from Team 1 or
      Team 2 read it and explained back where a `RunConfig` becomes a Python
      invocation. Record who, and fix whatever they stumbled on
- [ ] Any bugs you found while writing are **reported in the channel, not fixed**
- [ ] Walk through `week-4-team-3-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: 1.30.0 running with `test:engine` green →
      walk the estimation path from the doc → show the clean-environment setup
      run → present the agentic memo's recommendation
- [ ] PR merged to `main` by **Wed Jul 29 EOD** — acceptance from `main`, not a
      branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **The bump is time-critical for Team 1.** If it's going to drag, say so in the
  channel the moment you know — they are building on top of it.
- **If you find a bug, report it — don't fix it.** Writing docs is the best bug
  detector we have, and a half-refactor in a docs branch is exactly what this
  rotation is meant to avoid. Offer the fix; let the owning team take it. The
  1.30.0 PR is the one exception to the no-code rule, not a licence to widen it.
- **If the agentic memo turns into a prototype**, stop. Microsoft was explicit
  that developers finish the core tool first. The memo is the deliverable.
