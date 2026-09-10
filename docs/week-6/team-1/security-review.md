# Week 6 — Team 1 — Security Review

## Deliverable 6 — what else we found

Swept the codebase beyond the items already named in the technical brief
(deliverables 1–5). Findings below, each with file:line, a one-sentence
summary, and a disposition.

### 1. World-readable SQLite data directory

**File:** `app/src/main/databaseFile.ts:20`
**Summary:** `prepareDatabasePath()` created the directory holding the run-store
and chat SQLite databases with `mkdirSync(..., { recursive: true })` and no
explicit `mode`, leaving it at the OS default (typically world-readable and
world-traversable) even though the app treats this data as something to
restrict access to.
**Disposition:** Fixed. Added `mode: 0o700` to the `mkdirSync` call, matching
the defense-in-depth reasoning already in `credentialStore.ts`'s comment on
its own `0o600` file mode — this is one more local user who can no longer
just read the directory, not the only thing standing between this data and
another account on the machine.

### 2. Full parent environment handed to the Python subprocess

**File:** `app/src/main/engine/execute.ts:181-185`
**Summary:** The Python estimator subprocess was spawned with
`env: { ...process.env, ... }`, spreading the entire launching shell's
environment (any cloud credentials, tokens, or secrets sitting in it) into a
subprocess that only needs a handful of those variables to run.
**Disposition:** Fixed. Replaced the spread with an explicit allowlist
(`PATH`, `HOME`/`USERPROFILE`, `SystemRoot`, `TEMP`/`TMP`/`TMPDIR`) plus the
three QDK-specific variables the code already set. Verified against
`resolvePythonBin()` that the interpreter is invoked by absolute path (so
`PATH` is not needed for process resolution, only for the interpreter's own
internal use) and confirmed no existing test inspects the subprocess env, so
this does not change test behavior.

### 3. World-readable credential directory (PM-owned file)

**File:** `app/src/main/credentialStore.ts:117`
**Summary:** `mkdirSync(dirname(this.filePath), { recursive: true })` has the
same missing-mode gap as finding #1 — the directory holding the encrypted
provider-API-key blob gets default (world-readable) permissions, even though
the file written inside it is deliberately `0o600`.
**Disposition:** Filed, not fixed. `credentialStore.ts` matches
`main/credential*`, which is explicitly PM-owned this week (LLM interface
track). Per the assignment's own rule, a finding in a PM-owned file is
reported here and raised in the team channel, not committed. **Action:**
flag to the PM track owner that the same directory-mode fix applied to
`databaseFile.ts` (see finding #1) should be applied here too.

### 4. Full error object logged on a history-save failure (PM-owned file)

**File:** `app/src/renderer/state/useRunFlow.ts:79`
**Summary:** `console.error("Failed to save run to history:", saveErr)` logs
the entire caught error object — which can include a stack trace or other
detail — rather than just `saveErr.message`, when persisting a completed run
to history fails.
**Disposition:** Filed, not fixed. `useRunFlow.ts` is explicitly PM-owned
this week. Raised in the team channel for the PM track owner; no code change
made here.

### 5. Crash and error-path sweep — nothing found

**Summary:** Reviewed the three named crash surfaces: the Python subprocess
dying mid-run (`execute.ts`), database errors surfaced through
`ipcMain.handle` handlers, and a file disappearing between selection and
read in `app/src/main/engine/uploadValidation.ts`. All three are handled
gracefully — each returns a typed failure result to the renderer rather than
throwing past the boundary or crashing the app.
**Disposition:** Swept, found nothing to fix or file.

### 6. Public-repo embarrassment sweep — nothing found

**Summary:** Grepped for stray `TODO`/`FIXME`/`HACK` comments with names
attached, hardcoded absolute paths (e.g. `/Users/...`), commented-out dead
code, and empty test bodies.
**Disposition:** Swept, found nothing to fix or file.

### 7. Upload path follows symlinks, no explicit containment check

**File:** `app/src/main/engine/uploadValidation.ts:164`
**Summary:** File validation uses `stat()` (which follows symlinks) with no
explicit path-containment check against a trusted root.
**Disposition:** Accepted with a reason, not fixed. The path handed to this
function always originates from the OS's native file-picker dialog — a
trusted local user action — never from a renderer-supplied string that gets
joined into a path, so there is no actual path-traversal vector to close
today. Treating this as defense-in-depth-only rather than a live
vulnerability; hardening it (e.g. an `lstat` + symlink check) is deferred
rather than risked against the upload flow without broader test coverage
than this review had time for. Worth revisiting if the app ever accepts a
file path from a less-trusted source (drag-and-drop, a remote-import
feature, etc.).
