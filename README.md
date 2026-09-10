# QRE Dashboard

A cross-platform desktop application that wraps Microsoft's open-source
**Quantum Resource Estimator (QRE v3)** in a structured, analyst-facing
interface. QRE is powerful but is normally driven through VS Code or the command
line — a workflow built for quantum researchers, not for the government and
industry analysts who use resource estimation as a benchmarking and evaluation
tool. The QRE Dashboard gives those users a way to **configure**, **run**,
**save**, **compare**, and **export** resource estimates without writing code.

Built as a PlexTech × Microsoft engagement.

---

## Highlights

- **Guided configuration** — set up a run from the full parameter surface
  (application, physical architecture, error-correction code, magic-state
  factory, trace transform, and error budget) with sensible defaults, so a
  sound estimate is a minute of work rather than a scripting exercise.
- **Local execution** — runs execute on your machine against a bundled QRE v3
  engine. No cloud, no accounts, no server-side compute.
- **Immutable run history** — every run is saved as a complete, immutable record
  (full configuration, timestamp, QRE engine version, and full raw output).
  You never edit a run; you **rerun** it, which pre-fills a new configuration
  from an existing one.
- **Comparison** — select runs from history and compare them side by side across
  architectures and error-correction schemes, in tables and charts.
- **Markdown-first export** — export individual runs and comparison sets as
  Markdown for reports and downstream analysis.
- **Optional AI assistant** — describe the run you want in plain language and let
  a model draft a configuration for you (bring your own API key; keys are stored
  encrypted and never leave your machine except to your chosen provider).
- **MCP server** — a read-only Model Context Protocol server over your run
  history, so an external agent can answer questions about saved estimates.
- **Offline and reproducible by design** — no network is required for any core
  workflow, and the exact QRE engine version is recorded on every run so results
  stay reproducible as QRE evolves.

## Who it's for

Government and industry users who treat QRE as a **decision tool** — they want
resource estimates, architecture comparisons, and benchmark-level analysis, not
a quantum programming environment. The app is deliberately **not** a quantum
program editor, a cloud service, or a reimplementation of QRE; it bundles and
orchestrates the real engine and preserves its output verbatim.

## Architecture

The application is an Electron app with a strict two-process split. The renderer
never talks to the estimator or the database directly — everything crosses one
typed boundary, which keeps the engine swappable (mock ↔ real) and the UI
testable.

```
┌────────────────────────────── Electron app ──────────────────────────────┐
│                                                                           │
│  Renderer process (React + TS)          Main process (Node + TS)          │
│  ┌──────────────────────────┐           ┌────────────────────────────┐    │
│  │ Run Configuration UI     │  typed    │ EstimatorService           │    │
│  │ Results Area             │◄─ IPC ───►│  ├─ QRE v3 engine adapter  │    │
│  │ Run History              │           │  │   (bundled, versioned)  │    │
│  │ Comparison               │           │  └─ MockEngine (fixtures)  │    │
│  │ AI assistant             │           │ RunStore (SQLite)          │    │
│  └──────────────────────────┘           │ Exporter (Markdown)        │    │
│                                         └────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
```

QRE v3 is executed locally by the main process, which invokes Microsoft's QDK
(`qdk[qre]`) as a subprocess. See [`docs/architecture.md`](docs/architecture.md)
for the full picture and [`docs/tech-stack.md`](docs/tech-stack.md) for pinned
versions and rationale.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron 43 (Chromium + Node 24.18.0) |
| UI | React 19 + TypeScript 5.9 (strict) |
| Build / dev | Vite 8 |
| Estimation engine | Microsoft QDK — `qdk[qre]` (QRE v3) on Python 3.13 |
| Persistence | `node:sqlite` (built-in, no native rebuild) |
| Testing | Vitest + Testing Library + jsdom |
| AI / agent | Provider-agnostic, bring-your-own-key; MCP over run history |

## Getting started

The application lives in [`app/`](app/). Node and npm versions are pinned in
[`app/package.json`](app/package.json) (`engines`) and in
[`.nvmrc`](.nvmrc) — Node **24.18.0** / npm **11.16.0**, matching Electron's
embedded Node line. A version manager such as `fnm` or `nvm` will pick this up
from `.nvmrc` automatically.

Local QRE execution additionally requires **Python 3.13** with
`qdk[qre]` installed. See
[`docs/setup-and-troubleshooting.md`](docs/setup-and-troubleshooting.md) for
clean-machine setup and common fixes.

```sh
cd app
npm ci            # install dependencies (exact, from the lockfile)
npm run dev       # build the main/preload/MCP bundles and launch the app
```

### Checks

```sh
cd app
npm run typecheck # tsc --noEmit (renderer + node projects)
npm run lint      # eslint
npm run test      # vitest unit tests (jsdom)
```

Slower real-engine / conformance tests (which spawn the Python `qdk.qre`
estimator) are kept out of the default test path and run separately:

```sh
npm run test:engine
```

## Connecting an agent (MCP)

The app ships a read-only MCP server over the run history, so an agent can answer
questions about saved estimates and review a configuration before you run it.
Build it, then ask it to print its own client configuration:

```sh
cd app
npm run build:mcp
npm run mcp:config
```

That prints a ready-to-paste `claude mcp add` line and a Claude Desktop config
block, with paths already resolved for this machine — including a Node new enough
to run the server, which is not necessarily the one your shell defaults to. See
[`app/src/mcp/README.md`](app/src/mcp/README.md) for the available tools, error
codes, and where the database path comes from.

## Development workflow

### Pre-commit hook

A committed hook in [`.githooks/`](.githooks/) runs `typecheck` and the unit
tests before each commit. Git hooks aren't shared automatically, so **activate
it once per clone**:

```sh
git config core.hooksPath .githooks
```

The hook runs only the fast checks; the slow real-engine tests stay out of the
commit path (run them via `npm run test:engine` or CI).

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same typecheck
and unit tests on every pull request and push, on the pinned Node version.

## Repository layout

```
.
├── app/                  # the Electron application (source, build, tests)
│   └── src/
│       ├── renderer/     # React UI (configuration, results, history, comparison, AI)
│       ├── main/         # main process: estimator, run store, exporter, IPC
│       ├── mcp/          # read-only MCP server over run history
│       └── shared/       # contract types shared across the IPC boundary
├── docs/                 # project documentation (see docs/README.md)
├── spikes/               # exploratory prototypes
├── Intro_to_QRE.md       # domain primer: what QRE estimates and why
└── PlexTech_and_Microsoft_SOW.md  # statement of work
```

## Documentation

[`docs/`](docs/) is the source of truth for the project. Good entry points:

- [`docs/project-overview.md`](docs/project-overview.md) — what the app is and why.
- [`docs/architecture.md`](docs/architecture.md) — end-to-end app, IPC, engine, and store.
- [`docs/data-contracts.md`](docs/data-contracts.md) — the `RunConfig` / `RunResult` shapes.
- [`docs/features-and-fields.md`](docs/features-and-fields.md) — every application type, field, range, and default.
- [`docs/glossary.md`](docs/glossary.md) — QRE and project terminology.

New to quantum resource estimation? Start with
[`Intro_to_QRE.md`](Intro_to_QRE.md) and Microsoft's
[resource estimator documentation](https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation).

## License

Released under the [MIT License](LICENSE) — Copyright © 2026 PlexTechIP.
