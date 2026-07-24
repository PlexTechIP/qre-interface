const fs = require("node:fs");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");

const bundle = path.join(
  __dirname,
  "vendor-extension-fallback",
  "qsharp-compiler-bundle.cjs",
);
const wasm = new WebAssembly.Module(
  fs.readFileSync(
    path.join(__dirname, "vendor-extension-fallback", "qsc_wasm_bg.wasm"),
  ),
);
const bootstrap = `
  const { parentPort } = require("node:worker_threads");
  globalThis.WorkerSelf = {
    postMessage(message) { parentPort.postMessage(message); },
    onMessage(handler) { parentPort.on("message", data => handler({ data })); }
  };
  const qsharp = require(${JSON.stringify(bundle)});
  qsharp.createWorker(qsharp.compilerProtocol);
`;
const worker = new Worker(bootstrap, { eval: true });

const source = `
namespace RouteAWorkerSpike {
    operation Work(width : Int, layers : Int) : Unit {
        use qs = Qubit[width];
        for _ in 1..layers {
            for q in qs { H(q); T(q); }
        }
        ResetAll(qs);
    }
}
`;

let ticks = 0;
const ticker = setInterval(() => ticks++, 10);
const start = performance.now();

worker.on("error", (error) => {
  clearInterval(ticker);
  console.error(error);
  process.exitCode = 1;
});
worker.on("message", (message) => {
  if (message.messageType !== "response") return;
  clearInterval(ticker);
  const report = {
    elapsedMs: performance.now() - start,
    tenMsTimerTicksOnMainThread: ticks,
    responseSuccess: message.result.success,
  };
  fs.writeFileSync(
    path.join(__dirname, "output-samples", "worker-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  worker.terminate();
});

worker.postMessage({ type: "init", wasmModule: wasm, qscLogLevel: 0 });
worker.postMessage({
  type: "getEstimates",
  args: [
    {
      sources: [["worker.qs", source]],
      languageFeatures: [],
      projectType: "qsharp",
    },
    "RouteAWorkerSpike.Work(64, 10000)",
    JSON.stringify([{}]),
  ],
});
