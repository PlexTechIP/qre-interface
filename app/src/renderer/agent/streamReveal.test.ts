import { describe, expect, it } from "vitest";

import {
  REVEAL_MAX_CPS,
  REVEAL_MIN_CPS,
  REVEAL_MAX_COMMIT_MS,
  REVEAL_MIN_COMMIT_MS,
  REVEAL_PARSE_BUDGET,
  REVEAL_PARSE_MS_PER_CHAR,
  REVEAL_TARGET_LATENCY_MS,
  charsToReveal,
  minCommitIntervalMs,
} from "./streamReveal";

const FRAME_MS = 1000 / 60;

/** Frames needed to clear a backlog that stops growing, at 60fps. */
function framesToDrain(backlog: number): number {
  let left = backlog;
  let frames = 0;
  while (left > 0 && frames < 100_000) {
    left -= charsToReveal(left, FRAME_MS);
    frames += 1;
  }
  return frames;
}

const drainMs = (backlog: number): number => framesToDrain(backlog) * FRAME_MS;

describe("charsToReveal", () => {
  it("reveals nothing when nothing is waiting", () => {
    expect(charsToReveal(0, FRAME_MS)).toBe(0);
    expect(charsToReveal(-5, FRAME_MS)).toBe(0);
  });

  it("never reveals more than has arrived", () => {
    for (const backlog of [1, 3, 17, 250, 9000]) {
      expect(charsToReveal(backlog, 500)).toBeLessThanOrEqual(backlog);
    }
  });

  it("always makes progress, so a tail cannot stall", () => {
    // Even a frame short enough to round to zero characters has to advance,
    // or the last few characters of a reply would never be shown.
    expect(charsToReveal(3, 0.01)).toBeGreaterThanOrEqual(1);
    expect(framesToDrain(3)).toBeLessThan(100);
  });

  /**
   * The property the whole design rests on.
   *
   * While text is arriving steadily the buffer settles at the point where the
   * reveal rate matches the arrival rate, and because the reveal rate is
   * proportional to the backlog, that settling point is the same *duration*
   * behind whatever the provider is doing — fast or slow. Constant lag is what
   * reads as smooth. The 60ms batch this replaces had no such property: it
   * painted whatever had arrived, so it moved in steps as uneven as the
   * network delivered them.
   */
  it("settles at the same lag whatever rate text arrives at", () => {
    const settledLagMs = (arrivalCps: number): number => {
      let backlog = 0;
      // Ten seconds is far past the ~320ms time constant, so this is settled.
      for (let frame = 0; frame < 600; frame += 1) {
        backlog += (arrivalCps * FRAME_MS) / 1000;
        backlog -= charsToReveal(backlog, FRAME_MS);
      }
      return (backlog / arrivalCps) * 1000;
    };

    // Spanning slow to fast providers: roughly 25 to 250 tokens/second.
    for (const cps of [100, 250, 400, 1000]) {
      expect(settledLagMs(cps)).toBeGreaterThan(REVEAL_TARGET_LATENCY_MS * 0.75);
      expect(settledLagMs(cps)).toBeLessThan(REVEAL_TARGET_LATENCY_MS * 1.25);
    }
  });

  /**
   * The rate is proportional to what is left, so the drain after delivery stops
   * is exponential and its tail is governed by the floor rather than the target.
   * It only has to finish promptly, which the floor guarantees.
   */
  it("finishes the tail promptly once delivery stops", () => {
    for (const backlog of [40, 120, 400]) {
      expect(drainMs(backlog)).toBeLessThan(1500);
    }
  });

  it("does not crawl through a huge burst", () => {
    // A reconnect can dump kilobytes at once. Typing that out at the target
    // latency's implied rate would take half a minute.
    const ms = drainMs(20_000);
    expect(ms).toBeLessThan(20_000 / REVEAL_MAX_CPS * 1000 * 1.4);
    expect(ms).toBeGreaterThan(REVEAL_TARGET_LATENCY_MS);
  });

  it("does not sprint through a trickle", () => {
    // A few characters should still read as arriving, not blink into place.
    expect(charsToReveal(4, FRAME_MS)).toBeLessThan(4);
  });

  it("stays inside its declared rate bounds", () => {
    const rate = (backlog: number): number => charsToReveal(backlog, 1000);
    expect(rate(1_000_000)).toBeLessThanOrEqual(REVEAL_MAX_CPS);
    // A backlog far under the floor rate is bounded by the backlog itself.
    expect(rate(10)).toBe(10);
    expect(rate(100_000)).toBeGreaterThanOrEqual(REVEAL_MIN_CPS);
  });
});

describe("minCommitIntervalMs", () => {
  it("paints every frame while the reply is short", () => {
    expect(minCommitIntervalMs(0)).toBe(REVEAL_MIN_COMMIT_MS);
    expect(minCommitIntervalMs(940)).toBe(REVEAL_MIN_COMMIT_MS);
  });

  it("backs off as the reply grows, so the parse stays inside its budget", () => {
    const long = minCommitIntervalMs(9440);
    expect(long).toBeGreaterThan(REVEAL_MIN_COMMIT_MS);
    // The whole point: parsing must not eat more than its share of the clock.
    const paintsPerSecond = 1000 / long;
    const parseMsPerSecond = paintsPerSecond * 9440 * REVEAL_PARSE_MS_PER_CHAR;
    expect(parseMsPerSecond).toBeLessThanOrEqual(1000 * REVEAL_PARSE_BUDGET + 1);
  });

  it("never gets slower than the fixed batch it replaced", () => {
    expect(minCommitIntervalMs(10_000_000)).toBe(REVEAL_MAX_COMMIT_MS);
  });

  it("rises monotonically with length", () => {
    const lengths = [0, 500, 2_000, 5_000, 20_000, 100_000];
    const intervals = lengths.map(minCommitIntervalMs);
    expect([...intervals].sort((a, b) => a - b)).toEqual(intervals);
  });
});
