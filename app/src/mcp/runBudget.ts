/**
 * How much of the analyst's machine an agent may spend.
 *
 * `qre_run_estimate` spawns Python and can hold a CPU for two minutes. A model
 * in a loop — retrying a failure it misread, or sweeping a parameter it decided
 * to sweep — is not a hypothetical failure mode, and the analyst is not
 * watching. So the tool is bounded three ways, and all three live here because
 * a budget spread across a handler is a budget nobody can read off:
 *
 *  - one engine subprocess at a time, because two estimates on one laptop are
 *    slower than two in sequence;
 *  - a queue of exactly ONE waiter, so a caller that arrives during a run is
 *    served rather than refused, and a third is refused rather than left
 *    holding an unbounded wait;
 *  - a rate and a session total, which are what a runaway loop actually hits.
 *
 * Pure and injectable-clocked, so the tests are about the rules rather than
 * about timers.
 */

export interface RunGateOptions {
  /** Total runs this server process will admit before the client must restart. */
  maxPerSession?: number;
  /** Runs admitted in any `windowMs`. */
  maxPerMinute?: number;
  windowMs?: number;
  now?: () => number;
}

export type Admission =
  | {
      ok: true;
      /** Resolves when the engine slot is free. Already resolved when it was. */
      ready: Promise<void>;
      /** Give the slot back. Idempotent; safe in a `finally`. */
      release: () => void;
      /** Whether this call had to wait for the run ahead of it. */
      queued: boolean;
    }
  | { ok: false; code: "RUN_BUSY"; message: string }
  | {
      ok: false;
      code: "RUN_BUDGET_EXCEEDED";
      message: string;
      scope: "session" | "minute";
      /** When the window will admit again; null for the session cap, which never reopens. */
      retryAfterMs: number | null;
    };

const DEFAULT_MAX_PER_SESSION = 50;
const DEFAULT_MAX_PER_MINUTE = 5;
const DEFAULT_WINDOW_MS = 60_000;

export class RunGate {
  private readonly maxPerSession: number;
  private readonly maxPerMinute: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  private sessionCount = 0;
  /** Admission times inside the window, oldest first. */
  private admissions: number[] = [];
  private running = false;
  /** The one waiter's resolver, or null when nobody is queued. */
  private waiter: (() => void) | null = null;

  constructor(options: RunGateOptions = {}) {
    this.maxPerSession = options.maxPerSession ?? DEFAULT_MAX_PER_SESSION;
    this.maxPerMinute = options.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Ask for a slot.
   *
   * Check order is session cap, then rate, then the slot — cheapest and most
   * final first, so a client that has exhausted its session is told that rather
   * than being told to try again after a run that will not help it.
   *
   * Budget is charged on ADMISSION, including an admission that queues. A
   * refusal costs nothing, which is what keeps a client that is being refused
   * from digging itself deeper: retrying at 1 Hz against a full minute window
   * would otherwise keep the window permanently full and the gate permanently
   * shut.
   */
  admit(): Admission {
    if (this.sessionCount >= this.maxPerSession) {
      return {
        ok: false,
        code: "RUN_BUDGET_EXCEEDED",
        scope: "session",
        retryAfterMs: null,
        message:
          `This server session has already run ${this.maxPerSession} estimates, which is its limit. ` +
          "Stop and restart the client to reset it, or run the estimate in the dashboard.",
      };
    }

    const now = this.now();
    this.admissions = this.admissions.filter(
      (at) => now - at < this.windowMs,
    );
    if (this.admissions.length >= this.maxPerMinute) {
      const oldest = this.admissions[0] ?? now;
      return {
        ok: false,
        code: "RUN_BUDGET_EXCEEDED",
        scope: "minute",
        retryAfterMs: oldest + this.windowMs - now,
        message:
          `No more than ${this.maxPerMinute} estimates may be started per minute. ` +
          "Wait for the window to clear, or stop and restart the client to reset the session budget.",
      };
    }

    if (this.running && this.waiter !== null) {
      return {
        ok: false,
        code: "RUN_BUSY",
        message:
          "An estimate is already running and another is waiting for it. " +
          "Try again after the current run finishes.",
      };
    }

    this.sessionCount += 1;
    this.admissions.push(now);

    if (!this.running) {
      this.running = true;
      return { ok: true, ready: Promise.resolve(), release: this.releaser(), queued: false };
    }

    const ready = new Promise<void>((resolve) => {
      this.waiter = resolve;
    });
    return { ok: true, ready, release: this.releaser(), queued: true };
  }

  /**
   * One release per admission, and only the first call counts.
   *
   * A handler releases in a `finally`, and the same `finally` can run twice in
   * the shapes an error path takes; a second release that handed the slot on
   * would let two engines run at once, which is the one thing this exists to
   * prevent.
   */
  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.handOver();
    };
  }

  /**
   * Pass the slot to the waiter, or leave it free.
   *
   * The waiter is cleared and resolved in the same synchronous step, so no
   * `admit()` can observe a state where the slot is running with nobody in it
   * and a waiter still queued.
   */
  private handOver(): void {
    const next = this.waiter;
    this.waiter = null;
    if (next === null) {
      this.running = false;
      return;
    }
    // `running` stays true: the slot moves from this run to the next one
    // without passing through free.
    next();
  }

  /** What the gate would say right now, for logging and tests. */
  snapshot(): {
    running: boolean;
    waiting: boolean;
    sessionCount: number;
    lastMinute: number;
  } {
    const now = this.now();
    return {
      running: this.running,
      waiting: this.waiter !== null,
      sessionCount: this.sessionCount,
      lastMinute: this.admissions.filter((at) => now - at < this.windowMs).length,
    };
  }
}
