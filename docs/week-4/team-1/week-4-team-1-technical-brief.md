# Week 4 — Team 1 — Technical Brief: Make Every Control Real

Your track: the **Run Configuration surface**. Right now a user can change
settings the engine never sees, and can see options labelled "Private" that the
engine actually supports. By Wednesday, the form matches the spec and every
control in it either drives a real estimate or doesn't exist.

You own this surface end-to-end — the React form, the `RunConfig`
serialization, the engine adapter, and the contract change that connects them.
Team 2 is in `renderer/results/` and `renderer/history/`. **You share no files.**

> ## Read the Features and Fields Google Doc first — it is your spec
>
> Preston's finalized field reference lives in the **Features and Fields Google
> Doc** — *not in this repo*; the link is pinned in the project channel. Five
> tabs: **Application**, **QPU Specification**, **Micro Architecture Settings**,
> **Run Name**, **Notes**. Every application type, every architecture, every
> field, type, constraint, and default. **It is the source of truth for what
> should exist.** `docs/data-contracts.md` remains the source of truth for the
> wire format. Where they disagree, the Google Doc says what to build and the
> contract says how to serialize it — and closing that gap is literally this
> week's work.
>
> This brief does **not** restate the field tables. Read them there. What follows
> is the gap analysis, the sequencing, and the decisions already made for you.

## 0. The engine is moving to qdk 1.30.0 — Team 3 owns it

We are pinned to **1.29.1**; **1.30.0 is the current stable**. **Team 3 is
landing that bump** as a separate dependency-standard PR, early in the week. You
don't do it — but your week rides on it, so:

- **Build on 1.30.0, not 1.29.1.** Pull their PR before you encode Neutral Atom
  field defaults in the contract. Rebuilding the venv mid-week is expected.
- **They owe you three answers in the channel**, and you should chase them
  rather than wait: that the model exports still exist
  (`NeutralAtom`, `SurfaceCodeLowMove`, `GSJ24Factory`, `GSJ24CCXFactory`,
  `MagicUpToClifford`, the Yoked codes); that `QSharpApplication` still accepts a
  `LogicalCounts` as its `entry_expr` (§2 rides on this); and whether Neutral
  Atom's defaults in 1.30.0 still match the Google Doc's **QPU Specification**
  tab.
- **If the bump slips or gets reverted**, keep going on 1.29.1 and say so in
  your PR. Don't stall — everything below works on either version, and the pin
  is one line.

## 1. The audit — what's actually wrong

### Options greyed out as "Private" that the engine supports

`qdk/qre/models/__init__.py` exports `GateBased`, `Majorana`, **`NeutralAtom`**,
`SurfaceCode`, **`SurfaceCodeLowMove`**, `ThreeAux`, both **Yoked** codes,
`RoundBasedFactory`, `Litinski19Factory`, **`GSJ24Factory`**,
**`GSJ24CCXFactory`**, **`MagicUpToClifford`**.

`MicroArchitectureSection.tsx` and `ArchitectureSection.tsx` currently render
most of those as disabled or "Private · not available." The labels are wrong.

Genuinely absent from the package — **delete these**: **Trapped Ion**,
**Dynamic Memory Compute**, and the four private QEC codes (`beryllium`,
`phenom_beryllium`, `aft_surface`, `bicycle`). An option the engine can't run
has no business in the form. Delete, don't grey out.

### Controls wired to nothing

`MicroArchitectureSection.tsx` lines 92–93 hold Secondary Factory and Memory
Optimization in local `useState`. Never serialized, never sent, discarded on
unmount.

### Hyperparameters validate but never reach the config

This is Preston's note, and his framing is the accurate one: **the
hyperparameters are there — they're just not part of the JSON config.**
`constants/hyperparameters.ts` defines the schemas, bounds, and cross-field
rules; `validateHyperparams` enforces them; the values live in `FormState`. Then
`toRunConfig.ts:53` drops them, by design, pending a contract field.

So the job is the one the Google Doc's **Notes** tab names: *"Hyperparameters are
serialized and validated, but are not part of `RunConfig`. Need to update backend
configuration."* Get them into the contract and through the adapter.

**Be honest about what that buys.** Serializing them makes the saved record
complete and reproducible — History, Comparison, Rerun, and export all start
telling the truth about what was configured. It does **not**, on its own, change
any estimate: the bundled Q# benchmarks hardcode their sizes
(`ShorsFactoring.Run()` uses `Qubit[10]`), so the engine still ignores them.
Making a benchmark's hyperparameters actually move the numbers needs a
per-benchmark analytic mapping, which is domain work and **not** in this week.
Say plainly in the UI which is which — a field that's recorded but not yet
influential must not look like one that is.

### The form is behind the spec

Read the Google Doc and diff it against the app yourself. The deltas that matter
most:

- **Application Type** is a three-way choice — Benchmarks, Saved Programs, and
  **Manual Logical Counts** (§2 below). The third doesn't exist yet.
- **Magic State Factory is multi-select**, not single-select, and Litinski19 /
  GSJ24 availability depends on the architecture *and* its error rates.
- **Neutral Atom** has its full field table with defaults, including the two
  Surface Code time factors.
- **QEC pairing** extends to Low-Move ← Neutral Atom.
- **Saved Programs** accepts **zip files and folders**, not just single files.
- **Cirq** appears as a fourth input class alongside Q#, OpenQASM, and QIR.

The last two are real scope. See §Priority order — they're below the line, and
that's deliberate.

## 2. Manual Logical Counts — a new application type

This is Preston's feature, specified in the Google Doc's **Application** tab:
the user enters logical resource counts **directly**, instead of choosing a
benchmark or uploading a program. Seven fields: Number of Qubits, T Count,
Rotation Count, Rotation Depth, CCZ Count, CCiX Count, Measurement Count.

**It belongs in the Application section** (confirmed with Preston) — it answers
"what am I estimating," not "on what hardware." Contract-wise that makes it a
third `application.type` alongside `benchmark` and `uploaded`.

**The engine path is already verified — the PMs ran it before publishing this
brief.** `QSharpApplication` accepts `str | Callable | LogicalCounts` as its
`entry_expr` (`qdk/qre/application/_qsharp.py`); given a `LogicalCounts`,
`trace_from_entry_expr` (`qdk/qre/interop/_qsharp.py:73-77`) skips Q#
compilation entirely and builds the `Trace` straight from the counts. Those
seven form fields map **one-to-one** onto `LogicalCounts`' keys — `numQubits`,
`tCount`, `rotationCount`, `rotationDepth`, `cczCount`, `ccixCount`,
`measurementCount`.

Verified on 1.29.1 through our exact pipeline shape (same `GateBased` arguments,
same `isa_query`, same `trace_query`, same `max_error` as `estimate.py`):

```
numQubits=100, tCount=20,000  →  24,010 qubits, 224,350,000 ns
numQubits=400, tCount=900,000 →  93,026 qubits, 2,470,090,000 ns
```

Real, input-sensitive estimates with no program at all. Reproduce it yourself
first — it's a ten-line script — then build the feature on it. Re-confirm it
holds on 1.30.0 as part of §0.

In the adapter, this is a branch in `build_application` (`estimate.py`)
constructing `QSharpApplication(entry_expr=LogicalCounts({...}))`. **We are not
adding `qdk.estimator` as a second engine** — that's the legacy generation with
no Neutral Atom, no PSSPC/Lattice Surgery, and no GSJ24, and `LogicalCounts` is
already reachable from `qdk.qre`. That decision is made; don't reopen it.

## 3. The contract change — you draft it, PMs merge it

Everything downstream waits on this, so **open one PR early**. Expect it to
carry: the Neutral Atom architecture variant with its fields, the Low-Move QEC
value and the extended architecture→QEC derivation, the **manual-counts
application variant**, magic-state factory as a **multi-select set**, the
secondary-factory set, memory optimization, and the **hyperparameters** field.

Rules: schema **and** `types.ts` **and** the version bump in one commit; the
architecture→QEC pairing encoded in the schema the way the existing pairing rule
is; tests proving a config using each new value validates. **Do not** bundle the
four deferred week-3 contract questions into it.

## 4. Coupling and availability rules

From the Google Doc's **Micro Architecture Settings** tab — read the constraint
tables there, and note these three in particular:

- **GSJ24 CCX Factory ↔ CCX Magic States are bound.** Turning either on turns
  the other on; turning either off turns the other off.
- **Secondary Factory is multi-select** — Magic Up-to-Clifford *and* GSJ24 CCX
  can both be active.
- **Magic Up-to-Clifford is incompatible with Majorana** — **already
  implemented** (`MicroArchitectureSection.tsx:207`). Verify it survives your
  refactor; don't rebuild it.

Litinski19's current rule in the app (GateBased, error rate ≤ 1e-3) is narrower
than the spec, which also allows Neutral Atom under its own error-rate
conditions. Bring it in line.

## 5. The file upload checker

Uploads currently accept whatever path arrives and hand it to the engine. Add a
pre-flight check: the file exists, is readable, the extension matches the
declared format, and the content is plausible for that format. A bad file should
produce a clear message in the form, not a `COMPILE_ERROR` three seconds later.
There's a deliberately-bad sample at
`app/src/main/engine/uploads/bad-sample.qasm`.

Format context, from the Google Doc's **Notes** tab: **Q# / Cirq** are
high-level languages, **OpenQASM** is assembly level, **QIR** is an intermediate
representation (bitcode).

## Priority order

The week is short and this list is long. Land them in this order; the top four
are what "done" means.

1. **Delete the dead options** — pure subtraction, high trust payoff.
2. **Manual Logical Counts** — Preston's feature, fully specified, engine path
   already proven.
3. **Neutral Atom + Low-Move pairing**, plus the other real options
   (GSJ24, GSJ24 CCX, Magic Up-to-Clifford, Yoked) enabled **and serialized**.
4. **Coupling + availability rules** — GSJ24 CCX ↔ CCX Magic States,
   multi-select factories, Litinski19 availability.
5. **Hyperparameters into `RunConfig`** and through the adapter.
6. **File upload checker.**

**Below the line, and deliberately so:** zip/folder uploads for Saved Programs,
and Cirq as a fourth input format. Both are real spec items; neither fits this
week alongside the above. Flag them for week 5 rather than starting them.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/results/` and `renderer/history/` — Results, History, Comparison | Team 2 |
| The Markdown exporter, the save dialog | Team 2 |
| Architecture / setup / agentic documentation | Team 3 |
| The qdk 1.30.0 bump itself | Team 3 — you build on it, they land it |
| The four deferred week-3 contract questions | PMs — Team 3 reports what 1.30.0 changes; nobody rules on them |
| Per-benchmark analytic mappings that make hyperparameters move the numbers | Not this week — serialization only |
| Zip/folder uploads, Cirq support | Week 5 |
| Packaging, installers | Week 6 |

## Quality bar

Strict TS, no `any` at boundaries. Contract types imported from
`app/src/shared/types.ts`, never re-declared. **No control renders unless it
reaches the engine or is explicitly marked as recorded-only** — grep-checkable:
no `useState` in `MicroArchitectureSection.tsx` standing in for a config field.
Every new architecture/factory/QEC/application value has a test proving a config
using it validates against the schema **and** produces a real estimate through
the adapter. Field types, ranges, and defaults match
the Features and Fields Google Doc exactly — where you deviate, say so in the PR
and why. `npm run typecheck`, `npm test`, and `npm run test:engine` green before
every PR.
