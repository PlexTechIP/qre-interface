// @vitest-environment node

import { describe, expect, it } from "vitest";
import { homedir } from "node:os";

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

/**
 * The paths the segment patterns alone did not reach.
 *
 * `POSIX_PATH` and `WINDOWS_PATH` enumerate the characters a path segment may
 * contain, and a real person's home directory routinely contains one outside
 * that set. Every case here leaked before: a surname survived as
 * `<path> Smith<path>`, a Windows path kept everything after its first space,
 * and a UNC share — which names an internal host as well as a directory — was
 * not matched at all.
 *
 * The vector is not hypothetical. A stored engine failure carries up to 2000
 * characters of raw Python stderr, `toRunDetail` returns it, and a traceback
 * spells its paths as `File "…", line 42`.
 */
describe("redactPaths on the shapes a real machine produces", () => {
  const leaks = [
    ["a home directory containing a space", "/Users/John Smith/Documents/prog.qasm", "Smith"],
    ["a Windows path containing a space", "C:\\Users\\John Smith\\Documents\\prog.qasm", "Smith"],
    ["a UNC share", "\\\\corp-fileserver\\share\\secret.qasm", "corp-fileserver"],
    ["an apostrophe in a surname", "/Users/o'brien/x.qasm", "brien"],
    ["a mounted volume", "/Volumes/Shared Drive/proj/x.qasm", "Shared Drive"],
  ] as const;

  it.each(leaks)("redacts %s", (_label, input, secret) => {
    expect(redactPaths(input)).not.toContain(secret);
  });

  it("redacts a path inside a Python traceback frame", () => {
    const frame = 'File "/Users/Jane Doe/Acme Corp/run.py", line 42, in <module>';

    const redacted = redactPaths(frame);

    expect(redacted).not.toContain("Jane");
    expect(redacted).not.toContain("Acme Corp");
    // The frame is still readable as a frame; only the path is gone.
    expect(redacted).toContain("line 42");
  });

  it("keeps the message that follows a path", () => {
    // Over-redaction has a cost too: a path-shaped rule that swallows the rest
    // of the line leaves an agent with no error to reason about.
    const redacted = redactPaths("/Users/x/venv/bin/python: No such file or directory");

    expect(redacted).toContain("No such file or directory");
    expect(redacted).not.toContain("/Users");
  });

  it("leaves prose alone", () => {
    for (const prose of [
      "and/or see 1/2",
      "the ratio is 3/4 and/or 5/6",
      "ModuleNotFoundError: No module named qsharp",
    ]) {
      expect(redactPaths(prose)).toBe(prose);
    }
  });

  it("redacts this machine's own home directory, whatever it is called", () => {
    const underHome = `${homedir()}/qre/scratch/run-history.sqlite`;

    const redacted = redactPaths(underHome);

    expect(redacted).toBe("<path>");
  });

  it("stays idempotent", () => {
    for (const input of leaks.map(([, value]) => value)) {
      const once = redactPaths(input);
      expect(redactPaths(once)).toBe(once);
    }
  });
});

describe("redactPaths on a quoted path containing the other quote", () => {
  it("takes a double-quoted path whole even with an apostrophe in it", () => {
    // A single class excluding both quotes never matched this at all, so it
    // fell through to the segment patterns and kept the surname.
    const frame = `File "/srv/exports/o'neill/x.py", line 7`;

    const redacted = redactPaths(frame);

    expect(redacted).not.toContain("neill");
    expect(redacted).toContain("line 7");
  });

  it("takes a single-quoted path whole even with a double quote in it", () => {
    const redacted = redactPaths(`File '/srv/say "hi"/x.py', line 3`);

    expect(redacted).not.toContain("say");
    expect(redacted).toContain("line 3");
  });
});
