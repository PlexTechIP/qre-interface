// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  buildFailedResult,
  buildFrontierRow,
  buildRunConfig,
  buildRunResult,
  buildSuccessResult,
} from "../../shared/testing/builders";
import { describeRunForAgent } from "./agentRunReport";

describe("describeRunForAgent — a run that failed", () => {
  const config = buildRunConfig({ name: "(agent) Grover search" });

  it("hands the model the error it has no other way to see", () => {
    const result = buildRunResult({
      status: "failed",
      error: { code: "ENGINE_CRASH", message: "The engine exited unexpectedly." },
      frontier: null,
    });

    const message = describeRunForAgent(config, result);

    expect(message).toContain("failed");
    expect(message).toContain("(agent) Grover search");
    expect(message).toContain("ENGINE_CRASH");
    expect(message).toContain("The engine exited unexpectedly.");
    expect(message).toMatch(/what should I change/i);
  });

  it("says so plainly when the engine reported no detail", () => {
    const result = buildRunResult({ status: "failed", error: null, frontier: null });

    expect(describeRunForAgent(config, result)).toContain("no error detail");
  });

  it("works on the shared failure fixture", () => {
    expect(describeRunForAgent(config, buildFailedResult())).toContain("failed");
  });
});

describe("describeRunForAgent — a run that succeeded", () => {
  const config = buildRunConfig({ name: "(agent) Grover search" });

  /**
   * A frontier has no "the" answer, so reporting one row would be this function
   * inventing a ranking the engine deliberately did not supply. The span
   * between its cheapest and largest point is what the frontier actually says.
   */
  it("reports the frontier as a range", () => {
    const result = buildRunResult({
      status: "succeeded",
      error: null,
      frontier: [
        buildFrontierRow({
          physicalQubits: { value: 4_200_000, unit: "qubits", display: "4.2M" },
        }),
        buildFrontierRow({
          physicalQubits: { value: 1_100_000, unit: "qubits", display: "1.1M" },
        }),
      ],
    });

    const message = describeRunForAgent(config, result);

    expect(message).toContain("2 frontier points");
    expect(message).toContain("from 1.1M to 4.2M");
    expect(message).toMatch(/what would you change/i);
  });

  it("does not say 'from X to X' for a single point", () => {
    const result = buildRunResult({
      status: "succeeded",
      error: null,
      frontier: [
        buildFrontierRow({
          physicalQubits: { value: 1_100_000, unit: "qubits", display: "1.1M" },
          runtime: { value: 6, unit: "hours", display: "6 hours" },
        }),
      ],
    });

    const message = describeRunForAgent(config, result);

    expect(message).toContain("One frontier point");
    expect(message).toContain("1.1M physical qubits");
    expect(message).toContain("6 hours");
    expect(message).not.toContain("from");
  });

  it("survives a success that carried no frontier at all", () => {
    const result = buildRunResult({ status: "succeeded", error: null, frontier: [] });

    expect(describeRunForAgent(config, result)).toContain("no frontier points");
  });

  it("works on the shared success fixture", () => {
    expect(describeRunForAgent(config, buildSuccessResult())).toContain("successfully");
  });
});

/**
 * The model proposed this configuration earlier in the same conversation, and
 * the transcript replays it on every turn. Restating it would spend tokens
 * telling the model what it already said — and would be WRONG the moment the
 * analyst edited a field before running.
 */
describe("describeRunForAgent — what it deliberately leaves out", () => {
  it("does not restate the configuration", () => {
    const config = buildRunConfig({ name: "(agent) Grover search" });
    const message = describeRunForAgent(config, buildSuccessResult());

    expect(message).not.toContain(config.id);
    expect(message).not.toContain("architecture");
    expect(message).not.toContain("maxError");
  });
});
