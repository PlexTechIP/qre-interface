# QRE Engine & Execution (Team 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `QreEngine implements EstimatorService` — consume a `RunConfig`, run a real local QRE estimation via the `qdk[qre]==1.29.1` Python package, and emit a conformant `RunResult` — passing the conformance harness on all 4 frozen `contracts/fixtures/runconfig.*.json` fixtures.

**Architecture:** Three pure-where-possible stages composed in `app/src/main/engine/qreEngine.ts`: `configToInvocation` (TS, `RunConfig` → `QreInvocation`), `execute` (TS, spawns a Python subprocess running `qdk.qre.estimate`, timeout-enforced), `outputToResult` (TS, raw JSON → `RunResult`). Route: **B — `qdk` Python subprocess**, confirmed working end-to-end during planning (see Task 1 note).

**Tech Stack:** TypeScript 5.9.3 (strict), Node 24.18.0, Vitest 4.1.10, Ajv 8.20.0 + ajv-formats 3.0.1, Python 3.13 + `qdk[qre]==1.29.1`, tsx 4.23.0 for running TS directly.

## Global Constraints

- Contract types come from `contracts/types.ts`, copied verbatim into `app/src/shared/types.ts` — never re-declared (per `docs/engineering-workflow.md`).
- Strict TS everywhere: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters` (already set in `app/tsconfig.node.json`).
- `EstimatorService.run()` never rejects on engine/config failure — it always resolves, with `status: "failed"` and a canonical `error.code` (`INVALID_CONFIG`, `COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`) per `docs/data-contracts.md`.
- `raw` is the complete, unmodified engine output, verbatim — `null` only on `TIMEOUT`/`ENGINE_CRASH`.
- `qreVersion` is read at runtime via `importlib.metadata.version("qdk")` on the Python side — never hardcoded.
- No hardcoded absolute paths. No UI code anywhere in this track.
- `QDK_PYTHON_TELEMETRY=none` must be set for every Python subprocess invocation.

## Real API research (done during planning, not guessed)

I installed `qdk[qre]==1.29.1` in an isolated venv and ran real estimates end-to-end before writing this plan. Confirmed, working API surface:

```python
import qdk
import qdk.qre as qre
from qdk.qre.models import GateBased, Majorana, SurfaceCode, ThreeAux, RoundBasedFactory, Litinski19Factory
from qdk.qre.application import QSharpApplication, OpenQASMApplication, QIRApplication
from qdk.qre._trace import PSSPC, LatticeSurgery  # exported as qdk.qre.PSSPC / qdk.qre.LatticeSurgery
from qdk.qre.property_keys import DISTANCE, CODE_CYCLE_TIME  # + others

qdk.init(project_root="<dir containing qsharp.json + src/*.qs>")
# operations become qdk.code.<Filename>.<OperationName>

app = QSharpApplication(entry_expr="QuantumDynamics.Main()")
arch = GateBased(error_rate=1e-4, gate_time=50, measurement_time=100)  # two_qubit_gate_time optional
isa_query = SurfaceCode.q() * RoundBasedFactory.q()   # QEC code x factory, composed with *
trace_query = PSSPC.q()                                # or LatticeSurgery.q()

table = qre.estimate(app, arch, isa_query, trace_query, max_error=1.0)
# table: EstimationTable (list of EstimationTableEntry), one per Pareto-optimal point
entry = table[0]
entry.qubits    # int, total physical qubits
entry.runtime   # int, ns
entry.error     # float, total error probability
entry.factories # dict[int instrId, FactoryResult(copies, runs, error_rate, states)]
entry.properties  # dict[int propKey, value] -- NOTE: does NOT include DISTANCE/LOGICAL_CYCLE_TIME
entry.source    # InstructionSource: walk .nodes[i] for {instruction, transform, children}
```

**Confirmed findings that change the design:**

1. **`DISTANCE` and `CODE_CYCLE_TIME` are NOT in `entry.properties`.** They live on the QEC transform's instruction node inside `entry.source.nodes` — find the node whose `transform` is a `SurfaceCode`/`ThreeAux` instance, then read `node.instruction.get_property_or(DISTANCE, None)` and `.get_property_or(CODE_CYCLE_TIME, None)`. `logicalCycleTime = distance * code_cycle_time` (verified against a real run: distance=3, code_cycle_time=350ns).
2. **`Majorana` in this package version has no configurable `operation_time`** — it's hardcoded to 1000ns internally regardless of input. The contract's `architecture.operationTime` field can't actually be honored by this engine version. **Flag to PMs as a stakeholder question** (Task 12).
3. Several contract appendix fields have no equivalent property key in this package: `SOURCE`, `BLOCK_SIZE`, `BASE_SYSTEM_COST`, `SHOT_COST`, `COST_PER_QUBIT`, `COST_PER_HOUR`, `COST_PER_QUBIT_PER_HOUR`, `DATA_QUBIT_SPACING`. Map what exists; document the gap (Task 12).
4. `qreVersion`: `importlib.metadata.version("qdk")` → `"1.29.1"`, confirmed live.
5. `RoundBasedFactory` caches results to disk by default (`~/.cache/re3/round_based`) — first call per config is slower than repeats. Relevant to timeout tuning (Task 11).

---

## Checkpoints (for Codex review)

Work through tasks in order. **Stop and hand off to Codex at the end of each of these 5 points** — they're the natural review boundaries where a defect in one stage would otherwise get built on top of in the next:

- **Checkpoint 1** — after Task 3 (`configToInvocation` + validation done and tested)
- **Checkpoint 2** — after Task 6 (Python wrapper + `execute` done and tested)
- **Checkpoint 3** — after Task 7 (`outputToResult` done and tested)
- **Checkpoint 4** — after Task 9 (`qreEngine` composed, conformance harness green on all 4 fixtures)
- **Checkpoint 5** — after Task 12 (uploads, robustness, README, decision memo — ready for PR)

At each checkpoint, run Codex over the diff since the last checkpoint, specifically checking: does the code match this plan's stated contract semantics exactly (no missing/extra validation rules), do all failure paths resolve rather than throw, is `raw` preserved verbatim, can anything hang the caller. Reconcile findings before moving to the next task.

---

### Task 1: Workspace setup — Node scripts, Python venv, shared contract types

**Files:**
- Modify: `app/package.json`
- Create: `app/src/shared/types.ts`
- Create: `app/src/main/engine/python/requirements.txt`
- Create: `app/src/main/engine/python/setup_venv.sh`

**Interfaces:**
- Produces: `app/src/shared/types.ts` exporting everything from `contracts/types.ts` verbatim (`RunConfig`, `RunResult`, `EstimatorService`, `SCHEMA_VERSION`, `BENCHMARK_IDS`, etc.) — every later task imports contract types from here, never re-declares them.

- [ ] **Step 1: Copy the frozen contract types verbatim**

Copy `contracts/types.ts` to `app/src/shared/types.ts` exactly as-is (same content, same file). Run:

```bash
cp contracts/types.ts app/src/shared/types.ts
```

- [ ] **Step 2: Verify the copy is byte-identical**

Run: `diff contracts/types.ts app/src/shared/types.ts`
Expected: no output (files identical).

- [ ] **Step 3: Add test/typecheck scripts to `app/package.json`**

Add a `"scripts"` block (there isn't one yet):

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Create the Python requirements file**

```txt
# app/src/main/engine/python/requirements.txt
qdk[qre]==1.29.1
```

- [ ] **Step 5: Create the venv setup script**

```bash
#!/usr/bin/env bash
# app/src/main/engine/python/setup_venv.sh
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
./.venv/bin/pip install --quiet -r requirements.txt
echo "Python venv ready at $(pwd)/.venv"
```

Run: `chmod +x app/src/main/engine/python/setup_venv.sh && app/src/main/engine/python/setup_venv.sh`
Expected: ends with `Python venv ready at .../app/src/main/engine/python/.venv`

- [ ] **Step 6: Verify the venv can import qdk.qre**

Run: `app/src/main/engine/python/.venv/bin/python3 -c "import qdk.qre; print('ok')"`
Expected: `ok`

- [ ] **Step 7: Add `.venv` to `.gitignore`**

Check if `app/src/main/engine/python/.venv` would be ignored by an existing root `.gitignore`; if not, append `app/src/main/engine/python/.venv/` to the repo's `.gitignore`.

- [ ] **Step 8: Commit**

```bash
git add app/package.json app/src/shared/types.ts app/src/main/engine/python/requirements.txt app/src/main/engine/python/setup_venv.sh .gitignore
git commit -m "Set up engine workspace: shared contract types, Python venv, test scripts"
```

---

### Task 2: `QreInvocation` internal type

**Files:**
- Create: `app/src/main/engine/invocation.ts`

**Interfaces:**
- Consumes: nothing (leaf type file).
- Produces: `QreInvocation` interface, imported by `configToInvocation.ts` (produces it) and `execute.ts` (consumes it).

- [ ] **Step 1: Write the type**

```typescript
// app/src/main/engine/invocation.ts

/**
 * Internal seam between configToInvocation and execute/outputToResult.
 * Not part of the frozen contracts/ — owned entirely by this engine module.
 */
export interface QreInvocation {
  program: {
    /** Absolute path to the Q# project root (dir with qsharp.json), or the OpenQASM/QIR source file. */
    sourcePath: string;
    format: "qsharp" | "openqasm" | "qir";
    /** Fully-qualified Q# entry expression, e.g. "QuantumDynamics.Main()". Empty for openqasm/qir. */
    entryExpr: string;
  };
  architecture:
    | {
        type: "gateBased";
        errorRate: number;
        gateTime: number;
        measurementTime: number;
        twoQubitGateTime: number | null;
      }
    | {
        type: "majorana";
        errorRate: 0.0001 | 0.00001 | 0.000001;
        operationTime: number;
      };
  qecCode: "surface_code" | "three_aux";
  magicStateFactory: "round_based" | "litinski19";
  traceTransform:
    | { type: "psspc"; tStatesPerRotation: number; ccxMagicStates: boolean }
    | { type: "latticeSurgery"; slowDownFactor: 1.0 };
  maxError: number;
  timeoutMs: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors related to `invocation.ts` (other errors from not-yet-created files are expected and will clear as later tasks land).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/engine/invocation.ts
git commit -m "Add QreInvocation internal type"
```

---

### Task 3: `configToInvocation` — validation + translation

**Files:**
- Create: `app/src/main/engine/benchmarkRegistry.ts`
- Create: `app/src/main/engine/configToInvocation.ts`
- Test: `app/src/main/engine/configToInvocation.test.ts`

**Interfaces:**
- Consumes: `RunConfig` from `app/src/shared/types.ts`; `QreInvocation` from `./invocation.ts`.
- Produces: `configToInvocation(config: RunConfig, timeoutMs: number): { ok: true; invocation: QreInvocation } | { ok: false; error: { code: string; message: string } }` — later consumed by `execute.ts` and `qreEngine.ts`.
- Produces: `resolveBenchmark(benchmarkId: string): BenchmarkEntry | undefined` and `BENCHMARK_REGISTRY: Record<string, BenchmarkEntry>` from `benchmarkRegistry.ts` — consumed by Task 4 (which populates it with real sources) and by `qreEngine.test.ts` (Task 8).

- [ ] **Step 1: Write the benchmark registry skeleton (sources added in Task 4)**

```typescript
// app/src/main/engine/benchmarkRegistry.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QSHARP_PROJECT_ROOT = path.join(__dirname, "benchmarks", "qsharp-project");

export interface BenchmarkEntry {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  format: "qsharp" | "openqasm" | "qir";
  entryExpr: string;
}

export const BENCHMARK_REGISTRY: Record<string, BenchmarkEntry> = {
  "shors-factoring": {
    id: "shors-factoring",
    name: "Shor's Factoring",
    description:
      "Factoring-oriented benchmark for estimating resources of Shor-style modular arithmetic workloads.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "ShorsFactoring.Main()",
  },
  "ekera-hastad-factoring": {
    id: "ekera-hastad-factoring",
    name: "Ekerå-Håstad Factoring",
    description:
      "Factoring benchmark based on the Ekerå-Håstad variant, for contrasting factoring resource estimates against Shor's algorithm.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "EkeraHastadFactoring.Main()",
  },
  "quantum-dynamics": {
    id: "quantum-dynamics",
    name: "Quantum Dynamics",
    description:
      "Simulation-style benchmark for quantum dynamics workloads and the default baseline for week-2 contract fixtures.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "QuantumDynamics.Main()",
  },
  "grovers-search": {
    id: "grovers-search",
    name: "Grover's Search",
    description: "Search benchmark for Grover-style amplitude amplification workloads.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "GroversSearch.Main()",
  },
  "phase-estimation": {
    id: "phase-estimation",
    name: "Phase Estimation",
    description:
      "Phase-estimation benchmark for algorithms dominated by controlled unitary applications and precision trade-offs.",
    sourcePath: QSHARP_PROJECT_ROOT,
    format: "qsharp",
    entryExpr: "PhaseEstimation.Main()",
  },
};

export function resolveBenchmark(benchmarkId: string): BenchmarkEntry | undefined {
  return BENCHMARK_REGISTRY[benchmarkId];
}
```

- [ ] **Step 2: Write the failing tests for `configToInvocation`**

```typescript
// app/src/main/engine/configToInvocation.test.ts
import { describe, it, expect } from "vitest";
import { configToInvocation } from "./configToInvocation";
import type { RunConfig } from "../../shared/types";

function baseGateBasedConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id: "acaf1c0e-a716-41bc-9774-598cacee033f",
    name: "test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
    architecture: {
      type: "gateBased",
      errorRate: 0.0001,
      gateTime: 50,
      measurementTime: 100,
      twoQubitGateTime: null,
    },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
    ...overrides,
  };
}

describe("configToInvocation", () => {
  it("translates a valid GateBased/PSSPC config into an invocation", () => {
    const result = configToInvocation(baseGateBasedConfig(), 30000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invocation.program.entryExpr).toBe("QuantumDynamics.Main()");
      expect(result.invocation.program.format).toBe("qsharp");
      expect(result.invocation.architecture).toEqual({
        type: "gateBased",
        errorRate: 0.0001,
        gateTime: 50,
        measurementTime: 100,
        twoQubitGateTime: null,
      });
      expect(result.invocation.qecCode).toBe("surface_code");
      expect(result.invocation.timeoutMs).toBe(30000);
    }
  });

  it("rejects an unknown benchmark id with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ application: { type: "benchmark", benchmarkId: "not-a-real-id" } }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects a GateBased/three_aux mismatch with INVALID_CONFIG", () => {
    const result = configToInvocation(baseGateBasedConfig({ qecCode: "three_aux" }), 30000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("rejects litinski19 with errorRate above 1e-3 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: { type: "gateBased", errorRate: 0.005, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("accepts litinski19 with errorRate exactly 1e-3", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: { type: "gateBased", errorRate: 0.001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects majorana with litinski19 with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
        magicStateFactory: "litinski19",
      }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("accepts a valid Majorana/three_aux config", () => {
    const result = configToInvocation(
      baseGateBasedConfig({
        application: { type: "benchmark", benchmarkId: "phase-estimation" },
        architecture: { type: "majorana", errorRate: 0.00001, operationTime: 1000 },
        qecCode: "three_aux",
        magicStateFactory: "round_based",
        traceTransform: { type: "psspc", tStatesPerRotation: 5, ccxMagicStates: false },
      }),
      30000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.qecCode).toBe("three_aux");
  });

  it("does NOT reject an in-range-but-unsatisfiable maxError (passes through)", () => {
    const result = configToInvocation(baseGateBasedConfig({ maxError: 1e-12 }), 30000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invocation.maxError).toBe(1e-12);
  });

  it("rejects PSSPC tStatesPerRotation out of [5,20] with INVALID_CONFIG", () => {
    const result = configToInvocation(
      baseGateBasedConfig({ traceTransform: { type: "psspc", tStatesPerRotation: 21, ccxMagicStates: false } }),
      30000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx vitest run src/main/engine/configToInvocation.test.ts`
Expected: FAIL — `configToInvocation` module not found.

- [ ] **Step 4: Implement `configToInvocation`**

```typescript
// app/src/main/engine/configToInvocation.ts
import type { RunConfig } from "../../shared/types";
import type { QreInvocation } from "./invocation";
import { resolveBenchmark } from "./benchmarkRegistry";

export type ConfigToInvocationResult =
  | { ok: true; invocation: QreInvocation }
  | { ok: false; error: { code: "INVALID_CONFIG"; message: string } };

function invalid(message: string): ConfigToInvocationResult {
  return { ok: false, error: { code: "INVALID_CONFIG", message } };
}

export function configToInvocation(config: RunConfig, timeoutMs: number): ConfigToInvocationResult {
  // --- application ---
  let program: QreInvocation["program"];
  if (config.application.type === "benchmark") {
    const entry = resolveBenchmark(config.application.benchmarkId);
    if (!entry) {
      return invalid(
        `Unknown benchmark id "${config.application.benchmarkId}". Choose one of the starter benchmarks or upload a program.`,
      );
    }
    program = { sourcePath: entry.sourcePath, format: entry.format, entryExpr: entry.entryExpr };
  } else {
    if (!config.application.filePath) {
      return invalid("Uploaded program is missing a file path.");
    }
    program = { sourcePath: config.application.filePath, format: config.application.format, entryExpr: "" };
  }

  // --- architecture <-> qecCode coupling ---
  const architecture = config.architecture;
  if (architecture.type === "gateBased") {
    if (config.qecCode !== "surface_code") {
      return invalid(
        `GateBased architecture requires qecCode "surface_code", got "${config.qecCode}".`,
      );
    }
    if (!(architecture.errorRate > 0 && architecture.errorRate < 0.01)) {
      return invalid(`GateBased errorRate must be in (0, 0.01), got ${architecture.errorRate}.`);
    }
    if (!(architecture.gateTime > 0)) {
      return invalid(`GateBased gateTime must be > 0, got ${architecture.gateTime}.`);
    }
    if (!(architecture.measurementTime > 0)) {
      return invalid(`GateBased measurementTime must be > 0, got ${architecture.measurementTime}.`);
    }
    if (architecture.twoQubitGateTime != null && !(architecture.twoQubitGateTime > 0)) {
      return invalid(`GateBased twoQubitGateTime must be null or > 0, got ${architecture.twoQubitGateTime}.`);
    }
  } else {
    if (config.qecCode !== "three_aux") {
      return invalid(`Majorana architecture requires qecCode "three_aux", got "${config.qecCode}".`);
    }
    if (![0.0001, 0.00001, 0.000001].includes(architecture.errorRate)) {
      return invalid(`Majorana errorRate must be one of 1e-4, 1e-5, 1e-6, got ${architecture.errorRate}.`);
    }
    if (!(architecture.operationTime > 0)) {
      return invalid(`Majorana operationTime must be > 0, got ${architecture.operationTime}.`);
    }
    if (config.magicStateFactory !== "round_based") {
      return invalid(`Majorana architectures only support magicStateFactory "round_based".`);
    }
  }

  // --- magic state factory eligibility ---
  if (config.magicStateFactory === "litinski19") {
    if (architecture.type !== "gateBased" || !(architecture.errorRate <= 0.001)) {
      return invalid(
        "litinski19 magic state factory requires a GateBased architecture with errorRate <= 1e-3.",
      );
    }
  }

  // --- trace transform ---
  const traceTransform = config.traceTransform;
  if (traceTransform.type === "psspc") {
    if (!(traceTransform.tStatesPerRotation >= 5 && traceTransform.tStatesPerRotation <= 20)) {
      return invalid(
        `PSSPC tStatesPerRotation must be in [5, 20], got ${traceTransform.tStatesPerRotation}.`,
      );
    }
  } else {
    if (traceTransform.slowDownFactor !== 1.0) {
      return invalid(`latticeSurgery slowDownFactor must be 1.0, got ${traceTransform.slowDownFactor}.`);
    }
  }

  // --- maxError: range-checked only; unsatisfiability is NOT validated here ---
  if (!(config.maxError > 0 && config.maxError <= 1)) {
    return invalid(`maxError must be in (0, 1], got ${config.maxError}.`);
  }

  return {
    ok: true,
    invocation: {
      program,
      architecture:
        architecture.type === "gateBased"
          ? {
              type: "gateBased",
              errorRate: architecture.errorRate,
              gateTime: architecture.gateTime,
              measurementTime: architecture.measurementTime,
              twoQubitGateTime: architecture.twoQubitGateTime ?? null,
            }
          : { type: "majorana", errorRate: architecture.errorRate, operationTime: architecture.operationTime },
      qecCode: config.qecCode,
      magicStateFactory: config.magicStateFactory,
      traceTransform:
        traceTransform.type === "psspc"
          ? { type: "psspc", tStatesPerRotation: traceTransform.tStatesPerRotation, ccxMagicStates: traceTransform.ccxMagicStates }
          : { type: "latticeSurgery", slowDownFactor: 1.0 },
      maxError: config.maxError,
      timeoutMs,
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/main/engine/configToInvocation.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors in `configToInvocation.ts` or `benchmarkRegistry.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/engine/benchmarkRegistry.ts app/src/main/engine/configToInvocation.ts app/src/main/engine/configToInvocation.test.ts
git commit -m "Implement configToInvocation with exact contract validation rules"
```

**>>> CHECKPOINT 1: hand off to Codex here before continuing. <<<**

---

### Task 4: Real Q# benchmark source programs

**Files:**
- Create: `app/src/main/engine/benchmarks/qsharp-project/qsharp.json`
- Create: `app/src/main/engine/benchmarks/qsharp-project/src/QuantumDynamics.qs`
- Create: `app/src/main/engine/benchmarks/qsharp-project/src/GroversSearch.qs`
- Create: `app/src/main/engine/benchmarks/qsharp-project/src/PhaseEstimation.qs`
- Create: `app/src/main/engine/benchmarks/qsharp-project/src/ShorsFactoring.qs`
- Create: `app/src/main/engine/benchmarks/qsharp-project/src/EkeraHastadFactoring.qs`

**Interfaces:**
- Consumes: nothing new (paths already referenced by `benchmarkRegistry.ts` from Task 3).
- Produces: 5 real, compilable Q# operations, each callable as `<Namespace>.Main()`, verified by Task 5's Python wrapper test.

- [ ] **Step 1: Project manifest**

```json
{}
```
Path: `app/src/main/engine/benchmarks/qsharp-project/qsharp.json`

- [ ] **Step 2: Quantum Dynamics — Trotterized Hamiltonian simulation**

```qsharp
// app/src/main/engine/benchmarks/qsharp-project/src/QuantumDynamics.qs
namespace QuantumDynamics {
    operation TrotterStep(qs : Qubit[], theta : Double) : Unit {
        for i in 0..Length(qs) - 2 {
            CNOT(qs[i], qs[i + 1]);
            Rz(theta, qs[i + 1]);
            CNOT(qs[i], qs[i + 1]);
        }
        for q in qs {
            Rx(theta, q);
        }
    }

    operation Main() : Result[] {
        use qs = Qubit[8];
        for _ in 1..6 {
            TrotterStep(qs, 0.31);
        }
        return MResetEachZ(qs);
    }
}
```

- [ ] **Step 3: Grover's Search — amplitude amplification**

```qsharp
// app/src/main/engine/benchmarks/qsharp-project/src/GroversSearch.qs
namespace GroversSearch {
    operation Oracle(qs : Qubit[], target : Qubit) : Unit is Adj + Ctl {
        Controlled X(qs, target);
    }

    operation Diffuser(qs : Qubit[]) : Unit {
        ApplyToEach(H, qs);
        ApplyToEach(X, qs);
        Controlled Z(qs[1...], qs[0]);
        ApplyToEach(X, qs);
        ApplyToEach(H, qs);
    }

    operation Main() : Result[] {
        use qs = Qubit[6];
        use target = Qubit();
        ApplyToEach(H, qs);
        X(target);
        H(target);

        for _ in 1..3 {
            Oracle(qs, target);
            Diffuser(qs);
        }

        let results = MResetEachZ(qs);
        Reset(target);
        return results;
    }
}
```

- [ ] **Step 4: Phase Estimation — QPE with inverse QFT**

```qsharp
// app/src/main/engine/benchmarks/qsharp-project/src/PhaseEstimation.qs
import Std.Arithmetic.*;

namespace PhaseEstimation {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ControlledUnitary(power : Int, control : Qubit, target : Qubit[]) : Unit {
        for _ in 1..power {
            Controlled Z([control], target[0]);
            Controlled Rz([control], (0.7, target[0]));
        }
    }

    operation Main() : Result[] {
        use counting = Qubit[6];
        use target = Qubit[2];
        X(target[0]);
        ApplyToEach(H, counting);

        for i in 0..Length(counting) - 1 {
            ControlledUnitary(1 <<< i, counting[i], target);
        }

        ApplyInverseQft(counting);
        let phaseResults = MResetEachZ(counting);
        let targetResults = MResetEachZ(target);
        return phaseResults + targetResults;
    }
}
```

- [ ] **Step 5: Shor's Factoring — QRE-style period-finding stand-in**

Full modular exponentiation is out of scope for a resource-estimation benchmark; the estimator only needs a representative circuit with the right qubit-count/T-count profile (this is the same simplification Microsoft's own QRE tutorials use). Uses a parameterized register with repeated controlled rotations to stand in for modular exponentiation, followed by inverse QFT:

```qsharp
// app/src/main/engine/benchmarks/qsharp-project/src/ShorsFactoring.qs
namespace ShorsFactoring {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ModularExponentiationStandIn(counting : Qubit[], work : Qubit[]) : Unit {
        for i in 0..Length(counting) - 1 {
            for _ in 1..(1 <<< i) % 8 + 1 {
                for w in work {
                    Controlled Rz([counting[i]], (0.9, w));
                }
                Controlled X(counting[i..i], work[0]);
            }
        }
    }

    operation Main() : Result[] {
        use counting = Qubit[10];
        use work = Qubit[8];
        ApplyToEach(H, counting);
        X(work[0]);

        ModularExponentiationStandIn(counting, work);
        ApplyInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
```

- [ ] **Step 6: Ekerå-Håstad Factoring — variant with shorter padding**

Differentiated from Shor's by register sizing per the Ekerå-Håstad short-discrete-log approach (fewer counting qubits relative to the work register):

```qsharp
// app/src/main/engine/benchmarks/qsharp-project/src/EkeraHastadFactoring.qs
namespace EkeraHastadFactoring {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ShortDiscreteLogStandIn(counting : Qubit[], work : Qubit[]) : Unit {
        for i in 0..Length(counting) - 1 {
            for w in work {
                Controlled Rz([counting[i]], (1.1, w));
            }
        }
    }

    operation Main() : Result[] {
        use counting = Qubit[7];
        use work = Qubit[8];
        ApplyToEach(H, counting);
        X(work[0]);

        ShortDiscreteLogStandIn(counting, work);
        ApplyInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
```

- [ ] **Step 7: Verify all 5 compile and estimate successfully**

Run (from repo root, using the venv from Task 1):

```bash
QDK_PYTHON_TELEMETRY=none app/src/main/engine/python/.venv/bin/python3 -c "
import qdk
import qdk.qre as qre
from qdk.qre.models import GateBased, SurfaceCode, RoundBasedFactory

qdk.init(project_root='app/src/main/engine/benchmarks/qsharp-project')
arch = GateBased(error_rate=1e-4, gate_time=50, measurement_time=100)
isa_query = SurfaceCode.q() * RoundBasedFactory.q()

for entry_expr in [
    'QuantumDynamics.Main()',
    'GroversSearch.Main()',
    'PhaseEstimation.Main()',
    'ShorsFactoring.Main()',
    'EkeraHastadFactoring.Main()',
]:
    from qdk.qre.application import QSharpApplication
    table = qre.estimate(QSharpApplication(entry_expr=entry_expr), arch, isa_query, max_error=1.0)
    print(entry_expr, '->', len(table), 'rows, first qubits=', table[0].qubits if len(table) else None)
"
```

Expected: 5 lines printed, each with `rows` >= 1 and a numeric qubit count. If any operation fails to compile, fix the Q# syntax error shown in the traceback before proceeding — do not skip a benchmark.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/engine/benchmarks/
git commit -m "Add real Q# source programs for all 5 starter benchmarks"
```

---

### Task 5: Python estimation wrapper script

**Files:**
- Create: `app/src/main/engine/python/estimate.py`
- Test: `app/src/main/engine/python/test_estimate.py`

**Interfaces:**
- Consumes: JSON on stdin matching `QreInvocation` (Task 2's shape, snake_case-adapted for Python).
- Produces: JSON on stdout, either `{"status": "success", ...}` with a `frontier` array of raw entries, or `{"status": "failed", "code": ..., "message": ...}` — consumed by `execute.ts`/`outputToResult.ts` (Task 6/7).

- [ ] **Step 1: Write the wrapper script**

```python
#!/usr/bin/env python3
# app/src/main/engine/python/estimate.py
"""
Reads a QreInvocation JSON object from stdin, runs qdk.qre.estimate, and
writes a JSON result to stdout. Never raises past main() -- all failures
become a JSON {"status": "failed", ...} object so the Node caller can map
them to the contract's error codes.
"""
import importlib.metadata
import json
import sys

import qdk
import qdk.qre as qre
from qdk.qre.application import OpenQASMApplication, QIRApplication, QSharpApplication
from qdk.qre.models import (
    GateBased,
    Litinski19Factory,
    Majorana,
    PSSPC,
    RoundBasedFactory,
    SurfaceCode,
    ThreeAux,
)
from qdk.qre.property_keys import CODE_CYCLE_TIME, DISTANCE
from qdk.qre import LatticeSurgery, instruction_name


def build_application(program: dict):
    fmt = program["format"]
    if fmt == "qsharp":
        qdk.init(project_root=program["sourcePath"])
        return QSharpApplication(entry_expr=program["entryExpr"])
    if fmt == "openqasm":
        with open(program["sourcePath"], "r", encoding="utf-8") as f:
            return OpenQASMApplication(program=f.read())
    if fmt == "qir":
        with open(program["sourcePath"], "r", encoding="utf-8") as f:
            return QIRApplication(input=f.read())
    raise ValueError(f"Unknown program format: {fmt}")


def build_architecture(arch: dict):
    if arch["type"] == "gateBased":
        return GateBased(
            error_rate=arch["errorRate"],
            gate_time=arch["gateTime"],
            measurement_time=arch["measurementTime"],
            two_qubit_gate_time=arch.get("twoQubitGateTime"),
        )
    return Majorana(error_rate=arch["errorRate"])


def build_isa_query(qec_code: str, magic_state_factory: str):
    qec = SurfaceCode.q() if qec_code == "surface_code" else ThreeAux.q()
    factory = Litinski19Factory.q() if magic_state_factory == "litinski19" else RoundBasedFactory.q()
    return qec * factory


def build_trace_query(trace_transform: dict):
    if trace_transform["type"] == "psspc":
        return PSSPC.q(
            num_ts_per_rotation=trace_transform["tStatesPerRotation"],
            ccx_magic_states=trace_transform["ccxMagicStates"],
        )
    return LatticeSurgery.q()


def find_qec_property(entry, key, default=None):
    """Distance and code-cycle-time live on the QEC transform's instruction
    node in the source graph, not in entry.properties directly."""
    for node in entry.source.nodes:
        if type(node.transform).__name__ in ("SurfaceCode", "ThreeAux"):
            value = node.instruction.get_property_or(key, None)
            if value is not None:
                return value
    return default


def entry_to_dict(entry) -> dict:
    distance = find_qec_property(entry, DISTANCE)
    code_cycle_time = find_qec_property(entry, CODE_CYCLE_TIME)
    logical_cycle_time = (
        distance * code_cycle_time if distance is not None and code_cycle_time is not None else None
    )
    return {
        "qubits": entry.qubits,
        "runtime": entry.runtime,
        "error": entry.error,
        "distance": distance,
        "logicalCycleTime": logical_cycle_time,
        "factories": [
            {"stateType": instruction_name(instr_id) or str(instr_id), "copies": result.copies}
            for instr_id, result in entry.factories.items()
        ],
        "properties": {str(k): v for k, v in entry.properties.items()},
    }


def main() -> int:
    raw_input = sys.stdin.read()
    invocation = json.loads(raw_input)

    try:
        application = build_application(invocation["program"])
        architecture = build_architecture(invocation["architecture"])
        isa_query = build_isa_query(invocation["qecCode"], invocation["magicStateFactory"])
        trace_query = build_trace_query(invocation["traceTransform"])

        table = qre.estimate(
            application, architecture, isa_query, trace_query, max_error=invocation["maxError"]
        )

        if len(table) == 0:
            print(
                json.dumps(
                    {
                        "status": "failed",
                        "code": "ESTIMATION_FAILED",
                        "message": "The estimator found no feasible Pareto frontier point for this configuration.",
                        "qreVersion": importlib.metadata.version("qdk"),
                    }
                )
            )
            return 0

        print(
            json.dumps(
                {
                    "status": "success",
                    "engineApi": "qdk-qre-estimate",
                    "frontier": [entry_to_dict(e) for e in table],
                    "stats": {
                        "numTraces": table.stats.num_traces,
                        "numIsas": table.stats.num_isas,
                        "totalJobs": table.stats.total_jobs,
                        "successfulEstimates": table.stats.successful_estimates,
                        "paretoResults": table.stats.pareto_results,
                    },
                    "qreVersion": importlib.metadata.version("qdk"),
                }
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001 -- must never propagate as a crash
        print(
            json.dumps(
                {
                    "status": "failed",
                    "code": "COMPILE_ERROR" if "Resolve" in type(exc).__name__ or "Compil" in str(exc) else "ESTIMATION_FAILED",
                    "message": str(exc),
                    "qreVersion": importlib.metadata.version("qdk"),
                }
            )
        )
        return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Write a Python test for the wrapper's pure helper functions**

```python
# app/src/main/engine/python/test_estimate.py
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "estimate.py"
PROJECT_ROOT = Path(__file__).parents[1] / "benchmarks" / "qsharp-project"


def run_wrapper(invocation: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=json.dumps(invocation),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_gate_based_psspc_success():
    result = run_wrapper(
        {
            "program": {
                "sourcePath": str(PROJECT_ROOT),
                "format": "qsharp",
                "entryExpr": "QuantumDynamics.Main()",
            },
            "architecture": {
                "type": "gateBased",
                "errorRate": 0.0001,
                "gateTime": 50,
                "measurementTime": 100,
                "twoQubitGateTime": None,
            },
            "qecCode": "surface_code",
            "magicStateFactory": "round_based",
            "traceTransform": {"type": "psspc", "tStatesPerRotation": 20, "ccxMagicStates": False},
            "maxError": 1.0,
            "timeoutMs": 30000,
        }
    )
    assert result["status"] == "success"
    assert len(result["frontier"]) >= 1
    row = result["frontier"][0]
    assert row["qubits"] > 0
    assert row["distance"] is not None
    assert row["logicalCycleTime"] is not None


def test_unsatisfiable_max_error_fails_soft():
    result = run_wrapper(
        {
            "program": {
                "sourcePath": str(PROJECT_ROOT),
                "format": "qsharp",
                "entryExpr": "QuantumDynamics.Main()",
            },
            "architecture": {
                "type": "gateBased",
                "errorRate": 0.0001,
                "gateTime": 100000,
                "measurementTime": 100000,
                "twoQubitGateTime": None,
            },
            "qecCode": "surface_code",
            "magicStateFactory": "round_based",
            "traceTransform": {"type": "psspc", "tStatesPerRotation": 20, "ccxMagicStates": False},
            "maxError": 1e-12,
            "timeoutMs": 30000,
        }
    )
    assert result["status"] == "failed"
    assert result["code"] == "ESTIMATION_FAILED"
```

- [ ] **Step 3: Install pytest and run the tests**

```bash
app/src/main/engine/python/.venv/bin/pip install --quiet pytest
QDK_PYTHON_TELEMETRY=none app/src/main/engine/python/.venv/bin/python3 -m pytest app/src/main/engine/python/test_estimate.py -v
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/engine/python/estimate.py app/src/main/engine/python/test_estimate.py
git commit -m "Add Python estimation wrapper around qdk.qre.estimate"
```

---

### Task 6: `execute` — spawn, timeout, crash handling

**Files:**
- Create: `app/src/main/engine/execute.ts`
- Test: `app/src/main/engine/execute.test.ts`

**Interfaces:**
- Consumes: `QreInvocation` from `./invocation.ts`.
- Produces: `execute(invocation: QreInvocation, pythonBin: string): Promise<ExecuteResult>` where
  `type ExecuteResult = { ok: true; raw: Record<string, unknown> } | { ok: false; code: "TIMEOUT" | "ENGINE_CRASH" | "COMPILE_ERROR" | "ESTIMATION_FAILED"; message: string; raw: Record<string, unknown> | null }` — consumed by `outputToResult.ts` and `qreEngine.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/main/engine/execute.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "./execute";
import type { QreInvocation } from "./invocation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");
const BENCHMARK_PROJECT = path.join(__dirname, "benchmarks", "qsharp-project");

function invocation(overrides: Partial<QreInvocation> = {}): QreInvocation {
  return {
    program: { sourcePath: BENCHMARK_PROJECT, format: "qsharp", entryExpr: "QuantumDynamics.Main()" },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1.0,
    timeoutMs: 30000,
    ...overrides,
  };
}

describe("execute", () => {
  it("runs a real estimate and returns raw success output", async () => {
    const result = await execute(invocation(), PYTHON_BIN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw.status).toBe("success");
      expect(Array.isArray((result.raw as Record<string, unknown>)["frontier"])).toBe(true);
    }
  }, 60000);

  it("maps an unsatisfiable maxError to ESTIMATION_FAILED without a raw parse error", async () => {
    const result = await execute(
      invocation({
        architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 100000, measurementTime: 100000, twoQubitGateTime: null },
        maxError: 1e-12,
      }),
      PYTHON_BIN,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ESTIMATION_FAILED");
  }, 60000);

  it("times out on an unreasonably short timeout and returns TIMEOUT with raw: null", async () => {
    const result = await execute(invocation({ timeoutMs: 1 }), PYTHON_BIN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TIMEOUT");
      expect(result.raw).toBeNull();
    }
  }, 15000);

  it("reports ENGINE_CRASH when the interpreter binary doesn't exist", async () => {
    const result = await execute(invocation(), "/nonexistent/python3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ENGINE_CRASH");
      expect(result.raw).toBeNull();
    }
  }, 15000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/main/engine/execute.test.ts`
Expected: FAIL — `execute` module not found.

- [ ] **Step 3: Implement `execute`**

```typescript
// app/src/main/engine/execute.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QreInvocation } from "./invocation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_SCRIPT = path.join(__dirname, "python", "estimate.py");

export type ExecuteResult =
  | { ok: true; raw: Record<string, unknown> }
  | {
      ok: false;
      code: "TIMEOUT" | "ENGINE_CRASH" | "COMPILE_ERROR" | "ESTIMATION_FAILED";
      message: string;
      raw: Record<string, unknown> | null;
    };

export function execute(invocation: QreInvocation, pythonBin: string): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, [WRAPPER_SCRIPT], {
      env: { ...process.env, QDK_PYTHON_TELEMETRY: "none" },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, code: "TIMEOUT", message: `Estimation exceeded ${invocation.timeoutMs}ms.`, raw: null });
    }, invocation.timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: "ENGINE_CRASH", message: `Failed to start engine process: ${err.message}`, raw: null });
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (exitCode !== 0) {
        resolve({
          ok: false,
          code: "ENGINE_CRASH",
          message: `Engine process exited with code ${exitCode}. stderr: ${stderr.slice(0, 2000)}`,
          raw: null,
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdout) as Record<string, unknown>;
      } catch {
        resolve({
          ok: false,
          code: "ENGINE_CRASH",
          message: `Engine produced non-JSON output. stderr: ${stderr.slice(0, 2000)}`,
          raw: null,
        });
        return;
      }

      if (parsed["status"] === "failed") {
        const knownCodes = ["TIMEOUT", "ENGINE_CRASH", "COMPILE_ERROR", "ESTIMATION_FAILED"] as const;
        const rawCode = String(parsed["code"] ?? "ESTIMATION_FAILED");
        const code = (knownCodes as readonly string[]).includes(rawCode)
          ? (rawCode as (typeof knownCodes)[number])
          : "ESTIMATION_FAILED";
        resolve({
          ok: false,
          code,
          message: String(parsed["message"] ?? "The engine reported a failure."),
          raw: parsed,
        });
        return;
      }

      resolve({ ok: true, raw: parsed });
    });

    child.stdin.write(JSON.stringify(invocation));
    child.stdin.end();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/main/engine/execute.test.ts`
Expected: PASS, 4 tests (the real-estimate test takes a few seconds — that's expected).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/engine/execute.ts app/src/main/engine/execute.test.ts
git commit -m "Implement execute(): Python subprocess spawn with timeout and crash handling"
```

**>>> CHECKPOINT 2: hand off to Codex here before continuing. <<<**

---

### Task 7: `outputToResult` — raw output to `RunResult`

**Files:**
- Create: `app/src/main/engine/outputToResult.ts`
- Test: `app/src/main/engine/outputToResult.test.ts`

**Interfaces:**
- Consumes: `ExecuteResult` from `./execute.ts`; `RunConfig` from `../../shared/types`.
- Produces: `outputToResult(config: RunConfig, executeResult: ExecuteResult, startedAt: string, completedAt: string): RunResult` — consumed by `qreEngine.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/main/engine/outputToResult.test.ts
import { describe, it, expect } from "vitest";
import { outputToResult } from "./outputToResult";
import type { RunConfig } from "../../shared/types";
import type { ExecuteResult } from "./execute";

const config: RunConfig = {
  schemaVersion: "1.0.0",
  id: "acaf1c0e-a716-41bc-9774-598cacee033f",
  name: "test",
  createdAt: "2026-07-09T18:22:00Z",
  application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
  architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
  qecCode: "surface_code",
  magicStateFactory: "round_based",
  traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
  maxError: 1,
  qreVersion: "1.29.1",
};

describe("outputToResult", () => {
  it("maps a successful raw wrapper output into a conformant RunResult", () => {
    const executeResult: ExecuteResult = {
      ok: true,
      raw: {
        status: "success",
        engineApi: "qdk-qre-estimate",
        qreVersion: "1.29.1",
        frontier: [
          {
            qubits: 829766,
            runtime: 19100000,
            error: 0.00042,
            distance: 19,
            logicalCycleTime: 5200,
            factories: [{ stateType: "T", copies: 216 }],
            properties: { "10": 700000, "11": 610920 },
          },
        ],
      },
    };
    const result = outputToResult(config, executeResult, "2026-07-09T18:22:03Z", "2026-07-09T18:22:06Z");
    expect(result.status).toBe("succeeded");
    expect(result.error).toBeNull();
    expect(result.frontier).not.toBeNull();
    const row = result.frontier![0]!;
    expect(row.physicalQubits.value).toBe(829766);
    expect(row.physicalQubits.unit).toBe("qubits");
    expect(row.runtime.value).toBe(19100000);
    expect(row.logicalCycleTime.value).toBe(5200);
    expect(row.codeDistance.value).toBe(19);
    expect(row.totalError.value).toBe(0.00042);
    expect(row.factories.value).toEqual([{ stateType: "T", copies: 216 }]);
    expect(result.raw).toEqual(executeResult.raw);
    expect(result.qreVersion).toBe("1.29.1");
  });

  it("maps a row with zero factories to an empty factories array (0 is legitimate)", () => {
    const executeResult: ExecuteResult = {
      ok: true,
      raw: {
        status: "success",
        qreVersion: "1.29.1",
        frontier: [
          {
            qubits: 126400,
            runtime: 880000,
            error: 0.00012,
            distance: 9,
            logicalCycleTime: 1000,
            factories: [],
            properties: {},
          },
        ],
      },
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.status).toBe("succeeded");
    expect(result.frontier![0]!.factories.value).toEqual([]);
  });

  it("marks the run failed with ESTIMATION_FAILED when a row is missing a required default field", () => {
    const executeResult: ExecuteResult = {
      ok: true,
      raw: {
        status: "success",
        qreVersion: "1.29.1",
        frontier: [{ qubits: 100, runtime: 200, error: 0.1, distance: null, logicalCycleTime: 500, factories: [], properties: {} }],
      },
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("ESTIMATION_FAILED");
    expect(result.frontier).toBeNull();
  });

  it("maps a failed execute result to a failed RunResult with the canonical code", () => {
    const executeResult: ExecuteResult = {
      ok: false,
      code: "ESTIMATION_FAILED",
      message: "No feasible frontier point.",
      raw: { status: "failed", code: "ESTIMATION_FAILED", message: "No feasible frontier point." },
    };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.status).toBe("failed");
    expect(result.error).toEqual({ code: "ESTIMATION_FAILED", message: "No feasible frontier point." });
    expect(result.frontier).toBeNull();
    expect(result.raw).toEqual(executeResult.raw);
  });

  it("sets raw: null only for TIMEOUT/ENGINE_CRASH", () => {
    const executeResult: ExecuteResult = { ok: false, code: "TIMEOUT", message: "Timed out.", raw: null };
    const result = outputToResult(config, executeResult, "t0", "t1");
    expect(result.raw).toBeNull();
    expect(result.error?.code).toBe("TIMEOUT");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/main/engine/outputToResult.test.ts`
Expected: FAIL — `outputToResult` module not found.

- [ ] **Step 3: Implement `outputToResult`**

```typescript
// app/src/main/engine/outputToResult.ts
import type { RunConfig, RunResult, FrontierRow } from "../../shared/types";
import type { ExecuteResult } from "./execute";

interface RawFrontierRow {
  qubits: number;
  runtime: number;
  error: number;
  distance: number | null;
  logicalCycleTime: number | null;
  factories: Array<{ stateType: string; copies: number }>;
  properties: Record<string, unknown>;
}

function failed(config: RunConfig, code: string, message: string, raw: Record<string, unknown> | null, startedAt: string, completedAt: string): RunResult {
  return {
    schemaVersion: "1.0.0",
    runId: config.id,
    status: "failed",
    error: { code, message },
    frontier: null,
    raw,
    qreVersion: (raw?.["qreVersion"] as string | undefined) ?? config.qreVersion,
    startedAt,
    completedAt,
  };
}

function mapRow(row: RawFrontierRow): FrontierRow | null {
  if (row.distance == null || row.logicalCycleTime == null) return null;
  return {
    physicalQubits: { value: row.qubits, unit: "qubits", display: row.qubits.toLocaleString() },
    runtime: { value: row.runtime, unit: "ns", display: `${row.runtime} ns` },
    logicalCycleTime: { value: row.logicalCycleTime, unit: "ns", display: `${row.logicalCycleTime} ns` },
    factories: {
      value: row.factories,
      unit: "factories",
      display: row.factories.length === 0 ? "none" : row.factories.map((f) => `${f.copies} x ${f.stateType}`).join(", "),
    },
    totalError: { value: row.error, unit: "probability", display: row.error.toExponential(2) },
    codeDistance: { value: row.distance, unit: "", display: String(row.distance) },
  };
}

export function outputToResult(
  config: RunConfig,
  executeResult: ExecuteResult,
  startedAt: string,
  completedAt: string,
): RunResult {
  if (!executeResult.ok) {
    return failed(config, executeResult.code, executeResult.message, executeResult.raw, startedAt, completedAt);
  }

  const raw = executeResult.raw;
  const rawFrontier = (raw["frontier"] as RawFrontierRow[] | undefined) ?? [];
  const mappedRows: FrontierRow[] = [];
  for (const rawRow of rawFrontier) {
    const mapped = mapRow(rawRow);
    if (mapped === null) {
      return failed(
        config,
        "ESTIMATION_FAILED",
        "The engine reported a frontier row missing a required default field (distance or logicalCycleTime).",
        raw,
        startedAt,
        completedAt,
      );
    }
    mappedRows.push(mapped);
  }

  if (mappedRows.length === 0) {
    return failed(config, "ESTIMATION_FAILED", "The estimator returned an empty frontier.", raw, startedAt, completedAt);
  }

  return {
    schemaVersion: "1.0.0",
    runId: config.id,
    status: "succeeded",
    error: null,
    frontier: mappedRows,
    raw,
    qreVersion: (raw["qreVersion"] as string | undefined) ?? config.qreVersion,
    startedAt,
    completedAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/main/engine/outputToResult.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/engine/outputToResult.ts app/src/main/engine/outputToResult.test.ts
git commit -m "Implement outputToResult: raw qdk output to conformant RunResult"
```

**>>> CHECKPOINT 3: hand off to Codex here before continuing. <<<**

---

### Task 8: `QreEngine` — compose the three stages

**Files:**
- Create: `app/src/main/engine/qreEngine.ts`
- Test: `app/src/main/engine/qreEngine.test.ts`

**Interfaces:**
- Consumes: `configToInvocation`, `execute`, `outputToResult`, `RunConfig`/`RunResult`/`EstimatorService` from shared types.
- Produces: `class QreEngine implements EstimatorService` with `run(config: RunConfig): Promise<RunResult>` — consumed by Task 9's conformance harness.

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/main/engine/qreEngine.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine";
import type { RunConfig } from "../../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

const config: RunConfig = {
  schemaVersion: "1.0.0",
  id: "acaf1c0e-a716-41bc-9774-598cacee033f",
  name: "test",
  createdAt: "2026-07-09T18:22:00Z",
  application: { type: "benchmark", benchmarkId: "quantum-dynamics" },
  architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
  qecCode: "surface_code",
  magicStateFactory: "round_based",
  traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
  maxError: 1,
  qreVersion: "qdk-qre-v1-fixture",
};

describe("QreEngine", () => {
  it("runs a real benchmark end to end and resolves a succeeded RunResult", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(config);
    expect(result.status).toBe("succeeded");
    expect(result.runId).toBe(config.id);
    expect(result.frontier!.length).toBeGreaterThan(0);
    expect(result.qreVersion).toBe("1.29.1");
  }, 60000);

  it("resolves (never rejects) with INVALID_CONFIG for a bad benchmark id", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const badConfig: RunConfig = { ...config, application: { type: "benchmark", benchmarkId: "does-not-exist" } };
    const result = await engine.run(badConfig);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_CONFIG");
    expect(result.raw).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/main/engine/qreEngine.test.ts`
Expected: FAIL — `QreEngine` module not found.

- [ ] **Step 3: Implement `QreEngine`**

```typescript
// app/src/main/engine/qreEngine.ts
import type { EstimatorService, RunConfig, RunResult } from "../../shared/types";
import { configToInvocation } from "./configToInvocation";
import { execute } from "./execute";
import { outputToResult } from "./outputToResult";

const DEFAULT_TIMEOUT_MS = 120000;

export class QreEngine implements EstimatorService {
  constructor(private readonly pythonBin: string, private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async run(config: RunConfig): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const invocationResult = configToInvocation(config, this.timeoutMs);

    if (!invocationResult.ok) {
      return {
        schemaVersion: "1.0.0",
        runId: config.id,
        status: "failed",
        error: invocationResult.error,
        frontier: null,
        raw: null,
        qreVersion: config.qreVersion,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const executeResult = await execute(invocationResult.invocation, this.pythonBin);
    const completedAt = new Date().toISOString();
    return outputToResult(config, executeResult, startedAt, completedAt);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/main/engine/qreEngine.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/engine/qreEngine.ts app/src/main/engine/qreEngine.test.ts
git commit -m "Implement QreEngine composing configToInvocation, execute, outputToResult"
```

---

### Task 9: Conformance harness against all 4 frozen fixtures

**Files:**
- Create: `app/src/main/engine/conformance.test.ts`
- Modify: `app/package.json` (add `ajv-formats` usage is already a dependency; no new deps needed)

**Interfaces:**
- Consumes: `QreEngine`, `contracts/fixtures/runconfig.*.json`, `contracts/runresult.schema.json`.
- Produces: a passing/failing test suite — this is the "documented command" DoD item ("runnable by anyone via a documented command").

- [ ] **Step 1: Write the harness test**

```typescript
// app/src/main/engine/conformance.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { QreEngine } from "./qreEngine";
import type { RunConfig } from "../../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function loadFixture<T>(name: string): T {
  const p = path.join(REPO_ROOT, "contracts", "fixtures", name);
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

const FIXTURES = [
  "runconfig.benchmark.json",
  "runconfig.large.json",
  "runconfig.sparse.json",
  "runconfig.failing.json",
] as const;

describe("QreEngine conformance harness", () => {
  let validate: ReturnType<Ajv["compile"]>;

  beforeAll(() => {
    const schema = JSON.parse(readFileSync(path.join(REPO_ROOT, "contracts", "runresult.schema.json"), "utf-8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  for (const fixtureName of FIXTURES) {
    it(`produces a schema-valid RunResult for ${fixtureName}`, async () => {
      const config = loadFixture<RunConfig>(fixtureName);
      const engine = new QreEngine(PYTHON_BIN);
      const result = await engine.run(config);

      const valid = validate(result);
      if (!valid) {
        throw new Error(`Schema validation failed for ${fixtureName}: ${JSON.stringify(validate.errors, null, 2)}`);
      }
      expect(result.runId).toBe(config.id);
    }, 60000);
  }

  it("resolves the failing fixture as a schema-valid FAILED result, not a hang or rejection", async () => {
    const config = loadFixture<RunConfig>("runconfig.failing.json");
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(config);
    expect(result.status).toBe("failed");
    expect(result.error).not.toBeNull();
    expect(result.frontier).toBeNull();
  }, 60000);
});
```

- [ ] **Step 2: Run the harness**

Run: `cd app && npx vitest run src/main/engine/conformance.test.ts`
Expected: PASS, 5 tests (one per fixture + the explicit failing-fixture check). If any fixture fails schema validation, read the Ajv error output, fix `outputToResult.ts` or `configToInvocation.ts` accordingly, and re-run — do not weaken the schema check.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

Run: `cd app && npm run test`
Expected: all suites pass (configToInvocation, execute, outputToResult, qreEngine, conformance).

- [ ] **Step 4: Commit**

```bash
git add app/src/main/engine/conformance.test.ts
git commit -m "Add conformance harness validating QreEngine against all 4 frozen fixtures"
```

**>>> CHECKPOINT 4: hand off to Codex here before continuing. <<<**

---

### Task 10: Uploaded program proof (OpenQASM end-to-end)

**Files:**
- Create: `app/src/main/engine/uploads/sample-bell.qasm`
- Create: `app/src/main/engine/uploads/bad-sample.qasm`
- Test: `app/src/main/engine/uploadedProgram.test.ts`

**Interfaces:**
- Consumes: `QreEngine`, `configToInvocation`.
- Produces: proof that the `uploaded` application variant works end to end for at least one format, and that a bad upload fails soft.

- [ ] **Step 1: Write a valid OpenQASM sample**

```qasm
// app/src/main/engine/uploads/sample-bell.qasm
OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[4] c;

h q[0];
for int i in [1:3] {
    cx q[0], q[i];
}
rz(0.4) q[1];
rz(0.4) q[2];

c = measure q;
```

- [ ] **Step 2: Write an intentionally invalid sample**

```qasm
// app/src/main/engine/uploads/bad-sample.qasm
OPENQASM 3.0;
this is not valid openqasm at all !!!
```

- [ ] **Step 3: Write the test**

```typescript
// app/src/main/engine/uploadedProgram.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine";
import type { RunConfig } from "../../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function uploadConfig(filePath: string): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id: "b1a2c3d4-0000-4000-8000-000000000001",
    name: "upload test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "uploaded", filePath, format: "openqasm", addToLibrary: false },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("uploaded program end to end", () => {
  it("estimates a valid uploaded OpenQASM program", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(uploadConfig(path.join(__dirname, "uploads", "sample-bell.qasm")));
    expect(result.status).toBe("succeeded");
    expect(result.frontier!.length).toBeGreaterThan(0);
  }, 60000);

  it("fails soft with COMPILE_ERROR for a garbled uploaded program", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const result = await engine.run(uploadConfig(path.join(__dirname, "uploads", "bad-sample.qasm")));
    expect(result.status).toBe("failed");
    expect(["COMPILE_ERROR", "ESTIMATION_FAILED"]).toContain(result.error?.code);
  }, 60000);
});
```

- [ ] **Step 4: Run the tests**

Run: `cd app && npx vitest run src/main/engine/uploadedProgram.test.ts`
Expected: PASS, 2 tests. If the valid-upload test fails to compile, check the OpenQASM syntax against what `qdk.openqasm.import_openqasm` accepts (adjust `sample-bell.qasm` as needed) — do not weaken the test's assertions.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/engine/uploads/ app/src/main/engine/uploadedProgram.test.ts
git commit -m "Prove uploaded OpenQASM program works end to end, including bad-file fail-soft"
```

---

### Task 11: Robustness — concurrent runs, timeout tuning

**Files:**
- Test: `app/src/main/engine/robustness.test.ts`

**Interfaces:**
- Consumes: `QreEngine`.
- Produces: proof that two runs back-to-back (and concurrently) don't interfere.

- [ ] **Step 1: Write the test**

```typescript
// app/src/main/engine/robustness.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QreEngine } from "./qreEngine";
import type { RunConfig } from "../../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = path.join(__dirname, "python", ".venv", "bin", "python3");

function config(id: string, benchmarkId: string): RunConfig {
  return {
    schemaVersion: "1.0.0",
    id,
    name: "robustness test",
    createdAt: "2026-07-09T18:22:00Z",
    application: { type: "benchmark", benchmarkId },
    architecture: { type: "gateBased", errorRate: 0.0001, gateTime: 50, measurementTime: 100, twoQubitGateTime: null },
    qecCode: "surface_code",
    magicStateFactory: "round_based",
    traceTransform: { type: "psspc", tStatesPerRotation: 20, ccxMagicStates: false },
    maxError: 1,
    qreVersion: "qdk-qre-v1-fixture",
  };
}

describe("robustness", () => {
  it("runs two configs sequentially without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const r1 = await engine.run(config("11111111-1111-4111-8111-111111111111", "quantum-dynamics"));
    const r2 = await engine.run(config("22222222-2222-4222-8222-222222222222", "grovers-search"));
    expect(r1.runId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r2.runId).toBe("22222222-2222-4222-8222-222222222222");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");
  }, 90000);

  it("runs two configs concurrently without interference", async () => {
    const engine = new QreEngine(PYTHON_BIN);
    const [r1, r2] = await Promise.all([
      engine.run(config("33333333-3333-4333-8333-333333333333", "phase-estimation")),
      engine.run(config("44444444-4444-4444-8444-444444444444", "quantum-dynamics")),
    ]);
    expect(r1.runId).toBe("33333333-3333-4333-8333-333333333333");
    expect(r2.runId).toBe("44444444-4444-4444-8444-444444444444");
    expect(r1.status).toBe("succeeded");
    expect(r2.status).toBe("succeeded");
  }, 90000);
});
```

- [ ] **Step 2: Run the tests**

Run: `cd app && npx vitest run src/main/engine/robustness.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/engine/robustness.test.ts
git commit -m "Add concurrency/sequential-run robustness tests"
```

---

### Task 12: README, decision memo, full suite run

**Files:**
- Create: `app/src/main/engine/README.md`
- Create: `docs/week-2/team-3/route-decision-memo.md`
- Modify: `docs/week-2/team-3/week-2-team-3-checklist.md` (check off completed items)

**Interfaces:** none (documentation task).

- [ ] **Step 1: Write the engine module README**

```markdown
# QRE Engine module

`QreEngine implements EstimatorService` (contract types imported from
`app/src/shared/types.ts`, copied verbatim from `contracts/types.ts`).

## Route

**Route B — `qdk[qre]==1.29.1` Python subprocess**, per `docs/tech-stack.md`'s
primary-spike guidance. See `docs/week-2/team-3/route-decision-memo.md` for
full evidence and the Route A finding.

## Running the harness

```bash
app/src/main/engine/python/setup_venv.sh   # one-time: creates the Python venv
cd app && npm run test                      # runs all suites, including conformance.test.ts
```

The conformance harness (`app/src/main/engine/conformance.test.ts`) runs the
real engine against all 4 frozen `contracts/fixtures/runconfig.*.json`
fixtures and validates the emitted `RunResult` against
`contracts/runresult.schema.json` with Ajv.

## Benchmark list

All 5 starter benchmarks (`contracts/benchmarks.json`) have real Q# sources
under `app/src/main/engine/benchmarks/qsharp-project/src/`. Uploaded programs
(Q#/OpenQASM/QIR) are also supported — see `app/src/main/engine/uploadedProgram.test.ts`
for a worked OpenQASM example.

## Error codes

Canonical codes only, per `docs/data-contracts.md`: `INVALID_CONFIG`,
`COMPILE_ERROR`, `ESTIMATION_FAILED`, `TIMEOUT`, `ENGINE_CRASH`.

## Known gaps vs. the contract (flagged to PMs)

- `Majorana.operation_time` is not configurable in `qdk[qre]==1.29.1` — the
  package hardcodes 1000ns internally regardless of the value passed in
  `RunConfig.architecture.operationTime`. The invocation still carries the
  configured value for forward-compatibility, but it currently has no effect
  on the estimate.
- Contract appendix fields with no equivalent in this package version:
  `SOURCE`, `BLOCK_SIZE`, `BASE_SYSTEM_COST`, `SHOT_COST`, `COST_PER_QUBIT`,
  `COST_PER_HOUR`, `COST_PER_QUBIT_PER_HOUR`, `DATA_QUBIT_SPACING`. Not
  populated in `frontier[].additional`.
```

- [ ] **Step 2: Write the route decision memo**

```markdown
# Team 3 Route Decision Memo — Week 2

**Recommendation: Route B — `qdk[qre]==1.29.1` Python subprocess.**

## Evidence

Installed `qdk[qre]==1.29.1` in an isolated venv and ran real end-to-end
estimates (not samples/docs — actual executed code) covering:

- GateBased + Surface Code + Round-Based Factory + PSSPC (multi-row frontier,
  real qubit/runtime/error numbers captured).
- A rotation-heavy circuit exercising T-state factories (`factories={1028:
  FactoryResult(...)}`, confirmed `instruction_name(1028) == "T"`).
- Confirmed classes for every contract concept: `GateBased`, `Majorana`,
  `SurfaceCode`, `ThreeAux`, `RoundBasedFactory`, `Litinski19Factory`,
  `PSSPC`, `LatticeSurgery`, `QSharpApplication`, `OpenQASMApplication`,
  `QIRApplication` — near 1:1 with the contract's vocabulary.
- Confirmed `qreVersion` is runtime-readable via
  `importlib.metadata.version("qdk")` → `"1.29.1"`.
- Confirmed the property-key enum (`DISTANCE=0`, `LOGICAL_CYCLE_TIME=20`,
  `CODE_CYCLE_TIME=21`, `NUM_TS_PER_ROTATION=6`, etc.) matches
  `docs/data-contracts.md`'s 37-field appendix almost exactly.

Full working call:

```python
qdk.init(project_root="<q# project>")
table = qre.estimate(
    QSharpApplication(entry_expr="QuantumDynamics.Main()"),
    GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
    SurfaceCode.q() * RoundBasedFactory.q(),
    PSSPC.q(),
    max_error=1.0,
)
```

## Route A (JS/WASM `qsharp-lang`) — light spike

[Fill in after running the Route A spike script; not part of this plan's
tasks. At minimum: does `qsharp-lang@1.29.1` expose an equivalent `qre`
estimation surface with factory/transform control? Document working code or
a specific documented failure.]

## Findings that affect the contract

1. `Majorana.operation_time` is not configurable in this package version —
   hardcoded to 1000ns. `RunConfig.architecture.operationTime` currently has
   no effect on Majorana estimates. **Question for PMs:** should the UI
   still expose this field, or should it be marked read-only/informational
   for Majorana until a package update exposes it?
2. Several appendix fields (`SOURCE`, `BLOCK_SIZE`, cost fields,
   `DATA_QUBIT_SPACING`) have no equivalent property key in
   `qdk[qre]==1.29.1`. They're simply absent from `frontier[].additional`
   rather than populated with placeholder values.
3. `DISTANCE` and `LOGICAL_CYCLE_TIME` are not in the flat `properties` dict
   the package returns — they live on the QEC transform's instruction node
   in the result's provenance graph and had to be extracted by walking it.
   `logicalCycleTime` is derived as `distance * code_cycle_time`; this
   matches the numbers in `contracts/fixtures/runresult.success.json`
   (proportionally) but should be double-checked against Microsoft's
   published tutorial numbers per the technical brief's cross-config sanity
   check.

## Packaging implications (Route B)

Bundling a Python 3.13 runtime + `qdk[qre]` into a macOS/Windows Electron app
is heavier than an npm dependency — this is a real cost, deferred to Part 3/4
packaging work, but worth flagging now: options are (a) bundling a
self-contained Python distribution per platform, or (b) requiring a system
Python at install time. Not resolved in this memo; a Part 3/4 concern.
```

- [ ] **Step 3: Check off completed checklist items**

Open `docs/week-2/team-3/week-2-team-3-checklist.md` and check off every box now satisfied by this plan's work: engine adapter, input/output translation, failure mapping, conformance harness, all 5 benchmarks runnable, uploaded program proof, version capture, concurrent/sequential robustness, README.

- [ ] **Step 4: Run the full test suite one final time**

Run: `cd app && npm run test && npm run typecheck`
Expected: all suites pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/engine/README.md docs/week-2/team-3/route-decision-memo.md docs/week-2/team-3/week-2-team-3-checklist.md
git commit -m "Add engine README, route decision memo, and update week-2 checklist"
```

**>>> CHECKPOINT 5: hand off to Codex here — this is the pre-PR review. <<<**

---

## After all tasks

Push `week-2/team-3` and open a PR into `main` per `docs/engineering-workflow.md`. PR description should answer: what changed, how to verify it (`app/src/main/engine/python/setup_venv.sh && cd app && npm run test`), and which checklist items it advances.
