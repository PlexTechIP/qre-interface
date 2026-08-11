# Week 6 — Team 3 (Neil + Jessie) — Technical Brief: Open-Source Readiness

Your track: **answer what has to be true before this repository can be public
under the PlexTech account — and what we have to keep doing afterwards.**

**The direction is set.** Microsoft wants this open-sourced, under the PlexTech
account. So this is not a go/no-go study, and your document should not be written
as one. The question is **how, in what order, and what could go wrong** — which is
a harder and more useful question than "should we."

**No code this week.** Not a `LICENSE` file, not a `CONTRIBUTING.md`, not a
tidy-up of the CI workflow. Every one of those is a *decision your document
recommends*, not a task it performs. **One `.md` in the repo, one Google Doc
mirror.** That is the whole delivery surface.

## Read week 5's MCP document as a model for form

[`docs/week-5/team-1/mcp-server-design.md`](../../week-5/team-1/mcp-server-design.md).
Steal three things from it:

- The **`[VERIFIED · <sha>]` / `[INFERENCE]` / `[EXTERNAL]`** labelling
  convention, defined up front and applied consistently — including on the
  uncomfortable claims.
- The **"established / could not establish / what it would take"** shape, wherever
  you hit something you cannot settle from where you sit.
- **A recommendation with the conditions that would reverse it.** Yours will be a
  recommendation about *sequence and preconditions* rather than about whether, but
  it still has to be a call someone can act on.

And learn from its one real mistake: it shipped a **second summary document**
nobody asked for, the summary immediately drifted from the main file, and the
drifted copy stated a carefully-hedged finding as fact. **One repo document.** If
you want a summary, it is a section at the top of the same file.

## The boundary with Team 1 — agree it on day one

Team 1 is doing a security review this week. You are not doing it twice.

| | Team 1 | You |
|---|---|---|
| **Scope** | The code as it stands on `main` | The repository and its history |
| **Examples** | Electron posture, CSP, IPC surface, `npm audit`, CI | Secrets in past commits, licensing, community files, governance, maintenance |
| **May change code?** | Yes | **No** |

**Message them in the channel on day one.** Their findings belong in your
document, and your publication runbook depends on what they fixed versus filed.
A document that lands on Aug 18 describing security gaps Team 1 closed on Aug 13
is a document nobody can trust.

## What we already know, so you do not re-derive it

Verified on `main` at `b6a5091`. **Re-check each one and say in the document that
you did** — a claim about repository state rots faster than a claim about code.

| Fact | Where |
|---|---|
| **No `LICENSE` file.** None, anywhere | repo root |
| **No `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`** | repo root |
| **No root `package.json`** — the only one is `app/package.json` | — |
| **`app/package.json` has no `license`, `author`, or `repository`** | `app/package.json` |
| **The remote is a personal account:** `github.com/patjandra/microsoft-qre-dashboard` | `git remote -v` |
| **All JS dependencies are MIT**, except TypeScript (Apache-2.0) | `app/package.json` |
| **The engine is a Microsoft Python package**, `qdk[qre]==1.30.0` | `app/src/main/engine/python/requirements.txt` |
| **CI triggers on a four-week-stale branch** and not on team branches | `.github/workflows/ci.yml` — *Team 1 is fixing this* |
| **The app handles provider API keys** and writes an encrypted blob to disk | `app/src/main/credentialStore.ts` |

---

## 1. Ownership and authority — narrower than it was, not closed

Microsoft wanting it and PlexTech hosting it settles the *direction*. It does not
settle these:

- **Who signs off?** PlexTech has to accept a repository into its account, and
  someone has to be accountable for it afterwards. Name the person or role.
- **The repository has to move.** It lives on a personal GitHub account today.
  Transferring an account-owned repo is a real operation with consequences for
  forks, stars, issue links, and existing clones. What does it involve?
- **What is Microsoft's, inside our repo?** This is the part nobody has looked at
  and it is the most likely thing to bite:
  - `docs/features-and-fields.md` is **transcribed from a Microsoft Google Doc.**
    It is the field spec and now the tooltip copy — so the transcription is also
    in the shipped app's source.
  - The **Q# benchmark programs**.
  - `qdk[qre]` itself, as a dependency rather than as vendored code.
  Can each of those be published as-is? Does any of it need attribution, a notice
  file, or permission we do not currently have?

Where you cannot answer, **write the question and name who has to answer it**, in
the register week 5's §11 used. An assumed answer here is worse than an open one.

---

## 2. Licensing

All JS dependencies are MIT except TypeScript (Apache-2.0), so the dependency
graph is unlikely to be the constraint. **The two places to look harder are the
ones nobody has checked:**

- **`qdk[qre]`.** Microsoft's, and the app is useless without it. Find the actual
  license text — not a summary — and say what it permits for a derivative tool,
  and whether distributing an app that shells out to it differs from merely
  depending on it.
- **`qsharp-lang`** (an optional dependency) and anything vendored, transcribed, or
  copied.

Then **recommend a license, and say what the choice buys and costs.** MIT and
Apache-2.0 are the obvious candidates; the patent grant is not a footnote in a
project built on a vendor's quantum toolkit. Note what Microsoft's own quantum
repositories use, and whether matching them is worth anything.

---

## 3. History and secrets — the irreversible section

**This is the one that cannot be undone, and it is the one a rushed document
skips.**

A public repository has a public history. A key committed in week 2 is public
even if deleted in week 6. The app handles API keys, six weeks of commits exist
across a dozen branches, and at least one commit message (`85e0599 "forgot to
add"`) suggests a hurried follow-up.

- **Run an actual scan over the full history, all branches** — not just `HEAD`.
  Name the tool, and say what it covers and what it does not.
- **Check for untracked-but-unignored paths.** `.gitignore` covers `node_modules`,
  the Python venv, caches, and `.DS_Store` — it does not cover everything present
  on a working tree today. There is PM working material in the repository
  directory that is neither tracked nor ignored, which means it is one `git add -A`
  away from being permanent and public. **Recommend what belongs in `.gitignore`
  before anyone runs a bulk add.** Do not enumerate the contents; flag the class of
  problem and let a PM handle specifics.
- **State what the scan found.** If it found something, **report it privately in
  the channel and do not put the value in the document** — say a finding exists
  and was reported.
- **Lay out the options and their costs** if something is found. History rewriting
  is one, and it invalidates every existing clone and open PR.
- **Fix nothing.** Not a key, not a path, not a stray file.

---

## 4. What has to exist before a stranger can use this

We have unusually good internal documentation and **nothing aimed outward.**
`README.md`, `setup-and-troubleshooting.md`, and `architecture.md` are all written
for someone who already sits next to you.

Enumerate the minimum set — README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT,
SECURITY, issue and PR templates — and **draw a line between load-bearing and
cargo-cult.** Four files that matter beat eight nobody reads. Argue the line.

**Then draft them, as appendices in your one document.** This is the highest-value
thing you can produce this week and it is why the track has room for it: a PM
should be able to copy an appendix into a file and commit it. Draft at minimum the
README's outward-facing opening and the SECURITY disclosure policy — the two that
cannot be copied from a template without thought. **Appendices, not files.**

---

## 5. Maintenance — the part actually being asked for

*"Practices we should follow to best maintain it"* is the section most likely to
become a generic listicle. **Ground every recommendation in something specific
about this repository**, or cut it. Things that genuinely are:

- **The contract becomes a public API the moment the repo is public.**
  `runconfig.schema.json` is at `schemaVersion: 1.4.0` with
  `additionalProperties: false`, bumped twice in six weeks, once mid-week. What
  does versioning discipline become when strangers depend on it? Does
  `schemaVersion` become semver, and what is a breaking change?
- **Release cadence and versioning.** `app/package.json` is `version: 0.0.0`,
  `private: true`. *(Team 1 is also looking at this — coordinate so you do not
  propose two schemes.)*
- **Who has merge rights, and what does review look like** when a contributor is
  not one of eight people in a channel?
- **Issue triage.** What happens when someone files a bug at 2am in another
  timezone, and what is the honest response time?
- **Dependency and security updates.** Nothing watches Electron or Node
  advisories today. *(Team 1 is implementing a guard — say what the ongoing policy
  should be.)*
- **The Python engine pin.** `qdk[qre]==1.30.0` is exact. Who bumps it, how often,
  and what proves a bump is safe?

### Look at what comparable projects actually do

Do not invent governance from first principles. Qiskit, Cirq, and Microsoft's own
QDK repositories are all public, all in this domain, and all have made these
choices already. **Pick two or three, look at what they actually do** — license,
governance file, contribution flow, release cadence, issue templates — and say
which of their choices fit a project of our size and which are for organizations
with staff we do not have. A comparison grounded in three real repositories is
worth more than a page of best practices.

---

## 6. Risks and preconditions — not a go/no-go, still honest

The direction is set, so this is not "should we." It is **"what could go wrong,
and what should gate the switch being flipped."**

State the strongest version of each honest risk: an unmaintained public repo is a
worse advertisement than no public repo; nobody is currently assigned to maintain
it past the summer; a published schema constrains us; and issues from strangers
are work that has to come from somewhere.

Then give the deliverable that makes this document actionable: **a sequenced
publication runbook.** The ordered list of what happens, who does each step, and
which steps are irreversible. That is what a PM will actually use.

---

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| **Any source file.** No branch that touches `app/` | Nobody — this is a documentation week |
| **Adding `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`**, or editing `.gitignore` | Nobody. Draft them as appendices; do not commit them as files |
| **Editing `.github/workflows/ci.yml`** | Team 1 |
| **The code security review** — Electron posture, CSP, IPC, `npm audit` | Team 1 |
| **Making the repository public, transferring it, or changing any repo setting** | PMs and PlexTech. Not reversible |
| **Fixing anything a secret scan turns up** | Report privately in the channel first |
| The LLM interface | **PMs** |
| The MCP server | Team 2 |

**If you find a bug while researching, report it in the channel; don't fix it.**
Week 5's Team 1 found a real one this way. A fix in a documentation branch is
exactly what this assignment is shaped to avoid.

## Quality bar

Every claim about the repository names the file it lives in and the commit it was
verified against. Every claim about a license or an external practice links to the
primary source — the license text itself, not somebody's summary of it. Where
something is an inference rather than something you checked, the document says so.

**And the thing that separates this from a survey:** somewhere in it there are
numbers. How many files, how many days, what the scan actually covered, what
ongoing maintenance costs per month. A readiness assessment with no quantities in
it has not looked.
