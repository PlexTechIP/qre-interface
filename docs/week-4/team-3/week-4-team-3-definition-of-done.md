# Week 4 — Team 3 — Definition of Done: Engine Upgrade + Documentation

The bar for **Wed Jul 29 EOD**. Demoed from `main`, not a branch.

## Functional

- [ ] **The app runs on `qdk[qre]==1.30.0`**, landed as its own
      dependency-standard PR with the `docs/tech-stack.md` pin updated, and
      `npm run test:engine` green — **or** a channel post explaining what broke
      and why staying on 1.29.1 was the right call
- [ ] **Team 1 was given what they were waiting on**, in the channel: the model
      exports still exist (`NeutralAtom`, `SurfaceCodeLowMove`, `GSJ24Factory`,
      `GSJ24CCXFactory`, `MagicUpToClifford`, the Yoked codes),
      `QSharpApplication` still accepts a `LogicalCounts` as `entry_expr`, and
      whether Neutral Atom's defaults still match the Features and Fields Google Doc
- [ ] **Whatever 1.30.0 changes about the four deferred contract questions was
      reported** — including "nothing changed" — and **not ruled on**
- [ ] **Architecture documentation exists and is complete** across: the
      end-to-end estimation path, the IPC boundary, persistence, the Python
      engine, the contract-change process, and known issues
- [ ] The IPC section explains the **deliberate asymmetry** — the estimator never
      rejects, the store rejects on duplicate ids — clearly enough that someone
      adding a fourth preload surface knows which convention to follow
- [ ] Known issues include the **four open contract questions** and the state of
      **benchmark hyperparameters** — Team 1 is serializing them into `RunConfig`
      this week, but they still don't influence the estimate, and the doc says so
- [ ] **Setup + troubleshooting guide covers macOS and Windows**, including Node
      24.18.0 (and why it isn't optional), `npm ci` in `app/`, the Python venv
      (~428 MB), `npm run dev`, all three test suites and when to use each, and
      where the database lives
- [ ] The troubleshooting section lists real failures with the **symptom as it
      actually appears** and the fix — at minimum: wrong Node version, missing
      venv, `resolvePythonBin` pointing at nothing, stale `dist-electron/`
- [ ] **The agentic-integration memo covers all three asks** — natural-language
      interface, bring-your-own-LLM connectivity, automated circuit creation
- [ ] The memo **reckons explicitly with the offline / no-accounts /
      no-telemetry non-negotiables** and argues a position on them
- [ ] The proposed design is **yours and is grounded in the codebase** — it names
      the seams and files it would touch, not just the concept
- [ ] The memo answers the open questions in the technical brief and **carries an
      explicit recommendation**, including what would change it

## Validation & correctness

- [ ] **The setup guide was executed on a clean environment** by one of you —
      fresh clone, different machine, or fresh user account — and the doc records
      that it was run and on what
- [ ] **A developer from Team 1 or Team 2 read the architecture doc** and could
      explain back where a `RunConfig` becomes a Python invocation; whatever they
      stumbled on was fixed. Record who tested it
- [ ] Every claim is **verified against `main` as it is this week**, not against
      memory — file paths, script names, and behaviours all check out
- [ ] Any architectural claim the memo makes was **checked against the code**,
      not assumed — if it says a seam exists, you looked
- [ ] Bugs found while writing were **reported in the channel**, with none fixed
      in this branch

## Quality

- [ ] Docs live **in the repo, in Markdown**, cross-referenced by relative path —
      not in a Google Doc, not in chat
- [ ] Existing module READMEs (`app/src/main/`, `app/src/main/engine/`) were
      **extended, not duplicated**; the project-level architecture doc links out
      rather than restating
- [ ] Written in the register of `docs/week-2/team-3/route-decision-memo.md`:
      direct, specific, evidence over opinion
- [ ] **No production source files were modified beyond the 1.30.0 dependency
      PR** — the documentation branch's diff touches documentation only
- [ ] The setup guide documents the version we **actually ship**, read from
      `requirements.txt` rather than hardcoded from memory

## Process

- [ ] Team branch `week-4/team-3` created at kickoff off a current `main`
- [ ] **The 1.30.0 PR landed before Team 1 encoded Neutral Atom's defaults**, or
      its slip was announced in the channel to Team 1 the moment it was known
- [ ] macOS / Windows authorship of the setup guide split between you at kickoff
- [ ] Slippage was flagged in the channel as soon as it was known, not at the
      checkpoint
- [ ] Checklist file updated with boxes checked
- [ ] PR merged to `main` by **Wed Jul 29 EOD**; teammate reviews first, and a PM
      reviews the agentic memo
- [ ] Acceptance walkthrough rehearsed: walk the estimation path from the doc →
      show the clean-environment setup run → present the memo's recommendation

## Explicitly NOT required

- **Any production code change beyond the 1.30.0 dependency PR** — no fixes, no
  refactors, no "while I was in there." Report bugs; let the owning team take
  them · **any agentic
  implementation**: no LLM SDK, no API-token UI, no network call added to the
  app, no prototype · the Configuration surface, Neutral Atom, hyperparameters,
  or the upload checker (Team 1) · Results, History, Comparison, or export
  (Team 2) · **ruling on** the four deferred contract questions — document them
  as open, don't resolve them · packaging, installers, or signing · API-reference
  documentation generated from source (prose that explains *why* beats generated
  signatures) · a video walkthrough — written docs are the deliverable
