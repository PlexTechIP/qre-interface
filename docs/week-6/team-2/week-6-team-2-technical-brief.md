# Week 6 — Team 2 (Melody + Rishabh) — Technical Brief: Start Building the MCP Server

Your track: **turn the first slice of Team 1's MCP design into running code.**

The design document is
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
— 1,203 lines, on `main`, substantially revised after review. It is your spec.
**Read §0, §3, §4, §5.1, §6, §6.1, and §14 before you write anything.**

## Read this number before you read anything else

**§10 of the design costs v1 at ~15–20 dev-days for one developer.** You have
roughly **two**. Two people, three days, ~6–9 h each.

That is not a criticism of the estimate — it was rebuilt carefully in the revision
pass and it is probably right. It is the fact that shapes your week. **You are not
building v1. You are building the first ~15% of it**, and the scope below has
already been cut to fit by us so that you do not have to spend Tuesday evening
discovering it yourself.

**Three deliverables. Nothing else.** If you finish, post in the channel and stop.

---

## Deliverable 1 — The concurrency spike (§4)

**This is first, it is the highest-value hour in the week, and it is the one
thing that is pure measurement with no scaffolding in the way.**

§4.3 draws an honest boundary and it is worth quoting, because your job is to move
one line of it:

> **Could NOT establish (not tested):** we did **not** run two processes against
> one `run-history.sqlite` and observe the behaviour empirically. […] **In
> particular, the concurrent-migration case in §4.1 is unmeasured.**

The design then names exactly what would close it:

> a short spike — two Node processes, one DB, one writing in a loop while the
> other reads/writes, plus a deliberate concurrent-open test against a database
> one version behind — measured under both default and WAL modes.

Do that. It needs no MCP, no SDK, and no Electron — two `tsx` scripts and a temp
database. What is established from code today and what you are testing against:

- `sqliteRunStore.ts:103` opens with `{ timeout: 5_000 }` — a 5 s busy timeout.
- **No WAL pragma is set anywhere.** The only pragma in product code is
  `user_version`. So the database is in default rollback-journal mode.
- **The store runs schema DDL at open time**, which is what makes §4.1's
  concurrent-migration case a real question rather than a theoretical one.

**What the write-up must say:** what you observed, under default mode and under
WAL, for (a) concurrent reads, (b) a read during a write, (c) two writers, and
(d) two processes opening a database one `user_version` behind at the same time.
Then a recommendation on WAL, and on §4.1's "the MCP server never migrates;
refuses on version mismatch" rule.

**A negative or messy result is a good result.** If something corrupts, that is
the most valuable finding of the week and it changes the design. If nothing does,
we get to stop hedging §4 with `[INFERENCE]`.

---

## Deliverable 2 — The scaffold, plus exactly one tool

A second, non-Electron Node entry point that starts, speaks MCP over stdio, and
serves **one** tool: `qre_list_benchmarks`, backed by the real
`app/src/main/engine/benchmarkRegistry.ts`.

One tool, not five. The point of this deliverable is **not** tool coverage — it is
to prove end to end, in running code, the claim the entire design rests on:

> **[VERIFIED]** `QreEngine` and `SqliteRunStore` import nothing from Electron, so
> a second, non-Electron Node entry point could reuse both modules unchanged.

That claim has been verified by `grep`. It has never been verified by a process
starting. Until it is, everything downstream of it is a plan.

**What you need:**

- `@modelcontextprotocol/sdk` — **not in `package.json` today.** Adding it is part
  of the work.
- A new build entry alongside main / preload / renderer. §10 names it
  `vite.mcp.config.ts`; follow the pattern the other three use.
- Tool names are **prefixed** — `qre_list_benchmarks`, not `list_benchmarks`. §6
  explains why: clients that aggregate servers may collide on bare names, and tool
  shadowing is in the threat list.

### The trap that will cost you an afternoon if you do not read it

**Never write to stdout.** On a stdio MCP server, stdout *is* the protocol
channel. One stray `console.log` — yours or a dependency's — corrupts the message
stream, and the failure looks like the client mysteriously disconnecting rather
than like a logging bug. Route everything to stderr. §7 of the design says this;
it is the single most useful sentence in the document for whoever builds first.

---

## Deliverable 3 — Close three open items, in writing

§14 lists ten open items. Three of them block more tools and are cheap to settle
now that someone is actually building:

| # | Item | Why now |
|---|---|---|
| **OPEN-1** | Confirm the "MCP server never migrates; refuses on version mismatch" rule (§4.1) | Your spike is what tells us whether this is necessary or merely prudent |
| **OPEN-2** | Enable WAL in `SqliteRunStore`, or record a decision not to (§4.2) | Same. And nobody else is in `sqliteRunStore.ts` this week, so if the spike says WAL, **you may make the one-line change** |
| **OPEN-3** | `ConfigDraft` shape: raw `FormState` vs. a flattened projection (§6.1) | Every remaining tool schema depends on this. Deciding it costs an hour now and a rewrite later |

Write the answers as a short section appended to the design document, dated and
signed, in the same `[VERIFIED]` / `[INFERENCE]` register the document already
uses. **Do not start a second document** — that is the drift problem week 5's
review called out on this exact file.

**Also file, do not fix:** §14's last row is a live bug — `main.ts:62` resolves the
database to `app.getPath("userData")/run-history.sqlite` while `dataDir.ts:17`
resolves to `~/.qre-dashboard/run-history.sqlite`. Two disagreeing defaults, so a
naive server reusing the helper opens a **different file** than the running app.
It is still there on `main`. Post it in the channel as a ticket. Fixing it is not
your week and touching `main.ts` is not your file.

---

## Why `ConfigDraft` matters more than it looks (§6.1)

Do not skip this section even though you are not building `qre_validate_config`
this week. It is the part of the design a first implementer is most likely to get
wrong, and OPEN-3 asks you to decide it.

The original draft had tools take `{ config: RunConfig }`. That is wrong three
ways, and all three are worth carrying in your head:

1. **It mints run identity.** `RunConfig` carries `id` and `createdAt`, and
   identity is created in exactly two places — `useRunFlow.ts:42` at Run-click and
   `rerun.ts:13`. `toRunConfig.ts:43`'s comment states the invariant outright:
   *"id/createdAt are real only at Run-click."*
2. **The model cannot be constrained to the canonical schema.** Numeric bounds and
   conditionals are dropped by strict structured-output modes. This is the same
   finding that produced the lowered generation schema for the in-app interface.
3. **Ajv is a weaker check than the app applies.** The form also enforces
   `deriveQecCode`, `isLitinski19AllowedInForm`, `isGsj24AllowedInForm`, and
   `isPrimaryFactoryAllowed` (`formState.ts:484`, `:550`, `:560`, `:570`). An agent
   that passes Ajv alone can still hand the engine a configuration the form would
   have refused.

So the seam is `ConfigDraft` → `normalizeFormState` → `toRunConfig` →
`validateRunConfigSchema`, reusing what exists rather than reimplementing it.

---

## What is explicitly NOT in this week

Naming these because each is in the design and each will look tempting:

- **`qre_run_estimate`, or any write tool.** No exceptions. It is costed at 2–3
  days on its own, plus 1–2 for the Tasks extension, and §7.2's gate is the
  subtlest part of the design.
- **`qre_validate_config`, `qre_list_runs`, `qre_get_run`, `qre_draft_from_run`,
  `qre_compare_runs`.** All good tools. All next week.
- **The elicitation flow, rate limiting, output sanitization, the invocation
  log.** §7's machinery, all of it.
- **The "Copy MCP server config" action in the app** (§5.1). It is the right
  answer and it is the §9 adoption lever, but it is app-side UI and it is not a
  first slice.
- **Anything under `renderer/`.** Your track has no UI this week.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/agent/`, `main/agentHandler.ts`, `main/credential*`, `main/*DraftGenerator.ts` | Team 1 |
| `renderer/state/useRunFlow.ts` and `validation.ts` | Team 1 |
| The open-source question — LICENSE, CONTRIBUTING, repo visibility | Team 3 |
| `main/main.ts`, including the `dataDir.ts` path bug | Nobody — file it, don't fix it |
| `renderer/components/`, `renderer/constants/`, `main/engine/` **as edits** | Nobody. You *import* `benchmarkRegistry.ts`; you do not change it |
| Opening a contract-change PR | Nobody. v1.4.0 stands |
| Packaging or installers | Deferred to week 7+ |

`main/sqliteRunStore.ts` is the one exception: the WAL decision (OPEN-2) is yours,
and if the spike says to enable it, the one-line change is yours to make. Say so
in the PR and get a PM on the review.

## Quality bar

Strict TypeScript, no `any` at boundaries, contract types imported from
`app/src/shared/types.ts` rather than re-declared. **The MCP entry point imports
nothing from `electron`** — that is the whole thesis, and it is grep-checkable, so
grep it and say you did. Nothing is written to stdout. The spike's numbers are
numbers you measured, not numbers you reasoned to — and where you reasoned, label
it, the way the design document does. `npm run typecheck` and `npm test` green
**on the commit you merge**.
