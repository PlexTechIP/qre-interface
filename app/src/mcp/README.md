# The MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server
over the dashboard's run history. It lets an agent — Claude Code, Claude
Desktop, or anything else that speaks MCP — answer questions about runs the
analyst has already saved, and check a proposed configuration before the analyst
runs it.

It reads. It does not run estimates, does not save runs, and cannot modify the
database: the connection is opened `readOnly`, so SQLite itself refuses every
write, and the store handed to tools has no write methods to call. Migration
stays the dashboard's job.

## Connect an agent

Build it, then ask it for its own configuration:

```sh
cd app
npm run build:mcp
npm run mcp:config
```

`mcp:config` resolves the three absolute paths a client needs — the node binary,
the built bundle, and the run history — using the same resolution the server
itself uses, and prints both a `claude mcp add` line and a
`claude_desktop_config.json` block. It also tells you what is not yet true: if
the dashboard has never been launched on this machine there is no run history to
point at, and it says so rather than letting you find out at the first tool call.

Paste the line it prints. For Claude Code that is one command; for Claude Desktop,
merge the JSON block into `claude_desktop_config.json` and restart it.

Then ask the agent: *"what QRE runs do I have saved?"*

`npm run mcp:config --json` prints only the config block, for piping.

### It names a node deliberately, and maybe not yours

The block always spells out an absolute path to a node binary, because an MCP
client does not run the server through your shell and does not have your `PATH`.

That node must be **24 or newer** (the version `engines.node` pins). The server
imports `node:sqlite`, which is not a built-in before 24, so an older
interpreter fails like this:

```
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
```

That happens while the module graph is being evaluated, before any of the
server's own code runs — so there is nothing to catch it and report it kindly,
and the client shows only a server that would not start.

`mcp:config` therefore does not assume the node running it is the right one. If
you invoke it from a shell whose default node is older, it finds a suitable
install and names *that* one, and says so under "Worth knowing". If it cannot
find one at all it refuses to pretend, and tells you to install it.

### Where the database comes from

The dashboard resolves its own data directory through Electron
(`app.getPath("userData")`), which this process cannot call and must not
reimplement. So the dashboard writes the path down on startup —
`~/.qre-dashboard/location.json` — and the server reads it back.

`QRE_DB_PATH` overrides that pointer when set, which is how you aim the server at
a scratch database. Setting it in the client config's `env` block is the normal
way to do it: the variable travels with the server entry rather than having to be
in the machine environment.

If neither is available the server still starts and `qre_list_benchmarks` still
works; everything that needs history returns `DB_NOT_CONFIGURED` with an
instruction to launch the dashboard once.

### If the client says `CONNECTION_CLOSED`

The server process started and exited. A client reports only that, so the reason
is in its own log — for Claude Code, run with `--debug` and look for
`MCP server "qre-dashboard" Server stderr:`.

The two causes seen so far:

- **`MODULE_NOT_FOUND` on `mcp-server.mjs`.** The bundle is not there. Four
  builds share `dist-electron` and `vite.main.config.ts` empties it, so a
  pipeline that does not go on to build this one deletes it. `npm run dev` did
  exactly that until it was fixed, which meant launching the dashboard broke
  every configured agent. `buildPipeline.test.ts` holds that ordering now;
  `npm run build:mcp` puts the file back.
- **`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.** The config names a Node older
  than 24. See above.

## The tools

| Tool | Takes | Gives back |
|---|---|---|
| `qre_list_benchmarks` | — | Every benchmark this build can estimate. Needs no history. |
| `qre_list_runs` | `limit`, `cursor`, `filter` | Saved runs newest-first, each with the span of its Pareto frontier. The only source of run IDs. |
| `qre_get_run` | `id` | One run in full: the settings it was configured with, timings, engine version, failure details, and one representative frontier point with every metric. |
| `qre_draft_from_run` | `id` | The run as an editable draft, for "what if we changed X?". |
| `qre_validate_config` | `draft` | Whether that draft would be accepted, and what is wrong if not. |

`qre_get_run` reports `settings` — what the run was ASKED FOR, as against
`error` and `frontierSample`, which are what came back. Without it a failure was
unexplainable: every estimation failure says to relax `maxError`, and nothing
could say what `maxError` had been. Nested settings appear as dotted keys
(`traceTransform.dynamicMemoryCompute.evictionStrategy`) rather than collapsing
to `null` — for that field `null` means the stage is OFF, so collapsing it
asserted the opposite of the truth.

`qre_list_runs` carries each run's frontier span — the fewest-qubits point and
the most-qubits point, with the runtime at each — so ranking or comparing runs by
cost is one call rather than one call per run. A frontier trades qubits against
time, so the fewest-qubits point is generally the slowest; the two ends are
reported as whole points for that reason, never as an independent minimum per
measurement, which would describe a configuration the engine never returned.

## When a tool fails

A failure comes back as an MCP error result whose text block is
`{"code": "...", "message": "..."}`. The codes are a closed set:

| Code | Means |
|---|---|
| `DB_NOT_CONFIGURED` | No run history pointer, and no `QRE_DB_PATH`. Launch the dashboard once. |
| `DB_NOT_FOUND` | The configured path has no database at it. |
| `DB_SCHEMA_MISMATCH` | The database is at a schema version this build cannot read. Launch or update the dashboard to migrate it. |
| `DB_LOCKED` | The dashboard is writing. Try again shortly. |
| `DB_READONLY` | The database's directory is not writable, and a WAL read needs to create a file beside it. |
| `DB_UNAVAILABLE` | The database could not be opened, for another reason. |
| `RUN_NOT_FOUND` | No run has that id. |
| `INVALID_CURSOR` | The cursor is malformed, or the history changed under it. List again without one. |
| `DRAFT_UNSUPPORTED` | This run cannot become an editable draft. The message names the setting responsible — an uploaded program, a `dynamicMemoryCompute` stage, a Majorana `tErrorRate`. Naming it matters: while the reason was withheld, an agent asked why simply inferred one, and reported a confident wrong cause. |
| `STORE_READ_FAILED` | A read failed, or a stored record is corrupt. |
| `VALIDATION_FAILED` | Validation itself failed. An *invalid draft* is not this — that is a successful result carrying `valid: false`. |

Failures carry no `structuredContent`, deliberately: each tool's declared
`outputSchema` describes its success payload, and the SDK's client validates
`structuredContent` against that schema whether or not the result is an error. A
failure that filled the field was rejected before the caller ever saw it, and
every message here was replaced with `-32602 Structured content does not match
the tool's output schema`. `errorPaths.test.ts` is what keeps that fixed.

Nothing a tool returns carries a filesystem path, a stack trace, an exception
message, or an unescaped control character — `toolResult.ts` applies that below
every handler, so adding a sixth tool cannot weaken it.

## Shipping this in a packaged app

The server runs today under a `node` binary that `mcp:config` locates. A packaged
application has none of that: no checkout, no `npm run`, and `process.execPath`
inside Electron is the app's own binary rather than a node.

It still works, because Electron 43 embeds Node 24 — the version `node:sqlite`
needs — and can execute the bundle directly:

```json
{
  "command": "/Applications/QRE Dashboard.app/Contents/MacOS/QRE Dashboard",
  "args": ["<resources>/dist-electron/mcp-server.mjs"],
  "env": { "ELECTRON_RUN_AS_NODE": "1", "QRE_DB_PATH": "…" }
}
```

So a release needs no second runtime. `packagedRuntime.test.ts` holds that
assumption — it starts the shipped bundle under Electron's own Node and
completes a handshake, so an Electron bump that moved to an older Node would
fail there rather than in an analyst's install.

**What is still missing for a release**, in the order it bites:

1. **There is no packaging tooling at all** — no electron-builder, no
   electron-forge. Week 6 excludes it deliberately, so none of the above has
   been exercised against a real `.app`.
2. **`mcp:config` cannot run in a packaged app.** It resolves paths relative to
   `src/mcp/`, which is not shipped. The design's answer is the right one: the
   dashboard emits the config block itself, from Settings, because it is the only
   process that knows its own binary path, its resources path, and its database
   path. That feature does not exist yet.
3. **An update moves the paths.** A config block naming a versioned install
   directory goes stale on upgrade, and the failure looks like
   `CONNECTION_CLOSED`. Whatever emits the block should be re-runnable, and the
   docs should say to re-run it after an update.

## Performance

Measured against synthetic histories, warm, on the shipped bundle:

| History size | `qre_list_runs` (page of 25) | `qre_get_run` | Filtered list |
|---|---|---|---|
| 23 runs | ~2 ms | ~1 ms | ~1 ms |
| 3,000 runs | ~16 ms | ~1 ms | ~1 ms |
| 40,000 runs | ~260 ms | ~4 ms | ~1 ms |

`qre_get_run` is indexed by id and flat. Exact-match filters are pushed into SQL
and stay flat. **Listing is linear in the whole matching set**, because
`RunStore` cannot express a seek predicate — design note F-4, and `listRuns.ts`
says so where it slices the page in memory. Every page re-reads and re-parses
every matching record, so paging deeper costs the same as paging shallowly, and
both grow with the history rather than with the page.

It is comfortable to a few thousand runs and wants a store-level fix beyond
that. The fix is not local to this directory: `RunStore` would need a keyset
query, which is the dashboard's side of the boundary.

One consequence worth knowing: `node:sqlite` is synchronous, so a large read
blocks the whole process. At 40,000 runs a trivial `qre_list_benchmarks` issued
during a full scan waited ~250 ms behind it. This is bounded in practice because
a client spawns its own server process — there is no shared instance and no
other tenant to starve — but it does mean one slow call delays that client's
others.

## Development

```sh
npm run mcp             # run from source over stdio (tsx)
npm run build:mcp       # bundle to dist-electron/mcp-server.mjs
npx vitest run --config vitest.workspace.ts src/mcp/
```

Two structural rules are held by tests rather than by convention:

- **Nothing on the server's import graph may reach Electron, the DOM, or
  `process.stdout`.** `importGraph.test.ts` walks from `server.ts` and enforces
  an explicit allowlist of what it may import from outside `src/mcp/` and
  `src/shared/`. Adding a line to that allowlist is meant to be argued for.
- **stdout belongs to the protocol.** `bootstrap.ts` installs a guard as the
  first import in `server.ts` and diverts every other write to stderr, because
  one stray `console.log` corrupts the JSON-RPC stream. All logging goes through
  `logger.ts`.

`printClientConfig.ts` is the one file here that writes to stdout, and it is a
CLI, not part of the server. It must never appear on `server.ts`'s import graph;
`importGraph.test.ts` fails if it does.
