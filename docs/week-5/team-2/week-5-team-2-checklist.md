# Week 5 — Team 2 (Melody + Rishabh) — Checklist: The LLM Interface

**Due: Wednesday Aug 5 EOD** — the single deadline for the week.
**Tue Aug 4** 5–6pm is the checkpoint meeting.
Read first: `../week-5-overview.md`, `week-5-team-2-technical-brief.md`, and
[`docs/agentic-integration-research.md`](../../agentic-integration-research.md)
§4 (credential storage) and §8.1 (the schema finding) — plus its Currency note,
which lists what has drifted since it was written.
Check items off as you go (edit + commit).

Your mission in one line: **an analyst describes a run in prose, reviews what the
model proposes, and presses Run — with the key never leaving the main process.**

**Work split — fill this in at kickoff and commit it:**

- Melody: _______________________
- Rishabh: _______________________
- Shared / pairing on: _______________________

## A. Day 0

- [ ] **Wait for the channel go-ahead** confirming contract v1.4.0 is on `main`,
      then create `week-5/team-2` off `main`. It merges to `main` by
      **Wed Aug 5 EOD**
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, then
      `npm run typecheck && npm test` — green before you change anything
- [ ] Confirm the **provenance field** landed in v1.4.0 and read its shape. Use
      it; don't add your own
- [ ] **Decide and post your design in the channel** — where the entry point
      lives, what the proposal panel does, which provider you adapt first. The
      design is yours; sharing it early is how the PMs stay out of your way

## B. Face the schema problem before you build on it

- [x] **Re-count the unsupported keywords** in `runconfig.schema.json` after
      v1.4.0 — `if`/`then`, `not`, `allOf`, `exclusiveMinimum`, `format` are all
      rejected by strict structured-output modes
- [x] Decide your approach: a **lowered generation schema** derived from the
      canonical one, or something else you can defend
- [x] **The canonical schema stays the real gate** via the existing
      `validateRunConfigSchema()` — a bad draft surfaces as ordinary Ajv errors in
      `ValidationSummary.tsx`, not a new failure surface
- [x] **Write the drift test** — it fails when the canonical schema gains
      something the lowered one doesn't have. This outlives the feature
- [ ] **Halfway gate:** if the model has not produced one valid draft
      configuration by the time you're half through the week, escalate. Consider
      the deterministic-parser alternative in the brief rather than pushing on

## C. Credential storage — the constraints, verbatim

- [ ] Key stored via **`safeStorage`**, encrypted blob under
      `app.getPath("userData")`
- [ ] **Never** in `run-history.sqlite`, a config JSON, `localStorage`, or
      renderer memory — grep-checkable
- [ ] **`getSelectedStorageBackend()` checked**; on `basic_text` the app refuses
      to store a key and says why
- [ ] **No getter.** The renderer can ask "is a provider configured?" and get a
      boolean; there is no channel that returns the key
- [ ] Validate the key once on entry with a cheap request, and report failure as
      data

## D. The preload surface

- [ ] A **fifth** surface, alongside `estimator`, `uploads`, `store`, `files`
- [ ] **Estimator convention:** provider failures — 401, 429, TLS, network down,
      timeout, refusal — **resolve** carrying a typed failure
- [ ] **Reject only on programmer error:** a draft requested with no credential,
      or any attempt to read the token back
- [ ] Note in your PR whether the week-4 architecture doc's decision rule was
      actually usable for this — it was written for exactly this moment

## E. The feature

- [ ] Prose in → a **draft `FormState`**, never a stamped `RunConfig`
- [ ] Every proposed field is visible and editable before anything runs
- [ ] Nothing runs until the analyst presses the existing Run button — `id` and
      `createdAt` are still stamped only there
- [ ] **The analyst sees exactly what will be sent, before it is sent**
- [ ] A **permanent, visible indicator** of whether networked features are on and
      which provider they point at
- [ ] Model-assisted runs carry the v1.4.0 **provenance** value

## F. The offline non-negotiable still holds

- [ ] **With no provider configured and no network**, configuration, execution,
      history, comparison, and export all still work — demonstrated, not asserted
- [ ] No key, prompt, or provider response is ever written to
      `run-history.sqlite`
- [ ] The feature is removable — nothing in the core path depends on it existing

## G. The renames on your surfaces

- [x] **Max Error → Total Fault Tolerant Execution Error** and **T States /
      Rotation → T Count Per Rotation** in `historyLabels.ts`, the Markdown
      export, and the comparison table
- [x] **Contract field ids unchanged** — `maxError`, `tStatesPerRotation`
- [ ] Confirm in the channel that Team 3's half (the configuration form) is
      landing the same week — exported numbers and on-screen labels must agree

## H. Acceptance prep

- [ ] Keyboard + label pass on every new surface; legible in both themes
- [ ] Walk through `week-5-team-2-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough rehearsed: no key configured → app fully usable →
      key entered and validated → prose in → draft proposed and edited → Run →
      record carries provenance → key unreadable from the renderer → renamed
      labels agree between screen and export
- [ ] `npm run typecheck && npm test` green; **merged to `main` by Wed Aug 5
      EOD** — acceptance from `main`, not a branch

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **`formState.ts` is Team 3's this week.** You'll need to read it to build a
  draft. Read it, don't reshape it — coordinate in the channel before any change
  there.
- **If the schema problem turns out bigger than the week**, say so early. The
  deterministic-parser alternative in the brief is a legitimate outcome, not a
  retreat — but it's only legitimate if you raise it on Monday, not Wednesday.
- **Merged, not opened.** Week 4 had three PRs open at the deadline and nothing on
  `main`. If your teammate hasn't reviewed by Tuesday, say so and a PM will.
- **Below the line this week:** automated circuit creation, consumer OAuth, Part 3
  export hardening.
