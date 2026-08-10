# Week 6 — Team 3 (Neil + Jessie) — Technical Brief: Open-Source Readiness

Your track: **answer, in writing, what it would actually take to open-source this
project — and what we would have to keep doing afterwards to maintain it well.**

**No code this week.** Not a `LICENSE` file, not a `CONTRIBUTING.md`, not a
tidy-up of the CI workflow. Every one of those is a *decision* your document
recommends, not a task it performs. The deliverable is a document good enough that
a PM could act on it without asking you a question.

This is the same assignment shape week 5 gave Team 1 for MCP, and it is worth
reading their output — [`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md)
— **as a model for form, not for content.** In particular, steal three things:

- The `[VERIFIED · <sha>]` / `[INFERENCE]` / `[EXTERNAL]` labelling convention,
  defined up front and applied consistently.
- The **"established / could not establish / what it would take"** shape, used
  wherever you hit something you cannot settle from where you sit.
- **A recommendation, with the conditions that would reverse it.** "It depends" is
  not a deliverable. "Do not open-source this" is a complete and useful answer if
  that is where the evidence lands.

## Why this question, and why now

Nobody has asked for it yet, which is exactly why it is worth doing now rather
than under a deadline. Open-sourcing is **not reversible**: a repository made
public has a public git history, and a secret committed in week 2 is public even
if it was deleted in week 6. Every question below is cheap this week and expensive
the week someone decides to flip the switch.

## What we already know, so you do not re-derive it

All verified on `main` at `b6a5091` — **re-check each one yourself and say in the
document that you did**, because a claim about repository state rots faster than a
claim about code:

| Fact | Where |
|---|---|
| **There is no `LICENSE` file.** None, anywhere in the repo | repo root |
| **There is no `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`** | repo root |
| **There is no root `package.json`** — the only one is `app/package.json` | — |
| **`app/package.json` has no `license`, `author`, or `repository` field** | `app/package.json` |
| **The remote is a personal account:** `github.com/patjandra/microsoft-qre-dashboard` | `git remote -v` |
| **Every JS dependency is MIT**, except TypeScript, which is Apache-2.0 | `app/package.json` |
| **The engine is a Microsoft Python package**, `qdk[qre]==1.30.0` | `app/src/main/engine/python/requirements.txt` |
| **CI still triggers on `week-2/team-3`** — a branch from four weeks ago | `.github/workflows/ci.yml` |
| **The app handles provider API keys** and writes an encrypted blob to disk | `app/src/main/credentialStore.ts` |

## The questions the document has to answer

Get there however you think is right. These are the answers we need, not an
outline to fill in.

### 1. Who owns this, and who can decide?

The repository lives under an individual's GitHub account. The work was done by a
PlexTech team, for Microsoft, by students at Berkeley. **Whose IP is it, and whose
signature does "make it public" require?**

Do not answer this yourself. It is the same class of question as week 5's *"how
many of your target analysts already run an agent"* — an **empirical question for
someone outside this team**, and the right output is a crisp version of it,
phrased so that the answer changes what we do. Name who has to be asked.

### 2. Which license, and is it actually compatible?

Every JS dependency is MIT except TypeScript (Apache-2.0), and both are permissive
— so the dependency graph is unlikely to be the constraint. **The two places to
look harder are the ones nobody has checked:**

- **`qdk[qre]`.** It is Microsoft's, it is the engine, and the app is useless
  without it. What is its license, what does it permit for a derivative tool, and
  does distributing an app that shells out to it change the answer versus
  depending on it?
- **The `qsharp-lang` optional dependency** and anything vendored or copied. A
  transcribed table of field descriptions from a Microsoft document is content
  with an owner too — `docs/features-and-fields.md` is exactly that.

Then make a recommendation: MIT, Apache-2.0, or something else, **and say what the
choice buys and costs.** Apache-2.0's patent grant is not a detail in a project
built on a vendor's quantum toolkit.

### 3. What is irreversible, and what does the history contain?

**This is the section that matters most, and it is the one a rushed version
skips.**

The app handles API keys. `credentialStore.ts` writes an encrypted blob. Six weeks
of commits exist across a dozen branches, some of them written fast, at least one
of them (`85e0599 "forgot to add"`) suggesting a hurried follow-up commit.

- Has any key, token, credential, internal URL, personal path, or unpublished
  Microsoft material ever been committed — **on any branch, in any commit, not
  just at `HEAD`**?
- What would a scan actually cover, and what tool would run it? Name one and say
  what it does and does not catch.
- If something is found, what are the options, and what does each cost? (History
  rewriting is one of them, and it invalidates every existing clone and PR.)
- **Do not fix anything you find. Report it in the channel privately, not in the
  document**, and say in the document that a finding exists and was reported.

An honest *"we scanned with X, here is what it covers, here is what it found"* is
the deliverable. An unscanned *"we should probably check for secrets"* is not.

### 4. What has to exist before a stranger can use this?

We have unusually good internal documentation and **nothing aimed outward**. The
`README.md`, `setup-and-troubleshooting.md`, and `architecture.md` are written for
someone who is already on the team.

What does the minimum set look like — README, LICENSE, CONTRIBUTING,
CODE_OF_CONDUCT, SECURITY, issue and PR templates — and **which of those are
genuinely load-bearing versus cargo-cult?** We would rather ship four files that
matter than eight that nobody reads. Argue the line you draw.

One concrete thing to check: `setup-and-troubleshooting.md:189` still reads
*"Guide executed on clean environment: **not yet**."* A setup guide nobody has run
is the first thing that fails for an outside contributor, and it has been open
since week 4.

### 5. The maintenance question — the one that is actually being asked

*"Practices we should follow to best maintain it"* is the part of this assignment
most likely to turn into a generic listicle. **Ground every recommendation in
something specific about this repository**, or leave it out. Things that are
genuinely specific to us:

- **The contract is a public API the moment the repo is public.**
  `runconfig.schema.json` is at `schemaVersion: 1.4.0` with
  `additionalProperties: false`. We have bumped it twice in six weeks, sometimes
  mid-week. What does versioning discipline have to become when strangers depend
  on it, and does `schemaVersion` become semver?
- **CI is a security surface once it is public.** `.github/workflows/ci.yml` still
  triggers on `week-2/team-3`. What does a fork PR do to it, and what would a
  public CI configuration need that this one does not have?
- **`npm run test:engine` cannot be run on a fresh checkout.** The pinned venv is
  gitignored and absent, and `setup_venv.sh` requires Python 3.13.14 — and deletes
  the existing `.venv` *before* it checks the version, so on the wrong interpreter
  it fails after destroying what you had. An outside contributor hits this on day
  one.
- **`npm run typecheck` short-circuits** (`tsc -p a && tsc -p b`), so a renderer
  error hides every main-process error. A contributor reading a red CI log gets a
  misleading count.
- **Release cadence, versioning, and who has merge rights.** `app/package.json` is
  `version: 0.0.0` and `private: true`.
- **Dependency updates.** Electron and Node have security releases; today nothing
  watches them.

### 6. Is this a good idea at all?

Take a position. Some honest arguments against: the audience for a quantum
resource-estimation dashboard is small; an unmaintained public repo is worse than
no public repo; the project's value to Microsoft may be as an internal tool; and
maintaining a public repo is real ongoing work that nobody has been assigned.

**State the strongest version of the case against, and do not argue it away.**
Then recommend, and name the conditions that would reverse the recommendation.

## Form and delivery

Two artifacts, same content:

1. **`docs/week-6/team-3/open-source-readiness.md`** — canonical, in the repo, in
   Markdown, cross-referenced by relative path.
2. **A Google Doc mirror**, stamped with its export date and the source commit,
   stating at the top that the repo copy is canonical.

**Two artifacts, not three.** Week 5's Team 1 shipped a second summary document
nobody asked for, it immediately drifted from the main one, and the drifted copy
was the one that stated a carefully-hedged finding as fact. One repo document, one
mirror. If you want a summary, it is a section at the top of the same file.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| **Any source file.** No branch that touches `app/` | Nobody — this is a documentation week |
| **Adding `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`** | Nobody. These are decisions your document recommends, not tasks it performs |
| **Editing `.github/workflows/ci.yml`** — including the stale branch trigger | Nobody. Report it |
| **Making the repository public, or changing any repo setting** | PMs and PlexTech. Not reversible |
| **Fixing anything a secret scan turns up** | Report privately in the channel first |
| The LLM interface | Team 1 |
| The MCP server | Team 2 |

**If you find a bug while researching, report it in the channel; don't fix it.**
Reading a codebase closely is the best bug detector we have — week 5's Team 1
found a real one this way — and a fix in a documentation branch is exactly what
this assignment is shaped to avoid.

## Quality bar

Every claim about the repository names the file it lives in and the commit it was
verified against. Every claim about a license or an external practice links to the
primary source — the license text itself, not a summary of it. Where something is
an inference rather than something you checked, the document says so. The
recommendation is explicit, and so are the conditions that would reverse it.

**And the thing that makes this document real rather than a survey:** somewhere in
it, there is a number. How many files, how many days, what a scan actually found.
A readiness assessment with no quantities in it has not looked.
