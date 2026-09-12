// @vitest-environment node

/**
 * The three bounds, tested as rules rather than as timing.
 *
 * The clock is injected, so nothing here waits: a test about "six in a minute"
 * that actually spent a minute would be either slow or flaky, and would stop
 * being about the rule.
 */

import { describe, expect, it } from "vitest";

import { RunGate } from "./runBudget.js";

/** A clock the test moves by hand. */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Take a slot and give it straight back, as a handler's `finally` would. */
function runAndRelease(gate: RunGate): ReturnType<RunGate["admit"]> {
  const admission = gate.admit();
  if (admission.ok) admission.release();
  return admission;
}

describe("the session cap", () => {
  it("refuses the run after the last one it allows, and says restarting is the reset", () => {
    const gate = new RunGate({ maxPerSession: 50, maxPerMinute: 1000 });

    for (let i = 0; i < 50; i += 1) {
      expect(runAndRelease(gate).ok).toBe(true);
    }

    const refused = gate.admit();
    expect(refused.ok).toBe(false);
    if (refused.ok || refused.code !== "RUN_BUDGET_EXCEEDED") {
      throw new Error("expected a budget refusal");
    }
    expect(refused.scope).toBe("session");
    // Nothing reopens it; saying "try again in N ms" would be a lie.
    expect(refused.retryAfterMs).toBeNull();
    expect(refused.message).toMatch(/restart the client/i);
  });
});

describe("the rate window", () => {
  it("refuses the sixth in a minute and says how long the window has left", () => {
    const clock = fakeClock();
    const gate = new RunGate({ maxPerMinute: 5, now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      expect(runAndRelease(gate).ok).toBe(true);
      clock.advance(1_000);
    }

    const refused = gate.admit();
    if (refused.ok || refused.code !== "RUN_BUDGET_EXCEEDED") {
      throw new Error("expected a budget refusal");
    }
    expect(refused.scope).toBe("minute");
    // The oldest admission was five ticks ago; the window clears 60 s after it.
    expect(refused.retryAfterMs).toBe(60_000 - 5_000);
  });

  it("admits again once the oldest admission has left the window", () => {
    const clock = fakeClock();
    const gate = new RunGate({ maxPerMinute: 5, now: clock.now });

    for (let i = 0; i < 5; i += 1) runAndRelease(gate);
    expect(gate.admit().ok).toBe(false);

    clock.advance(60_001);

    expect(runAndRelease(gate).ok).toBe(true);
  });

  it("does not charge a refusal against the budget", () => {
    // A client retrying at 1 Hz against a full window would otherwise keep the
    // window permanently full and the gate permanently shut.
    const clock = fakeClock();
    const gate = new RunGate({ maxPerSession: 50, maxPerMinute: 2, now: clock.now });

    runAndRelease(gate);
    runAndRelease(gate);
    for (let i = 0; i < 10; i += 1) expect(gate.admit().ok).toBe(false);

    expect(gate.snapshot()).toMatchObject({ sessionCount: 2, lastMinute: 2 });

    clock.advance(60_001);
    expect(runAndRelease(gate).ok).toBe(true);
  });
});

describe("the queue", () => {
  it("is exactly one deep: the third concurrent caller is refused as busy", () => {
    const gate = new RunGate();

    const first = gate.admit();
    const second = gate.admit();
    const third = gate.admit();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected the second to queue");
    expect(second.queued).toBe(true);

    expect(third.ok).toBe(false);
    if (third.ok) throw new Error("expected a refusal");
    expect(third.code).toBe("RUN_BUSY");
  });

  it("hands the slot to the waiter when the run ahead of it releases", async () => {
    const gate = new RunGate();

    const first = gate.admit();
    const second = gate.admit();
    if (!first.ok || !second.ok) throw new Error("expected two admissions");

    let started = false;
    const waiting = second.ready.then(() => {
      started = true;
    });

    // Still held: the waiter must not start while the first run is going.
    await Promise.resolve();
    expect(started).toBe(false);

    first.release();
    await waiting;
    expect(started).toBe(true);
    // The slot moved across rather than passing through free, so a caller that
    // arrives now still sees a run in progress.
    expect(gate.snapshot()).toMatchObject({ running: true, waiting: false });
  });

  it("treats a second release as the no-op a duplicate `finally` needs it to be", () => {
    const gate = new RunGate();

    const first = gate.admit();
    if (!first.ok) throw new Error("expected an admission");
    first.release();
    first.release();

    expect(gate.snapshot()).toMatchObject({ running: false, waiting: false });
    // And the slot is genuinely free rather than doubly free.
    const next = gate.admit();
    if (!next.ok) throw new Error("expected an admission");
    expect(next.queued).toBe(false);
  });

  it("charges a queued admission to the budget, because it will run", () => {
    const clock = fakeClock();
    const gate = new RunGate({ maxPerMinute: 5, now: clock.now });

    gate.admit();
    gate.admit();

    expect(gate.snapshot()).toMatchObject({ sessionCount: 2, lastMinute: 2 });
  });
});
