# Week 6 — Team 3 (Neil + Jessie) — Definition of Done: Open-Source Readiness

The bar for **Tue Aug 18 EOD**. Read from `main`, not a branch.

> The direction is set — Microsoft wants this open-sourced under the PlexTech
> account. You are graded on **how, in what order, and what could go wrong**, not
> on whether.

## The document exists and is actionable

- [ ] **`docs/week-6/team-3/open-source-readiness.md` is on `main`**, in Markdown,
      cross-referenced by relative path
- [ ] **A Google Doc mirror exists**, stamped with export date and source commit,
      stating at the top that the repo copy is canonical
- [ ] **Exactly two artifacts.** No second summary document in the repo — a summary
      is a section at the top of the same file
- [ ] **The document names the commit SHA it was verified against**, and is dated
      the day it was finished
- [ ] **A sequenced publication runbook exists** — ordered steps, an owner per
      step, and **which steps are irreversible clearly marked**
- [ ] **Conditions that should gate the switch being flipped** are stated

## Ownership and authority

- [ ] **Who signs off is named** — a person or a role, accountable after
      publication as well as at it
- [ ] **The repository transfer is described** — it is on a personal account today,
      and the consequences for forks, stars, issue links, and clones are stated
- [ ] **Microsoft's material inside our repo is accounted for** —
      `docs/features-and-fields.md` (transcribed from a Microsoft doc, and now in
      the app's source as tooltip copy), the Q# benchmark programs, and `qdk[qre]`
- [ ] **For each: can it be published as-is**, and does it need attribution, a
      notice file, or permission we do not have?
- [ ] **Questions that cannot be answered here are written out, with the person who
      answers them named.** Nothing was resolved by assumption

## Licensing

- [ ] **Dependency licenses were re-verified**, not taken from the brief
- [ ] **`qdk[qre]`'s license was found and linked to its primary source**, with a
      statement of what it permits for a derivative tool and whether shelling out
      differs from depending on it
- [ ] **`qsharp-lang` and anything vendored, transcribed, or copied is accounted
      for**
- [ ] **A license is recommended**, with what the choice buys and costs
- [ ] **What Microsoft's own quantum repositories use is noted**, with whether
      matching them buys anything

## History and secrets — the irreversible half

- [ ] **A scan was actually run over the full history, all branches** — not just
      `HEAD`, and not "we should probably check"
- [ ] **The tool is named**, and what it covers and does not cover is stated
- [ ] **Untracked-but-unignored paths were checked**, and a `.gitignore`
      recommendation exists to protect against a bulk `git add -A`
- [ ] **What the scan found is stated.** If something was found, it was reported
      privately in the channel and the document records only that a finding exists
      — **never the value**
- [ ] **Options and costs are laid out** if something is found, including that
      history rewriting invalidates every existing clone and open PR
- [ ] **Nothing was fixed.** No key, no path, no file

## Readiness

- [ ] **The minimum file set is enumerated**, with a defended line between
      load-bearing and cargo-cult
- [ ] **The outward-facing readability of existing docs is assessed**
- [ ] **The files are drafted as appendices** — a PM can copy an appendix into a
      file and commit it
- [ ] **The README's outward-facing opening and the SECURITY disclosure policy are
      both drafted** — the two that cannot be templated without thought
- [ ] **They are appendices, not files.** No `LICENSE`, `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, or `SECURITY.md` was created

## Maintenance

- [ ] **The contract as a public API is addressed** — `schemaVersion: 1.4.0`,
      `additionalProperties: false`, two bumps in six weeks, whether it becomes
      semver, and what counts as a breaking change
- [ ] **Release cadence and versioning**, coordinated with Team 1 so two schemes
      were not proposed
- [ ] **Merge rights and review** for contributors outside the channel
- [ ] **Issue triage**, with an honest response time
- [ ] **A dependency and security update policy**, consistent with the guard
      Team 1 implemented
- [ ] **The `qdk[qre]==1.30.0` pin** — who bumps it, how often, and what proves a
      bump is safe
- [ ] **Two or three comparable public projects were actually examined** — Qiskit,
      Cirq, or Microsoft's QDK repos — with which of their choices fit our size and
      which need staff we do not have
- [ ] **Every maintenance recommendation is specific to this repository.** Nothing
      that would read identically for any project survived
- [ ] **There is at least one number** — files, days, or ongoing hours per month

## Risks

- [ ] **The strongest version of each honest risk is stated and not argued away** —
      an unmaintained public repo being worse than none, nobody assigned past the
      summer, a published schema constraining us, stranger issues as unfunded work

## Accuracy

- [ ] **Every claim about the repository names the file it lives in**
- [ ] **Every line-anchored claim was re-checked at the pinned SHA** before
      submission
- [ ] **Every external claim links to its primary source** — the license text
      itself, not a summary. No placeholder citations, no *"verify current
      permalink"*
- [ ] **Every inference is labelled as an inference**
- [ ] **Team 1's findings are cited and current** as of what they actually landed,
      not as of what they were investigating
- [ ] **A reader from Team 1 or Team 2 has read it** and can say what they would do
      first; **the reader's name and date are recorded in the document**

## Reviews

- [ ] **The author read the whole document cold** before requesting review — a
      readiness document that contradicts itself between sections is the failure
      mode here, and it is only visible on a full read
- [ ] **Every merge was reviewed by the teammate**, not just the last one
- [ ] **Anything noticed about the repository outside this remit was reported in
      the channel**, not silently dropped and not fixed

## Testing

> A documentation week still has things that can be wrong, and this is exactly
> where the equivalent deliverable lost points last week.

- [ ] **`git diff --name-only main...HEAD -- app/` returns nothing**, and the
      result is pasted in the PR
- [ ] **`git diff --name-only main...HEAD` shows only the one document** — no
      community files, no `.gitignore` edit
- [ ] **Every link in the document resolves**
- [ ] **No `[TODO]`, placeholder, `Status: DRAFT`, or note-to-self** survives into
      the merged file
- [ ] **No secret value appears anywhere in the document**
- [ ] **The reader sign-off is filled in**, not a blank template

## Process

- [ ] **Worked under `week-6/team-3`**, the branch the PMs created off `main` at kickoff
- [ ] **Each section had its own `week-6/team-3-<thing>` branch** that PR'd into
      the team branch. Nothing was committed straight to the team branch
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **The boundary with Team 1 was agreed on day one**, and the code security
      review was not duplicated
- [ ] **Work was merged in sections** rather than held for a single Tuesday drop
- [ ] **Mid-point gate honored** — the secret scan was run by the Tue Aug 11
      checkpoint, or an escalation was posted
- [ ] **Anything the scan found was escalated immediately and privately**, not held
      until the document
- [ ] **No file under `app/` was modified.** Grep-checkable
- [ ] **No repository setting was changed**, and the repo was not made public
- [ ] **Any bug found while researching was reported in the channel, not fixed**
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Tue Aug 18 EOD**; teammate reviews first. A PR opened
      Tuesday evening is not a delivery

## Explicitly NOT required

- **Creating any of the files you recommend** — `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue or PR templates, or a `.gitignore`
  edit. Draft them as appendices; committing them is a decision your document
  recommends, not a task it performs · **the code security review** — Electron
  posture, CSP, IPC, `npm audit`, CI (Team 1) · **editing
  `.github/workflows/ci.yml`** (Team 1) · **making the repository public,
  transferring it, or changing any repo setting** — not reversible, and the PMs'
  and PlexTech's call · **fixing anything a secret scan turns up** — report
  privately first · **executing the setup guide on a clean environment** — Team 1
  owns that this week · **resolving the ownership or Microsoft-IP questions
  yourselves** — ask them, don't answer them · **a legal opinion** — you are
  identifying what needs one, not providing it · **any source change** · **the LLM
  interface** (PMs) · **the MCP server** (Team 2) · **a contract-change PR** ·
  **packaging or installers** — deferred to week 7+.
