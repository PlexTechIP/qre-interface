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
