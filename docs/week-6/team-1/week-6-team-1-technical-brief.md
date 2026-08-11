# Week 6 — Team 1 (Sun Min + Emma) — Technical Brief: Deployment Readiness

Your track: **get the app and the pipeline around it into a state we would be
comfortable having strangers look at.**

Microsoft wants this open-sourced under the PlexTech account. That is the
direction, and it moves a pile of work from "someday" to "before that happens."
Nobody has ever done a security pass on this codebase. The CI pipeline has not
been touched since week 2 and **does not run on your branch**. There is a
high-severity advisory in the production dependency tree right now. None of that
had an owner during a feature week. It has one now.

**This is not packaging.** No electron-builder, no installers, no code signing —
that is week 7 or later, by decision. "Ready to go" this week means the codebase
and the pipeline are ready, not that there is something to double-click.

## Four deliverables, and one of them is a document

| # | Deliverable | Required / flexes |
|---|---|---|
| 1 | **The CI pipeline actually catches things** | Required |
| 2 | **Dependency advisories cleared** | Required |
| 3 | **A security review of the app as it stands**, written up, with the cheap fixes made | Required — the write-up. The fixes flex |
| 4 | **The two day-one contributor blockers closed** | Required |
| 5 | **Release hygiene** — versioning, package metadata | Flexes |
| 6 | **What else you found** — things we did not list, and what you did about each | **Required** |

Deliverables 3 and 6 have written artifacts. The rest are changes to the repo.

**Deliverable 6 is not a formality — read § The list below is a floor.**

---

## Deliverable 1 — Make CI catch things

`.github/workflows/ci.yml` has not changed since week 2. It is better than it
looks in one respect and worse in several others.

**What it does right, so you do not break it:** it runs the two typecheck
projects as **separate steps**, which sidesteps the `&&` short-circuit. And it has
a `real-engine-checks` job that installs Python 3.13 and runs `npm run test:engine`
— which is more than most people assume.

**What is wrong:**

**1. It does not run on your branch.** The triggers are:

```yaml
on:
  pull_request:
    branches: [week-2/team-3, main]
  push:
    branches: [week-2/team-3, main]
```

`week-2/team-3` is a branch from four weeks ago. `week-6/team-1` is not in that
list, and neither is any other team branch. **So work in progress gets no CI at
all** — which is precisely why week 5's non-compiling branch went unnoticed until
a human ran `tsc` by hand during review. Fix this first; it is the single
highest-value change in your week and it takes minutes.

**2. There is no lint step, and eslint does not work.** `eslint@10.6.0` and
`typescript-eslint@8.63.0` are both in `devDependencies` — and there is **no
eslint config file anywhere and no `lint` script in `package.json`.** Two
dependencies installed on every `npm ci`, run by nobody. Either wire it up
properly (config, script, CI step) or remove the dependencies. **Do not leave it
in the current state**, which reads to an outside contributor as a lint setup that
is silently broken.

**3. There is no build step.** `npm run build` works — verified — and CI never
checks it. A change that typechecks and passes tests can still break the
production build; Vite's build path is not the same as `tsc --noEmit`.

**4. It is ubuntu-only**, for an Electron desktop app that will run on macOS and
Windows. A matrix is not free — it multiplies minutes and the engine job installs
a Python venv — so **decide and defend**: full matrix, matrix on the fast job
only, or ubuntu-only with a written reason. Any of the three is fine. Silence is
not.

**5. `npm run typecheck` short-circuits.** CI dodges it; your terminal does not.
`"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"`
means a single renderer error hides every main-process error. Fix the script so a
local run reports both — two scripts plus a composite, or `;` with an explicit
exit code.

---

## Deliverable 2 — Clear the advisories

Run it yourself, but here is what we saw on `b6a5091`:

- **`npm audit --omit=dev` → 1 high severity.** `fast-uri` (3.0.0–3.1.4), host
  confusion via backslash authority introducer. **This is in the production
  dependency tree**, pulled in transitively — almost certainly under `ajv`, which
  is the library that validates every configuration this app runs.
- **`npm audit` (including dev) → 5 vulnerabilities**, 1 moderate and 4 high,
  `undici` among them.

`npm audit fix` reportedly resolves them. **Run it, then verify nothing broke** —
`npm run typecheck`, `npm test`, `npm run test:engine`, and `npm run build`. A
transitive bump under Ajv is exactly the kind of change that is fine 95% of the
time and silently changes validation behaviour the other 5%.

Then the harder half: **what stops this from recurring?** Nothing currently
watches for advisories. Your options are a CI `npm audit` step that fails the
build, a scheduled workflow, Dependabot, or a documented manual cadence. **Pick
one and implement it**, or write down why none of them is right yet. Also check
**Electron's currency** — we are on 43.1.0, and Electron ships security releases
on a schedule that does not care about our sprint plan.

---

## Deliverable 3 — Security review of the app as it stands

**Scope: the code on `main` today.** Not the git history — that is Team 3's, and
the boundary matters so you do not duplicate each other. **Talk to them.** Your
findings belong in their document, and their publication timeline depends on
yours.

### What is already right — verify, then say so

`main.ts:24-29` is correct and it is the part that matters most:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(currentDir, "preload.cjs"),
}
```

Three of the four canonical Electron footguns are already disarmed. **Confirm
this yourself and state it in the write-up** — a security review that only lists
problems is not a review, and this is a genuine strength worth recording before a
stranger has to work it out.

### What is missing

**1. There is no Content Security Policy.** Not a `<meta>` tag in `index.html`,
not a header set via `session.defaultSession.webRequest.onHeadersReceived`. The
app now renders content derived from LLM provider responses. Electron's own
security checklist treats a CSP as a baseline item and the renderer will warn
about its absence in development. Decide what the policy should be and implement
it — note that a strict `script-src` interacts with the inline theme script in
`index.html`, so this is slightly more than a one-liner.

**2. There are no navigation guards.** No `setWindowOpenHandler`, no
`will-navigate` handler anywhere in `src/main/`. The standard hardening is to deny
new-window creation by default and to block in-app navigation to external origins,
opening them in the system browser instead. With `sandbox: true` this is less
severe than it would otherwise be, but it is a standard item and its absence is
the sort of thing a first outside reviewer will spot in a minute.

**3. The IPC surface has grown and nobody has audited it end to end.** There are
now **five** preload surfaces — `estimator`, `uploads`, `store`, `agent`, `files`
(`preload.ts:101-105`). *(Note: the MCP design document says four. It was written
before `agent` landed. Tell Team 2.)* For each channel: what does the handler
receive, does it validate before acting, and what is the worst thing a malicious
or buggy renderer could ask for? `uploads` and `files` touch the filesystem;
`estimator` spawns a Python subprocess; `agent` makes network calls with a
credential the renderer is not allowed to see.

**4. The subprocess and network surfaces are new since anyone last looked.**
`QreEngine` spawns Python with arguments derived from a `RunConfig`. The agent
path sends analyst prose to a third-party provider. Neither has been reviewed as a
security surface — only as a feature.

### What the write-up needs

`docs/week-6/team-1/security-review.md`. **Every finding gets a severity, a file
and line, and one of three dispositions: fixed, filed, or accepted with a
reason.** "Accepted with a reason" is a legitimate outcome and we would rather see
it written down than see a rushed fix.

**Fix what is cheap and low-risk. File what is not.** A security review that turns
into a large refactor is a security review that does not get finished, and an
unfinished one is worth nothing to Team 3's document.

---

## Deliverable 4 — The two day-one blockers

Both of these break a new contributor before they write a line, and both have been
open for weeks.

**1. `npm run test:engine` cannot be run on a fresh checkout.** The pinned
interpreter `app/src/main/engine/python/.venv/bin/python3` is gitignored and
absent, so the suite reports ~135 instant "failures" that are not failures. Worse,
`setup_venv.sh` pins Python **3.13.14** and **deletes the existing `.venv` before
it checks the version** — so on a machine with an older `python3` it fails *after*
destroying what was there. That is a destructive failure in the first script a new
contributor runs.

Fix the ordering at minimum: **check the interpreter version before removing
anything.** Then decide whether the pin should be exact or a floor, and make the
failure message say what to do.

**2. The setup guide has never been executed on a clean environment.**
`setup-and-troubleshooting.md:189` still reads *"Guide executed on clean
environment: **not yet**; local macOS dev checkout."* Open since week 4. Someone
runs it start to finish on a machine that has not built this project, writes down
what broke, fixes the guide, and updates that line. Expect the Python pin to be
the first thing it catches.

---

## Deliverable 5 — Release hygiene (this is the part that flexes)

`app/package.json` is `version: 0.0.0`, `private: true`, and carries no `license`,
`author`, or `repository` field. There is no root `package.json` at all.

**Do not add a `license` field** — the license choice is Team 3's recommendation
and the PMs' decision, and putting a value there pre-empts both. Everything else
here is fair game: what the version number should be and when it moves, whether
`private: true` is still right, and what metadata a published package needs.

Write your recommendation into the security review document as a short section
rather than a separate file, and coordinate with Team 3 so you are not both
proposing versioning schemes.

---

## Deliverable 6 — The list above is a floor, not a ceiling

**Everything in deliverables 1–5 is something the PMs found from the outside, in
an afternoon, without running the app.** That is the level of scrutiny it took to
produce that list. You will be inside this codebase for two weeks with a security
brief in your hand.

**So go looking, and write down what you find.**

If you are handing this document to a coding agent, that is fine — but point it at
this section too. *"What else in this codebase is a security risk or a
deployment blocker that is not on this list?"* is exactly the prompt nobody runs,
and it is the one this track most rewards. Use your own judgment on what comes
back; you are accountable for what lands, not the agent.

**Places worth pointing it, that deliverables 1–5 do not cover:**

- **Error and crash paths.** What happens when the Python subprocess dies mid-run,
  when the database is locked, when a provider request times out, when a file the
  user uploaded disappears between selection and read? Nobody has swept these.
- **What the app writes to disk, and where.** The run store, the credential blob,
  any caches or temp files. File permissions on each — `credentialStore.ts` sets
  `0o600`; does everything else that should?
- **What the app logs.** Once this repository is public, a log line that seemed
  harmless is a log line strangers can read about. Does anything log a
  configuration, a prompt, a path, or an error body with data in it?
- **The upload path.** `uploads` and `files` are two of the five preload surfaces
  and they touch the filesystem on behalf of the renderer. Path traversal, symlink
  handling, size limits, what happens on a file that is not what its extension
  claims.
- **Anything that would embarrass us in a public repository** — a stray `TODO`
  with someone's name on it, a hardcoded path, a commented-out experiment, a
  test that asserts nothing.

**The output is a section in `security-review.md`:** everything you found that we
did not name, and for each one — fixed, filed, or deliberately left with a
reason. **Implement what is safe and inside your boundaries. File the rest.**

**An empty list is an acceptable answer, but it has to be argued.** "We swept the
error paths, the disk writes, and the upload surface, and found nothing worth
reporting" is a finding, and a useful one. Saying nothing is not.

**One guardrail:** deliverables 1–5 come first. Discovery does not justify an
unfinished pipeline. If you are behind, the extra *implementation* is the first
thing to cut — but the list of what you *found* still ships.

## Reviews — run them, on your own work

Two things, and neither is the same as testing:

1. **Read your own diff top to bottom before you ask your teammate to.** As though
   someone else wrote it. Most of what a reviewer catches is something the author
   would have caught by reading it once, cold.
2. **Your teammate reviews every merge.** Not just the last one. This track lands
   in pieces — the CI fix, the audit bump, the security fixes — and each piece is
   a review.

If you are using an agent, running a review pass over the finished diff is a
legitimate and encouraged use of it. It is also not a substitute for a human
reading the security changes, because the agent that wrote a fix is the worst
possible judge of whether the fix is right.

## Boundaries — what is NOT yours this week

| Not yours | Whose |
|---|---|
| `renderer/agent/`, `main/agentHandler.ts`, `main/credential*`, `main/*DraftGenerator.ts`, `renderer/state/useRunFlow.ts` | **PMs** — the LLM interface is a PM track this week |
| The git history secret scan, licensing, community files, governance | Team 3 |
| Adding `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | Nobody — Team 3 recommends, PMs decide |
| Making the repository public, or any repo setting | PMs and PlexTech. Not reversible |
| The MCP entry point and its build config; `main/sqliteRunStore.ts` | Team 2 |
| **electron-builder, installers, code signing** | Nobody — deferred to week 7+ |
| The Results-page `qreVersion` regression, the History selection change, the `MEMORY_OPTIMIZATION_SECTION` copy drift | PM — all three already known from the PR #22 review |
| Opening a contract-change PR | Nobody. v1.4.0 stands |

**You will be reading a lot of code you did not write, including the agent
files.** Reading them is expected — the IPC audit requires it. **Changing them is
not.** If the audit turns up something in a PM-owned file, that is a finding for
the write-up and a message in the channel, not a commit.

## Quality bar

Every security finding names a file and a line and carries a disposition. Every
CI change is proven by a run that actually happened — **push a deliberately broken
commit to a scratch branch once and confirm CI goes red**, because a pipeline
nobody has seen fail is a pipeline nobody has tested. `npm audit` clean, or the
remaining items explained. `npm run typecheck`, `npm test`, `npm run test:engine`,
and `npm run build` all green on the commit you merge.

**And the standard this track is actually held to:** if week 5 had happened with
your pipeline in place, would CI have caught it? Three typecheck errors and one
failing test on a team branch. If the answer is no, the pipeline is not done.
