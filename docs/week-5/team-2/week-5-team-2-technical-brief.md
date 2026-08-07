# Week 5 — Team 2 (Melody + Rishabh) — Technical Brief: The LLM Interface

Your track: **build the natural-language interface.** An analyst describes the
run they want in prose; the app proposes a filled-in configuration; the analyst
reviews it, edits anything, and presses Run.

Microsoft raised this at the **Jul 24 POC** as the first of three asks. You are
building ask #1, using ask #2 (connectivity) as the plumbing it needs. Ask #3 —
automated circuit creation — is **out of scope**; see § Scope.

## The design is yours

We are deliberately not sketching this. Where the entry point lives, what the
proposal panel looks like, how the analyst accepts or rejects individual fields,
which provider you adapt first — yours to decide and defend. This follows the
same rule the week-4 agentic memo got: we want your design, not ours with your
name on it.

What follows is split into **constraints**, which are not design choices, and
**one engineering finding** that will determine whether your week works.

---

## The finding that will eat your week if you don't plan for it

The obvious implementation is: hand `runconfig.schema.json` to the model as a
structured-output schema, let constrained decoding guarantee a valid config,
done. **That does not work**, and it is invisible until you try it.

Strict structured-output modes support roughly `type`, `properties`, `required`,
`items`, `enum`, `const`, `$defs`, `anyOf`, and `additionalProperties: false` —
and require every property to appear in `required`. Numeric bounds, string
formats, and conditional keywords are dropped or rejected.

Counted in our canonical schema at **v1.3.0** (re-count after v1.4.0 lands, the
numbers move):

| Keyword | Uses | Supported by strict structured outputs? |
|---|---|---|
| `const` | 23 | yes |
| `exclusiveMinimum` | 12 | **no** |
| `additionalProperties` | 9 | yes (must be `false`) |
| `if` / `then` | 6 / 6 | **no** |
| `format` (`uuid`, `date-time`) | 4 | **no** |
| `oneOf` | 3 | partial |
| `anyOf` | 2 | yes |
| `allOf` | 1 | **no** |
| `not` | 1 | **no** |

Our schema is *deliberately* strict — closed enums, `additionalProperties: false`,
conditional pairing rules — precisely so a producer typo fails fast. That
strictness is exactly what makes it un-generatable.

**So you need two schemas:**

1. A **lowered generation schema**, derived from the canonical one, using only
   the supported subset — bounds and conditionals expressed as prose in field
   descriptions rather than as constraints.
2. The **canonical schema as the real gate**, unchanged, through the existing
   `validateRunConfigSchema()` in `app/src/renderer/state/schemaValidation.ts`. A
   draft that fails shows the analyst the same Ajv errors they'd get from a bad
   manual entry, in the existing `ValidationSummary.tsx`. No new failure surface.

Keeping those two in sync is **permanent maintenance**, not a one-time cost.
Whatever you build, build the drift test that fails when the canonical schema
gains a field the lowered one doesn't have. That test is worth more than the
feature.

> **A smaller version exists and is worth pricing before you commit.** Our config
> space is small and closed — five benchmarks, three architectures, five
> factories, a fixed transform pipeline. A deterministic parser over a controlled
> vocabulary would handle a useful fraction of real phrasings with no token, no
> network, and no procurement conversation. It's less impressive in a demo and it
> won't handle prose it wasn't built for. If after a day you think it's the better
> product, say so — that's a legitimate outcome of this week, not a retreat.

---

## Constraints — these are not design choices

**1. The key never enters the renderer, and never enters SQLite.** Not in
`run-history.sqlite`, not in a config JSON, not in `localStorage`, not in
renderer memory. Electron's `safeStorage` encrypts against OS key management —
Keychain on macOS, DPAPI on Windows — and the encrypted blob lives under
`app.getPath("userData")`.

**2. Refuse to store when the backend is fake.** If no OS secret store is
available, `safeStorage` silently falls back to a hardcoded plaintext password.
`safeStorage.getSelectedStorageBackend()` returning `basic_text` means the
encryption is theatre. In that state the app **declines to store a key** and says
why, rather than pretending.

**3. There is no getter.** The renderer may ask "is a provider configured?" and
get a boolean. It may never ask "what is the key?" No IPC channel returns it.
That asymmetry is the point of putting the key in the main process at all.

**4. Your preload surface is the fifth, and it follows the estimator
convention.** Four exist today: `window.estimator`, `window.uploads`,
`window.store`, `window.files`. Provider failures — 401, 429, rate limit, TLS
failure, network down, model refusal, timeout — are **expected domain outcomes**
the UI has to render. They **resolve**, carrying a typed failure, exactly as
`estimatorHandler.ts` does with a failed `RunResult`. Only programmer errors
reject: asking for a draft with no credential configured, or any renderer attempt
to read the token back. `storeHandler.ts` documents the existing asymmetry and
the week-4 architecture doc states the decision rule — this is the first real
test of whether that doc is usable, so tell us if it isn't.

**5. The model produces a draft `FormState`, never a `RunConfig`.**
`app/src/renderer/state/toRunConfig.ts` is the only sanctioned path from draft to
config, and `useRunFlow.ts` stamps `id` and `createdAt` at Run-click and nowhere
else. A model emitting a `RunConfig` directly would be **minting run identity** —
which breaks the invariant that a run's identity is created at the moment a human
commits to it. Feed the existing form instead and the model inherits the same
validation, the same coupling rules (`deriveQecCode`, `isLitinski19AllowedInForm`,
`isGsj24AllowedInForm`), and the same human in the same place.

**6. Existing validation is the only execution gate.** Nothing the model produces
runs without passing every check a hand-typed config passes. There is no
"generated config" code path. If one exists, it is a bypass.

**7. The feature is optional, visibly networked, and removable.** `docs/tech-stack.md`
§Non-negotiables says no network calls are *required for core workflows* — that
is the gap this feature lives in, and it only holds if configuration, execution,
history, comparison, and export all still work with no provider configured and no
network. A permanent, visible indication of whether networked features are on,
and which provider they point at, is part of the feature rather than a nicety.

**8. The analyst sees what is about to be sent, before it is sent.** For our
users, "does my configuration leave this machine?" is a control question with an
auditor attached.

---

## Provenance ships for you at kickoff

`RunConfig` is `additionalProperties: false` and `RunRecord` carries nothing
beyond `config`, `result`, and `savedAt`, so "this run was model-assisted" cannot
be recorded without a contract change. **The PMs are landing that field in v1.4.0
at kickoff** — use it. Don't add a field of your own, and don't open a
contract-change PR.

---

## Scope

**In:** natural language → a draft configuration the analyst reviews and runs.
Credential storage and the provider adapter, because ask #1 needs them.

**Out — automated circuit creation.** A generated Q# or OpenQASM program is code
a compiler will execute semantics for, and "an LLM wrote it and it compiled" is
not evidence that it computes what the analyst asked for. A wrong *config* is
visible in the form; a wrong *circuit* is invisible until the numbers are in a
report. That's a different product and it isn't this week.

**Also out:** consumer-subscription OAuth ("log in with your Claude account").
Anthropic's February 2026 terms prohibit third-party tools using subscription
OAuth tokens, and no provider issues a `client_id` for this. API keys from a
provider console are the path with no legal ambiguity. See
[`docs/agentic-integration-research.md`](../../agentic-integration-research.md)
§5 for the full argument.

---

## Your other job this week: the renames

The Jul 31 POC renamed two labels, and they render on your surfaces as well as
the form:

| Current | New |
|---|---|
| Max Error | **Total Fault Tolerant Execution Error** |
| T States / Rotation | **T Count Per Rotation** |

**Team 3 does the configuration form; you do export, History, and Comparison** —
`historyLabels.ts`, the Markdown export, and the comparison table. Display labels
only: `maxError` and `tStatesPerRotation` stay exactly as they are on the wire.

Both halves land this week or the export disagrees with the screen. The exact
strings are in [`docs/features-and-fields.md` § Renames](../../features-and-fields.md).

---

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/components/`, `renderer/state/`, `renderer/constants/`, `main/engine/` | Team 3 |
| The renames **in the configuration form** | Team 3 |
| The trace pipeline, tooltips, the merged factory control | Team 3 |
| MCP, and any design of an agent driving our app | Team 1 |
| Opening a contract-change PR | PMs — v1.4.0 lands at kickoff |
| Automated circuit creation | Out of scope, deliberately |
| Part 3 export hardening — native save dialog, full-field export | Nobody this week; don't start |

You will need to touch `renderer/state/formState.ts` to produce a draft. **Read
it, don't reshape it** — Team 3 is changing that file this week for the pipeline
and the new QPU fields. If you need a change there, coordinate in the channel
before you make it.

## Quality bar

Strict TypeScript, no `any` at boundaries, contract types imported from
`app/src/shared/types.ts`. The app works completely with no provider configured
and no network — demonstrated, not asserted. No key, prompt, or provider response
is ever written to `run-history.sqlite`. Every networked call is visible to the
analyst before it happens. `npm run typecheck` and `npm test` green on the merge
commit.
