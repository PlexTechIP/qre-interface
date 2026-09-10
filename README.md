# QRE Dashboard

QRE Dashboard is a cross-platform desktop application built around Microsoft's open-source **Quantum Resource Estimator (QRE v3)**. It gives analysts a desktop interface for working with QRE without relying on VS Code or the command line.

Users can **configure**, **run**, **save**, **compare**, and **export** resource estimates without writing code.

Built through a **PlexTech × Microsoft** collaboration.

---

## Highlights

* **Guided configuration** — configure a run across the full QRE parameter set, including application, physical architecture, error-correction code, magic-state factory, trace transform, and error budget. Common settings include defaults to make setup faster.
* **Local execution** — estimates run locally against a bundled QRE v3 engine. Core workflows do not require a cloud service, account, or server-side compute.
* **Run history** — each run is saved with its full configuration, timestamp, QRE engine version, and raw output. Existing runs remain unchanged; users can **rerun** one to create a new configuration with the previous settings pre-filled.
* **Comparison** — select saved runs and compare results across architectures, error-correction schemes, and other configurations using tables and charts.
* **Markdown export** — export individual runs or comparison sets as Markdown for reports and further analysis.
* **Optional AI assistant** — describe an estimate in plain language and use a supported model to draft the configuration. Users provide their own API key, which is stored locally and only sent to the selected provider when making a request.
* **MCP server** — a read-only Model Context Protocol server exposes saved run history to external agents for analysis and review.
* **Offline and reproducible** — core estimation workflows work without a network connection, and each run records the QRE engine version used to produce it.

## Who it's for

QRE Dashboard is intended for government and industry analysts who use quantum resource estimation for **benchmarking, evaluation, and comparison**.

The application is not a quantum programming environment or a reimplementation of QRE. It provides a desktop interface around the existing QRE engine while preserving the engine's output for later review and comparison.

## Architecture

QRE Dashboard is built with Electron and separates the renderer from the main process. The renderer does not access the estimator or database directly. Communication passes through a typed IPC boundary, keeping the UI separate from the estimation and persistence layers.

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

QRE v3 runs locally through the main process, which invokes Microsoft's QDK
(`qdk[qre]`) as a subprocess.

See [`docs/architecture.md`](docs/architecture.md) for the full architecture and
[`docs/tech-stack.md`](docs/tech-stack.md) for version details and technical decisions.

## Tech stack

| Layer             | Choice                                                      |
| ----------------- | ----------------------------------------------------------- |
| Desktop shell     | Electron 43 (Chromium + Node 24.18.0)                       |
| UI                | React 19 + TypeScript 5.9 (strict)                          |
| Build / dev       | Vite 8                                                      |
| Estimation engine | Microsoft QDK — `qdk[qre]` (QRE v3) on Python 3.13          |
| Persistence       | `node:sqlite` (built-in, no native rebuild)                 |
| Testing           | Vitest + Testing Library + jsdom                            |
| AI / agent        | Provider-agnostic, bring-your-own-key; MCP over run history |

## Getting started

The application is located in [`app/`](app/).

Node and npm versions are pinned in [`app/package.json`](app/package.json)
under `engines` and in [`.nvmrc`](.nvmrc):

* Node **24.18.0**
* npm **11.16.0**

A version manager such as `fnm` or `nvm` can read the required Node version from `.nvmrc`.

Local QRE execution also requires **Python 3.13** with `qdk[qre]` installed.

See [`docs/setup-and-troubleshooting.md`](docs/setup-and-troubleshooting.md) for
clean-machine setup instructions and common issues.

```sh
cd app
npm ci            # install dependencies from the lockfile
npm run dev       # build the main/preload/MCP bundles and launch the app
```

### Checks

```sh
cd app
npm run typecheck # tsc --noEmit (renderer + node projects)
npm run lint      # eslint
npm run test      # vitest unit tests (jsdom)
```

Tests that use the real Python `qdk.qre` estimator are kept separate from the default test suite:

```sh
npm run test:engine
```

## Connecting an agent (MCP)

QRE Dashboard includes a read-only MCP server that gives external agents access to saved run history. This allows an agent to review previous estimates, answer questions about them, and inspect configurations before new runs are submitted.

Build the MCP server and generate its client configuration with:

```sh
cd app
npm run build:mcp
npm run mcp:config
```

The command prints a ready-to-use `claude mcp add` command and a Claude Desktop configuration block with paths resolved for the current machine.

See [`app/src/mcp/README.md`](app/src/mcp/README.md) for the available tools, error codes, and database configuration.

## Development workflow

### Pre-commit hook

A committed hook in [`.githooks/`](.githooks/) runs type checking and unit tests before each commit.

Git hooks are not enabled automatically after cloning the repository, so activate them once per clone:

```sh
git config core.hooksPath .githooks
```

The hook only runs the faster checks. Real-engine tests can be run separately with:

```sh
npm run test:engine
```

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs type checking and unit tests on each pull request and push using the pinned Node version.

## Repository layout

```
.
├── app/                  # Electron application source, build, and tests
│   └── src/
│       ├── renderer/     # React UI: configuration, results, history, comparison, AI
│       ├── main/         # main process: estimator, run store, exporter, IPC
│       ├── mcp/          # read-only MCP server over run history
│       └── shared/       # types shared across the IPC boundary
├── docs/                 # project documentation
├── spikes/               # exploratory prototypes
├── Intro_to_QRE.md       # introduction to QRE and resource estimation
└── PlexTech_and_Microsoft_SOW.md  # statement of work
```

## Documentation

Project documentation is available in [`docs/`](docs/). Useful starting points include:

* [`docs/project-overview.md`](docs/project-overview.md) — project goals and scope.
* [`docs/architecture.md`](docs/architecture.md) — application architecture, IPC, engine, and persistence.
* [`docs/data-contracts.md`](docs/data-contracts.md) — `RunConfig` and `RunResult` structures.
* [`docs/features-and-fields.md`](docs/features-and-fields.md) — supported applications, fields, ranges, and defaults.
* [`docs/glossary.md`](docs/glossary.md) — QRE and project terminology.

For an introduction to quantum resource estimation, see
[`Intro_to_QRE.md`](Intro_to_QRE.md) or Microsoft's
[resource estimator documentation](https://learn.microsoft.com/en-us/azure/quantum/intro-to-resource-estimation).

## License

Released under the [MIT License](LICENSE) — Copyright © 2026 PlexTechIP.
