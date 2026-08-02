# Week 5 — Team 1 (Sun Min + Emma) — Checklist: MCP Server Research

**Due: Wednesday Aug 5 EOD** — the single deadline for the week.
**Tue Aug 4** 5–6pm is the checkpoint meeting.
Read first: `../week-5-overview.md`, `week-5-team-1-technical-brief.md`, then
both agentic documents — [`docs/agentic-integration-research.md`](../../agentic-integration-research.md)
(start with its Currency note, then §6) and
`docs/week-4/team-3/agentic-integration-design-memo.md`.
Check items off as you go (edit + commit).

Your mission in one line: **a design document good enough to build from in week
6 without asking you a question.**

**No code this week.** No branch that touches `app/`.

**Work split — fill this in at kickoff and commit it:**

- Sun Min: _______________________
- Emma: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] Create `week-5/team-1` off `main`. It merges to `main` by **Wed Aug 5 EOD**
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, `npm run dev` — you need
      the app running to reason about it, even though you won't change it
- [ ] Read `docs/agentic-integration-research.md` — **its Currency note first**,
      then §6 (the MCP option) and §12 (the superseded recommendation) — and
      `docs/week-4/team-3/agentic-integration-design-memo.md`
- [ ] **Record the commit SHA you are verifying against**, at the top of your
      document. Every architectural claim is pinned to it

## B. Verify the foundations yourself

- [ ] `grep -rln 'from "electron"' app/src/main/` — confirm `QreEngine` and
      `SqliteRunStore` are Electron-free, and say in the document that you
      checked
- [ ] Count the preload surfaces. The research doc says three; confirm the real
      number and correct it
- [ ] Read `estimatorHandler.ts` and `storeHandler.ts` and understand the
      documented reject-vs-resolve asymmetry — an MCP tool surface has to pick a
      convention too

## C. The question nobody has asked

- [ ] **Two processes, one SQLite file.** Establish what `node:sqlite` actually
      does when the app and a spawned server both hold `run-history.sqlite` —
      journal mode, busy timeout, what a concurrent write does
- [ ] Establish whether a **read-only** server changes that answer
- [ ] **Path resolution outside Electron** — how a non-Electron process finds the
      database and the Python venv when it can't call `app.getPath`. Write it
      clearly enough that week-6 packaging can use it
- [ ] **Lifecycle** — who spawns the server, when it stops, what the analyst
      configures, and what happens when the app isn't running

## D. The design itself

- [ ] **Tool surface, split by trust** — which tools read, which change state,
      and where you drew the v1 line
- [ ] A defended position on `run_estimate`: in or out, and what gates it if in
- [ ] A defended position on `delete`
- [ ] **Security model translated into our system**, not restated in general —
      what "enforced at the execution layer" means when that layer is
      `QreEngine.run()`, and what an invocation log would record and where
- [ ] **Provenance:** look at what v1.4.0 actually shipped and say whether it
      serves an MCP-driven run or whether MCP needs something different
- [ ] **A start-to-finish walkthrough** of one analyst session
- [ ] **Cost to build, in days, split by tool**
- [ ] **What to ask Microsoft** — including a crisp version of "how many of your
      users already run an agent," phrased so a yes or no changes what we build
- [ ] **An explicit recommendation**, and the conditions that would reverse it

## E. Delivery

- [ ] `docs/week-5/team-1/mcp-server-design.md` — canonical, Markdown,
      relative-path cross-references
- [ ] **Google Doc mirror**, stamped with export date and source commit, stating
      at the top that the repo copy is canonical
- [ ] Every external claim linked to that tool's own documentation
- [ ] Every inference labelled as an inference rather than presented as a check
- [ ] **A real reader:** ask someone from Team 2 or Team 3 to read it and tell
      you what they'd build first. If they can't say, it isn't done
- [ ] Walk through `week-5-team-1-definition-of-done.md` — every box checkable
- [ ] **Merged to `main` by Wed Aug 5 EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **If the SQLite question turns out to be genuinely hard**, that is a finding,
  not a failure — write down what you established, what you couldn't, and what it
  would take. A documented unknown beats a confident guess.
- **You will want to write code.** The temptation to "just check" by building a
  small server is the predictable failure mode of this assignment. Check by
  reading and by documentation. If you think a prototype is genuinely necessary
  to answer something, ask in the channel first.
- **Merged, not opened.** A PR opened Wednesday evening is not a delivery.
