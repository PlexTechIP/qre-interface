# Week 4 — Team 3 — Technical Brief: Engine Upgrade + Documentation

Your track: **the engine version bump, then documentation.** You have held the
engine for three weeks and you are the only pair who can explain how this system
actually works. Right now the other four developers cannot safely modify the
engine, the IPC boundary, or the Python setup — which means every future rotation
is blocked on you, and a bus factor of two is carrying the riskiest part of the
product.

Four deliverables: the **qdk 1.30.0 upgrade** (your one code-touching task, and
it's first because another team is waiting on it), **architecture
documentation**, a **setup + troubleshooting guide**, and the
**agentic-integration design memo** Microsoft raised at the Jul 24 POC.

> **Documentation is a deliverable, not a write-up of one.** The bar is: a
> developer who has never opened `app/src/main/` can read your docs, get the app
> running on a clean machine, and make a change to the engine without asking you.
> That is testable — and §Testing your own docs below says how you'll test it.

## Deliverable 0 — Upgrade the engine to qdk 1.30.0 (Team 1 is blocked on this)

We are pinned to **1.29.1**. **1.30.0 is the current stable release** (confirmed
on PyPI; `1.30.2.dev0` / `1.30.3.dev0` also exist and are **dev builds we do not
use**, per `docs/tech-stack.md`).

This is yours because you own the engine module and you're the pair writing the
setup guide — documenting a version we're about to abandon would be wasted work.
It is the **one exception** to this week's no-production-code rule.

**Team 1 is building Neutral Atom, Manual Logical Counts, and a contract change
on top of whatever version is pinned.** Land this **before they encode Neutral
Atom's field defaults in the contract** — otherwise they build against 1.29.1
and re-validate everything later. It is the first thing you do this week. If
it's going to take longer than you expect, tell them in the channel as soon as
you know; their week reshapes around it.

What the bump involves:

- `app/src/main/engine/python/requirements.txt` → `qdk[qre]==1.30.0`; venv
  rebuilt. Update `docs/tech-stack.md`'s pin in the same PR.
- **`npm run test:engine` is the regression test.** It exists precisely so an
  engine change is a measurable event rather than a leap of faith. Run it and
  report what changed, if anything.
- **Confirm the model exports Team 1 depends on still exist** — `NeutralAtom`,
  `SurfaceCodeLowMove`, `GSJ24Factory`, `GSJ24CCXFactory`, `MagicUpToClifford`,
  the Yoked codes — and that `QSharpApplication` still accepts a `LogicalCounts`
  as its `entry_expr` (Team 1's Manual Logical Counts feature rides on that).
  Post the confirmation in the channel; they're waiting on it.
- **Check whether 1.30.0 changes any of the four deferred contract questions**
  (`docs/week-3/team-3/contract-decision-proposals.md`) — particularly whether
  Majorana `operationTime` is still inert and whether the sparse-fixture
  `tStatesPerRotation: 5` case now succeeds. If a version bump resolves them for
  free, that's a genuinely valuable finding. **Report it; don't rule on it** —
  the ruling stays with the PMs.
- Also check whether Neutral Atom's parameter defaults in 1.30.0 match the
  **Features and Fields Google Doc**'s QPU Specification tab (link pinned in the
  project channel). If they've drifted, Team 1 needs to know before they encode
  defaults in the contract.

Land it as its **own dependency-standard PR** with PM review — it moves every
team at once (`docs/tech-stack.md`).

**If 1.30.0 breaks something material, stop and post in the channel.** Staying
on 1.29.1 for one more week is an acceptable outcome; a half-migrated engine is
not. Your judgement call, made early and loudly.

## Deliverable 1 — Architecture documentation

Where the code lives is already discoverable. What *isn't* written down is how
the pieces relate, why the boundaries are where they are, and what breaks if you
cross them.

Cover, at minimum:

**The estimation path, end to end.** Form state → `toRunConfig` (stamping
`id`/`createdAt` at Run-click, not while editing) → `useRunFlow` →
`window.estimator.run` → IPC → `QreEngine` → `configToInvocation` → `execute`
(Python subprocess, JSON over stdio) → `outputToResult` → back across IPC →
`ResultsArea`. A reader should be able to point at where a `RunConfig` becomes a
Python invocation and where engine output becomes a `RunResult`.

**The IPC boundary and why it's shaped that way.** Three preload surfaces
(`window.estimator`, `window.store`, `window.files`), `contextIsolation: true`,
`sandbox: true`, `nodeIntegration: false`. Explain the deliberate asymmetry that
`storeHandler.ts` already documents in a comment: the estimator **never rejects**
(failures cross as resolved `RunResult`s with `status: "failed"`), while the
store **does** reject on a duplicate id because records are write-once. Someone
adding a fourth IPC surface should be able to tell which convention to follow.

**The persistence layer.** The `run_records` schema, why the full record is
stored as JSON *and* denormalized into indexed columns, the write-once rule and
how the API makes mutation inexpressible, newest-first ordering, and the
`InMemoryRunStore` ↔ `SqliteRunStore` parity that makes the store swappable.

**The Python engine.** The route decision and why (your week-2 memo has the
reasoning — link it, don't repeat it), `estimate.py`'s JSON-over-stdio contract,
how `qreVersion` is read at runtime, timeout enforcement, subprocess lifecycle
and orphan prevention, and the `QRE_PYTHON_BIN` / `QRE_DB_PATH` overrides.

**The contract, and what it costs to change it.** What's frozen, what the
schemas enforce that TypeScript doesn't, and the PM-owned contract-change
process. Team 1 is drafting a contract change this week — their PR is a live
worked example; reference it once it lands.

**Known issues.** Including the four still-open contract questions from your own
week-3 proposals doc, and the state of benchmark hyperparameters — Team 1 is
serializing them into `RunConfig` this week, but the bundled Q# programs hardcode
their sizes, so the values still don't influence the estimate. Say so plainly;
that gap is exactly the kind of thing a new reader would otherwise trip on.

Put it where developers will find it. Module READMEs already exist in
`app/src/main/` and `app/src/main/engine/` — extend those rather than creating a
parallel universe of docs, and add a project-level architecture doc under `docs/`
that ties them together and links out.

## Deliverable 2 — Setup + troubleshooting guide

The single most valuable thing you can write, because it is the thing every
person hits first and the thing you currently answer in DMs.

Cover both **macOS and Windows**:

- **Node 24.18.0 via nvm**, and *why it's not optional* — the store uses
  `node:sqlite`, which does not exist on Node 22. `.nvmrc` pins it. This has
  already bitten people.
- `npm ci` in `app/` (not the repo root).
- **The Python environment** — `setup_venv.sh` / `setup_venv.ps1`, what they
  install (`qdk[qre]` on Python 3.13 — you're bumping the pin to **1.30.0** in
  Deliverable 0, so read `requirements.txt` rather than hardcoding a version in
  your guide), roughly how long it takes and how
  much disk it needs (the venv is **~428 MB**; people should not be surprised).
- **Running it:** `npm run dev`, and what the dev script actually does (bundles
  `main.cjs` + `preload.cjs`, starts Vite, launches Electron).
- **The three test suites and when to use which:** `npm test` (fast, jsdom +
  node, no Python), `npm run test:engine` (real QDK, needs the venv, serialized),
  `npm run test:all`. Say plainly why the engine suite is separate.
- **Where state lives on disk** — the SQLite DB under the app's user-data dir,
  and `QRE_DB_PATH` to point it elsewhere.

Then a **troubleshooting section** written from real failures, not imagined
ones. Start with the ones you already know: wrong Node version, missing venv,
`resolvePythonBin` pointing at an interpreter that isn't there, a stale
`dist-electron/`. For each: the symptom as it actually appears, and the fix.

## Deliverable 3 — The agentic-integration design memo

Microsoft raised this at the **Jul 24** POC as an explicit **stretch goal**,
with the note that *"developers should remain focused on finishing the core tool
first to avoid distraction."* You are writing the memo precisely so that nobody
starts building it. **No LLM SDKs, no API-token UI, no network calls added to
the app.** The deliverable is a document with a recommendation.

The three things Microsoft asked about:

1. **Natural-language interface** — interacting with the tool by describing what
   you want instead of filling a form.
2. **LLM connectivity** — users connect their own agent (Claude, Codex, Hermes)
   by providing an API token during onboarding.
3. **Automated circuit creation** — the agent generates and uploads the circuit
   from a natural-language prompt, instead of the user writing one.

### This is your design work — the PMs are deliberately not sketching it

We want **your** proposal, not our proposal with your name on it. Nobody here
has designed this yet, and you know the system's seams better than anyone. So
the rest of this section gives you **constraints and questions, not a shape**.
If you conclude the framing below is wrong, say so — a memo that changes our
mind is the best possible outcome.

Two exceptions, because they are facts rather than opinions:

**Fact 1 — the product's stated non-negotiables.** `docs/tech-stack.md`
§Non-negotiables and `docs/project-overview.md` §What we are explicitly NOT
building commit us to:

> **Offline** — no network calls required for core workflows. **No cloud
> service** — no accounts, no server-side execution, no telemetry.

A bring-your-own-LLM integration is networked, token-authenticated, and sends
user content to a third party. Our users are **government and industry
analysts**, for whom "does my configuration leave this machine?" is a
procurement question, not a preference. Your memo has to reckon with this
explicitly. Whether it constrains the feature, reshapes it, or means we
shouldn't build it is **your call to argue**.

**Fact 2 — you have a real codebase to reason from.** You know where the seams
are: the contract, the application variants, the IPC boundary, the validation
layers, Team 1's new upload checker. Ground your proposal in what's actually
there. Concrete beats visionary — a design that names the file it would touch is
worth more than one that names a trend.

### Questions the memo needs to answer

Answer these; get there however you think is right.

- What would each of the three asks actually *do*, concretely, from the user's
  point of view? Walk one through, start to finish.
- Where does the boundary sit between what stays local and what doesn't — and
  what exactly crosses it?
- What sits between something a model generated and something we execute?
- What does the user see and agree to before anything leaves their machine, and
  where would a token live?
- What's the rough cost to build, and what's the smallest version worth
  shipping?
- What should we ask Microsoft, and what would we need from them?
- What could make this a bad idea — and what would have to be true for you to
  change your recommendation?

### Form

Model it on your own `docs/week-2/team-3/route-decision-memo.md`: options,
evidence, a decision, and what would reverse it. That memo made a real call on
real findings, which is exactly the register here.

**A recommendation is required.** "It depends" is not a deliverable. If your
recommendation is *don't build this*, say that and say why — that's a complete
and useful answer, and we'd rather have it in writing now than discover it in
August.

## Testing your own docs

Documentation nobody validated is a guess. Before Wednesday:

- **Run your own setup guide on a clean machine** — a fresh clone, a different
  machine, or a fresh user account. Follow it literally, in order, without using
  anything you know. Every step that fails or needs knowledge you didn't write
  down is a bug in the doc. Fix it and note that you ran it.
- **Get a real reader.** Ask someone from Team 1 or Team 2 to follow the
  architecture doc and explain back where a `RunConfig` becomes a Python
  invocation. If they can't, the doc isn't done — and it's a five-minute test.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| Any production code change **other than the 1.30.0 bump** | Teams 1 and 2 — you write docs, not fixes |
| The Configuration surface, Neutral Atom, hyperparameters | Team 1 |
| Results, History, Comparison, export | Team 2 |
| **Any agentic implementation** — LLM SDKs, token UI, network calls | Nobody, this summer, until the memo is accepted |
| Ruling on the four deferred contract questions | PMs — document them as open, don't resolve them |
| Packaging, installers, signing | Week 5+ |

**If you find a bug while writing.** You will — writing docs is the best bug
detector we have. **Report it in the channel; don't fix it.** A small, obviously
correct fix is fine to *offer*, but your week is the bump plus the
documentation, and a half-refactor in a docs branch is exactly what this
rotation is meant to avoid.

## Quality bar

Docs live in the repo, in Markdown, cross-referenced by relative path — not in a
Google Doc, not in chat. Existing module READMEs are extended, not duplicated.
Every claim is verified against the code as it is on `main` this week, not as you
remember it. The setup guide has been **executed** by one of you on a clean
environment and says so, and it documents the version we actually ship. The
agentic memo carries an explicit recommendation. Apart from the 1.30.0 dependency
PR, no production source files are modified in your branch.
