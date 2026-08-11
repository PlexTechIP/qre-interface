# Week 6 — Team 3 (Neil + Jessie) — Checklist: Open-Source Readiness

**Due: Tuesday Aug 18 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the mid-point checkpoint.
Read first: `../week-6-overview.md`, `week-6-team-3-technical-brief.md`, then
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
**as a model for form** — its labelling convention, its "established / could not
establish" shape, and its §0 recommendation. Not for its content.
Check items off as you go (edit + commit).

Your mission in one line: **a publication runbook a PM could execute without
asking you a question.**

**No code this week.** No branch that touches `app/`. No `LICENSE` file.
**One `.md` and one Google Doc.**

**Work split — fill this in at kickoff and commit it:**

- Neil: _______________________
- Jessie: _______________________
- Shared / pairing on: _______________________

> Week 5 shipped one commit from this team. This is not a formality — and a
> research week splits cleanly. §B/§C/§D (ownership, licensing, history) and
> §E/§F (readiness, maintenance) are two near-independent halves.

## A. Day 0

- [ ] `git fetch && git switch week-6/team-3` — **the PMs created it off `main`
      at kickoff.** Do not create your own team branch
- [ ] **Do not commit directly to the team branch.** Each section of the document
      gets its own branch off it, named `week-6/team-3-<thing>`, which PRs back in
      — e.g. `week-6/team-3-licensing` · `week-6/team-3-history-audit` ·
      `week-6/team-3-maintenance` · `week-6/team-3-runbook`.
      A document lands in sections; this is how your teammate reviews each one and
      how "merge in pieces" applies to a research week
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, `npm run dev` — you need
      the app running to reason about what publishing it means, even though you
      will not change it
- [ ] **Record the commit SHA you are verifying against**, at the top of your
      document, with the date. Every repository claim is pinned to it
- [ ] Re-verify the nine facts in the brief's table yourself. They were true at
      `b6a5091`; **say in the document that you checked**, and correct anything
      that has moved
- [ ] **Message Team 1 in the channel and agree the boundary.** They review the
      code; you review the repository and its history. Their findings go in your
      document — **ask them to tell you what they fixed versus filed**, or your
      document is stale on the day it lands

## B. Ownership and authority

- [ ] **Who signs off?** PlexTech has to accept the repo and someone has to be
      accountable afterwards. Name the person or role
- [ ] **The repository transfer.** It is on a personal account today. What does
      moving it involve, and what happens to forks, stars, issue links, and
      existing clones?
- [ ] **What in this repo is Microsoft's?** `docs/features-and-fields.md` is
      transcribed from a Microsoft Google Doc *and* the transcription now lives in
      the app's source as tooltip copy. Plus the Q# benchmark programs, plus
      `qdk[qre]` as a dependency
- [ ] For each: can it be published as-is, and does it need attribution, a notice
      file, or permission we do not have?
- [ ] **Write the questions you cannot answer, and name who answers them.** An
      assumed answer here is worse than an open one

## C. Licensing

- [ ] Confirm the dependency licenses yourself rather than trusting the brief. All
      JS deps MIT except TypeScript (Apache-2.0) is what we found
- [ ] **`qdk[qre]==1.30.0`** — find the actual license text, link the primary
      source, and say what it permits for a derivative tool and whether
      distributing an app that shells out to it differs from depending on it
- [ ] **`qsharp-lang`** and anything vendored, transcribed, or copied
- [ ] **Recommend a license** — and say what the choice buys and costs. The patent
      grant is not a footnote here
- [ ] Note what Microsoft's own quantum repositories use, and whether matching them
      buys anything

## D. History and secrets — the irreversible half

- [ ] **Run a real scan over the full history, all branches**, not just `HEAD`.
      Name the tool; say what it covers and what it does not
- [ ] **Check for untracked-but-unignored paths.** `.gitignore` covers
      `node_modules`, the venv, caches and `.DS_Store` — not everything present on
      a working tree. There is PM material in the repo directory that is neither
      tracked nor ignored, one `git add -A` from being permanent and public
- [ ] **Recommend what belongs in `.gitignore`** before anyone runs a bulk add.
      Flag the class of problem; do not enumerate contents
- [ ] **State what the scan found.** If it found something, **report it privately
      in the channel** and record in the document only that a finding exists and
      was reported — never the value
- [ ] Lay out the options and costs if something is found, including that history
      rewriting invalidates every existing clone and open PR
- [ ] **Fix nothing.** Not a key, not a path, not a stray file

## E. What has to exist before a stranger can use this

- [ ] Enumerate the minimum file set and **draw a defended line between
      load-bearing and cargo-cult**
- [ ] Assess the outward-facing readability of what exists. `README.md`,
      `setup-and-troubleshooting.md`, and `architecture.md` are all written for
      someone already on the team
- [ ] **Draft the files as appendices in your one document** — a PM should be able
      to copy an appendix into a file and commit it
- [ ] At minimum, draft **the README's outward-facing opening** and **the SECURITY
      disclosure policy** — the two that cannot be templated without thought
- [ ] **Appendices, not files.** Do not create `LICENSE`, `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, or `SECURITY.md`

## F. Maintenance — ground every item in this repo

> The section most likely to become a generic listicle. If a recommendation would
> read the same for any project, cut it or make it specific.

- [ ] **The contract becomes a public API.** `runconfig.schema.json` is
      `schemaVersion: 1.4.0` with `additionalProperties: false`, bumped twice in
      six weeks, once mid-week. Does it become semver, and what is a breaking
      change?
- [ ] **Release cadence and versioning.** `app/package.json` is `version: 0.0.0`,
      `private: true`. **Coordinate with Team 1** — they are looking at this too
- [ ] **Merge rights and review**, when a contributor is not one of eight people in
      a channel
- [ ] **Issue triage** — what happens at 2am in another timezone, and what response
      time is honest
- [ ] **Dependency and security update policy.** Team 1 is implementing a guard;
      say what the ongoing policy should be
- [ ] **The Python engine pin.** `qdk[qre]==1.30.0` is exact. Who bumps it, how
      often, and what proves a bump is safe?
- [ ] **Look at two or three comparable public projects** — Qiskit, Cirq,
      Microsoft's own QDK repos — and say which of their choices fit a project our
      size and which are for organizations with staff we do not have
- [ ] **At least one number in this section.** Files, days, or ongoing hours per
      month

## G. Risks and the runbook

- [ ] **State the strongest version of each honest risk** — an unmaintained public
      repo being worse than none, nobody assigned past the summer, a published
      schema constraining us, stranger issues being unfunded work — **and do not
      argue them away**
- [ ] **A sequenced publication runbook:** the ordered list of what happens, who
      does each step, and **which steps are irreversible.** This is the deliverable
      a PM will actually use
- [ ] Conditions that should gate the switch being flipped
- [ ] Every inference labelled as an inference rather than presented as a check
- [ ] Every external claim linked to its primary source — the license text, not a
      summary

## H. Delivery

- [ ] `docs/week-6/team-3/open-source-readiness.md` — canonical, Markdown,
      relative-path cross-references
- [ ] **Google Doc mirror**, stamped with export date and source commit, stating at
      the top that the repo copy is canonical
- [ ] **Two artifacts, not three.** No second summary document — week 5's second
      copy drifted within days and stated a hedged finding as fact. A summary is a
      section at the top of the same file
- [ ] **Team 1's findings are cited**, current as of what they actually landed
- [ ] **A real reader:** ask someone from Team 1 or Team 2 to read it and tell you
      what they would do first. If they can't say, it isn't done. **Record the
      reader's name and date in the document** — the one accuracy box week 5's
      Team 1 left blank
- [ ] **Read your own document end to end, cold, before your teammate does.** A
      readiness document that contradicts itself between §2 and §6 is the failure
      mode here, and it is only visible on a full read
- [ ] **Your teammate reviews every merge**, not just the last one. This document
      lands in sections
- [ ] **Anything you noticed about the repo that is not in your remit gets
      reported in the channel** — week 5 proved that reading a codebase closely is
      the best bug detector we have, and a research week is when that happens most

## I. Testing — do this last, and do not skip it

> A documentation week still has things that can be wrong, and this is exactly
> where week 5's equivalent deliverable lost points. None of it takes long.

- [ ] **`git diff --name-only main...HEAD -- app/` returns nothing.** No source
      file touched. Paste the result in the PR
- [ ] **`git diff --name-only main...HEAD` shows only your one document** — no
      `LICENSE`, no community files, no `.gitignore` edit
- [ ] **Every link resolves.** Relative paths open; external URLs load. Week 5's
      document shipped five citations reading *"verify current permalink"*
- [ ] **Every line-anchored claim re-checked at the pinned SHA** before you submit.
      Week 5's got 14 of 16 right and both misses were avoidable
- [ ] **No `[TODO]`, no placeholder, no `Status: DRAFT`, no note-to-self** survives
      into the merged file. Week 5's had all four
- [ ] **No secret value appears anywhere in the document**, even redacted-looking
- [ ] **The reader sign-off is filled in** — a name and a date, not a blank
      template
- [ ] Walk through `week-6-team-3-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] **Merged to `main` by Tue Aug 18 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **Merge in pieces.** A document can land in sections. Get §B–§D on `main` before
  the weekend rather than holding everything for the 18th — and the earlier the
  history-scan result lands, the more useful it is to everyone else.
- **Mid-point gate — Tue Aug 11.** Come to the checkpoint with the secret scan
  run. It is the irreversible item and the one with the longest tail if it finds
  something.
- **If the scan finds something, escalate immediately** — privately, in the
  channel, tagged to both PMs. Do not wait for the document, and do not put the
  value in writing.
- **If the ownership question is unanswerable from here, that is the finding.**
  Write down who you would ask and what you would ask them. A documented unknown
  beats a confident guess.
- **You will want to add a LICENSE file.** It is one line and it would feel like
  finishing the job. It is a decision with legal consequences this team does not
  own, and committing it would make the recommendation moot before anyone read it.
  Draft it as an appendix; do not commit it.
- **Merged, not opened.** Week 5's document was a day late, on a branch, with no
  PR. A PR opened Tuesday evening is not a delivery.
- **Below the line this week:** any source change · any repo setting · the code
  security review (Team 1) · the LLM interface (PMs) · the MCP server (Team 2) ·
  packaging · contract changes.
