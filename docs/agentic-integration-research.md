# Agentic Integration — Research & Design Options

**Status:** research input, not a decision. Written in week 4 to support the
Team 3 agentic memo (`docs/week-4/team-3/week-4-team-3-technical-brief.md`
§Deliverable 3), where the recommendation formally landed. Moved to `docs/` on
**2026-07-31** because it became a standing reference for two week-5 tracks
rather than an artifact of one week.

**Method.** Every architectural claim below was checked against `main` as it was
in **week 4**, and the file it lives in is named. Every external claim about how
another tool authenticates was checked against that tool's own documentation and
is linked in §13. Where a claim is an inference rather than something I verified,
it says so.

---

> ### ⚠️ Currency note — read before relying on anything here
>
> **The "build nothing" recommendation in §12 has been superseded.** It was
> correct for week 4, and this document still says so in several places. The PMs
> reopened the question after the **Fri Jul 31 POC**, and week 5 assigns two
> tracks against it:
>
> - **Team 1 — MCP server research** (`docs/week-5/team-1/`). §6 is their
>   starting point, not their conclusion. The questions §6 does *not* answer —
>   two processes on one SQLite file, path resolution outside Electron, server
>   lifecycle — are the substance of their week.
> - **Team 2 — the LLM interface** (`docs/week-5/team-2/`), building Option 1
>   (§4) for ask #1 only. §8.1 is the load-bearing finding for them. Ask #3
>   (circuit generation, §8.3) remains declined.
>
> **Two factual claims have since drifted.** This document was written against
> week-4 `main`; treat every architectural claim as needing re-verification, and
> these two as known-wrong:
>
> - **§3 says "exactly three surfaces are exposed."** There are **four** —
>   `window.estimator`, `window.uploads`, `window.store`, `window.files`. §4.3's
>   "fourth preload surface" is therefore the fifth.
> - **§8.1's keyword counts were taken at contract v1.0.0.** The contract is at
>   v1.3.0 and the PMs land v1.4.0 at the week-5 kickoff. The *finding* holds —
>   the canonical schema cannot be handed to a model as a structured-output
>   schema — but re-count before quoting a number.
>
> The `RunConfig` provenance gap identified in §9 is **being closed**: v1.4.0
> carries a run-provenance field.

---

## 1. TL;DR

Four findings, in descending order of how much they should change our plan.

1. **Option 2 as proposed — "let users log into their model provider" — is not
   available to us.** Not "risky," not "expensive": not available. Third-party
   apps cannot obtain an OAuth `client_id` for consumer LLM subscriptions, and
   Anthropic explicitly prohibited exactly this pattern in February 2026. The
   tools that do it (OpenClaw, Hermes) either are the provider's own client, or
   piggyback on a first-party CLI already installed on the machine, or are
   operating in a grey zone that has since been closed. See §5.
2. **Option 1 — bring-your-own API key — is viable, and there is exactly one
   correct shape for it**: key never enters the renderer, key never enters
   SQLite, key lives in `safeStorage`, and the network call is made from the main
   process behind a fourth preload surface. See §4.
3. **There is a third option nobody asked about that beats both**: don't put an
   LLM in our app at all — ship an **MCP server** so the analyst's *existing*
   agent drives our app. Zero tokens, zero network calls from us, offline
   non-negotiable untouched, and it composes with whatever the customer already
   procured. See §6. This is what I'd build first.
4. **Our `RunConfig` JSON Schema cannot be handed to a model as-is.** It uses
   `if`/`then`, `not`, `allOf`, `exclusiveMinimum` and `format` — all of which
   strict structured-output modes reject. Any natural-language→config feature
   needs a second, "lowered" generation schema, with Ajv remaining the actual
   gate. See §8.1. This is the single most concrete engineering finding here and
   it is invisible until you try to build it.

Recommendation in §12.

---

## 2. What Microsoft actually asked for

Three asks, per the technical brief (Jul 24 POC, flagged as a **stretch goal**
with "developers should remain focused on finishing the core tool first"):

| # | Ask | Restated against our system |
|---|---|---|
| 1 | Natural-language interface | Describe a run in prose; the app fills in `FormState` instead of the analyst clicking through `RunConfiguration.tsx` |
| 2 | LLM connectivity | The analyst supplies a token at onboarding so the app can reach their model |
| 3 | Automated circuit creation | A prompt produces a Q#/OpenQASM/QIR file that enters the existing upload path |

These are three *different* features with three different risk profiles, and the
brief bundles them. Worth separating: #1 is a UI convenience over a schema we
already own, #3 is arbitrary code generation feeding a compiler, and #2 is only
the plumbing both would need. Ask #2 is not a user-facing feature at all — it is
a cost the other two impose.

---

## 3. The constraint set (verified)

Not opinions — these are in the repo:

- `docs/tech-stack.md` §Non-negotiables: *"**Offline:** no network calls required
  for core workflows (the only network feature in scope is the *pull-oriented*
  update check in Part 3)."*
- `docs/project-overview.md` §What we are explicitly NOT building: *"A cloud
  service — no accounts, no server-side execution, no telemetry."*
- `docs/project-overview.md` §Who it's for: *"Government and industry users."*
- `app/src/main/main.ts:17-23` — the renderer runs `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`. A sandboxed renderer cannot make
  arbitrary Node network calls even if someone wanted it to. Any egress is a
  deliberate main-process act.
- `app/src/main/preload.ts:46-54` — exactly three surfaces are exposed:
  `window.estimator`, `window.store`, `window.files`. None of them can reach the
  network.

Read carefully, the offline rule says *"required for core workflows."* It does
**not** forbid an optional networked feature. That is the gap a design could
live in — but it only helps if the feature is genuinely optional, visibly
networked, and removable, and if procurement can be told a defensible story
about it. For our users, "does my configuration leave this machine?" is a
control question with an auditor attached, not a preference.

---

## 4. Option 1 — bring your own API key

### 4.1 What the user does

Settings → paste `sk-…` → pick a model → the key is validated with one cheap
request → a badge appears somewhere permanent that says networked features are
ON and which provider they point at. Every subsequent AI action shows what is
about to be sent before it is sent.

This is the pattern used by essentially every developer tool that supports
multiple providers, and it is the one path that has no legal ambiguity: an API
key issued from a provider console is billed to the user, is intended for
programmatic use, and carries the org's own retention policy. Anthropic's
February 2026 clarification points developers at exactly this: *"Developers can
get an API key from Anthropic, pay for usage directly, and integrate Claude into
any application."*

### 4.2 Where the key must live

**Not** in `run-history.sqlite` (`app/src/main/main.ts:50-54`), not in a config
JSON, not in `localStorage`, not in the renderer's memory, ever.

Electron ships `safeStorage`, which encrypts with OS key management — Keychain on
macOS, DPAPI on Windows. The correct pattern is
`safeStorage.encryptStringAsync()` → hex → a small file under
`app.getPath("userData")`, and the reverse on read. Two things worth knowing
before anyone builds it:

- **Check the backend.** If no OS secret store is available, `safeStorage`
  silently falls back to a hardcoded plaintext password.
  `safeStorage.getSelectedStorageBackend()` returning `basic_text` means the
  "encryption" is theatre — the app should refuse to store a key in that state
  rather than pretend.
- **DPAPI's threat model is narrower than Keychain's.** On macOS the key is
  protected from *other applications*; on Windows DPAPI protects from *other
  users* but not from other processes in the same user session. Worth writing
  down for anyone reviewing this on the government side, because they will ask.

### 4.3 The fourth preload surface — and which convention it follows

The brief asks that someone adding a fourth surface be able to tell which
convention to follow, and `app/src/main/storeHandler.ts:17-19` documents the
existing asymmetry: the **estimator never rejects** (failures cross as resolved
`RunResult`s with `status: "failed"` — see `estimatorHandler.ts:7-24`), while the
**store does reject** on a duplicate id, because records are write-once and a
duplicate is a real invariant violation.

A hypothetical `window.agent` should follow the **estimator** convention, and the
reasoning is the same one that produced the original split:

- Provider failures — 401, 429, rate limit, TLS failure, network down, model
  refused, timeout — are **expected domain outcomes** the UI has to render and
  possibly record. They resolve, carrying a typed failure, exactly like
  `failedBoundaryResult` does today.
- Two things should still **reject**, because they are programmer error: asking
  for a draft when no credential is configured, and any renderer attempt to
  *read* the token back. The renderer can ask "is a provider configured?" and get
  a boolean. It can never ask "what is the key?" There is no getter. That is the
  point.

### 4.4 What this costs

Small in code, large in everything else. The code is a settings pane, a
`safeStorage` wrapper, one provider adapter, one IPC channel. The cost is
procurement review, a provider allow-list, a data-flow diagram for the customer's
security team, a support burden when a key is wrong or expired, and a permanent
answer to "what leaves the machine."

---

## 5. Option 2 — "log in with your provider"

This is the one you asked me to dig into, so this section is the long one. Short
version: the mechanism is real and well-understood, the tools you named do
implement it, and **we cannot use it.**

### 5.1 How OpenClaw does it

OpenClaw supports OAuth for OpenAI (ChatGPT/Codex) and API keys for most others.
The OpenAI flow is textbook OAuth 2.0 public-client PKCE:

1. Generate a PKCE verifier/challenge pair plus a random `state`.
2. Open `https://auth.openai.com/oauth/authorize?…` with scope
   `openid profile email offline_access`.
3. Catch the redirect on a **loopback listener at
   `http://localhost:1455/auth/callback`** — loopback addresses only, host
   overridable via `OPENCLAW_OAUTH_CALLBACK_HOST`.
4. Exchange the code at `https://auth.openai.com/oauth/token`.
5. Store credentials, and refresh automatically on expiry under a file lock.

Credentials go into a per-agent SQLite database at
`~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`, in an
`auth_profile_store` table, with a parallel `auth_profile_state` table tracking
ordering, last-good, cooldown and usage. Legacy installs kept
`auth-profiles.json` / `credentials/oauth.json` and are migrated by
`openclaw doctor --fix`.

Two details are worth stealing regardless of what we build: **loopback-only
binding on the callback listener**, and **treating credentials as a pool with
health state** rather than a single field.

### 5.2 How Hermes does it

Hermes (Nous Research) is more explicit about the taxonomy, and its taxonomy is
the useful artifact here. A `PROVIDER_REGISTRY` in `hermes_cli/auth.py` maps each
provider to one of three auth strategies:

| Strategy | Providers | Mechanics |
|---|---|---|
| **OAuth device code** | Nous Portal, xAI, MiniMax | Fetch `user_code` + `verification_uri`, poll the token endpoint while the user authorizes in a browser. No loopback listener needed. |
| **OAuth external delegation** | OpenAI Codex, Qwen, Gemini | *Do not implement the flow at all.* Read the credentials the first-party CLI already wrote — e.g. `resolve_qwen_runtime_credentials()` reads the Qwen CLI's own credential file, and Hermes imports `~/.codex/auth.json` when present. |
| **API key** | Anthropic, OpenRouter, DeepSeek, GitHub Copilot | Scan env vars named in `ProviderConfig.api_key_env_vars`. |

Credentials land in `~/.hermes/auth.json` (OAuth tokens, pool state) and
`~/.hermes/.env` (API keys), guarded by `fcntl` / `msvcrt` file locks. There's a
`CredentialPool` with `fill_first` / `round_robin` / `random` / `least_used`
rotation and `STATUS_OK` / `STATUS_EXHAUSTED` / `STATUS_DEAD` health tracking,
plus optional secret injection from Bitwarden and 1Password.

**The middle row is the finding.** Hermes does not "log you into OpenAI." It
finds the file the *official* CLI wrote and reuses it. That is a fundamentally
different act from being an OAuth client, and it is the only reason the pattern
appears to work for third parties at all.

### 5.3 How Codex CLI does it (the first-party baseline)

`codex login` starts a local HTTP server on **port 1455**, generates PKCE,
validates `state` against CSRF, and operates as a public client with no client
secret. Tokens cache at `~/.codex/auth.json` with `0600` permissions, or in the
OS credential store — configurable via `cli_auth_credentials_store` in
`config.toml` as `file` / `keyring` / `auto`. Access tokens last about an hour;
refresh tokens are long-lived and refresh silently. For headless machines,
`codex login --device-auth` swaps the loopback listener for a device code.

Note what Codex *is*: OpenAI's own client, using OpenAI's own `client_id`,
against OpenAI's own auth server. That is the entire difference between it and
us.

### 5.4 Why none of this transfers to us — four blockers

**Blocker 1 — nobody will issue us a `client_id`.** OAuth needs the provider to
register your application. There is no public developer program at Anthropic or
OpenAI that issues a client registration letting a third-party desktop app call
the LLM API *on a consumer subscriber's behalf*. The tools above work around this
by either being first-party (Codex), reusing a first-party CLI's tokens (Hermes,
OpenClaw's Claude path), or reusing a first-party client identifier. The last of
those is not something we can ship in a Microsoft-branded deliverable.

**Blocker 2 — Anthropic explicitly banned it, four months before this memo.**
Anthropic's legal compliance documentation, published February 2026: *"Using
OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other
product, tool, or service — including the Agent SDK — is not permitted."*
Enforcement began blocking third-party OAuth access in **January 2026**; the
clarified language landed **February 20, 2026**. Anthropic framed it as
long-standing (Consumer ToS §3.7, February 2024). The brief names Claude as one
of the three example providers — so this blocker hits the ask directly, and it is
the kind of thing that turns into a contract problem, not a bug report.

**Blocker 3 — those tools are developer CLIs; we are a signed desktop app for
analysts.** OpenClaw and Hermes live in a dotfile directory, are installed by
developers who accept the tradeoff, and can migrate their credential store with a
`doctor --fix`. We ship a notarized macOS/Windows binary to government analysts
who will never open a terminal. "Reuse whatever token you find in
`~/.codex/auth.json`" is not a sentence that survives a security review.

**Blocker 4 — it buys nothing over Option 1.** OAuth is materially more code
(loopback listener, PKCE, state validation, refresh-under-lock, expiry,
revocation, a device-code fallback for locked-down machines) and it does not
change the only question that matters to our users: *what content leaves the
machine.* It changes who pays, not what is disclosed. If we are going to have to
answer the disclosure question either way, we should answer it with the simpler
mechanism.

### 5.5 The one login flow that does survive

There is a version of "log in with your provider" that is not blocked, and it is
the one a Microsoft-aligned product would pick anyway: **Microsoft Entra ID
against Azure OpenAI.**

- Entra ID eliminates hard-coded credentials and applies the customer's own RBAC,
  conditional access, and tenant policy. There is no key for us to store.
- Azure OpenAI was approved within the **FedRAMP High** authorization for Azure
  Government in September 2024, and by DISA at **DoD Impact Level 4 and 5**. For
  the stated user base that is not a nice-to-have; it is frequently the only way
  the feature is legal to use at all.
- The customer's tenant already governs retention. We are not asking them to
  trust *us* with anything — we are asking them to point the app at a resource
  they already own.

This is a genuinely different proposal from the one in the brief, and I think it
is the one to put in front of Microsoft. It reframes ask #2 from "connect your
personal Claude account" to "point this at your organization's approved
endpoint," which is the shape a government analyst's IT department can actually
sign off on. The cost is that it is Azure-specific, needs an Entra app
registration owned by *someone* (Microsoft, presumably, not PlexTech), and is
useless to an industry user who is not on Azure.

---

## 6. Option 3 — invert it: ship an MCP server

Nobody asked for this and I think it is the best idea in this document.

### 6.1 The move

Instead of putting an LLM client inside our app, expose our app's capabilities as
a **Model Context Protocol server over stdio**, and let the analyst's *existing*
agent — Claude Code, Codex, whatever their org already approved — be the natural
language interface.

Tools we would expose map almost one-to-one onto seams that already exist:

| MCP tool | Backed by |
|---|---|
| `list_benchmarks` | `app/src/main/engine/benchmarkRegistry.ts` |
| `validate_config` | `app/src/renderer/state/schemaValidation.ts` (Ajv + `runconfig.schema.json`) |
| `run_estimate` | `QreEngine.run()` — `app/src/main/engine/qreEngine.ts:19` |
| `list_runs` / `get_run` | `SqliteRunStore` — `app/src/main/sqliteRunStore.ts` |
| `compare_runs` | `app/src/renderer/history/comparisonModel.ts` |

### 6.2 Why it fits our constraints better than anything else

- **Our app makes zero network calls.** MCP stdio transport is a local pipe
  between two processes on the same machine. `docs/tech-stack.md`
  §Non-negotiables is untouched, verbatim, with no reinterpretation needed.
- **We store no credentials.** The analyst's agent already has whatever auth it
  has. Options 1 and 2 both evaporate — the entire token question stops being
  ours.
- **Procurement is someone else's problem, in a good way.** The customer already
  decided which agent is allowed on that machine. We are not adding a new
  third-party data-sharing relationship; we are adding a local IPC surface to a
  tool they already cleared.
- **It sidesteps the ToS blocker entirely.** Anthropic's prohibition is on
  third-party tools using subscription OAuth tokens. An MCP server is not using
  anyone's token. Claude Code connecting to a local MCP server is Claude Code
  doing exactly what it is licensed to do.
- **It is the smaller build.** No provider adapters, no key UI, no refresh
  logic, no retry/backoff, no cost accounting, no model-drift problem.

### 6.3 What it does not solve

Be honest about this:

- **It only helps users who already have an agent.** The analyst who has never
  used a CLI gets nothing. That may be most of our users — which would make this
  a developer/power-user feature, not the mass-market natural-language interface
  the brief describes. This is the strongest argument against it and it should go
  in front of Microsoft as a question, not be assumed away.
- **The UX is not in our app.** The conversation happens in the agent's window,
  not ours. Results land in our SQLite history and the user tabs over to see
  them. That is a coherent story but it is not "type into the dashboard."
- **It inverts the trust direction.** Today nothing outside the app can start a
  run. An MCP server means an external process can. Everything in §9 still
  applies, plus the MCP-specific risks: tool poisoning and indirect prompt
  injection are live, documented attack classes, and the guidance is consistent —
  least privilege, explicit user control, enforce access control at the tool
  execution layer rather than in a system prompt, and log every tool invocation
  with enough detail to reconstruct whether an action came from the user or from
  injected text. Concretely for us: `run_estimate` should be behind an in-app
  confirmation, and `delete` should not be exposed at all in v1.

### 6.4 Rough shape

An MCP server is a small stdio JSON-RPC process. Our main-process modules are
already the right granularity — `QreEngine`, `SqliteRunStore`,
`validateRunConfigSchema` — and none of them import Electron. That is not an
accident of this design; it is a property the codebase already has, and it is
what makes this cheap.

---

## 7. Option 4 — a local model, zero egress

If the requirement is "natural language" and the constraint is "nothing leaves
the machine," the honest answer is to run the model locally.

**Microsoft Foundry Local** is the obvious candidate and the politically
easiest one to propose to this customer: it is Microsoft's own on-device
inference runtime, runs on Windows 10/11 and macOS (Intel and Apple Silicon),
ships a model catalog (Phi-4, Phi-3.5, Llama 3.2, Mistral), does automatic
CPU/GPU/NPU selection over ONNX Runtime, and — the part that matters for us —
exposes an **OpenAI-compatible chat-completions endpoint**, so switching between
local and cloud is a base-URL change rather than an adapter rewrite. Ollama fills
the same slot with a wider model catalog and no Microsoft affiliation.

Tradeoffs, plainly:

- **Pro:** no token, no account, no egress, no procurement conversation, no ToS
  question. The offline non-negotiable survives literally.
- **Pro:** an OpenAI-compatible local endpoint means the provider adapter you'd
  write for §4 is the *same* adapter. Local-first does not close the cloud door.
- **Con:** the install is large and Foundry Local is a separate runtime, not
  something we can quietly bundle into a signed app without a packaging
  conversation (Part 4 territory).
- **Con:** a small local model is meaningfully worse at the one task we'd give it
  than a frontier model — though see §8.1: the task is "emit a JSON object
  matching a schema," which is exactly the kind of task constrained decoding
  makes tractable for small models.

---

## 8. How the three asks land, concretely

### 8.1 Ask 1 — natural-language interface, and the schema wrinkle

**The user-visible flow.** Analyst types *"Shor's factoring on neutral atom
hardware, keep total error under 1e-3, use the GSJ24 factory."* A panel proposes
a filled-in configuration. Every changed field is highlighted. The analyst edits
anything they want. Nothing runs until they press the existing Run button.

**The critical design call: the model produces a `FormState`, not a
`RunConfig`.** `app/src/renderer/state/toRunConfig.ts` is the only sanctioned
path from draft to config, and `useRunFlow.ts:40-41,86` stamps `id` and
`createdAt` at Run-click and nowhere else. If the model emitted a `RunConfig`
directly, it would be minting run identity — which breaks the invariant that a
run's identity is created at the moment the human commits to it. Feeding the
existing form instead means the model gets the same validation, the same coupling
rules (`deriveQecCode`, `isLitinski19AllowedInForm`, `isGsj24AllowedInForm` in
`formState.ts`), and the same human in the same place as today.

**Now the wrinkle.** The obvious implementation is to hand
`app/src/shared/contracts/runconfig.schema.json` to the model as a structured
output schema and let constrained decoding guarantee validity. **That does not
work.** I counted the keywords in our schema:

| Keyword | Uses in `runconfig.schema.json` | Supported by strict structured outputs? |
|---|---|---|
| `const` | 25 | yes |
| `exclusiveMinimum` | 12 | **no** |
| `additionalProperties` | 10 | yes (must be `false`) |
| `if` / `then` | 6 / 6 | **no** |
| `oneOf` | 4 | partial |
| `format` (`uuid`, `date-time`) | 4 | **no** |
| `anyOf` | 2 | yes |
| `allOf` | 1 | **no** |
| `not` | 1 | **no** |

Strict structured-output modes support roughly `type`, `properties`, `required`,
`items`, `enum`, `const`, `$defs`, `anyOf`, and `additionalProperties: false` —
and require every property to appear in `required`. Numeric bounds, string
formats, and conditional keywords are all dropped. Our schema is *deliberately*
strict (`additionalProperties: false`, closed enums, per its own description
comment) precisely so a producer typo fails fast — which is exactly the strictness
that makes it un-generatable.

So a natural-language feature needs **two schemas**:

1. A **lowered generation schema**, derived from the canonical one, using only
   the supported subset — bounds and conditionals expressed in the field
   descriptions as prose rather than as constraints.
2. The **canonical schema as the real gate**, unchanged, via the existing
   `validateRunConfigSchema()` in `schemaValidation.ts`. If the draft fails, the
   analyst sees the Ajv errors in the existing `ValidationSummary.tsx` — the same
   errors they'd see from a bad manual entry. No new failure surface.

Keeping those two in sync is real, permanent maintenance cost, and it is a cost
that only becomes visible after someone has already committed to the feature.
Writing it down now is most of the value of this section.

There is also a **fully local variant of ask #1 with no model at all**: a
deterministic parser over a controlled vocabulary — architecture names, benchmark
names, "error rate 1e-4," "max error 1e-3." Our config space is small and closed
(5 benchmarks, 3 architectures, 3 factories, 2 transforms). It would handle a
useful fraction of real phrasings, ships offline, needs no token, and costs
nothing at procurement. It is less impressive in a demo and it will not handle
prose it wasn't built for. Worth pricing before assuming an LLM is required —
"natural-language interface" was Microsoft's framing of a problem, and the
problem is that the form is tedious.

### 8.2 Ask 2 — connectivity

Covered in §4–§7. The summary: the token question has four answers, and three of
them are better than the one in the brief.

| Approach | Token stored by us? | Egress from our app? | ToS clear? | Gov-viable? |
|---|---|---|---|---|
| BYO API key (§4) | yes, `safeStorage` | yes | yes | needs review |
| Consumer OAuth (§5) | yes | yes | **no** | no |
| Entra ID → Azure OpenAI (§5.5) | no | yes | yes | **yes** (FedRAMP High / IL4-5) |
| MCP server (§6) | **no** | **no** | yes | best |
| Local model (§7) | **no** | **no** | yes | best |

### 8.3 Ask 3 — automated circuit creation

Highest risk of the three, and the one where our existing code does the most work
for us already.

**What already exists.** `app/src/main/engine/uploadValidation.ts` runs a
pre-flight before the engine spawns: the file must exist, be readable, carry an
extension matching the declared format, and *look* like that format —
`OPENQASM` version header plus recognizable statements, Q# `namespace`/
`operation`/`function` tokens, LLVM bitcode magic (`BC\xC0\xDE`) or textual IR
directives for QIR. It is explicitly "not a parser" (its own header comment says
so), and `QreEngine.run()` calls it at `qreEngine.ts:26-44` before anything
spawns.

**What that means for generated circuits.** A generated file is a file. It should
be written to disk and then travel the *identical* path as a user upload — same
`preflightUploadedProgram`, same `INVALID_CONFIG` on failure, same
`COMPILE_ERROR` handling from the compiler. There should be no
"generated-program" code path. If one exists, it is a bypass, and bypasses are
where this goes wrong.

Three additions on top:

1. **Quarantine directory.** Generated files land somewhere clearly marked under
   `app.getPath("userData")`, never silently into the user's project or the
   benchmark library. `addToLibrary` (`types.ts:53`) defaults to `false` and
   requires a separate deliberate action.
2. **The analyst reads it before it runs.** Show the generated source. A Q#
   program is not a config value; it is code that a compiler will execute
   semantics for, and "an LLM wrote it and it compiled" is not evidence that it
   computes what the analyst asked for. This is the difference between a wrong
   *config* (visible in the form) and a wrong *circuit* (invisible until the
   numbers are already in a report).
3. **Estimation cost is an attack surface of its own.** A generated circuit can
   be perfectly valid and take longer than the 120-second timeout
   (`qreEngine.ts:11`) — or be valid, fast, and quietly wrong. The timeout
   protects the process; nothing protects the conclusion.

**My read: ask #3 is the one to decline, or to defer longest.** Asks #1 and #2
help an analyst use a tool they understand. Ask #3 asks them to trust a program
they didn't write, can't easily verify, and will put numbers from into a
procurement document. That is a different product.

---

## 9. What stands between generated output and execution

If anything here gets built, these are the gates, in order. Each one already
exists except where noted.

| # | Gate | Where | New? |
|---|---|---|---|
| 1 | Model output parsed into a draft `FormState`, never a stamped `RunConfig` | `formState.ts` | new |
| 2 | Analyst sees and edits every proposed field | `RunConfiguration.tsx`, `ConfigurationSummary.tsx` | existing |
| 3 | Coupling/availability rules re-derived, not trusted | `deriveQecCode`, `isLitinski19AllowedInForm`, `isGsj24AllowedInForm` | existing |
| 4 | Ajv validation against the canonical schema | `schemaValidation.ts` | existing |
| 5 | Human clicks Run — identity stamped here and only here | `useRunFlow.ts:86` | existing |
| 6 | `configToInvocation` re-validates independently in the main process | `configToInvocation.ts` | existing |
| 7 | Upload pre-flight for any generated program file | `uploadValidation.ts` | existing |
| 8 | Engine failures cross as resolved failed `RunResult`s | `qreEngine.ts`, `estimatorHandler.ts` | existing |

Gates 3, 4 and 6 mean the model cannot smuggle an invalid config through by being
clever, and gate 5 means it cannot start a run at all. That is a genuinely strong
position, and it is strong because of decisions already made — not because of
anything the agentic feature would add.

**One gap.** There is currently **no way to record that a run was
model-assisted.** `RunConfig` is `additionalProperties: false`
(`runconfig.schema.json:8`), so provenance cannot be stashed on it without a
contract change; `RunRecord` (`types.ts:531-539`) deliberately carries no fields
beyond `config`, `result` and `savedAt`. If Microsoft wants an audit trail —
"which of these estimates had AI in the loop?" — that is a PM-owned contract
change (`docs/engineering-workflow.md`), and it should be priced into any
proposal rather than discovered afterwards. Worth asking them about explicitly;
see §11.

---

## 10. Rough build cost

Two developers, our week. Estimates include tests to the standard the repo
already holds, and exclude procurement/legal time, which is likely to dominate
for anything in the middle rows.

| Item | Est. | Notes |
|---|---|---|
| MCP server, read-only tools (`list_benchmarks`, `list_runs`, `get_run`, `validate_config`) | **3–5 days** | Reuses existing modules unchanged; no new trust boundary beyond read |
| MCP server + `run_estimate` behind in-app confirmation | +2–3 days | Adds the confirm UI and invocation logging |
| Deterministic local NL parser (§8.1) | 4–6 days | No network, no token, no procurement |
| `safeStorage` credential store + settings pane + no-getter preload surface | 4–6 days | Includes `basic_text` backend detection |
| One provider adapter (OpenAI-compatible; covers Foundry Local + Ollama + Azure OpenAI) | 3–4 days | Second provider ≈ 1–2 days after the first |
| Lowered generation schema + drift test against canonical | 3–5 days | The permanent-maintenance item from §8.1 |
| NL→draft-config UI (proposal panel, diff highlighting, accept/reject) | 5–8 days | |
| Entra ID / Azure OpenAI auth | 5–10 days | Plus an app registration we don't own |
| Consumer OAuth (PKCE + loopback + refresh + device-code fallback) | 8–12 days | **Do not build — see §5** |
| Automated circuit creation, end to end | 10–15 days | Excludes the question of whether the output is *correct* |
| Provenance contract change | 2–3 days | Plus PM review and every consumer that reads `RunRecord` |

---

## 11. What to ask Microsoft

Ordered so that a "no" high up saves the questions below it.

1. **Is a networked LLM feature permissible at all for the target users?** If the
   answer is "not for the government segment," §6 and §7 are the whole design
   space and everything else is moot.
2. **Would an MCP server satisfy the intent?** This is the question I most want
   answered, because it is cheap, it violates nothing, and it may simply *be*
   what they meant by "connect your own agent." It also reveals whether they
   imagined a chat box inside our app or an existing agent driving it.
3. **What fraction of the target users already run an agent?** Determines whether
   §6 is the main feature or a power-user side door.
4. **Azure OpenAI via Entra ID instead of consumer accounts?** Given FedRAMP High
   and IL4/IL5, this looks like the only cloud path with a clean government
   story. If yes: who owns the app registration?
5. **Are they aware consumer-subscription OAuth is now prohibited by Anthropic?**
   The brief names Claude explicitly. Worth surfacing as a fact, not a
   preference.
6. **Which providers are on the allow-list, and who maintains it?**
7. **Is an audit trail required when a model influenced a run?** This is a
   contract change (§9) and needs to be known before, not after.
8. **Priority order across the three asks** — and whether ask #3 (circuit
   generation) is genuinely wanted, given §8.3.

---

## 12. Recommendation

**Build nothing this summer. Propose the MCP server as the first thing to build
after the core tool lands, and take the Entra ID path to Microsoft as the answer
to ask #2.**

Reasoning, in order:

1. The core tool is not finished, and Microsoft said in the same breath as the
   ask that finishing it comes first. Nothing in this research changes that.
2. **Ask #2 as specified cannot be built.** Consumer OAuth is closed to us by
   both mechanism (no `client_id`) and policy (Anthropic, Feb 2026). Any plan
   that assumes it will fail late.
3. **The inversion in §6 is strictly better than what was asked for**, on every
   axis we care about: zero egress, zero credentials, zero ToS exposure, smaller
   build, and it composes with tools the customer already cleared. Its real
   weakness — it only serves users who already have an agent — is an empirical
   question we should ask rather than guess at.
4. **The schema finding in §8.1 means the natural-language feature is more
   expensive than it looks**, and the extra cost is permanent maintenance rather
   than one-time build. That should be priced before anyone commits.
5. **Ask #3 should be declined or deferred longest.** The failure mode is a
   plausible-looking circuit producing plausible-looking numbers that end up in a
   procurement decision. Our validation layers catch malformed input; nothing
   catches "compiles fine, computes the wrong thing."

### What would change this

- **Microsoft says the government segment can use an approved cloud endpoint, and
  names it.** → §5.5 becomes buildable and ask #2 has a real answer.
- **Microsoft says most target analysts already run an agent.** → §6 moves from
  "first thing after core" to "highest-value next feature," and it is cheap
  enough to justify quickly.
- **Microsoft says they meant a chat box inside our app, and the users are
  air-gapped.** → §7 (Foundry Local) becomes the only viable design, and the
  conversation shifts to packaging, which is Part 4 work.
- **The core tool lands early and Part 3 finishes ahead of schedule.** → §6's
  read-only tools are a 3–5 day spike with no contract change and no new egress.
  That is the cheapest real thing on this list and the first one I'd pick up.
- **Anthropic or OpenAI ships a third-party delegated-auth program for desktop
  apps.** → Blocker 1 disappears and §5 is worth re-reading. Nothing suggests
  this is imminent.

Nothing here would reverse the "not this summer" call. These would reorder what
comes first when someone does pick it up.

---

## 13. Sources

Provider auth mechanics:

- [OpenClaw — OAuth](https://docs.openclaw.ai/concepts/oauth) · [OpenClaw — Authentication](https://docs.openclaw.ai/gateway/authentication)
- [Hermes Agent — Authentication and Providers](https://deepwiki.com/NousResearch/hermes-agent/2.3-authentication-and-providers) · [Hermes Agent — AI Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [Codex CLI — Authentication](https://learn.chatgpt.com/docs/auth) · [Codex CLI authentication flows and credential management](https://codex.danielvaughan.com/2026/04/01/codex-cli-authentication-flows-credential-management/)

Policy and compliance:

- [The Register — Anthropic clarifies ban on third-party tool access to Claude (Feb 20, 2026)](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)
- [Anthropic bans Claude subscription OAuth in third-party apps](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)
- [Azure OpenAI Service authorized for all U.S. Government data classification levels](https://devblogs.microsoft.com/azuregov/azure-openai-authorization/)
- [Configure Azure OpenAI with Microsoft Entra ID authentication](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/managed-identity?view=foundry-classic)

Credential storage:

- [Electron — safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Signal-Desktop — protect database encryption key with safeStorage](https://github.com/signalapp/Signal-Desktop/pull/6849)

MCP:

- [Model Context Protocol — Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [OWASP — MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html) · [OWASP — MCP Tool Poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning)
- [NSA/CISA — Security Design Considerations for AI-Driven Automation (Jun 2026)](https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF)
- [Unit 42 — Prompt injection attack vectors through MCP sampling](https://unit42.paloaltonetworks.com/model-context-protocol-attack-vectors/)

Local inference and structured output:

- [Run local AI on any PC or Mac — Microsoft Foundry Local](https://techcommunity.microsoft.com/blog/microsoftmechanicsblog/run-local-ai-on-any-pc-or-mac-%E2%80%94-microsoft-foundry-local/4473018)
- [OpenAI — Structured model outputs (supported JSON Schema subset)](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Azure OpenAI — How to use structured outputs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs)
- [JSONSchemaBench — a rigorous benchmark of structured outputs for language models](https://arxiv.org/pdf/2501.10868)

Internal cross-references: `docs/tech-stack.md` §Non-negotiables ·
`docs/project-overview.md` §What we are explicitly NOT building ·
`docs/data-contracts.md` · `docs/engineering-workflow.md` (contract-change
process) · `docs/week-4/team-3/week-4-team-3-technical-brief.md` §Deliverable 3 ·
`docs/week-4/team-3/qdk-1.30.0-validation.md`
