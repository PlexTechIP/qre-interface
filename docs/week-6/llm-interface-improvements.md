# Week 6 — LLM Interface Improvements (PM-owned)

**Branch:** `week-6/llm-interface-improvements`
**Scope:** Team 1's *original* week-6 track, as published at `4c37a2c`
(`docs/week-6/team-1/`, "Improve the LLM Interface"). Team 1's scope was
switched to Deployment Readiness on `dafe9bb`, so the current
`docs/week-6/team-1/` docs describe different work and are **not** edited by
this branch. This file is the record for the LLM-interface track instead.

Part A is the closed five-defect list. Part B is the one improvement.

---

## Part B — the improvement, and why

**Chosen: Candidate 1's second half — show the analyst what the model actually
set.**

Candidate 1 named two problems. The first (a proposal discards a half-filled
form) is real but is a *workflow* fix. The second is that the review step is
dishonest: `draftToFormState` builds from `createInitialFormState()` plus the
proposal, so the analyst lands on a fully-populated form of ~40 fields with
nothing distinguishing the handful the model decided from the defaults it never
mentioned. "Review before you run" only means something if the thing under
review is legible, and it was not.

Candidate 2 (refining a proposal) was rejected on cost and on constraint:
multi-turn context has to live somewhere, and the week-5 seam deliberately
carries provider and model *with every request, never as main-process state*.
Doing it properly is more than this week had.

### What shipped

`renderer/components/ModelProposalSummary.tsx` — a panel above the form listing
exactly what the model chose, one entry per value, each a button that scrolls
to, flashes, and focuses the control that now holds it.

Three decisions worth the ink:

**It reports; it does not diff.** `draftToFormState` records each value as it
writes it (`ProposalLog`), rather than comparing the result against
`createInitialFormState()`. A diff cannot tell "the model asked for 20 T states
per rotation" from "the model said nothing and 20 is the default" — the two
produce identical state. Since most model choices agree with a default, a diff
would silently drop most of them, which is the exact failure the panel exists
to fix. Pinned by a test.

**"Chose" means expressed an opinion, not differs-from-default.** A `null` in a
required-nullable field is the generation schema's way of saying *no opinion*
(`twoQubitGateTime`), and an empty `magicStateFactories` is replaced by the
form's own `round_based`, so neither is the model's decision and neither is
shown as one. A chosen value that happens to equal the default *is* listed.

**It describes the proposal, not the current form.** The analyst edits
afterwards; a panel claiming to describe live values would start lying on the
first keystroke. As a record of what was proposed it stays true for as long as
it is on screen, and the jump takes the analyst to the live control. Marking
entries the analyst has since overridden is a genuine improvement on this and
is a **channel note, not this branch** (see § Notes for the channel).

### Supporting refactor

`FIELD_ANCHORS`, `FIELD_LABELS` and `jumpToField` moved out of
`ValidationSummary.tsx` into `components/fieldAnchors.ts`. Two surfaces now
point the analyst at a control they are not looking at, and the overview's
warning about `configSummaryFields.ts` / `resultFields.ts` is what happens when
each grows its own copy. `FieldAnchorKey` is a superset of the validation keys,
so `Record<FieldAnchorKey, …>` still makes a new `FieldErrors` member a compile
error.

---

## Part A — the defect list

### Defect 1 · Provenance is now inside the schema gate

`RunStamp` gained an optional `provenance`, and `toRunConfig` writes it.
`useRunFlow.start` builds `stamp(provenance)` instead of mutating the config it
just built; `isConfigValid` takes the draft's provenance and validates *with*
it; `RunConfiguration` passes `draftProvenance` to the gate and to Run from the
same variable. The object the gate approves and the object the engine receives
are now the same object.

`isConfigValid` is the Run gate, and `provenance` is the only app-controlled
field the canonical schema constrains (`authoredBy` is an enum, `model` is
`minLength: 1`, the object is closed) — so validating without it meant
approving one object and executing another.

**Tests:** `state/provenanceGate.test.ts` (4) plus two in
`RunConfiguration.test.tsx`. **Revert-checked:** reverting
`isConfigValid(state, draftProvenance)` to `isConfigValid(state)` turns
"gates a model-assisted draft on its provenance too" red.

### Defect 2 · `demoAgentService` is gone from the shipped app

**Choice: deleted from the production tree; the fake is injected by the tests
that want it.**

It now lives at `shared/testing/fakeAgentService.ts` beside `fakeEstimator`, and
`App.test.tsx` sets `window.agent` in `beforeEach` exactly as it already sets
`window.estimator` and `window.store` — so the suite exercises the resolution
order production actually takes.

`resolveAgentService(injected?)` is exported and has two branches, not three; a
missing `window.agent` throws a named error rather than substituting a fixture.
`preload.ts` exposes `window.agent` unconditionally, so the third branch could
never run in Electron and ran only under test — which is why a green suite said
nothing about whether the real seam worked.

The fixture reports `mode: "provider"`, the shape the real handler returns.
Reporting `local_demo` would have put the App suite back on a status the
shipped app cannot produce. `NetworkStatus.test.tsx` still covers `local_demo`
with its own inline status.

**Tests:** three in `App.test.tsx` ("agent service resolution").

### Defect 3 · The network-status dot is a token

`--color-status-online`, defined per theme, used once for the dot and derived
for its halo via `color-mix` so the ring cannot drift from the dot. `#22a06b`
now appears exactly once in the stylesheet, as the light value.

Dark gets its own value (`#34d399`), lifted the same way the six comparison
series are — a green tuned against a white card was the one colour in the
palette not being remapped for dark.

**Measured in the running app from computed styles, against
`--color-well-bg`:** light **3.18:1**, dark **7.10:1**. Both clear WCAG 1.4.11's
3:1 for a non-text indicator.

**Tests:** two in `NetworkStatus.test.tsx` — the rule contains no hex literal
and uses the token for both properties; the token is defined in both theme
blocks with different values.

### Defect 4 · Offline — demonstrated, not asserted

Run in the **real Electron app** (real preload, real IPC, real `qdk[qre]
1.30.0` Python subprocess, real SQLite store) on a throwaway Electron profile
so no credential existed, with the renderer put into Chromium's offline state
via `Network.emulateNetworkConditions` — stronger than pulling the Wi-Fi,
because it also fails loopback and every attempt is recorded.

What was done and what was seen:

| Step | Observed |
|---|---|
| Status with no key | `available: false`, `mode: "unavailable"`, "No model provider is configured. The rest of the app remains available offline." Header badge: "Network off · No key configured for Anthropic" |
| All five pages reachable | Run Configuration, Results ("No results yet"), Run History, Comparison, Describe a Run — all rendered |
| Configure | Gate time 50, measurement time 100 → "Ready to run. Your configuration is valid.", Run enabled |
| Run #1 | Real estimate returned: **38,495 physical qubits, 431 ms runtime**, 18 × T, code distance 7 |
| Run #2 | Gate time 80 / measurement 160 → **38,495 qubits, 690 ms** |
| History | 2 rows on screen; `window.store.list()` returned both from SQLite, `provenance: null` on each (hand-authored) |
| Compare | Comparison view with both columns; Physical Qubits 38,495 / 38,495, Runtime 690 ms / 431 ms |
| Export | "Export run as Markdown", **277 lines**, correct heading/status/application/architecture/QEC/factory |
| **Network requests** | **0** — across the entire workflow |

### Defect 5 · The end-to-end walkthrough — performed

Same running app. The provider key was entered by the PM into the throwaway
profile, which was deleted afterwards along with its `provider-credential-anthropic.enc`
blob (`0o600`, as designed).

| Link | Observed |
|---|---|
| No key → app fully usable | Defect 4 above. "Review request" correctly **disabled** with a prompt typed, and the panel says why |
| Key entered and validated | "Key validated and stored. Networked features are on." Badge → "Network on · Anthropic/claude-sonnet-5" |
| **Wrong key → clear message, not a crash** | A deliberately invalid placeholder produced *"The provider rejected this key. Check it was copied correctly and has not been revoked."* — app alive, status still `unavailable`, nothing stored |
| Prose in | Review panel showed the exact **18,458-byte** outbound body, read back from the process that sends it; **no `api-key` / `authorization` / `bearer` field anywhere in it** |
| Draft proposed | Real `claude-sonnet-5` response mapped into the form |
| **The new panel** | "Drafted by Anthropic/claude-sonnet-5 — The model chose **11 fields**." Listed: Application Type, Benchmark (Grover's Search), Search Qubits 20, Architecture, Error rate, Gate time 50, Measurement time 100, Magic State Factory, T Count Per Rotation, CCX Magic States, Total Error |
| Jump affordance | Clicking "Gate time" scrolled to and flashed the control (`.field--flash` present) |
| Draft edited in the form | Gate time 50 → **65**; the panel still records the model's proposed 50, by design |
| Run | Succeeded |
| **Saved record carries provenance** | `{ authoredBy: "model_assisted", model: "Anthropic/claude-sonnet-5" }`, with `architecture.gateTime: 65` — the analyst's edit, not the model's 50 |
| **Key unreadable from the renderer** | `window.agent` exposes exactly `getStatus, previewRequest, requestDraft, configureCredential`; the object is **frozen** and its property is **non-configurable and non-writable**, so it cannot even be substituted from the page |
| Nothing leaked to the store | No prompt text, no `sk-` string, no provider response in `run-history.sqlite`. `localStorage` holds only `qre-theme` and the non-secret provider/model preference |

---

## Definition of Done

### The defect list — all five closed

- [x] Provenance is inside the schema gate; `useRunFlow` no longer mutates `config`
- [x] A test covers it, and it fails when the fix is reverted (verified by reverting)
- [x] `demoAgentService` is no longer an implicit fallback — deleted; choice stated above
- [x] The dot uses a token, correct in light and dark (3.18:1 / 7.10:1 measured)
- [x] Offline demonstrated, not asserted — table above, 0 network requests
- [x] The end-to-end walkthrough performed once, in the running app
- [x] A wrong key produces a clear message, not a crash

### The improvement

- [x] One improvement shipped
- [x] The PR explains the design and why (§ Part B)
- [x] Genuinely usable, not a scaffold — reachable on every model-assisted draft,
      keyboard operable, and it moves the analyst to the control it names
- [~] "Posted in the channel before it was built" — **not applicable.** This is
      PM-executed work after the track moved off Team 1; the reasoning is written
      down here instead, which is what that box exists to produce

### The week-5 constraints survive

- [x] **The key never enters the renderer** and is not written to
      `run-history.sqlite`, a config JSON, or `localStorage`. Grepped, and
      checked live against the real store and `localStorage`
- [x] **There is still no getter.** `window.agent` is `getStatus |
      previewRequest | requestDraft | configureCredential`, frozen and
      non-configurable
- [x] **The model still produces a draft `FormState`, never a `RunConfig`.**
      `draftToFormState` returns `DraftHandoff`; the added `proposed` list is
      display-only and reaches no serializer
- [x] **Existing validation is still the only execution gate** — and is now a
      *stricter* one, since it finally inspects provenance
- [x] **The analyst still sees the literal payload**, read back from the sending
      process (18,458 bytes, verified carrying no auth field)
- [x] **The canonical schema is unchanged**; the lowered generation schema is
      untouched. `git diff` over `shared/contracts/` is empty
- [x] **The drift test still asserts set equality**, uniqueness check intact —
      `runconfigGenerationCoverage.ts` and `runconfig-generation.test.ts` are
      byte-identical to `main`
- [x] **The feature is still removable** — nothing in config → run → history →
      export imports agent code. `RunConfiguration` imports only the
      `ProposedField` *type* from `agent/draftToFormState`, which erases at
      compile time
- [x] **No network call happens without an explicit user action** — 0 requests
      across the whole offline workflow

### Testing

- [x] `npm run typecheck` clean — **both projects run separately**, both exit 0
- [x] `npm test` green: **60 files, 680 tests** (was 58 / 654)
- [x] Every changed behaviour has a test that fails when reverted; verified by
      actually reverting the Defect 1 gate change and watching it go red
- [x] No test skipped, `.only`'d, or deleted
- [x] Keyboard operable and legible in both themes — panel entries are real
      buttons, tab-reachable, Enter-activatable (tested); rendered and screenshotted
      in light and dark

### Quality

- [x] Strict TypeScript, no `any` at boundaries, contract types imported from
      `shared/types.ts`
- [x] New CSS uses tokens only; no hardcoded colour introduced, and one removed
- [x] Reasoning for each non-obvious decision is in the file, not only here

### Process

- [~] "Worked on `week-6/team-1`" — **no.** On `week-6/llm-interface-improvements`,
      off current `main`, because `week-6/team-1` now carries a different track
- [~] Work split / both names in the commit log — **not applicable**, PM-executed
- [ ] **Merged to `main`** — not done here; staging and commits are the PM's

---

## Notes for the channel (found, deliberately not built)

1. **`mode: "local_demo"` has no producer in the shipped app.** With the demo
   fixture gone, nothing in main ever returns it — `agentHandler` returns only
   `unavailable` or `provider`. The "Offline demo" badge in `AgentInterface` and
   the `isDemo` branch in `NetworkStatus` are therefore unreachable in Electron.
   Removing the mode is a product decision, not a defect fix, so it stayed.
2. **`--color-success-text` is referenced but never defined.**
   `.agent-success` reads `var(--color-success-text, var(--color-body))`, so the
   credential panel's success message renders as body text. One line to fix;
   left alone to keep Defect 3 to its stated scope.
3. **The proposal panel could mark entries the analyst has since overridden.**
   The data is there (proposed `FormState` vs current `FormState`); it needs a
   path-level reader and a comparison rule for arrays. Real value, roughly
   doubles the surface — a follow-up, not a smuggled second improvement.
4. **A model draft still discards a half-filled form** — Candidate 1's first
   half, untouched and still true.
