const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const vendorDir = path.join(__dirname, "vendor-extension-fallback");
const { Compiler, initSync, qsc_wasm_exports } = require(path.join(
  vendorDir,
  "qsharp-compiler-bundle.cjs",
));

const wasmBytes = fs.readFileSync(path.join(vendorDir, "qsc_wasm_bg.wasm"));
initSync({ module: wasmBytes });
const compiler = new Compiler(qsc_wasm_exports);

const qsharp = `
namespace RouteASpike {
    operation Work(width : Int, layers : Int) : Unit {
        use qs = Qubit[width];
        for _ in 1..layers {
            for q in qs {
                H(q);
                T(q);
            }
        }
        ResetAll(qs);
    }
}
`;

const qsharpProgram = {
  sources: [["spike.qs", qsharp]],
  languageFeatures: [],
  projectType: "qsharp",
};

function parseResult(raw) {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function estimate(label, program, expression, params) {
  const start = performance.now();
  try {
    const raw = await compiler.getEstimates(
      program,
      expression,
      JSON.stringify(Array.isArray(params) ? params : [params]),
    );
    const elapsedMs = performance.now() - start;
    const parsed = parseResult(raw);
    return { label, ok: true, elapsedMs, raw, parsed };
  } catch (error) {
    return {
      label,
      ok: false,
      elapsedMs: performance.now() - start,
      error: error?.stack || error?.message || String(error),
      diagnostics: error?.diagnostics,
    };
  }
}

async function main() {
  fs.mkdirSync(path.join(__dirname, "output-samples"), { recursive: true });

  const cases = [];
  cases.push(
    await estimate("qsharp-default", qsharpProgram, "RouteASpike.Work(8, 20)", {}),
  );
  cases.push(
    await estimate(
      "qsharp-gate-surface-max-error",
      qsharpProgram,
      "RouteASpike.Work(8, 20)",
      {
        qubitParams: { name: "qubit_gate_ns_e4" },
        qecScheme: { name: "surface_code" },
        errorBudget: 0.01,
      },
    ),
  );
  cases.push(
    await estimate(
      "qsharp-majorana-legacy",
      qsharpProgram,
      "RouteASpike.Work(8, 20)",
      {
        qubitParams: { name: "qubit_maj_ns_e6" },
        qecScheme: { name: "floquet_code" },
        errorBudget: 0.01,
      },
    ),
  );
  cases.push(
    await estimate(
      "qsharp-pareto-frontier",
      qsharpProgram,
      "RouteASpike.Work(32, 1000)",
      {
        qubitParams: { name: "qubit_gate_ns_e4" },
        qecScheme: { name: "surface_code" },
        errorBudget: 0.01,
        estimateType: "frontier",
      },
    ),
  );
  cases.push(
    await estimate(
      "contract-model-names",
      qsharpProgram,
      "RouteASpike.Work(8, 20)",
      {
        architecture: { name: "Majorana" },
        qecScheme: { name: "ThreeAux" },
        factory: { name: "Litinski19Factory" },
        trace: { transforms: ["PSSPC", "LatticeSurgery"] },
        maxError: 0.01,
      },
    ),
  );

  const openqasm = `
OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
h q[0];
cx q[0], q[1];
t q[1];
reset q;
`;
  cases.push(
    await estimate(
      "openqasm",
      {
        sources: [["spike.qasm", openqasm]],
        languageFeatures: [],
        projectType: "openqasm",
      },
      "",
      {},
    ),
  );

  cases.push(
    await estimate(
      "qir-as-input",
      {
        sources: [["spike.ll", "; ModuleID = 'route-a-spike'\ndefine void @main() { ret void }"]],
        languageFeatures: [],
        projectType: "qir",
      },
      "main",
      {},
    ),
  );

  let timerFiredAt;
  const timerStart = performance.now();
  const timer = new Promise((resolve) =>
    setTimeout(() => {
      timerFiredAt = performance.now();
      resolve();
    }, 0),
  );
  const heavy = await estimate(
    "qsharp-heavy-main-thread",
    qsharpProgram,
    "RouteASpike.Work(64, 10000)",
    {},
  );
  await timer;
  heavy.zeroDelayTimerDelayMs = timerFiredAt - timerStart;
  cases.push(heavy);

  for (const item of cases) {
    if (item.ok) {
      const filename = `${item.label}.json`;
      fs.writeFileSync(path.join(__dirname, "output-samples", filename), item.raw);
    }
  }
  const report = {
    node: process.version,
    wasmBytes: wasmBytes.length,
    source: "Official QDK VS Code extension 1.29.1 fallback bundle",
    cases: cases.map(({ raw, ...item }) => item),
  };
  fs.writeFileSync(
    path.join(__dirname, "output-samples", "probe-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
