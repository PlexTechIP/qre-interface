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

`npm run mcp:config -- --json` prints only the config block, for piping. The
bare `--` matters: without it npm keeps `--json` for itself and the script
never sees it.

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

The connection is cached for the life of the process but re-checked on every
tool call: the path is resolved again, the file's identity is compared with the
one that was opened, and the schema version is read back. So a history that is
deleted and recreated, moved by a new pointer, or migrated in place by the
dashboard is picked up on the next call rather than served stale until the
client restarts. SQLite reads an unlinked file happily, which is how an analyst
who reset their history once got the old runs back from the agent for the rest
of the session.

Three things that re-check deliberately does not do:

- **It does not treat not knowing as news.** A pointer file that cannot be read
  this instant says nothing about where the database went, so the open
  connection is left alone and only that call fails. The pointer is also
  written atomically now — `publishDataLocation.ts` renames it into place —
  because a reader that caught the old truncate-then-write read an empty file
  and was told to launch the dashboard that was launching.
- **It does not discard a busy connection.** SQLite reports a lock only after
  waiting out the five-second timeout, and the connection that reported it
  still works; reopening paid the timeout a second time.
- **It does not close what a caller is holding.** A replaced connection is
  retired, not closed: `getRunStore()` is synchronous but a handler keeps the
  store across awaits, and two requests arriving in one stdin chunk interleave.
  Retired connections are closed together at shutdown.

### When the client goes away

stdout is a pipe, and a client that exits breaks it. The write in flight is
released rather than left waiting for a `drain` that cannot come, the EPIPE is
reported on stderr instead of arriving as an uncaught exception, and later
frames are dropped rather than queued behind the stalled one — there is nobody
left to read them. Before that, an ordinary disconnect logged an uncaught
exception and exited 1, and a disconnect with output still queued exited 0 by
running the event loop dry, skipping the exit code entirely.

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

Two things sit beside the tools. The server sends `instructions` at
`initialize` — which tool to start with, that nothing here can act, that run
names are data — because that is the one thing five descriptions cannot say
from inside themselves. And it serves one resource,
`qre://contracts/run-draft.schema.json`: the committed generation schema,
re-serialised from the very artifact the handler validates against, which is
what a draft must satisfy. `qre_validate_config`'s input
schema is deliberately loose (the committed artifact is the single gate, not a
zod copy of it), so before the resource existed an agent writing a draft from
scratch saw `draft: object` and nothing else, and was corrected one field per
call. The tool's description now spells out the top-level keys as well.

When a draft is refused on structure, the message names the branch the draft
actually chose. That was not always so: the schema is a tree of `anyOf`
branches, and reporting "the deepest errors" reported the branches the draft was
NOT — a gate-based draft missing `twoQubitGateTime` was told `architecture.type
must be equal to one of the allowed values` about a type that was valid, on
every attempt, and nothing an agent changed could make that go away. The
resolution lives in `draftValidation.ts`, so the chat path's proposals get the
same messages.

`parameters` is resolved by the benchmark, not by the keys the caller happened
to send. Its six variants carry no discriminator and two of them share the key
`generator`, so overlap alone tied them and the first won: a draft for
`ekera-hastad-factoring` was told to add Shor's `bitSize`, which the next stage
then refused as "not a parameter of the ekera-hastad-factoring benchmark", and
removing it brought the first message back. The contract already says which
variant applies — "Parameters for the benchmark named in
application.benchmarkId" — and `BENCHMARK_PARAMS` already says which keys a
benchmark has, so the resolution asks them instead of guessing. Where nothing
names a variant, the alternatives are listed.

A reason is budgeted where it is written rather than cut where it is read. Both
consumers cap it — this tool bounds a structural message, the chat surface puts
it in a paragraph — and a cap applied there lands mid-sentence: a 593-character
reason arrived as 500 characters ending in an ellipsis, with two of the six
`parameters` variants missing from the list an agent had to choose from.

`qre_get_run` reports `settings` — what the run was ASKED FOR, as against
`error` and `frontierSample`, which are what came back. Without it a failure was
unexplainable: every estimation failure says to relax `maxError`, and nothing
could say what `maxError` had been. Nested settings appear as dotted keys
(`traceTransform.dynamicMemoryCompute.evictionStrategy`) rather than collapsing
to `null` — for that field `null` means the stage is OFF, so collapsing it
asserted the opposite of the truth.

`nextCursor` being absent is the only end-of-history signal. A page can be
shorter than the limit while more runs remain, because the dashboard may delete
a run between the two reads a page takes — the keys are read first, the records
second — so a short page must not be read as the last one. Making that one
snapshot would mean both reads inside a single synchronous store call, since a
transaction spanning an await could interleave with another handler on the same
connection.

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

Measured against synthetic histories, warm, from the handlers:

| History size | `qre_list_runs` (page of 25) | Page of 100 | `qre_get_run` | Exact-match filter, no matches |
|---|---|---|---|---|
| 3,000 runs | ~4 ms | ~6 ms | <1 ms | <1 ms |
| 40,000 runs | ~60 ms | ~65 ms | <1 ms | <1 ms |

A page costs a page. The store answers a filter with KEYS — five indexed
columns per run, no JSON — and only the runs on the page are read in full and
parsed. Before that (design note F-4) every page read, parsed, and upgraded the
whole matching history and sliced one page from it, which put the 40,000-run
page at ~260 ms and made page forty cost the same as page one; `listRuns.ts`
and `sqliteRunStoreReader.ts` say how the two halves split now.

**Listing is still linear in the whole matching set**, because `totalMatched`
and the cursor's position both need it — but linear in a column scan rather
than in JSON parsing, which is the ~4× above. Exact-match filters are pushed
into SQL and stay flat. The name search is decided in JS over the name column,
deliberately: it has to fold case the way `matchesRunFilter` does, which is
Unicode, and SQLite's `LOWER` is not — `Ekerå-Håstad` would stop matching
`HÅSTAD`. `selectRecordKeysByFilter.test.ts` holds the key query to the same
set and order as the record query.

One consequence worth knowing: `node:sqlite` is synchronous, so a large read
blocks the whole process. This is bounded in practice because a client spawns
its own server process — there is no shared instance and no other tenant to
starve — but it does mean one slow call delays that client's others.

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
