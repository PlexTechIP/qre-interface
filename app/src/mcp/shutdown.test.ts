// @vitest-environment node

/**
 * Leaving has an order, and the old one was wrong.
 *
 * Every exit path called `closeRunStore()` and then `process.exit()` on the
 * same tick. stdout is a pipe, so its writes are asynchronous: a response
 * already handed to the transport could be cut in half, and a handler still
 * awaiting `store.get()` had its database closed underneath it. The promises
 * returned by `transport.close()` and `server.close()` were discarded with
 * `void` and never got a tick to run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetShutdownForTests, shutdown } from "./shutdown.js";

function deps(overrides: Partial<Parameters<typeof shutdown>[1]> = {}) {
  const order: string[] = [];
  const base = {
    server: {
      close: async () => {
        order.push("server");
      },
    },
    transport: {
      close: async () => {
        order.push("transport");
      },
    },
    closeStore: () => {
      order.push("store");
    },
    flush: async () => {
      order.push("flush");
    },
    exit: () => {
      order.push("exit");
    },
  };
  return { order, dependencies: { ...base, ...overrides } };
}

beforeEach(() => {
  resetShutdownForTests();
});

describe("shutdown", () => {
  it("stops the server before closing the database it is reading", async () => {
    // server.close() is what waits for in-flight requests, so the store must
    // outlive it — otherwise a pending handler loses its connection mid-read.
    const { order, dependencies } = deps();

    await shutdown(0, dependencies);

    expect(order).toEqual(["server", "transport", "store", "flush", "exit"]);
  });

  it("does not exit until the protocol stream has drained", async () => {
    let released: (() => void) | undefined;
    const { order, dependencies } = deps({
      flush: () =>
        new Promise<void>((resolve) => {
          released = () => {
            order.push("flush");
            resolve();
          };
        }),
    });

    const finished = shutdown(0, dependencies);
    await new Promise((resolve) => setImmediate(resolve));

    expect(order).not.toContain("exit");

    released?.();
    await finished;

    expect(order).toEqual(["server", "transport", "store", "flush", "exit"]);
  });

  it("passes the exit code through", async () => {
    const exit = vi.fn();
    const { dependencies } = deps({ exit });

    await shutdown(1, dependencies);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("leaves even when closing the server fails", async () => {
    // A crash path still has to release the database and flush what it can.
    const { order, dependencies } = deps({
      server: {
        close: async () => {
          throw new Error("already closed");
        },
      },
    });

    await shutdown(1, dependencies);

    expect(order).toEqual(["transport", "store", "flush", "exit"]);
  });

  it("leaves anyway when a close never settles", async () => {
    // An uncaught exception can leave the SDK mid-write, so `close()` is not
    // guaranteed to resolve. Exiting late is acceptable; never exiting is not.
    const exit = vi.fn();
    const { dependencies } = deps({
      server: { close: () => new Promise<void>(() => {}) },
      exit,
    });

    await shutdown(1, { ...dependencies, graceMs: 20 });

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits immediately on a second signal rather than ignoring it", async () => {
    // The one-shot latch must not remove the operator's escape hatch: a second
    // Ctrl-C while the first shutdown is stuck has to end the process.
    const exit = vi.fn();
    const { dependencies } = deps({
      server: { close: () => new Promise<void>(() => {}) },
      exit,
    });

    const first = shutdown(0, { ...dependencies, graceMs: 5000 });
    await new Promise((resolve) => setImmediate(resolve));
    await shutdown(0, { ...dependencies, graceMs: 5000 });

    expect(exit).toHaveBeenCalled();
    void first;
  });

  it("runs the sequence once even when signalled twice", async () => {
    const exit = vi.fn();
    const { order, dependencies } = deps({ exit });

    await shutdown(0, dependencies);
    await shutdown(0, dependencies);

    // Closed once; left twice, because the second signal must always land.
    expect(order.filter((step) => step === "server")).toHaveLength(1);
    expect(exit).toHaveBeenCalledTimes(2);
  });
});
