# Week 1 — Mockup Specification (Shared, All Teams)

> **Source of truth:** the mockup-spec Google Doc: https://docs.google.com/document/d/120gxPyE1PyZVVu5HsWzfhY6HZUtDY_y_Yjs1s2jNyT4/edit?tab=t.8x1p498ddgo4

## Required surfaces

| Surface | Must show |
|---|---|
| **Run Configuration** | Five inputs: application model, architecture model, error correction + factory model, error budget, QRE engine version. Include defaults/expert path, inline meaning, Run/running/failure moment. |
| **Results Area** | Five core metrics: runtime per shot, physical qubits, logical error rate, logical cycle time, T states required. Include metric filtering, additional-metrics access, readable huge/tiny values, and configuration summary. |
| **Run History Area** | Saved-run list with view, delete, duplicate, and select-for-comparison. Make old runs findable by useful summary fields. |
| **Comparison page** | Runs × metrics table, at least one metric visualization, and clear labels for what differs between compared runs. |

## Fidelity bar

- High-fidelity desktop screens, not wireframes.
- Realistic QRE content: benchmark names, parameter ids, and plausible metric
  values from QRE docs/tutorials.
- Key states represented somewhere in the flow: loading/running, empty, and
  error.
- Desktop-app proportions: design for an Electron window around 1280×800 or
  larger.
- One consistent visual direction: type, color, spacing, and naming.

## Deliverable format

- One Figma file per team, posted in the project channel with view access.
- Screens named and ordered: Configure → Results → History → Compare.
- Presenter-notes frame with 2–3 design decisions and open questions.

## Checkpoint criteria

PMs look for:

1. **Spec coverage** — all four surfaces and Google Doc specifics honored.
2. **Workflow clarity** — an analyst can understand the first-run path.
3. **Comparison strength** — the design helps choose between configurations.
4. **Buildability** — week-2 developers can implement without guessing.
5. **Craft** — visual quality, consistency, and realistic data.
