# Tech Stack

These are the **currently suggested versions** for Week 2, not permanent
project commitments. The stack is subject to change as implementation needs,
Microsoft/QDK guidance, packaging constraints, or security updates require.

For now, use the exact versions below in the shared scaffold and in any
temporary standalone Vite workspace so the three teams can build separately and
merge without dependency drift. Do **not** use `^`, `~`, `latest`, `dev`, or
pre-release tags for direct dependencies. Commit the lockfile. When we decide a
version should change, make that change deliberately in one
dependency-standard PR so all teams move together.

## Current suggested stack

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | **Electron `43.1.0`** | Current supported stable line; bundles Chromium 150 and Node `24.18.0`. Cross-platform macOS + Windows, offline-first. |
| Local Node runtime | **Node.js `24.18.0` LTS + npm `11.16.0`** | Use this for local dev and CI so it matches Electron's embedded Node line. Set `engines.node` to `24.18.0` in the scaffold. |
| Package manager | **npm `11.16.0`** | Use `package-lock.json`; no pnpm/yarn in team branches this week. |
| UI | **React `19.2.7` + React DOM `19.2.7` + TypeScript `5.9.3`** | Strict TS everywhere; no `any` at module boundaries. TypeScript is intentionally held at 5.9 because `typescript-eslint` still peers on `<6.1`. |
| Build/dev server | **Vite `8.1.3` + `@vitejs/plugin-react` `6.0.3`** | Use Vite for renderer development and scaffold builds. Do not add `electron-vite` this week; its latest stable does not peer on Vite 8. |
| Estimation engine | **Primary spike: `qdk[qre]==1.29.1` on Python `3.13.14`; fallback JS/WASM: `qsharp-lang@1.29.1`** | Team 3 owns the route decision. The Python `qdk` package is the stable QDK entry point and exposes `qdk.qre`; `qsharp` PyPI is deprecated. `qsharp-lang@1.29.1` is exact-pinned as the JS/WASM route to evaluate for Electron packaging. No `1.29.x-dev` packages. |
| Contract validation | **Ajv `8.20.0` + `ajv-formats` `3.0.1`** | Required for draft-07 schemas plus `uuid` and `date-time` formats. Team 1 mock validation and Team 3 conformance use the same pair. |
| Testing | **Vitest `4.1.10` + jsdom `29.1.1` + Testing Library React `16.3.2` + jest-dom `6.9.1` + user-event `14.6.1`** | Renderer component/unit tests run in jsdom. Engine harness tests use Vitest with longer timeouts. |
| Engine/harness scripts | **tsx `4.23.0` + `@types/node` `24.13.3`** | Use for Team 3 CLI harnesses and Node-side TypeScript scripts. Keep Node types on the 24.x line to match Electron/Node 24, not latest 26.x. |
| Lint/format | **ESLint `10.6.0` + `typescript-eslint` `8.63.0` + Prettier `3.9.4`** | Flat config. TS target: `ES2022`; strict flags include `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. |
| Persistence | **`node:sqlite` from Node `24.18.0` / SQLite `3.53.1`** | Part 2+ local run history. Prefer the built-in API to avoid Electron native-module rebuilds. If its release-candidate API blocks Part 2, PMs may approve fallback `better-sqlite3@12.11.1`. |
| Charts | **No charting dependency in Week 2** | Team 2's Week 2 scatter/table visuals are hand-rolled SVG/CSS with plain props. The Recharts-vs-Plotly decision is deferred to Week 5 comparison work. |
| Export | **Markdown-first; no export package yet** | Part 3. Use plain Markdown generation until export requirements justify a library. |
| Build/packaging | **electron-builder `26.15.3`** | Packaging work is Part 3/4, but this is the standard to target for macOS/Windows installers unless PMs reopen the decision. Electron Forge is not part of the Week 2 baseline. |

## Architecture at a glance

```
┌────────────────────────────── Electron app ──────────────────────────────┐
│                                                                          │
│  Renderer process (React + TS)          Main process (Node + TS)         │
│  ┌──────────────────────────┐           ┌────────────────────────────┐   │
│  │ Run Configuration UI     │  typed    │ EstimatorService           │   │
│  │ Results Area             │◄─ IPC ───►│  ├─ QRE v3 engine adapter  │   │
│  │ Run History              │           │  │   (bundled, versioned)  │   │
│  │ Comparison page          │           │  └─ MockEngine (fixtures)  │   │
│  └──────────────────────────┘           │ RunStore (SQLite)          │   │
│                                         │ Exporter (Markdown)        │   │
│                                         └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

Two rules fall out of this picture:

1. **The renderer never talks to QRE or SQLite directly.** Everything crosses
   one typed boundary (`EstimatorService`, `RunStore`) so the engine can be
   swapped (mock ↔ real) and the UI stays testable.
2. **The contract types (`RunConfig`, `RunResult` — see `data-contracts.md`)
   are the only shapes that cross that boundary** for estimation workflows.

## How QRE v3 gets executed locally **(to be validated in week 2)**

QRE ships as part of Microsoft's open-source QDK. The dashboard needs
parameterized architectures, magic-state factory selection, trace transforms,
Three-Aux, max-error caps, and Pareto frontiers. Team 3's first job is to prove
which pinned package/API exposes that full surface and can be bundled reliably.

Team 3 should spike these exact packages:

- **Route A — Python QDK:** `Python 3.13.14` + `qdk[qre]==1.29.1`, invoked
  by Electron's main process as a subprocess. This is heavier to package, but
  the stable `qdk` package exposes `qdk.qre`, Q#, and OpenQASM support. Set
  `QDK_PYTHON_TELEMETRY=none` in local runs and in the packaged app.
- **Route B — JS/WASM fallback:** `qsharp-lang@1.29.1`, exact pinned. This is
  the cleanest Electron packaging story if it exposes the full estimator
  surface Team 3 needs. **Do not assume coverage** without real
  frontier/factory/transform captures.

Team 3 evaluates both in week 2 and recommends one; the PMs + Microsoft
confirm. **Either way, the engine sits behind the same `EstimatorService`
interface (committed in `contracts/types.ts`), so this decision must not leak
into UI code.**

**Version pinning facts:** "QRE v3" is the estimator *generation*; packages
self-report 1.x version strings, and that runtime-read string is what
`qreVersion` records on every run. Avoid `qsharp-lang@latest` because the
current `latest` tag is a `1.29.x-dev` build, not a stable release.

⚠️ **Engine surface note.** The product contract requires Pareto-frontier
results, selectable magic-state factories, trace transforms, parameterized
architectures, and Three-Aux QEC. Team 3's spike must prove which pinned package
produces contract-conformant output, then use that exact engine path for the
real adapter.

## Week 2 install baseline

Use this shape for the shared scaffold or temporary standalone workspaces:

```json
{
  "type": "module",
  "engines": { "node": "24.18.0", "npm": "11.16.0" },
  "packageManager": "npm@11.16.0",
  "dependencies": {
    "ajv": "8.20.0",
    "ajv-formats": "3.0.1",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "6.0.3",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "24.13.3",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "electron": "43.1.0",
    "eslint": "10.6.0",
    "jsdom": "29.1.1",
    "prettier": "3.9.4",
    "tsx": "4.23.0",
    "typescript": "5.9.3",
    "typescript-eslint": "8.63.0",
    "vite": "8.1.3",
    "vitest": "4.1.10"
  },
  "optionalDependencies": {
    "qsharp-lang": "1.29.1"
  }
}
```

Python engine spike environment:

```txt
python==3.13.14
qdk[qre]==1.29.1
QDK_PYTHON_TELEMETRY=none
```

Only install `qsharp-lang` when Team 3 is testing the JS/WASM route; UI teams
should never import either engine package.

## TypeScript standard

Shared compiler posture:

- Renderer: `target: "ES2022"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`,
  `module: "ESNext"`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`.
- Main/harness: `target: "ES2022"`, `module: "NodeNext"`,
  `moduleResolution: "NodeNext"`, `lib: ["ES2022"]`.
- All TS projects: `strict: true`, `exactOptionalPropertyTypes: true`,
  `noUncheckedIndexedAccess: true`, `noFallthroughCasesInSwitch: true`,
  `noUnusedLocals: true`, `noUnusedParameters: true`,
  `forceConsistentCasingInFileNames: true`.

## Non-negotiables

- **Offline:** no network calls required for core workflows (the only network
  feature in scope is the *pull-oriented* update check in Part 3).
- **Reproducibility:** every run records the exact QRE engine version.
- **Immutability:** run records are never mutated after execution — Rerun
  creates a new record.
- **Full-fidelity output:** whatever QRE emits is preserved verbatim (the `raw`
  blob in `RunResult`), no matter what the UI chooses to display.
- **Cross-platform:** features must work on macOS and Windows. If your pair is
  all-macOS or all-Windows, say so in the channel so testing gets covered.
