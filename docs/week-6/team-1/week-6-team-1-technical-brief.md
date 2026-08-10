# Week 6 — Team 1 (Sun Min + Emma) — Technical Brief: Improve the LLM Interface

Your track: **take the natural-language interface Team 2 built in week 5 and
make it something you would put in front of an analyst.**

You did not write this code. That is the point of the rotation, and it is also
the first thing to plan around: **budget your first sitting for reading, not
typing.** The feature is about 1,275 lines across `renderer/agent/` plus six
files in `main/`, and it is unusually well commented — the reasoning is in the
files, not lost.

## What you are inheriting, and its condition

Week 5's Team 2 branch landed on `main`. At review time the feature was inert;
it is not any more. Verified on `main` at `b6a5091`:

| Piece | Where | State |
|---|---|---|
| Credential storage | `main/credentialStore.ts`, `credentialHandler.ts`, `credentialValidator.ts` | **Done and good.** `safeStorage`, no getter, refuses on `basic_text`, `0o600` on the blob |
| Provider adapters | `main/anthropicDraftGenerator.ts`, `main/openAiDraftGenerator.ts` | **Two of them**, both wired |
| IPC seam | `main/agentHandler.ts`, registered at `main/main.ts:89` | **Wired.** Failures resolve as typed data; only programmer errors reject |
| Key entry UI | `renderer/agent/ProviderCredentialPanel.tsx` | **Exists.** A key can be entered, validated once, and stored |
| The interface | `renderer/agent/AgentInterface.tsx` (232 lines) | Prompt → **Review request** → Send → draft |
| Draft → form | `renderer/agent/draftToFormState.ts` | Maps a strict proposal into a `FormState` |
| Lowered schema + drift test | `shared/contracts/runconfig-generation.schema.json`, `runconfigGenerationCoverage.ts` | **The best artifact in the repo.** Do not weaken it |
| Provenance | `state/useRunFlow.ts` | Present, and attached the wrong way — see Defect 1 |

**Read `AgentInterface.tsx:55-70` first.** The comment there explains why the
reviewed payload is stored *with the request that produced it* rather than as a
separate `reviewing` flag. It is the clearest single example of the standard this
code was written to, and your changes should meet it.

## Your week is two things: a closed defect list, and one improvement

The defect list is small and fixed. The improvement is one item, chosen by you.
**Nothing else.** If you find a seventh thing, it goes in the channel as a note,
not into the branch.

---

## Part A — The defect list (closed; all five are required)

### Defect 1 — Provenance is attached outside the schema gate

`state/useRunFlow.ts:86-91`:

```ts
const config = toRunConfig(state, stamp());
if (config === null) return;
if (provenance !== undefined) config.provenance = provenance;
```

The Run button is gated on `validateRunConfigSchema(previewConfig)`, and
`previewConfig` is built **without** provenance
(`RunConfiguration.tsx:132-134`). So the object that actually executes carries a
field the schema gate never inspected.

This is safe *today* — the canonical schema does define `provenance` and the only
producer is the app itself. It is still a hole in the invariant the whole feature
rests on: *existing validation is the only execution gate.* Close it by threading
provenance through `toRunConfig`'s stamp rather than mutating after the fact, so
the validated object and the executed object are the same object.

**The test that proves it:** a model-assisted run whose provenance is present in
the object passed to `validateRunConfigSchema`, not only in the object passed to
`execute`.

### Defect 2 — `demoAgentService` is in the production fallback chain

`App.tsx:88`:

```ts
const resolvedAgentService = agentService ?? window.agent ?? demoAgentService;
```

In Electron, `preload.ts` always defines `window.agent`, so the third branch is
unreachable in the shipped app. It is very much reachable under test, which means
**the suite exercises a fixture path production can never take** — a green run
says nothing about whether the real seam works.

Decide and defend one of: delete `demoAgentService` and inject the fake in the
tests that need it, or keep it and make the fallback explicit and impossible to
hit by accident. Either is fine. Silently leaving a demo double in the resolution
order of the shipped app is not.

### Defect 3 — Two hardcoded colours on the network-status dot

`styles.css:365-366`:

```css
.agent-status--on .agent-status__dot {
  background: #22a06b;
  box-shadow: 0 0 0 3px color-mix(in srgb, #22a06b 18%, transparent);
}
```

170 lines of otherwise token-clean CSS, and the one colour that has to read
against both themes is the one that is hardcoded. Move it to a token and check it
in light **and** dark.

### Defect 4 — The offline non-negotiable has never been demonstrated

`docs/tech-stack.md` §Non-negotiables says no network calls are required for core
workflows. The feature only lives inside that rule if configuration, execution,
history, comparison, and export all work with **no provider configured and no
network**.

This has been statically audited — no agent import anywhere in the core path —
and never run. **Run it.** No key configured, network off, then: configure a run,
execute it, open History, compare two runs, export one. Write down in the PR what
you did and what you saw.

### Defect 5 — The end-to-end walkthrough has never been performed

No one has ever recorded doing this in order:

> no key configured → app fully usable → key entered and validated → prose in →
> draft proposed → draft edited in the form → Run → the saved record carries
> provenance → the key is unreadable from the renderer

Do it once, in the running app, and record it. **A wrong key should produce a
clear message, not a crash** — check that too; `providerErrorBody.ts` exists to
make the provider's own reason legible, so confirm it does.

---

## Part B — One improvement, and it is yours to choose

**Pick one. Post which one, and why, in the channel before you build it.** The
design is yours in the same way week 5's was Team 2's — we want your answer, not
ours with your name on it.

Two candidates are named below because both are real gaps we can point at. If you
have a third you can argue for, argue for it in the channel first.

### Candidate 1 — A model proposal silently discards the analyst's work

`App.tsx:245` hands the draft to the form as `initialDraft={draftHandoff?.state}`,
and `draftToFormState` builds that state from `createInitialFormState()` plus the
proposal. So an analyst who has half-filled the configuration form, then asks the
model for help, **loses everything they had typed** — with no warning and no way
back.

Worse for the review step specifically: the analyst is asked to review a draft
without being shown *what changed*. "Review before you run" only means something
if the thing under review is legible, and right now the proposal arrives as a
fully-populated form with no indication of which of its ~40 fields the model
actually chose versus which are defaults it never mentioned.

Fixing either half of this is a week. Fixing the second half — **show the analyst
what the model actually set** — is the one with more value per hour, because it
makes the existing review step honest rather than adding a new one.

### Candidate 2 — There is no way to refine a proposal

The interaction is single-shot: prompt in, draft out. An analyst who gets a draft
that is right except for the architecture has to rewrite the whole prompt from
scratch, and the second request has no knowledge of the first.

"Now make it Majorana" is the single most obvious thing a person will try with a
natural-language interface, and today it does not work. Whether the fix is
conversational context, a structured "adjust this field" affordance, or something
else is a design question — and it is genuinely yours.

**Whichever you pick, the constraints from week 5 are unchanged and are not
design choices:** the key never enters the renderer; the model produces a draft
`FormState`, never a `RunConfig`; existing validation is the only execution gate;
the analyst sees exactly what will be sent before it is sent; the app works
completely with no provider configured.

---

## The drift test is load-bearing — do not weaken it

`shared/contracts/runconfigGenerationCoverage.ts` asserts that every canonical
`RunConfig` leaf is classified **exactly once** as generated, app-controlled, or
excluded, by set equality against `runconfig.schema.json`. Add a field to the
canonical schema and this test fails until a human decides what the model may do
with it.

If your improvement makes it fail, **the answer is to classify the new field, not
to relax the assertion.** If you find yourself editing the test to make it pass,
stop and post in the channel.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| Anything under `main/mcp/`, the MCP scaffold, `@modelcontextprotocol/sdk` | Team 2 |
| `main/sqliteRunStore.ts`, including the WAL question | Team 2 |
| The open-source question — LICENSE, CONTRIBUTING, repo visibility | Team 3 |
| `renderer/components/`, `renderer/constants/`, `main/engine/` | Nobody this week — don't drift into them |
| The Results-page `qreVersion` regression and the History selection change | PM — both are tracked from the PR #22 review |
| Opening a contract-change PR | Nobody. v1.4.0 stands |
| Automated circuit creation, consumer-subscription OAuth | Out of scope, deliberately |
| Packaging or installers | Deferred to week 7+ |

**You will touch `renderer/state/useRunFlow.ts` and `renderer/state/validation.ts`
is adjacent to it.** Nobody else is in `renderer/state/` this week, so this is
yours without coordination — but note that Preston's PR #22 changed
`normalizeFormState` and `draftToFormState` as a pair on Aug 9. **Rebase and read
both before you edit either.**

## Quality bar

Strict TypeScript, no `any` at boundaries, contract types imported from
`app/src/shared/types.ts` rather than re-declared. Every new surface keyboard
operable and legible in both themes. No key, prompt, or provider response written
to `run-history.sqlite`. `npm run typecheck` and `npm test` green **on the commit
you merge** — and see the overview's note about the `&&` short-circuit before you
trust a clean run on a red tree.
