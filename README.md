# microsoft-qre-dashboard

## Development

The app lives in [`app/`](app/) (npm project, `node`/`npm` versions pinned in
`app/package.json`).

```sh
cd app
npm ci            # install dependencies
npm run typecheck # tsc --noEmit
npm run test      # vitest unit tests
```

### Connecting an agent (MCP)

The app ships a read-only MCP server over the run history, so an agent can
answer questions about saved estimates and check a configuration before you run
it. Build it, then ask it for its own client configuration:

```sh
cd app
npm run build:mcp
npm run mcp:config
```

That prints a ready-to-paste `claude mcp add` line and a Claude Desktop config
block, with the paths already resolved for this machine — including a node new
enough to run the server, which is not necessarily the one your shell defaults
to. See [`app/src/mcp/README.md`](app/src/mcp/README.md) for the tools, the
error codes, and where the database path comes from.

### Pre-commit hook (fast checks)

A committed hook in [`.githooks/`](.githooks/) runs `typecheck` + unit tests
before each commit. Git hooks aren't shared automatically, so **activate it once
per clone**:

```sh
git config core.hooksPath .githooks
```

The hook runs only the fast checks. Slow real-engine / conformance tests
(spawning the Python `qdk.qre` estimator) are kept out of the commit path — name
them `*.conformance.test.ts` and run them via CI / a dedicated script instead.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same typecheck +
unit tests on pull requests and pushes to `week-2/team-3` and `main`.