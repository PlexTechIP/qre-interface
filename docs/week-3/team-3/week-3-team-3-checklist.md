# Week 3 — Team 3 (Neil + Jessie) — Checklist: Integration — The Swap

**Due: Tuesday Jul 21 EOD** — Day 0 is Thu Jul 16; Tue Jul 21 is a checkpoint
meeting.
Read first: `../week-3-overview.md`, `week-3-team-3-technical-brief.md`,
`docs/tech-stack.md` §Architecture + §How QRE v3 gets executed locally,
`docs/data-contracts.md`. Check items off as you go (edit + commit).

Your track carries the week's critical path: the **mock→real swap**. Front-load
the risky wiring (main process + IPC + real engine talking to the renderer)
before polishing — the whole app is renderer-only today.

## A. Day 0

- [ ] **Create your team branch** `week-3/team-3` off the **updated `main`**
      (after the week-2 integration merge) — feature branches PR into it; it
      lands on `main` via a reviewed PR by **Tue Jul 21 EOD** (see the merge
      step in §E; `docs/engineering-workflow.md`)
- [ ] Attend the Tuesday meeting; confirm the week-3 assignment (integration —
      you **hold** the engine track through the swap) and the deadline
- [ ] Re-read your week-2 engine module (`QreEngine`, the three-stage adapter,
      the conformance harness) — you're wiring what already conforms, not
      rebuilding it
- [ ] **Open the contract decisions with the PMs today** (see §E): the
      sparse-fixture ruling, Majorana `operationTime`, the trace-transform
      one-of, and the provisional `source` field each need a ruling landed as a
      contract-change PR early in the week — you provide the engine-reality
      evidence, PMs arbitrate

## B. Electron main process + the IPC bridge

- [ ] **Stand up the Electron main process** in `app/src/main/`: app lifecycle,
      a `BrowserWindow` loading the existing renderer, and a preload script —
      the app currently has no main process at all
- [ ] **Typed IPC bridge:** expose an **`EstimatorService`-shaped** API to the
      renderer via `contextBridge` in the preload; `ipcMain` handlers in main
      call the real engine; `ipcRenderer.invoke` under the hood. The renderer
      keeps talking to the **same `EstimatorService` interface** from
      `contracts/types.ts` — the boundary moves to IPC, the interface does not
      (`docs/tech-stack.md` §Architecture: the renderer never talks to QRE
      directly)
- [ ] `RunConfig` crosses renderer→main and `RunResult` crosses main→renderer
      intact (structured-clone-safe); **failures cross as resolved `RunResult`s**
      with `status: "failed"`, never as thrown IPC errors that hang the caller
- [ ] Contextual isolation on, node integration off in the renderer — only the
      whitelisted `EstimatorService` surface is exposed

## C. The real engine + the swap

- [ ] **Python engine wired into main:** run real QRE via the route from your
      week-2 decision memo — `qdk[qre]==1.29.1` on `Python 3.13.14`, invoked as
      a **subprocess** from the main process (JSON-over-stdio),
      `QDK_PYTHON_TELEMETRY=none`, interpreter + package version pinned
      (`docs/tech-stack.md`)
- [ ] **Python setup/bundling:** a documented, reproducible way to provision the
      Python runtime + `qdk[qre]` for local dev on **macOS and Windows**, and a
      bundling plan for the packaged app (size/signing implications noted, deep
      packaging is Part 3) — no hardcoded absolute interpreter paths
- [ ] **Swap `MockEngine → QreEngine`** behind `EstimatorService`: the
      main-process handler constructs the real engine; the MockEngine stays in
      `app/src/shared/` as the reference/test double, not the app default
- [ ] `qreVersion` is read from the engine/package at runtime (not a constant)
      and rides on every real `RunResult`

## D. End-to-end verification + hardening

- [ ] **Prove the full path live:** configure a run in Team 1's UI → Run →
      **real QRE executes** → Team 2's `ResultsArea` renders the real frontier —
      for a multi-row success, a sparse/one-row run, and a **real failure** (the
      failure renders through Team 2's failure view with a canonical
      `error.code`)
- [ ] **Non-blocking:** a heavy estimate never freezes the main process or the
      renderer UI (subprocess isolation + async); the running state stays live
- [ ] **Timeouts + lifecycle:** execution timeout enforced end-to-end; the
      subprocess is cleaned up on completion, timeout, and app quit (no orphans);
      two sequential runs don't interfere
- [ ] **Conformance still green** through the new path: the week-2 harness passes
      on every committed `runconfig.*` fixture (including the failing one → a
      schema-valid failed result) with the real engine behind IPC
- [ ] **Confirm Teams 1 & 2's surfaces are unregressed** by the swap — the Run
      Configuration and Results surfaces behave as they did on the mock; flag any
      regression in the channel immediately

## E. Contract decisions, cleanup + acceptance prep

- [ ] **Land the contract decisions** (as PM-arbitrated contract-change PRs; you
      supply evidence + a proposed mapping):
      - **Sparse fixture** — amend `tStatesPerRotation 5→20` (satisfiable on
        1.29.1) **or** revert to 5 and treat sparse as an expected-failure
        fixture; harness + fixtures updated to match the ruling
      - **Majorana `operationTime` inert** — the package ignores it; the contract
        must reflect reality (document-as-inert / mark advisory / drop) per the
        PM ruling
      - **Trace transform is not a true one-of** — PSSPC and Lattice Surgery
        chain in 1.29.1 rather than being mutually exclusive; reflect the real
        relationship in the contract per the PM ruling
      - **Provisional `source`** — finalize the `source` field's mapping/status
- [ ] **Carry-over cleanup from week 2** (does not block): finish the **capture
      spread** (a `litinski19` capture + a 2nd failure class) and replace the
      **fragile substring `COMPILE_ERROR` classifier** with a robust check
- [ ] **Handoff doc** (rotation resumes next week): update the engine-module
      README + a known-issues list covering the route, the Python setup, the IPC
      boundary, and the resolved/open contract items
- [ ] Walk through `week-3-team-3-definition-of-done.md` — every box checkable
- [ ] Acceptance walkthrough: live end-to-end run (configure → real QRE →
      results), a failure path, non-blocking demonstrated, conformance green
      through IPC, contract-decision recap
- [ ] **Open a PR** `week-3/team-3 → main` for the swap. Because it stands up
      the Electron main process + IPC and rewires both Team 1's and Team 2's
      merged surfaces to the real engine, it touches shared/cross-team surfaces:
      your teammate reviews first, **and** a PM (or the owning team) reviews the
      seam per `docs/engineering-workflow.md`. The PR description says *what
      changed, how to verify it, which checklist item it advances*
- [ ] **After review approval, merge onto `main`** by **Tue Jul 21 EOD** —
      final acceptance is from `main`, not a branch (unlike the week-2 Team-1+2
      integration, which the PMs composed and landed; this swap is Team 3's PR
      to own through review and merge)
