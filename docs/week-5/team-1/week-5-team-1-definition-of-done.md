# Week 5 — Team 1 (Sun Min + Emma) — Definition of Done: MCP Server Research

The bar for **Wed Aug 5 EOD**. Read from `main`, not a branch.

## The document exists and answers the questions

- [ ] **`docs/week-5/team-1/mcp-server-design.md` is on `main`**, in Markdown,
      cross-referenced by relative path
- [ ] **A Google Doc mirror exists**, stamped with export date and source commit,
      stating at the top that the repo copy is canonical
- [ ] **The document names the commit SHA it was verified against**, and is dated
- [ ] **A start-to-finish walkthrough** of one analyst session — concretely, not
      as a capability list
- [ ] **The v1 tool surface is stated and defended**, split by which tools read
      and which change state
- [ ] **An explicit position on `run_estimate`** — in or out, and what gates it
      if in
- [ ] **An explicit position on `delete`**
- [ ] **Cost to build, in days, split by tool**
- [ ] **What to ask Microsoft**, including a version of "how many target users
      already run an agent" phrased so the answer changes what we build
- [ ] **An explicit recommendation**, plus the conditions that would reverse it.
      "It depends" is not a deliverable; "don't build this" is a complete answer

## The technical questions are actually answered

- [ ] **Two processes, one SQLite file** — what `node:sqlite` does when the app
      and a spawned server both hold `run-history.sqlite`, and whether a
      read-only server changes the answer. A documented "we established X, could
      not establish Y, and here's what it would take" is acceptable; silence is
      not
- [ ] **Path resolution outside Electron** — how a non-Electron process finds the
      database and the venv, written clearly enough that week-6 packaging can act
      on it
- [ ] **Lifecycle** — who spawns the server, when it stops, what the analyst
      configures, what happens when the app isn't running
- [ ] **The security model is translated into this system**, not restated
      generally — what enforcement at the execution layer means for
      `QreEngine.run()`, and what an invocation log records and where
- [ ] **Provenance** — whether the field shipped in v1.4.0 serves an
      MCP-driven run, checked against what actually landed
- [ ] **The "only helps users who already have an agent" objection is stated, not
      argued away**, and appears as a question for Microsoft

## Accuracy

- [ ] **`QreEngine` and `SqliteRunStore` being Electron-free was verified by you**,
      and the document says so
- [ ] **The preload surface count is correct** — the prior research doc says
      three; the document corrects it
- [ ] **Every architectural claim names the file it lives in**
- [ ] **Every external claim links to that tool's own documentation**
- [ ] **Every inference is labelled as an inference** rather than presented as a
      verified fact
- [ ] **A reader from Team 2 or Team 3 has read it** and can say what they'd
      build first; the reader is recorded in the document

## Process

- [ ] Team branch `week-5/team-1` created at kickoff off a current `main`
- [ ] **No file under `app/` was modified.** Grep-checkable
- [ ] Any bug found while researching was **reported in the channel, not fixed**
- [ ] Checklist file updated with boxes checked
- [ ] **Merged to `main` by Wed Aug 5 EOD**; teammate reviews first. A PR opened
      Wednesday evening is not a delivery

## Explicitly NOT required

- **An MCP prototype, spike, or proof of concept** — if the document argues for
  one, that is a week-6 conversation, not this week's work · **any source
  change** · the in-app LLM interface, token storage, or provider adapters
  (Team 2) · the configuration surface, tooltips, or the trace pipeline (Team 3) ·
  **a contract-change PR** — v1.4.0 is a PM deliverable · resolving the
  "do analysts run agents" question yourselves — ask it, don't answer it ·
  packaging or installers (week 6) · a decision on whether we build this at all,
  beyond your recommendation — the call is the PMs' and Microsoft's
