# Week 5 — Team 2 (Melody + Rishabh) — Definition of Done: The LLM Interface

The bar for **Wed Aug 5 EOD**. Demoed from `main`, not a branch.

## Functional

- [ ] **An analyst can describe a run in prose and get a proposed
      configuration** — demonstrated live, end to end, against a real provider
- [ ] **Every proposed field is visible and editable** before anything runs
- [ ] **Nothing runs until the analyst presses Run.** `id` and `createdAt` are
      still stamped only in `useRunFlow`
- [ ] **The analyst sees exactly what will be sent, before it is sent**
- [ ] **A permanent, visible indicator** shows whether networked features are on
      and which provider they point at
- [ ] **A key can be entered, validated once, and stored**; a wrong or expired
      key produces a clear message, not a crash
- [ ] **Model-assisted runs carry the v1.4.0 provenance value** into the saved
      record
- [ ] **The renames are live on your surfaces** — Total Fault Tolerant Execution
      Error and T Count Per Rotation in `historyLabels.ts`, the Markdown export,
      and the comparison table

## Security & correctness — the non-negotiable half

- [ ] **The key is stored via `safeStorage`** as an encrypted blob under
      `app.getPath("userData")`
- [ ] **The key appears nowhere else** — not in `run-history.sqlite`, a config
      JSON, `localStorage`, or renderer memory. Grep-checkable, and grepped
- [ ] **`getSelectedStorageBackend()` is checked**, and on `basic_text` the app
      refuses to store a key and explains why
- [ ] **There is no getter.** No IPC channel returns the key to the renderer; the
      renderer can only ask whether one is configured
- [ ] **The new preload surface follows the estimator convention** — provider
      failures resolve as typed failures; only programmer errors reject
- [ ] **The model produces a draft `FormState`, never a `RunConfig`** — no path
      exists by which model output becomes a stamped config directly
- [ ] **Existing validation is the only execution gate.** There is no
      "generated config" code path that skips `toRunConfig` or
      `validateRunConfigSchema`
- [ ] **The canonical schema is unchanged** and remains the real validator; any
      lowered generation schema is a separate artifact
- [ ] **A drift test exists** that fails when the canonical schema gains
      something the generation schema doesn't have
- [ ] **No key, prompt, or provider response is written to the run store**

## The offline non-negotiable survives

- [ ] **With no provider configured and no network, the app is fully usable** —
      configuration, execution, history, comparison, and export all work.
      Demonstrated, not asserted
- [ ] **The feature is removable** — nothing in the core path depends on it
- [ ] **No network call happens without an explicit user action**

## Quality

- [ ] Strict TypeScript; no `any` at boundaries; contract types imported from
      `app/src/shared/types.ts`, never re-declared
- [ ] Every new surface is keyboard operable and legible in both themes
- [ ] `npm run typecheck` and `npm test` green on the merge commit
- [ ] The PR describes the design you chose and why — this was your call to make,
      so the reasoning belongs in writing

## Process

- [ ] Team branch `week-5/team-2` created at kickoff off a `main` carrying v1.4.0
- [ ] **The design was posted in the channel early**, not revealed at the
      checkpoint
- [ ] **No contract-change PR opened by this team** — provenance came from the
      PMs at kickoff
- [ ] **`formState.ts` was read, not reshaped** — any change there was
      coordinated with Team 3 in the channel first
- [ ] **Halfway gate honored** — one valid draft configuration produced by
      mid-week, or an escalation posted
- [ ] Checklist file updated with boxes checked
- [ ] **Team branch merged to `main` by Wed Aug 5 EOD**; teammate reviews first,
      and a PM reviews the credential-storage and preload seam. A PR opened
      Wednesday evening is not a delivery
- [ ] Acceptance walkthrough rehearsed: no key → app fully usable → key entered
      and validated → prose in → draft proposed and edited → Run → provenance in
      the record → key unreadable from the renderer → labels agree between screen
      and export

## Explicitly NOT required

- **Automated circuit creation** — generating Q#/OpenQASM/QIR from a prompt.
  Deliberately out; a wrong circuit is invisible until the numbers are in a
  report · **consumer-subscription OAuth** ("log in with your Claude account") —
  prohibited by Anthropic's Feb 2026 terms and no provider issues us a
  `client_id` · **more than one provider adapter** — one working adapter beats two
  half-wired ones · **Azure OpenAI / Entra ID** — a real option, but it needs an
  app registration we don't own · **Part 3 export hardening** — native save
  dialog, full-field export, version-tracking enforcement · **anything in
  `renderer/components/`, `renderer/state/`, `renderer/constants/`, or
  `main/engine/`** (Team 3), including the renames in the configuration form ·
  **MCP** or any design of an agent driving our app (Team 1) · **a contract-change
  PR** · packaging or installers (week 6)
