import { describe, expect, it } from "vitest";

import { nextRerunName } from "./rerun";

describe("nextRerunName", () => {
  it("appends (1) to a name with no suffix", () => {
    expect(nextRerunName("test")).toBe("test(1)");
  });

  it("bumps an existing (n) suffix", () => {
    expect(nextRerunName("test(1)")).toBe("test(2)");
    expect(nextRerunName("test(2)")).toBe("test(3)");
    expect(nextRerunName("test(9)")).toBe("test(10)");
  });

  it("chains across successive reruns", () => {
    let name = "run";
    name = nextRerunName(name);
    expect(name).toBe("run(1)");
    name = nextRerunName(name);
    expect(name).toBe("run(2)");
    name = nextRerunName(name);
    expect(name).toBe("run(3)");
  });

  it("only treats a trailing (digits) group as the counter", () => {
    // Parenthesised text mid-name is not a counter.
    expect(nextRerunName("plan (draft)")).toBe("plan (draft)(1)");
    // Nested suffixes bump only the outermost trailing counter.
    expect(nextRerunName("test(1)(2)")).toBe("test(1)(3)");
  });

  it("handles an empty base before the counter", () => {
    expect(nextRerunName("(3)")).toBe("(4)");
  });
});
