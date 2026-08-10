# Week 6 — Team 1 (Sun Min + Emma) — Definition of Done: The LLM Interface

The bar for **Wed Aug 12 EOD**. Demoed from `main`, not a branch.

## The defect list — all five closed

- [ ] **Provenance is inside the schema gate.** The object validated by
      `validateRunConfigSchema` and the object passed to `execute` are the same
      object; `useRunFlow` no longer mutates `config` after `toRunConfig`
- [ ] **A test covers it** — provenance present in the validated object, and it
      fails if the fix is reverted
- [ ] **`demoAgentService` is no longer an implicit fallback in the shipped app.**
      Deleted, or made explicit and unhittable; the choice is stated in the PR
- [ ] **The network-status dot uses a token**, not `#22a06b`, and reads correctly
      in light and dark
- [ ] **Offline was demonstrated, not asserted.** With no provider configured and
      no network: configure → run → History → compare → export, all working, and
      the PR says what was done and seen
- [ ] **The end-to-end walkthrough was performed once, in the running app**, in
      order: no key → app usable → key entered and validated → prose in → draft
      proposed → draft edited in the form → Run → saved record carries provenance
      → key unreadable from the renderer
- [ ] **A wrong or expired key produces a clear message, not a crash**

## The improvement

- [ ] **One improvement shipped**, and it is the one that was posted in the
      channel before it was built
- [ ] **The PR explains the design and why** — this was your call to make, so the
      reasoning belongs in writing
- [ ] It is genuinely usable, not a scaffold: an analyst can reach it, use it, and
      understand what it did

## The week-5 constraints survive — non-negotiable

- [ ] **The key never enters the renderer** and is never written to
      `run-history.sqlite`, a config JSON, or `localStorage`. Grep-checkable, and
      grepped
- [ ] **There is still no getter.** No IPC channel returns the key; the renderer
      can only ask whether one is configured
- [ ] **The model still produces a draft `FormState`, never a `RunConfig`.** No
      path exists by which model output becomes a stamped config directly
- [ ] **Existing validation is still the only execution gate.** There is no
      "generated config" code path that skips `toRunConfig` or
      `validateRunConfigSchema`
- [ ] **The analyst still sees the literal payload before it is sent**, read back
      from the process that sends it rather than reconstructed in the renderer
- [ ] **The canonical schema is unchanged**; the lowered generation schema
      remains a separate artifact
- [ ] **The drift test still asserts set equality** against
      `runconfig.schema.json`, with the uniqueness check intact. It was not
      relaxed to accommodate a change
- [ ] **The feature is still removable** — nothing in the core config → run →
      history → export path imports agent code
- [ ] **No network call happens without an explicit user action**

## Testing

> The section that did not happen last week. Every line here is cheap.

- [ ] **`npm run typecheck` is clean on the merge commit.** If it went red at any
      point, both projects were run separately — the `&&` short-circuits and an
      error count on a red tree is a floor, not a total
- [ ] **`npm test` is green on the merge commit**, not on an earlier commit
- [ ] **Every behaviour changed has a test that fails when the change is
      reverted**, and this was verified by actually reverting one
- [ ] **No test was skipped, `.only`'d, or deleted** to make the suite pass
- [ ] **Every surface touched is keyboard operable and legible in both themes**

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] New CSS uses tokens; no hardcoded colours introduced
- [ ] The code you added meets the standard of the code you inherited — the
      reasoning for a non-obvious decision is in the file, not only in the PR

## Process

- [ ] **Worked on `week-6/team-1`**, the branch the PMs created off `b6a5091` —
      not a branch of your own, and not one based on week 5
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **The improvement choice was posted in the channel before it was built**
- [ ] **Halfway gate honored** — Part A done by Tuesday's checkpoint, or Part B
      dropped and said so in the channel
- [ ] **Scope was not grown.** Anything found beyond the five defects and the one
      improvement went to the channel as a note, not into the branch
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Wed Aug 12 EOD**; teammate reviews first. A PR opened
      Wednesday evening is not a delivery

## Explicitly NOT required

- **A second improvement** — one, finished, beats two started · **any MCP work**,
  the scaffold, `@modelcontextprotocol/sdk`, or anything under `main/mcp/`
  (Team 2) · **`main/sqliteRunStore.ts`, including the WAL question** (Team 2) ·
  **the open-source question** — LICENSE, CONTRIBUTING, repo visibility (Team 3) ·
  **the Results-page `qreVersion` regression** and **the History
  compare/delete selection change** — both are tracked PM items from the PR #22
  review, and neither is yours · **a contract-change PR** — v1.4.0 stands ·
  **automated circuit creation** · **consumer-subscription OAuth** · **a third
  provider adapter** — two work; a third proves nothing · **packaging or
  installers** — deferred to week 7+ · **rewriting the drift test or the
  credential module** — they are the two best things in the repo, and improving
  the interface does not require touching either.
