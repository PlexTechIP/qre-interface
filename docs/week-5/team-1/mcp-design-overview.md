# QRE Dashboard as an MCP Server — Design Overview

## The idea

Analysts who use the QRE dashboard increasingly also use an AI agent (Claude
Desktop, Claude Code, and similar). Instead of building a chatbot *inside* our app,
we can expose the app's capabilities as an **MCP server** so the analyst's existing
agent can call them directly — list benchmarks, validate a config, run an estimate,
compare results — in plain conversation.

The app's core is already shaped for this: the estimation engine and the run store
don't depend on Electron, so a small, separate server process can reuse them without
touching the desktop app.

---

## How it fits together

```
Analyst  ⇄  their Agent  ⇄  QRE MCP server  ⇄  QreEngine  →  Python estimator
(Claude Desktop)          (small new process)   SqliteRunStore → run-history.sqlite
```

- The **agent** is the client. The analyst talks to it normally.
- The **MCP server** is a small new process the agent starts. It's *not* the desktop
  app — it's a thin wrapper that translates agent tool calls into calls on the
  existing engine and store.
- The **desktop app keeps running independently.** It may be open or closed; the
  server doesn't need it.

Setup is a one-time thing: the analyst adds our server to their agent's config once,
and never thinks about it again.

---

## The tools

Six tools, split by whether they only read or actually change something.

| Tool | What it does | Read / Write |
|---|---|---|
| `list_benchmarks` | List the benchmarks QRE can estimate | Read |
| `validate_config` | Check a run config against the schema | Read |
| `list_runs` / `get_run` | Browse past runs | Read |
| `compare_runs` | Diff two runs | Read |
| `run_estimate` | Start a new estimation | **Write** |
| `delete` | Remove a single run | **Write (destructive)** |

**The four read tools are safe** — they can't change anything, so they need no
special handling.

**The two write tools are gated** behind an explicit approval prompt in the agent —
the analyst clicks "approve" before anything runs. `delete` is gated harder: it's
marked destructive, takes exactly one run id (no bulk delete), and shows what it's
about to remove, because its worst case is permanent data loss.

---

## Key design decisions

**Two processes, one database.** If the desktop app and the server are both open,
both touch `run-history.sqlite`. Reads are always safe. Writes are rare (only the two
gated tools, and only after a human approves), and if two writes ever collide the
worst case is a brief, recoverable "database busy" — not corruption. We recommend
turning on SQLite's WAL mode so readers and the writer never block each other.

**Finding the database and Python.** The server can't ask Electron where files live.
So it reads the database path from an environment variable the app already supports
(`QRE_DB_PATH`), and packaging sets that variable so both the app and the server open
the *same* file. The Python environment is already found independently of Electron,
so that half is effectively solved.

**Security.** Our users are government and industry analysts, so the trust boundary
matters. The rule: **approval and validation live in the server's code, never in a
prompt.** A poisoned tool description or an injected instruction can't bypass a check
the agent never sees. Every tool call is written to an append-only audit log —
who called what, when, whether the user approved it, and that it came in over MCP.

**Provenance.** Runs already record whether a model helped author the config
(`model_assisted`), so an agent-driven run is labeled correctly today with no
contract change. The finer "which channel triggered this" question lives in the
audit log, not the run record.

---

## One session, start to finish

1. The analyst opens their agent. It quietly starts the QRE server in the background.
2. *"What benchmarks can QRE estimate?"* → the agent reads them and lists them.
3. *"Draft a surface-code estimate and check it's valid."* → the agent builds a
   config and validates it, fixing any errors, without the analyst touching a form.
4. *"Run it."* → the agent asks to run; the analyst clicks **Approve**; the estimate
   runs and the headline numbers come back.
5. *"How does that compare to yesterday's run?"* → the agent finds both and explains
   the difference in plain English.
6. The analyst closes the agent; the server shuts down with it.

The analyst never opened a terminal, pasted a key, or left their normal workflow.

---

## The one open question

An MCP server **only helps analysts who already run an agent.** If most of
Microsoft's target users don't, this is a power-user side door rather than the
natural-language interface they asked for — and an in-app interface should come
first instead. This isn't ours to guess: we should ask Microsoft, *"What fraction of
your target analysts already run an AI agent?"* A high answer confirms this design; a
low one reverses it.

---

## Recommendation

**Build it.** It's cheap (the engine and store already work outside Electron), it
doesn't conflict with the in-app interface effort, and it delivers what Microsoft
asked for — an agent that can actually drive an estimation, not just read history.
Ship all six tools in the first version, with the two writes gated behind user
approval. The one thing that would change this call is learning that few analysts run
an agent at all.
