# Week 6 — Team 3 (Neil + Jessie) — Definition of Done: Open-Source Readiness

The bar for **Wed Aug 12 EOD**. Read from `main`, not a branch.

## The document exists and answers the questions

- [ ] **`docs/week-6/team-3/open-source-readiness.md` is on `main`**, in Markdown,
      cross-referenced by relative path
- [ ] **A Google Doc mirror exists**, stamped with export date and source commit,
      stating at the top that the repo copy is canonical
- [ ] **Exactly two artifacts.** No second summary document in the repo — a
      summary is a section at the top of the same file
- [ ] **The document names the commit SHA it was verified against**, and is dated
      the day it was finished
- [ ] **An explicit recommendation**, plus the conditions that would reverse it.
      "It depends" is not a deliverable; "don't do this" is a complete answer

## Ownership

- [ ] **The plausible owners are named** — PlexTech, Microsoft, UC Berkeley, the
      individual contributors — and what each claim would rest on
- [ ] **The question to be asked is written out, and the person who has to answer
      it is named**, phrased so a yes or no changes what we do
- [ ] **It was not resolved by assumption** in either direction

## Licensing

- [ ] **The dependency licenses were re-verified**, not taken from the brief
- [ ] **`qdk[qre]`'s license was found and linked to its primary source**, with a
      statement of what it permits for a derivative tool and for distributing an
      app that shells out to it
- [ ] **Vendored, transcribed, and copied content is accounted for** — including
      `docs/features-and-fields.md`, which is transcribed from a Microsoft document
- [ ] **A license is recommended**, with what the choice buys and costs

## History and secrets — the irreversible half

- [ ] **A secret scan was actually run over the full history, all branches** — not
      just `HEAD`, and not "we should probably check"
- [ ] **The tool is named**, and what it covers and does not cover is stated
- [ ] **What it found is stated.** If something was found, it was reported
      privately in the channel and the document records that a finding exists
      **without reproducing the value**
- [ ] **The options and their costs are laid out** if something were found,
      including that history rewriting invalidates every existing clone and PR
- [ ] **Nothing was fixed.** No key, no path, no file

## Readiness and maintenance

- [ ] **The minimum file set is enumerated**, with a defended line between
      load-bearing and cargo-cult
- [ ] **The outward-facing readability of existing docs is assessed**, including
      `setup-and-troubleshooting.md:189`'s open *"not yet"*
- [ ] **The contract as a public API is addressed** — `schemaVersion: 1.4.0`,
      `additionalProperties: false`, two bumps in six weeks, and what versioning
      discipline becomes when strangers depend on it
- [ ] **CI as a public surface is addressed**, including the stale
      `week-2/team-3` trigger and what a fork PR does
- [ ] **The two contributor day-one blockers are named** — `test:engine`
      unrunnable on a fresh checkout, and `typecheck`'s short-circuit
- [ ] **Release cadence, versioning, and merge rights are addressed**
- [ ] **A dependency and security update policy is proposed**
- [ ] **Every maintenance recommendation is specific to this repository.** Nothing
      that would read identically for any project survived
- [ ] **There is at least one number** — files, days, or ongoing time per month.
      A readiness assessment with no quantities has not looked

## The position

- [ ] **The strongest case against open-sourcing is stated and not argued away** —
      small audience, an unmaintained public repo being worse than none, possible
      value as an internal tool, nobody assigned to maintain it
- [ ] **The recommendation follows the evidence**, including where the evidence
      points away from the obvious answer

## Accuracy

- [ ] **Every claim about the repository names the file it lives in**
- [ ] **Every line-anchored claim was re-checked at the pinned SHA** before
      submission
- [ ] **Every external claim links to its primary source** — the license text
      itself, not a summary. No placeholder citations, no *"verify current
      permalink"*
- [ ] **Every inference is labelled as an inference** rather than presented as a
      verified fact
- [ ] **A reader from Team 1 or Team 2 has read it** and can say what they would
      do first; **the reader's name and date are recorded in the document**

## Testing

> A documentation week still has things that can be wrong, and this is where the
> equivalent deliverable lost points last week.

- [ ] **`git diff --name-only main...HEAD -- app/` returns nothing**, and the
      result is pasted in the PR
- [ ] **Every link in the document resolves** — relative paths open, external URLs
      load
- [ ] **No `[TODO]`, placeholder, `Status: DRAFT`, or note-to-self** survives into
      the merged file
- [ ] **The reader sign-off is filled in**, not a blank template

## Process

- [ ] **Worked on `week-6/team-3`**, the branch the PMs created off `b6a5091` —
      not a branch of your own
- [ ] **The work split at the top of the checklist was filled in at kickoff** and
      is still accurate, or was corrected in a commit
- [ ] **Both names appear in the commit log**
- [ ] **No file under `app/` was modified.** Grep-checkable
- [ ] **No `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`
      was added**, and `.github/workflows/ci.yml` was not edited
- [ ] **No repository setting was changed**, and the repo was not made public
- [ ] **Any bug found while researching was reported in the channel, not fixed**
- [ ] **Checklist file updated** — every box ticked, or annotated with one line
      saying why not. An unchecked box with a reason is a good outcome; an
      unchecked box with no reason reads as abandoned
- [ ] **Merged to `main` by Wed Aug 12 EOD**; teammate reviews first. A PR opened
      Wednesday evening is not a delivery

## Explicitly NOT required

- **Adding any of the files you recommend** — `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue or PR templates. Every one is a
  decision your document recommends, not a task it performs · **editing
  `.github/workflows/ci.yml`**, including the stale branch trigger — report it ·
  **making the repository public or changing any repo setting** — not reversible,
  and the PMs' and PlexTech's call · **fixing anything a secret scan turns up** —
  report it privately first · **executing the setup guide on a clean environment**
  — a real open item since week 4, but not this week's · **resolving the ownership
  question yourselves** — ask it, don't answer it · **a decision on whether we open
  source at all**, beyond your recommendation — the call is the PMs' and
  PlexTech's · **any source change** · **the LLM interface** (Team 1) · **the MCP
  server** (Team 2) · **a contract-change PR** · **packaging or installers** —
  deferred to week 7+.
