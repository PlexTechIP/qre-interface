import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OBJECT_URL_LIFETIME_MS,
  downloadCsv,
  downloadMarkdown,
  exportFilename,
} from "./download";

/**
 * How long the Blob URL survives its own click.
 *
 * `click()` returns as soon as the event dispatches; the browser fetches the
 * blob afterwards, on another thread. Revoking before that fetch completes is a
 * cancelled or zero-byte download — and the exports most likely to lose the
 * race are the large ones, which for this app is the ordinary case: a real run
 * embeds its whole raw engine output.
 */
describe("downloadMarkdown — object URL lifetime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stub");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * A literal second rather than `OBJECT_URL_LIFETIME_MS - 1`: the requirement
   * is that the URL outlives a real download's fetch, not that it matches
   * whatever the constant happens to say. Tuning the constant should not be
   * able to quietly satisfy this.
   */
  it("keeps the object URL alive while the download may still be fetching it", () => {
    downloadMarkdown("# Run", "a run");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    // Not on the next line, and not on the next task either.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("releases the object URL rather than leaking it for the session", () => {
    downloadMarkdown("# Run", "a run");

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stub");
  });

  it("gives each export its own lifetime rather than one shared timer", () => {
    downloadMarkdown("# One", "one");
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS / 2);
    downloadMarkdown("# Two", "two");

    // The first is due; the second is only halfway through its own window.
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS / 2);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS / 2);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("names the file from the title, and the download is the Markdown it was given", () => {
    downloadMarkdown("# Run", "Grover, 20 qubits");

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
  });
});

/**
 * Two exports must not quietly become one file.
 *
 * Run names are analyst-chosen and not unique, so the slug alone collides
 * across different runs — and re-exporting anything left the browser to invent
 * "foo (1).md". The stamp is the export timestamp already threaded through for
 * the provenance line, formatted so a Downloads folder sorts by it.
 */
describe("exportFilename", () => {
  it("slugs a title into something a filesystem accepts", () => {
    expect(exportFilename("Grover, 20 search qubits")).toBe("grover-20-search-qubits");
    expect(exportFilename("Shor / 2048-bit \"modulus\"")).toBe("shor-2048-bit-modulus");
  });

  it("stamps the export time so two exports never silently collide", () => {
    expect(exportFilename("Grover", "qre-run", "2026-08-12T19:04:31.000Z")).toBe(
      "grover-20260812-1904",
    );
  });

  it("stamps the fallback too, so an untitled export is still distinguishable", () => {
    expect(exportFilename("···", "qre-run", "2026-08-12T19:04:31.000Z")).toBe(
      "qre-run-20260812-1904",
    );
  });

  it("degrades to the bare slug rather than writing NaN into a filename", () => {
    expect(exportFilename("Grover", "qre-run", "not a timestamp")).toBe("grover");
  });

  it("caps a long title so the name stays inside a filesystem's limits", () => {
    const name = exportFilename("a".repeat(300), "qre-run", "2026-08-12T19:04:31.000Z");

    expect(name.length).toBeLessThanOrEqual(96);
    // Capped on a hyphen boundary, not mid-stamp.
    expect(name.endsWith("-20260812-1904")).toBe(true);
  });

  it("falls back rather than producing a file called .md", () => {
    expect(exportFilename("···")).toBe("qre-export");
    expect(exportFilename("", "qre-conversation")).toBe("qre-conversation");
  });
});

describe("downloadCsv", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stub");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes a .csv the operating system will hand to a spreadsheet", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    downloadCsv("a,b\r\n1,2", "Grover", { fallback: "qre-run", exportedAt: "2026-08-12T19:04:31.000Z" });

    expect(downloads).toEqual(["grover-20260812-1904.csv"]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe("a,b\r\n1,2");
  });

  it("gets the same object-URL lifetime the Markdown download does", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("a,b", "run");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
