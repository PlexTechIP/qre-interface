# Week 6 — Team 2 (Melody + Rishabh) — Technical Brief: Build the MCP Server's Read Half

Your track: **turn the read half of Team 1's MCP design into running code.**

The design document is
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
— 1,203 lines, on `main`, substantially revised after review. It is your spec.
**Read §0, §3, §4, §5.1, §6, §6.1, and §14 before you write anything.**

## Read this number before you read anything else

**§10 of the design costs v1 at ~15–20 dev-days for one developer.** Two of you
over twelve days at ~18–24 h/person is roughly **4.5–6 dev-days**.

That is not a criticism of the estimate — it was rebuilt carefully in the revision
pass and it is probably right. It is the fact that shapes your week. **You are not
building v1. You are building its read half**, and the scope below has already
been cut to fit so that you do not spend the Monday before the deadline
discovering it yourself.

| Deliverable | Required / flexes |
|---|---|
| The §4 concurrency spike | **Required — do it first** |
| The scaffold: a working stdio server | **Required** |
| `qre_list_benchmarks`, `qre_list_runs`, `qre_get_run`, `qre_draft_from_run` | **Required** |
| Three §14 open items closed in writing | **Required** |
| **What else you found** — risks and gaps we did not list | **Required** |
| `qre_validate_config` + `ConfigDraft` plumbing | **Flexes — cut this first** |
| `qre_compare_runs` | Out |
| **Anything that writes** | **Out. Not negotiable** |

---

## Deliverable 1 — The concurrency spike (§4)

**First, and it is the highest-value day in the week.** It is also the one thing
that is pure measurement with no scaffolding in the way, which makes it the
natural parallel task while the other of you fights the build config.

§4.3 draws an honest boundary, and your job is to move one line of it:

> **Could NOT establish (not tested):** we did **not** run two processes against
> one `run-history.sqlite` and observe the behaviour empirically. […] **In
> particular, the concurrent-migration case in §4.1 is unmeasured.**

The design names exactly what would close it:

> a short spike — two Node processes, one DB, one writing in a loop while the
> other reads/writes, plus a deliberate concurrent-open test against a database
> one version behind — measured under both default and WAL modes.

No MCP, no SDK, no Electron — two `tsx` scripts and a temp database. What is
established from code today, and what you are testing against:

- `sqliteRunStore.ts:103` opens with `{ timeout: 5_000 }` — a 5 s busy timeout.
- **No WAL pragma is set anywhere.** The only pragma in product code is
  `user_version`. The database is in default rollback-journal mode.
- **The store runs schema DDL at open time**, which is what makes §4.1's
  concurrent-migration case real rather than theoretical.

**What the write-up must say:** what you observed, under default mode and under
WAL, for (a) concurrent reads, (b) a read during a write, (c) two writers, and
(d) two processes opening a database one `user_version` behind at the same time.
Then a recommendation on WAL and on §4.1's "the MCP server never migrates;
refuses on version mismatch" rule.

**A negative or messy result is a good result.** If something corrupts, that is
the most valuable finding of the month and it changes the design. If nothing does,
we get to stop hedging §4 with `[INFERENCE]`.

---

## Deliverable 2 — The scaffold

A second, non-Electron Node entry point that starts and speaks MCP over stdio.

The point is **not** tool coverage. It is to prove end to end, in running code,
the claim the entire design rests on:

> **[VERIFIED]** `QreEngine` and `SqliteRunStore` import nothing from Electron, so
> a second, non-Electron Node entry point could reuse both modules unchanged.

That has been verified by `grep`. It has never been verified by a process
starting. Until it is, everything downstream of it is a plan.

**What you need:**

- `@modelcontextprotocol/sdk` — **not in `package.json` today.**
- A new build entry alongside main / preload / renderer. §10 names it
  `vite.mcp.config.ts`; follow the pattern the other three use.
- Tool names are **prefixed** — `qre_list_benchmarks`, not `list_benchmarks`. §6
  explains why: clients that aggregate servers may collide on bare names, and tool
  shadowing is in the threat list §7 cites.

### The trap that will cost you an afternoon if you do not read it

**Never write to stdout.** On a stdio MCP server, stdout *is* the protocol
channel. One stray `console.log` — yours or a dependency's — corrupts the message
stream, and the failure looks like the client mysteriously disconnecting rather
than like a logging bug. Route everything to stderr. §7 of the design says this;
it is the most useful sentence in the document for whoever builds first.

---

## Deliverable 3 — Four read tools

In roughly this order, cheapest first, so that each one lands on `main` rather
than all four arriving on the 18th:

| Tool | Backed by | §10 estimate |
|---|---|---|
| `qre_list_benchmarks` | `main/engine/benchmarkRegistry.ts` | 0.5 d |
| `qre_list_runs` / `qre_get_run` | `SqliteRunStore.list` / `.query` / `.get`, plus a new `RunSummary` type | 1 d |
| `qre_draft_from_run` | `formState.formStateFromRunConfig` | 0.25 d |

**`qre_list_runs` needs pagination and a `RunSummary`.** Returning whole
`RunRecord`s for a large history floods the agent's context. Define `RunSummary`
in `app/src/shared/types.ts` — it is a TypeScript type, not a contract change, and
it does not touch `runconfig.schema.json`.

**Two things to carry from §7 even though the write tools are out of scope:**

- **§7.3 — our own store is an injection path.** Run names are user-authored free
  text, `qre_list_runs` returns them, and they land in the agent's context. You are
  not building the tool that makes that *actionable*, but you are building the one
  that makes it *available*. Note in your PR how you handled it, even if the answer
  is "we didn't, and here is the ticket."
- **§7.4 — the read tools are the ones that move data off the machine.** Every read
  tool puts QRE data into the agent's context, which for a hosted model means off
  the analyst's machine. The design calls this out precisely because read tools
  look safe and are not.

---

## Deliverable 4 — Close three open items, in writing

§14 lists ten. Three block further work and are cheap to settle now that someone
is actually building:

| # | Item | Why now |
|---|---|---|
| **OPEN-1** | Confirm the "MCP server never migrates; refuses on version mismatch" rule (§4.1) | Your spike is what says whether this is necessary or merely prudent |
| **OPEN-2** | Enable WAL in `SqliteRunStore`, or record a decision not to (§4.2) | Same. Nobody else is in `sqliteRunStore.ts` this week, so **if the spike says WAL, the one-line change is yours** |
| **OPEN-3** | `ConfigDraft` shape: raw `FormState` vs. a flattened projection (§6.1) | Every remaining tool schema depends on it. **Decide it even if `qre_validate_config` gets cut** |

Write the answers as a dated, signed section appended to the design document, in
its existing `[VERIFIED]` / `[INFERENCE]` / `[EXTERNAL]` register. **Do not start
a second document** — two copies of this content is the exact drift week 5's
review flagged on this file.

**Also file, do not fix:** §14's last row is a live bug — `main.ts:62` resolves the
database to `app.getPath("userData")/run-history.sqlite` while `dataDir.ts:17`
resolves to `~/.qre-dashboard/run-history.sqlite`. Two disagreeing defaults, so a
naive server reusing the helper opens a **different file** than the running app.
Still there on `main`. Post it in the channel as a ticket; `main.ts` is not your
file this week.

**And one correction to the design you should make while you are in there:** §3
says there are **four** preload surfaces. There are now **five** —
`estimator`, `uploads`, `store`, `agent`, `files` (`preload.ts:101-105`). The
`agent` surface landed after the document was written. This is a small thing that
proves the document's own thesis about unpinned claims rotting, and it is worth a
line in your appended section.

---

## Deliverable 5 — What the design does not say

**The design document is 1,203 lines and it is still a document.** It was written
by someone reading the codebase, not running a server against it. You are the
first people to actually build this, which means you are the first people in a
position to find what it got wrong.

You have already been handed one example: **§3 says there are four preload
surfaces and there are now five.** That is the document's own thesis about
unpinned claims rotting, demonstrated on itself, and we only caught it because
Team 1 was counting them for a different reason.

**So go looking, and write down what you find.** Two categories:

**1. Where the design is wrong, stale, or insufficient.** Line anchors that have
moved. Claims that were true at `ed52411` and are not now. Places where §6.1's
seam does not survive contact with the actual types. Anything a week-7 implementer
would waste a day on. **Append these to the design document** with the same
labelling convention, in the section where you are already answering OPEN-1
through OPEN-3.

**2. Security and robustness risks in what you are building.** §7 is thorough
about the write tools and comparatively light on the read ones — which is
backwards from where you are working. Things §7 does not fully cover:

- **What a read tool returns when the store is in an unexpected state** — a
  corrupt record, a `schemaVersion` from the future, a run whose result JSON does
  not parse. Does the server crash, return a protocol error, or leak a stack
  trace with a filesystem path in it?
- **Unbounded output.** `qre_get_run` returns a whole `RunRecord` including
  `result.raw`. How large can that get, and what happens to an agent's context
  when it arrives?
- **Errors as an egress path.** An error message containing a database path, a
  home directory, or a config fragment goes straight into the agent's context and
  therefore off the machine (§7.4).
- **Denial of service against ourselves.** No rate limiting exists — that is
  explicitly out of scope — but an agent in a loop calling `qre_list_runs` against
  a shared SQLite file interacts with your own §4 findings. Worth a sentence even
  if the fix is next week's.

**If you are using a coding agent, point it at this.** *"What is wrong or missing
in this design document, and what could go wrong with these tool handlers that
the security section does not cover?"* is the prompt nobody runs, and you are the
only people positioned to run it.

**Implement what is safe and inside your boundaries. File the rest.** The
write-tool line does not move because you found a good argument for one.

**An empty list is acceptable if it is argued** — "we checked the design's line
anchors against `b6a5091` and they hold; we considered these four failure modes
and here is what we concluded" is a finding. Silence is not.

**One guardrail:** deliverables 1–4 come first. If you are behind, cut the extra
*implementation* — the list of what you *found* still ships.

## Reviews — run them, on your own work

1. **Read your own diff top to bottom before your teammate does**, cold, as
   though someone else wrote it.
2. **Your teammate reviews every merge.** This track lands in at least four
   pieces — the spike, the scaffold, and each tool — and each one is a review.
3. **A PM reviews anything that touches `SqliteRunStore`**, including the WAL
   change if you make it.

If you use an agent for a review pass over the finished diff, that is fine and
encouraged. It does not replace a human reading the store access, because the
agent that wrote the code is the worst possible judge of whether it is right.

## Deliverable 6 — `qre_validate_config` (this is the part that flexes)

**Cut this first if you are behind, and say so in the channel rather than
silently dropping it.** OPEN-3's *decision* is still required either way.

Do not skip §6.1 even if you cut the tool. It is the part a first implementer is
most likely to get wrong. The original draft had tools take `{ config: RunConfig }`,
and that is wrong three ways:

1. **It mints run identity.** `RunConfig` carries `id` and `createdAt`, and
   identity is created in exactly two places — `useRunFlow.ts:42` at Run-click and
   `rerun.ts:13` for a rerun. `toRunConfig.ts:43`'s comment states the invariant
   outright: *"id/createdAt are real only at Run-click."*
2. **The model cannot be constrained to the canonical schema.** Numeric bounds and
   conditionals are dropped by strict structured-output modes — the same finding
   that produced the lowered generation schema for the in-app interface.
3. **Ajv is a weaker check than the app applies.** The form also enforces
   `deriveQecCode`, `isLitinski19AllowedInForm`, `isGsj24AllowedInForm`, and
   `isPrimaryFactoryAllowed` (`formState.ts:484`, `:550`, `:560`, `:570`). An agent
   that passes Ajv alone can still hand the engine a configuration the form would
   have refused.

So the seam is `ConfigDraft` → `normalizeFormState` → `toRunConfig` →
`validateRunConfigSchema`, reusing what exists rather than reimplementing it.

---

## What is explicitly NOT in this week

Each of these is in the design and each will look close. None of them is.

- **`qre_run_estimate`, or any write tool.** No exceptions. 2–3 days on its own,
  plus 1–2 for the Tasks extension, and §7.2's gate is the subtlest part of the
  design. **Building it badly is worse than not building it**, because the gate is
  the whole reason it is allowed to exist.
- **`qre_compare_runs`.** A good tool, and 1 day. Next week.
- **The elicitation flow, rate limiting, output sanitization, the invocation
  log** — §7's machinery, all of it.
- **The "Copy MCP server config" action in the app** (§5.1). It is the right answer
  and it is the §9 adoption lever, and it is app-side UI. Next week.
- **MCP resources** (§13).
- **Anything under `renderer/`.** Your track has no UI this week.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/agent/`, `main/agentHandler.ts`, `main/credential*`, `main/*DraftGenerator.ts`, `renderer/state/useRunFlow.ts` | **PMs** — the LLM interface is a PM track this week |
| `.github/`, `app/package.json` scripts, `main.ts`, `preload.ts`, `setup_venv.sh` | Team 1 |
| The open-source question — licensing, community files, governance | Team 3 |
| `main/main.ts`, including the `dataDir.ts` path bug | Nobody — file it, don't fix it |
| `main/engine/` **as edits** | Nobody. You *import* `benchmarkRegistry.ts`; you do not change it |
| Opening a contract-change PR | Nobody. v1.4.0 stands |
| Packaging or installers | Deferred to week 7+ |

`main/sqliteRunStore.ts` is your one exception: the WAL decision (OPEN-2) is
yours, and if the spike says enable it, the one-line change is yours to make. Say
so in the PR and get a PM on the review.

**You will need `app/package.json` for the SDK dependency** while Team 1 is
changing its scripts. That is a coordinate-in-the-channel situation, not a
blocker — different keys in the same file.

## Quality bar

Strict TypeScript, no `any` at boundaries, contract types imported from
`app/src/shared/types.ts` rather than re-declared. **The MCP entry point imports
nothing from `electron`** — that is the whole thesis, it is grep-checkable, so
grep it and say you did. Nothing is written to stdout. The spike's numbers are
numbers you measured, not numbers you reasoned to — and where you reasoned, label
it, the way the design document does.

**Write this as though someone outside the team will read it, because they will** —
Microsoft wants this repository open-sourced, and a brand-new entry point with no
prior art is the first thing a stranger will open.
