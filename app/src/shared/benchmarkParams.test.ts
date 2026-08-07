import { describe, expect, it } from "vitest";

import {
  BENCHMARK_PARAMS,
  buildBenchmarkEntryExpr,
  defaultBenchmarkParameters,
} from "./benchmarkParams";
import { BENCHMARK_IDS } from "./types";

describe("benchmark parameter specs", () => {
  it("covers every frozen benchmark id", () => {
    expect(Object.keys(BENCHMARK_PARAMS).sort()).toEqual([...BENCHMARK_IDS].sort());
  });

  it("gives every benchmark at least one argument its entry operation takes", () => {
    for (const id of BENCHMARK_IDS) {
      const passed = BENCHMARK_PARAMS[id].filter((p) => p.kind !== "computed");
      expect(passed.length).toBeGreaterThan(0);
    }
  });
});

describe("buildBenchmarkEntryExpr", () => {
  it("passes the spec defaults when the config records no parameters", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", undefined);
    expect(result).toEqual({
      ok: true,
      entryExpr: "QuantumDynamics.Run(10, 10, 30.0, 0.9, 1.0, 1.0)",
    });
  });

  it("passes the recorded values in the entry operation's argument order", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      latticeN1: 4,
      latticeN2: 7,
      totalTime: 12.5,
      trotterStep: 0.25,
      couplingJ: -1.5,
      fieldG: 2.0,
    });
    expect(result).toEqual({
      ok: true,
      entryExpr: "QuantumDynamics.Run(4, 7, 12.5, 0.25, -1.5, 2.0)",
    });
  });

  it("renders a whole-numbered Double with a decimal point, which Q# requires", () => {
    // Q# rejects `Run(..., 30, ...)` for a Double parameter with
    // Qsc.TypeCk.TyMismatch — the literal must be `30.0`.
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      latticeN1: 2,
      latticeN2: 2,
      totalTime: 30,
      trotterStep: 1,
      couplingJ: 3,
      fieldG: -4,
    });
    expect(result).toEqual({
      ok: true,
      entryExpr: "QuantumDynamics.Run(2, 2, 30.0, 1.0, 3.0, -4.0)",
    });
  });

  it("falls back to the spec default for a single omitted parameter", () => {
    // toRunConfig drops a field the user cleared; absence means "engine default".
    const result = buildBenchmarkEntryExpr("shors-factoring", { bitSize: 64 });
    expect(result).toEqual({
      ok: true,
      entryExpr: "ShorsFactoring.Run(64, 11)",
    });
  });

  it("maps a choice value onto its numeric literal", () => {
    const result = buildBenchmarkEntryExpr("ekera-hastad-factoring", {
      rsaInstance: "rsa-2048",
      generator: 7,
    });
    expect(result).toEqual({
      ok: true,
      entryExpr: "EkeraHastadFactoring.Run(2048, 7)",
    });
  });

  it("omits computed parameters, which the Q# operation derives itself", () => {
    const result = buildBenchmarkEntryExpr("grovers-search", {
      searchQubits: 5,
      iterations: 999,
    });
    expect(result).toEqual({ ok: true, entryExpr: "GroversSearch.Run(5)" });
  });

  it("rejects an unknown benchmark id", () => {
    const result = buildBenchmarkEntryExpr("not-a-benchmark", {});
    expect(result.ok).toBe(false);
  });
});

describe("buildBenchmarkEntryExpr rejects values it cannot emit safely", () => {
  it("rejects a choice value outside the allowed set instead of interpolating it", () => {
    // parameters arrives as free-form JSON; an unrecognised string must never
    // reach the entry expression, where it would be compiled as Q# source.
    const result = buildBenchmarkEntryExpr("ekera-hastad-factoring", {
      rsaInstance: "rsa-100); DumpMachine(); (",
      generator: 7,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("RSA Instance");
  });

  it("rejects a string where a number is expected", () => {
    const result = buildBenchmarkEntryExpr("shors-factoring", {
      bitSize: "31",
      generator: 11,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Bit Size");
  });

  it("rejects a non-integer for an integer parameter", () => {
    const result = buildBenchmarkEntryExpr("shors-factoring", { bitSize: 31.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("whole number");
  });

  it("rejects an integer parameter below its minimum", () => {
    const result = buildBenchmarkEntryExpr("shors-factoring", { bitSize: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("at least 2");
  });

  it("rejects a non-finite number", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      totalTime: Number.POSITIVE_INFINITY,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a Double at its exclusive minimum", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", { totalTime: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("greater than 0");
  });

  it("rejects a Trotter Step larger than Total Time", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      totalTime: 5,
      trotterStep: 6,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Trotter Step");
  });
});

describe("defaultBenchmarkParameters", () => {
  it("returns every editable parameter's default", () => {
    expect(defaultBenchmarkParameters("shors-factoring")).toEqual({
      bitSize: 31,
      generator: 11,
    });
  });

  it("builds the same entry expression as recording nothing at all", () => {
    for (const id of BENCHMARK_IDS) {
      expect(buildBenchmarkEntryExpr(id, defaultBenchmarkParameters(id))).toEqual(
        buildBenchmarkEntryExpr(id, undefined),
      );
    }
  });
});

describe("every integer parameter is bounded", () => {
  it("declares a finite max, so no value can overflow the Q# it feeds", () => {
    // Unbounded ints are the root cause of three separate silent-wrong-answer
    // bugs: Grover's iteration count, Phase Estimation's 1 <<< i, and the
    // Trotter step count. A max is what makes them unreachable.
    for (const id of BENCHMARK_IDS) {
      for (const param of BENCHMARK_PARAMS[id]) {
        if (param.kind !== "int") continue;
        expect(Number.isFinite(param.max)).toBe(true);
        expect(param.max).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it("emits every in-range integer as a plain decimal literal", () => {
    // String(1e21) is "1e+21", which Q# rejects as an Int literal. Bounding the
    // params keeps every emittable value in plain decimal.
    for (const id of BENCHMARK_IDS) {
      for (const param of BENCHMARK_PARAMS[id]) {
        if (param.kind !== "int") continue;
        for (const value of [param.min, param.default, param.max]) {
          expect(String(value)).toMatch(/^-?\d+$/);
        }
      }
    }
  });
});

describe("bounds that stop an overflow becoming a wrong answer", () => {
  it("rejects a Grover search width whose iteration count would overflow", () => {
    // Round(PI()/4 * 2^(n/2)) exceeds Int64 above ~126 qubits and collapses to
    // 1, so the engine used to return a fast, confident, 19-orders-of-magnitude
    // wrong estimate. Verified against the compiler: n=200 traced 1 iteration.
    const result = buildBenchmarkEntryExpr("grovers-search", { searchQubits: 200 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Search Qubits");
  });

  it("accepts the largest search width that still computes honestly", () => {
    const result = buildBenchmarkEntryExpr("grovers-search", { searchQubits: 63 });
    expect(result).toEqual({ ok: true, entryExpr: "GroversSearch.Run(63)" });
  });

  it("rejects a precision whose controlled-unitary power would overflow", () => {
    // ControlledUnitary(1 <<< i, ...) overflows Int64 at i = 63.
    const result = buildBenchmarkEntryExpr("phase-estimation", { precision: 64 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Precision");
  });

  it("accepts the largest precision that keeps 1 <<< i in range", () => {
    const result = buildBenchmarkEntryExpr("phase-estimation", {
      precision: 63,
      registerSize: 3,
    });
    expect(result).toEqual({ ok: true, entryExpr: "PhaseEstimation.Run(63, 3)" });
  });

  it("rejects an integer too large to write as a Q# Int literal", () => {
    // Number.isInteger(1e21) is true and String() yields "1e+21", which the Q#
    // compiler rejects with a type error rather than the intended INVALID_CONFIG.
    const result = buildBenchmarkEntryExpr("shors-factoring", { bitSize: 1e21 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Bit Size");
  });

  it("rejects a Total Time whose Trotter step count would overflow", () => {
    // Ceiling(totalTime / trotterStep) overflows Int64 past ~9.2e18 and
    // MaxI(1, ...) then reports a ONE-step evolution. Verified against the
    // compiler: totalTime 1e19 / step 1.0 traced 1 step.
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      totalTime: 1e19,
      trotterStep: 1.0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Total Time");
  });

  it("rejects a Trotter step so small the step count would overflow", () => {
    const result = buildBenchmarkEntryExpr("quantum-dynamics", {
      totalTime: 1.0,
      trotterStep: 1e-25,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Trotter Step");
  });

  it("keeps the worst in-range Trotter step count inside Int64", () => {
    const params = BENCHMARK_PARAMS["quantum-dynamics"];
    const totalTime = params.find((p) => p.key === "totalTime");
    const trotterStep = params.find((p) => p.key === "trotterStep");
    if (totalTime?.kind !== "double" || trotterStep?.kind !== "double") {
      throw new Error("expected both to be double params");
    }
    const worstCaseSteps = totalTime.max! / trotterStep.min!;
    expect(worstCaseSteps).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
