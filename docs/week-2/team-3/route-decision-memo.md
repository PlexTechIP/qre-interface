# Team 3 Route Decision Memo — Week 2

**Recommendation: `qdk[qre]==1.29.1` Python subprocess** — called "Route B"
in this team's technical brief and checklist. (`docs/tech-stack.md` numbers
the same two options the other way — its "Route A" is this Python route and
its "Route B" is the JS/WASM route. This memo uses the team-3 brief's
naming; be aware of the mismatch if cross-referencing `tech-stack.md`.)

## Evidence: real, executed output, not samples or docs

Two independent bodies of evidence back this recommendation, both against
the actually-installed `qdk[qre]==1.29.1` package, not documentation:

**1. Jessie's original spike** — installed `qdk[qre]==1.29.1` in an isolated
venv and ran real end-to-end estimates covering GateBased + SurfaceCode +
RoundBasedFactory + PSSPC; confirmed every contract-vocabulary class exists
in the package (`GateBased`, `Majorana`, `SurfaceCode`, `ThreeAux`,
`RoundBasedFactory`, `Litinski19Factory`, `PSSPC`, `LatticeSurgery`,
`QSharpApplication`, `OpenQASMApplication`, `QIRApplication`); confirmed
`qreVersion` is runtime-readable via `importlib.metadata.version("qdk")` →
`"1.29.1"`; confirmed the property-key enum (`DISTANCE=0`,
`LOGICAL_CYCLE_TIME=20`, `CODE_CYCLE_TIME=21`, `NUM_TS_PER_ROTATION=6`, etc.)
matches `docs/data-contracts.md`'s appendix almost exactly.

**2. Neil's real capture set** (committed at
`docs/week-2/team-3/qre-output-captures/`, indexed in `manifest.json`) — 5
input/output pairs produced by the actual `estimate.py` wrapper running
against the real package, covering exactly what the technical brief asks
for (both architecture types, both trace transforms, multi-row and
single-row frontiers, a real failure):

| capture | status | rows | notable numbers |
|---|---|---|---|
| `multi-row-gatebased-psspc` | success | 5 | row 0: 25,085 qubits, 2,538,900 ns runtime, distance 13 |
| `single-row-gatebased-psspc` | success | 1 | 426 qubits, 585,900 ns runtime, distance 3 |
| `real-compile-failure` | failed (`COMPILE_ERROR`) | 0 | real `Qsc.Resolve.NotFound` diagnostic from an unresolvable entry expr |
| `majorana-three-aux` | success | 2 | row 0: 1,209 qubits, 10,602,000 ns runtime, distance 3 |
| `lattice-surgery` | success | 1 | 426 qubits, 320,250 ns runtime, distance 3 |

All 5 captures report `qreVersion: "1.29.1"`, confirming the runtime-read
version string used by every `RunResult`.

Full working call shape (from `app/src/main/engine/python/estimate.py`):

```python
qdk.init(project_root="<q# project>")
table = qre.estimate(
    QSharpApplication(entry_expr="QuantumDynamics.Run()"),
    GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
    SurfaceCode.q() * RoundBasedFactory.q(),
    PSSPC.q(),
    max_error=1.0,
)
```

This is the exact call shape the shipped `QreEngine` uses in production
(not a throwaway spike script) — see `build_application`,
`build_architecture`, `build_isa_query`, `build_trace_query` in
`estimate.py`, and it is exercised end-to-end by
`app/src/main/engine/conformance.test.ts` against all 4 frozen
`contracts/fixtures/runconfig.*.json` fixtures, plus a live benchmark and
uploaded-program suite (31/31 tests passing as of this memo).

## Route A (JS/WASM `qsharp-lang`) — spiked, not viable

**Status: spiked with a documented not-viable finding.** Full writeup, probe
scripts, and verbatim output samples are committed under `spikes/route-a/`
(start at [`spikes/route-a/FINDINGS.md`](../../../spikes/route-a/FINDINGS.md)).

The correct npm package is **`qsharp-lang`** (not `qsharp`), evaluated at
`1.29.1` to match the pinned QDK version. It runs real resource estimates
**in-process in Node** for Q# and OpenQASM — including a genuine 12-point
legacy Pareto frontier — and a heavy estimate can be isolated in a
`worker_thread` so it doesn't block the main event loop. So its clean
in-process packaging is real. **But** it exposes only the *legacy*
target-parameter estimator, not the current composable `qdk.qre` surface the
contract needs:

- No named `ThreeAux`, `RoundBasedFactory`, `Litinski19Factory`, or
  selectable PSSPC / Lattice Surgery transforms — passing the current
  model-shaped params returns `Qsc.Estimates.IOError.CannotParseJSON`.
- No QIR as estimator input (`getEstimates` has no QIR project type).
- The legacy frontier row carries ~43 legacy fields, not the contract's
  ~37-field row shape.

Bridging those gaps would mean binding substantial new QRE surface rather
than integrating an existing npm API. **Verdict: Route A is not viable for
the Team 3 contract; Route B (Python `qdk.qre`) is the route.** This closes
the DoD's "both packaging routes spiked (working code or documented
failure)" bar.

*Caveat (documented in FINDINGS.md):* the npm registry was unreachable in the
spike environment, so the probes ran against version-matched official QDK
extension artifacts as an offline fallback. That does not change the
missing-model-surface conclusion, which is established from the package's
own typings/source and its parameter parser.

## Findings that affect the contract

1. **`Majorana.operation_time` has no effect in this package version.**
   `qdk.qre.models.Majorana`'s constructor signature is
   `(self, *, error_rate: float = 1e-05)` — there is no `operation_time`
   parameter at all (verified directly against the installed 1.29.1
   package, not documentation). Internally, `Majorana.provided_isa`
   hardcodes `time=1000` (ns) for every instruction it defines (state prep,
   measurement, T gate) regardless of any configured value.
   `RunConfig.architecture.operationTime` is validated and threaded through
   the invocation JSON for forward-compatibility, but `estimate.py`'s
   `build_architecture` never reads it when constructing the `Majorana`
   object — it is silently dropped. **Question for PMs:** should the UI
   still expose this field for Majorana runs, or should it be marked
   read-only/informational until a package update actually exposes it?
2. **Several appendix property names don't exist in this qdk version at
   all.** `SOURCE`, `BLOCK_SIZE`, `BASE_SYSTEM_COST`, `SHOT_COST`,
   `COST_PER_QUBIT`, `COST_PER_HOUR`, `COST_PER_QUBIT_PER_HOUR`,
   `DATA_QUBIT_SPACING` are not attributes of `qdk.qre.property_keys` in
   `1.29.1` (checked directly against the installed module — not merely
   "unpopulated"; the names themselves aren't defined). They're absent from
   `frontier[].additional` rather than populated with placeholder or zero
   values.
3. **`DISTANCE` and `CODE_CYCLE_TIME` are not in the flat `properties` dict**
   the package returns per entry — they live on the QEC transform's
   instruction node in the result's provenance graph and had to be
   extracted by walking it (`estimate.py`'s `find_qec_property`).
   `logicalCycleTime` is derived as `distance * code_cycle_time`; confirmed
   against the `multi-row-gatebased-psspc` capture (distance 13 ×
   codeCycleTime 350ns = logicalCycleTime 4550ns, internally consistent).
   This has not yet been cross-checked against Microsoft's published
   tutorial numbers — that cross-config sanity check from the technical
   brief is still outstanding (see the checklist).

## Packaging implications (Route B)

Bundling a Python 3.13 runtime + `qdk[qre]` into a macOS/Windows Electron
app is heavier than an npm dependency — this is a real cost, deferred to
Part 3/4 packaging work, but worth flagging now: options are (a) bundling a
self-contained Python distribution per platform, or (b) requiring a system
Python at install time. Not resolved in this memo; a Part 3/4 concern.
