# Week 5 — Team 1 (Sun Min + Emma) — Technical Brief: MCP Server Research

Your track: **answer, in writing, what it would actually mean to expose this app
to an analyst's existing agent through a Model Context Protocol server.**

**No code this week.** Not a prototype, not a spike, not a branch with "just a
small experiment" in it. The deliverable is a design document good enough that
someone could build from it in week 6 without asking you a question. That bar is
the whole assignment.

## Why this question, and why now

Microsoft raised agentic integration at the **Jul 24 POC** as a stretch goal —
three asks: a natural-language interface, LLM connectivity, and automated circuit
creation. Team 3's week-4 memo (`docs/week-4/team-3/agentic-integration-design-memo.md`)
recommended deferring implementation. A follow-up research pass
([`docs/agentic-integration-research.md`](../../agentic-integration-research.md))
argued something more interesting: that the best available option is one **nobody
asked for** — don't put an LLM in our app at all, and instead expose the app's
capabilities as an MCP server so the analyst's *existing* agent drives it. **§6
is your starting point, not your conclusion.**

That claim is plausible and it is not proven. Your week is proving or breaking
it. **Team 2 is building the other half** — the in-app LLM interface — so the two
tracks together answer "should an agent drive us, or should we drive a model."
You are not competing; you are answering different questions.

> Both prior documents are **inputs, not gospel.** The research doc in particular
> was written against `main` as it was in week 4 and has already drifted — see
> § Two things it gets wrong. If it isn't on `main` when you start, ask in the
> channel.

## Two things the existing research gets wrong or leaves open

**It says there are exactly three preload surfaces.** There are four:
`window.estimator`, `window.uploads`, `window.store`, `window.files`. That's a
small error with a large lesson — a design document written against a moving
codebase rots in about a week. **Every architectural claim in your document
carries the commit SHA you verified it against.** Put the SHA at the top and date
it.

**It never asks what happens when two processes open the same database.** This is
the gap that matters most, and § The question nobody has asked is about it.

## What we've already verified, so you don't re-derive it

**The core feasibility claim holds.** `QreEngine` and `SqliteRunStore` import
nothing from Electron — only `main.ts`, `preload.ts`, `estimatorHandler.ts`,
`uploadHandler.ts`, and `storeHandler.ts` do. So a second, non-Electron Node
entry point could reuse both modules unchanged. That is a real property of the
codebase and it is what makes this idea cheap rather than expensive.

Confirm it yourself with `grep -rln 'from "electron"' app/src/main/` and say in
the document that you did.

## The question nobody has asked

An MCP stdio server is a **separate process, spawned by the agent** — not by us,
and not necessarily while our app is running. Everything below follows from that
one fact, and none of it is answered anywhere in the repo today:

**Two writers, one SQLite file.** `SqliteRunStore` opens `run-history.sqlite`
through `node:sqlite`. If the dashboard is open *and* an agent has spawned the
MCP server, two processes hold that database. What happens? Does `node:sqlite`
use WAL? Is there a busy timeout? What does a concurrent write actually do — block,
fail, or corrupt? And if the MCP server only ever reads, does that change the
answer? **This is the single most important technical question in your week.** An
answer of "reads are safe, writes are not, therefore v1 is read-only" is a
perfectly good answer — but it has to be established, not assumed.

**Path resolution outside Electron.** Today the DB path and the Python binary
come from `app.getPath("userData")` and the `QRE_DB_PATH` / `QRE_PYTHON_BIN`
overrides. A process that isn't Electron cannot call `getPath`. So how does a
spawned MCP server find the database and the venv? This is also a **week-6
packaging dependency** — whatever answer you reach constrains how the app is
bundled, so write it down clearly enough that the packaging week can use it.

**Lifecycle.** Who starts the server, when does it stop, and what does the
analyst have to configure in their agent for it to be found at all? What happens
if the app is closed, or was never installed on that machine?

## The tool surface, split by trust

The obvious tools map onto seams that already exist:

| Tool | Backed by |
|---|---|
| `list_benchmarks` | `app/src/main/engine/benchmarkRegistry.ts` |
| `validate_config` | `app/src/renderer/state/schemaValidation.ts` (Ajv + the canonical schema) |
| `list_runs` / `get_run` | `SqliteRunStore` |
| `compare_runs` | `app/src/renderer/history/comparisonModel.ts` |
| `run_estimate` | `QreEngine.run()` |

**They are not equally safe, and the document should say so plainly.** The first
four read. `run_estimate` spawns a Python subprocess and writes a record — it
inverts the app's current trust direction, because today nothing outside the app
can start a run. Where the line falls in v1, and what gates `run_estimate` if it
is included at all, is a call you should make and defend.

`delete` is not on that list on purpose. If you think it should be, argue it.

## The security model — not optional for this product

Our users are government and industry analysts. Tool poisoning and indirect
prompt injection are documented, live attack classes against MCP servers
specifically, and there is public guidance to reason from (OWASP's MCP material,
and NSA/CISA's June 2026 note on AI-driven automation). The consistent advice is
least privilege, explicit user control, access control enforced at the tool
execution layer rather than in a prompt, and logging every invocation with enough
detail to reconstruct whether an action came from the user or from injected text.

Translate that into **our** system rather than restating it. What does "enforced
at the execution layer" mean when the execution layer is `QreEngine.run()`? What
would an invocation log actually record, and where would it live?

## The provenance gap

`RunConfig` is `additionalProperties: false` and `RunRecord` deliberately carries
nothing beyond `config`, `result`, and `savedAt`. So today there is **no way to
record that a run was agent-driven.**

The PMs are landing a provenance field in **v1.4.0 at kickoff** for Team 2's
feature. Look at what shipped and say whether it also serves an MCP-driven run,
or whether MCP needs something different. That is a concrete, checkable finding
and it is exactly the kind of thing that is cheap now and expensive in September.

## The objection you must not argue away

The research doc names it honestly and it is the strongest thing anyone has said
against this idea: **an MCP server only helps users who already run an agent.**
Our stated users are analysts who may never open a terminal. If that's most of
them, this is a power-user side door, not the natural-language interface
Microsoft described.

Do not resolve this by assumption in either direction. It is an **empirical
question for Microsoft**, and the right output is a crisp version of it in your
§ What to ask Microsoft — phrased so that a yes or no actually changes what we
build.

## Questions the document needs to answer

Answer these; get there however you think is right.

- What does an analyst actually *do*, start to finish, in the world where this
  exists? Walk one session through concretely.
- Which tools ship in v1, and what is the argument for the line you drew?
- What happens when the app and the server are both running?
- Where do the database and the Python environment come from, for a process
  Electron didn't start?
- What stands between a tool call and a spawned subprocess?
- What does this cost to build, in days, split by tool?
- What should we ask Microsoft, and what would we need from them?
- What would make this a bad idea — and what would have to be true for you to
  change your recommendation?

## Form and delivery

Model it on `docs/week-2/team-3/route-decision-memo.md`: options, evidence, a
decision, and what would reverse it. That memo made a real call on real findings,
which is the register here. **A recommendation is required** — "it depends" is
not a deliverable, and "don't build this" is a complete and useful answer if
that's where the evidence lands.

Two artifacts, same content:

1. **`docs/week-5/team-1/mcp-server-design.md`** — canonical, in the repo, in
   Markdown, cross-referenced by relative path.
2. **A Google Doc mirror**, stamped with its export date and the source commit,
   stating at the top that the repo copy is canonical.

The repo file is the source of truth. Two live copies is a drift problem that
surfaces in three weeks as two people believing different things.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| **Any source file.** No branch that touches `app/` | Nobody — this is a documentation week |
| An MCP prototype, spike, or proof of concept | Not this week. If your document argues for one, that's a week-6 conversation |
| The in-app LLM interface, token storage, provider adapters | Team 2 |
| The configuration surface, tooltips, the trace pipeline | Team 3 |
| Opening a contract-change PR | PMs — v1.4.0 lands at kickoff |

**If you find a bug while researching, report it in the channel; don't fix it.**
Reading the codebase closely is the best bug detector we have, and a fix in a
documentation branch is exactly what this assignment is shaped to avoid.

## Quality bar

Every architectural claim names the file it lives in and the commit it was
verified against. Every external claim about how MCP or another tool behaves is
linked to that tool's own documentation. Where something is an inference rather
than something you checked, the document says so. The recommendation is explicit,
and so are the conditions that would reverse it.
