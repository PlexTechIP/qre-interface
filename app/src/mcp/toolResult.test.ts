// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  boundedText,
  capText,
  escapeControlChars,
  redactPaths,
} from "./toolResult.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("capText", () => {
  it("counts Unicode code points rather than UTF-16 units", () => {
    // Ten astral code points, twenty UTF-16 units. A cap of ten should keep
    // all ten rather than cutting the string in half.
    const rockets = "\u{1F680}".repeat(10);

    expect(capText(rockets, 10)).toBe(rockets);
  });

  it("never leaves a broken surrogate pair behind", () => {
    const capped = capText("\u{1F680}".repeat(10), 5);

    // A well-formed pair is two surrogates, so the defect is a surrogate
    // WITHOUT its partner — that is what renders as U+FFFD downstream.
    const loneSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(capped).not.toMatch(loneSurrogate);
  });

  it("keeps its own promise about length", () => {
    const capped = capText("\u{1F680}".repeat(10), 5);

    expect([...capped].length).toBeLessThanOrEqual(5);
  });

  it("does not return more than was asked for at tiny caps", () => {
    expect([...capText("abcdef", 1)].length).toBeLessThanOrEqual(1);
    expect([...capText("abcdef", 0)].length).toBeLessThanOrEqual(0);
  });

  it("leaves text that already fits completely alone", () => {
    expect(capText("shor 2048", 200)).toBe("shor 2048");
  });
});

describe("escapeControlChars", () => {
  it("is idempotent, so escaping twice cannot double-escape", () => {
    const once = escapeControlChars(`a${ESC}[2Jb`);

    expect(escapeControlChars(once)).toBe(once);
  });
});

describe("boundedText", () => {
  it("honours the cap even when escaping expands the text fourfold", () => {
    // Escaping turns each control character into four visible characters, so
    // capping first and escaping second overruns every documented bound.
    const bounded = boundedText(BEL.repeat(500), 200);

    expect([...bounded].length).toBeLessThanOrEqual(200);
  });

  it("still escapes the control characters it keeps", () => {
    const bounded = boundedText(`name${ESC}[2J`, 200);

    // eslint-disable-next-line no-control-regex
    expect(bounded).not.toMatch(/[\x00-\x1F\x7F]/);
  });
});

describe("redactPaths", () => {
  it("removes an absolute POSIX path", () => {
    const redacted = redactPaths(
      "Engine process exited with code 1. stderr: File \"/Users/analyst/app/.venv/lib/python3.13/qsharp.py\", line 8",
    );

    expect(redacted).not.toContain("/Users/analyst");
    expect(redacted).not.toContain(".venv");
  });

  it("removes a Windows path", () => {
    const redacted = redactPaths(
      "could not open C:\\Users\\analyst\\AppData\\run-history.sqlite",
    );

    expect(redacted).not.toContain("C:\\Users");
  });

  it("leaves ordinary prose alone", () => {
    const prose = "Increase the error budget and/or the code distance (see 1/2).";

    expect(redactPaths(prose)).toBe(prose);
  });
});
