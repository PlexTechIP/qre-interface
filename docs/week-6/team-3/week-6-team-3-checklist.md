# Week 6 — Team 3 (Neil + Jessie) — Checklist: Open-Source Readiness

**Due: Wednesday Aug 12 EOD** — the single deadline for the week.
**Tue Aug 11** 5–6pm is the checkpoint meeting.
Read first: `../week-6-overview.md`, `week-6-team-3-technical-brief.md`, then
[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
**as a model for form** — its labelling convention, its "established / could not
establish" shape, and its §0 recommendation. Not for its content.
Check items off as you go (edit + commit).

Your mission in one line: **a readiness document a PM could act on without asking
you a question.**

**No code this week.** No branch that touches `app/`. No `LICENSE` file.

**Work split — fill this in at kickoff and commit it:**

- Neil: _______________________
- Jessie: _______________________
- Shared / pairing on: _______________________

> Week 5 shipped one commit from this team. Filling this in is not a formality
> this week — and a research week splits cleanly, so there is no reason for one
> name on the log. The sections below are roughly two independent halves: §B/§C
> (ownership, licensing, history) and §D/§E (readiness, maintenance).

## A. Day 0

- [ ] `git fetch && git switch week-6/team-3` — **the PMs created it off `main`
      at `b6a5091`.** Do not create your own
- [ ] `nvm use` (Node **24.18.0**), `npm ci` in `app/`, `npm run dev` — you need
      the app running to reason about what shipping it would mean, even though you
      will not change it
- [ ] **Record the commit SHA you are verifying against**, at the top of your
      document, with the date. Every repository claim is pinned to it
- [ ] Re-verify the nine facts in the brief's table yourself. **They were true at
      `b6a5091`; say in the document that you checked, and correct anything that
      has moved**

## B. Ownership — the question you ask, not answer

- [ ] Establish who the plausible owners are: PlexTech, Microsoft, UC Berkeley,
      the individual contributors. What each one's claim would rest on
- [ ] Note that the remote is a **personal** GitHub account
      (`github.com/patjandra/microsoft-qre-dashboard`) and what that does or does
      not imply
- [ ] **Write the question to be asked, and name who has to answer it**, phrased
      so a yes or no changes what we do. This is the §11-equivalent of the week-5
      MCP document
- [ ] **Do not resolve it yourselves.** An assumed answer here is worse than an
      open one

## C. Licensing and history — the irreversible half

- [ ] Confirm the dependency licenses yourself rather than trusting the brief's
      table. All JS deps MIT except TypeScript (Apache-2.0) is what we found
- [ ] **`qdk[qre]==1.30.0`** — find its actual license, link the primary source,
      and say what it permits for a derivative tool and for distributing an app
      that shells out to it
- [ ] **`qsharp-lang`** (optional dependency) and anything vendored, transcribed,
      or copied — including `docs/features-and-fields.md`, which is transcribed
      from a Microsoft document
- [ ] **Recommend a license** — MIT, Apache-2.0, or other — and say what the
      choice buys and costs. The patent grant is not a detail here
- [ ] **Run an actual secret scan over the full history**, all branches, not just
      `HEAD`. Name the tool, and say what it covers and what it does not
- [ ] State what it found. **If it found something, report it in the channel
      privately and do not put the value in the document** — say a finding exists
      and was reported
- [ ] Say what the options would be if something were found, and what each costs.
      History rewriting invalidates every existing clone and PR
- [ ] **Fix nothing.** Not a key, not a path, not a stray file

## D. What has to exist before a stranger can use this

- [ ] Enumerate the minimum set — README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT,
      SECURITY, issue/PR templates — and **draw a line between load-bearing and
      cargo-cult.** Argue the line; four files that matter beat eight nobody reads
- [ ] Assess the outward-facing readability of what exists today. `README.md`,
      `setup-and-troubleshooting.md`, and `architecture.md` are all written for
      someone already on the team
- [ ] Note `setup-and-troubleshooting.md:189` — *"Guide executed on clean
      environment: **not yet**"* — open since week 4, and the first thing an
      outside contributor hits
- [ ] **Do not write any of these files.** List them, size them, recommend them

## E. Maintenance — ground every item in this repo

> The part most likely to become a generic listicle. If a recommendation would
> read the same for any project, cut it or make it specific.

- [ ] **The contract becomes a public API.** `runconfig.schema.json` is
      `schemaVersion: 1.4.0` with `additionalProperties: false`, bumped twice in
      six weeks, once mid-week. What does versioning discipline become, and does
      `schemaVersion` become semver?
- [ ] **CI as a public surface.** `.github/workflows/ci.yml` still triggers on
      `week-2/team-3`. What does a fork PR do to it, and what would a public
      configuration need that this one lacks?
- [ ] **`npm run test:engine` cannot be run on a fresh checkout** — gitignored
      venv, Python 3.13.14 pin, and `setup_venv.sh` deletes `.venv` *before* it
      checks the version. Day-one blocker for a contributor
- [ ] **`npm run typecheck` short-circuits** (`tsc -p a && tsc -p b`), so a
      renderer error hides every main-process error and a public CI log
      under-reports
- [ ] Release cadence, versioning, merge rights. `app/package.json` is
      `version: 0.0.0`, `private: true`
- [ ] Dependency and security update policy — nothing watches Electron or Node
      advisories today
- [ ] **At least one number somewhere in this section.** How many files, how many
      days, how much ongoing time per month

## F. The position

- [ ] **State the strongest case against open-sourcing** — small audience, an
      unmaintained public repo being worse than none, the value possibly being as
      an internal Microsoft tool, and nobody currently assigned to maintain it —
      **and do not argue it away**
- [ ] **An explicit recommendation**, and the conditions that would reverse it.
      "It depends" is not a deliverable; "don't do this" is a complete answer
- [ ] Every inference labelled as an inference rather than presented as a check
- [ ] Every external claim linked to its primary source — the license text, not a
      summary of it

## G. Delivery

- [ ] `docs/week-6/team-3/open-source-readiness.md` — canonical, Markdown,
      relative-path cross-references
- [ ] **Google Doc mirror**, stamped with export date and source commit, stating
      at the top that the repo copy is canonical
- [ ] **Two artifacts, not three.** No second summary document — week 5's second
      copy drifted within days and stated a hedged finding as fact. A summary is a
      section at the top of the same file
- [ ] **A real reader:** ask someone from Team 1 or Team 2 to read it and tell you
      what they would do first. If they can't say, it isn't done. **Record the
      reader's name in the document** — this was the one accuracy box week 5's
      Team 1 left blank

## H. Testing — do this last, and do not skip it

> A documentation week still has things that can be wrong, and this is where week
> 5's equivalent deliverable lost points. None of this takes long.

- [ ] **`git diff --name-only main...HEAD -- app/` returns nothing.** No source
      file was touched. Paste the result in the PR
- [ ] **Every link in the document resolves.** Relative paths open; external URLs
      load. Week 5's document shipped five citations reading *"verify current
      permalink"*
- [ ] **Every line-anchored claim is re-checked at the pinned SHA** before you
      submit. Week 5's document got 14 of 16 right and the two misses were both
      avoidable
- [ ] **No `[TODO]`, no placeholder, no `Status: DRAFT`, no note addressed to
      yourself** survives into the merged file. Week 5's did, all four
- [ ] **The reader sign-off is filled in**, with a name and a date, not a blank
      template
- [ ] Walk through `week-6-team-3-definition-of-done.md` line by line — every box
      either ticked or annotated with one line saying why not
- [ ] **Merged to `main` by Wed Aug 12 EOD** — acceptance from `main`, not a
      branch. Teammate reviews first

## Blockers & escalation

- **24-hour rule:** anything blocking you for more than 24 hours goes in the
  channel, tagged to both PMs.
- **If the ownership question turns out to be unanswerable from here, that is the
  finding** — write down who you would ask and what you would ask them. A
  documented unknown beats a confident guess.
- **You will want to add a LICENSE file.** It is one line and it would feel like
  finishing the job. It is a decision with legal consequences that this team does
  not own, and adding it would make the recommendation moot before anyone read it.
  Recommend it; do not commit it.
- **Merged, not opened.** Week 5's document was a day late, on a branch, with no
  PR. A PR opened Wednesday evening is not a delivery.
- **Below the line this week:** any source change · any repo setting · the LLM
  interface (Team 1) · the MCP server (Team 2) · packaging · contract changes.
