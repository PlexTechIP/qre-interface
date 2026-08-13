import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_RUN_RECORDS } from "../../shared/testing";
import { withClipboard } from "../test/clipboard";
import { ComparisonExportDialog } from "./ComparisonExportDialog";
import { ExportDialog } from "./ExportDialog";

const noop = () => {};

const [FIRST, SECOND] = SAMPLE_RUN_RECORDS;
if (!FIRST || !SECOND) throw new Error("Expected at least two sample records.");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * Both export dialogs used to hand-roll their copy handler: the failure branch
 * was an empty `catch` with a comment saying it left the label alone, and the
 * "Copied" label never reset. `CopyButton` had already solved both, in the
 * transcript, with a comment explaining why each mattered — so the export
 * surface shipped the exact bugs the fix next door documented.
 */
describe.each([
  {
    what: "run export",
    render: () => render(<ExportDialog record={FIRST} onClose={noop} />),
    resting: "Copy Markdown",
  },
  {
    what: "comparison export",
    render: () =>
      render(
        <ComparisonExportDialog records={[FIRST, SECOND]} onClose={noop} />,
      ),
    resting: "Copy Markdown",
  },
])("$what — copy", ({ render: renderDialog, resting }) => {
  it("says so when the clipboard refuses, rather than looking like it worked", async () => {
    await withClipboard(
      () => Promise.reject(new Error("denied")),
      async () => {
        renderDialog();
        const button = screen.getByRole("button", { name: resting });

        await act(async () => {
          button.click();
        });

        expect(button).toHaveTextContent("Could not copy");
      },
    );
  });

  it("returns to its resting label instead of sitting on 'Copied'", async () => {
    vi.useFakeTimers();

    await withClipboard(
      () => Promise.resolve(),
      async () => {
        renderDialog();
        const button = screen.getByRole("button", { name: resting });

        await act(async () => {
          button.click();
        });
        expect(button).toHaveTextContent("Copied");

        await act(async () => {
          vi.advanceTimersByTime(2_500);
        });
        expect(button).toHaveTextContent(resting);
      },
    );
  });

  it("copies the Markdown the preview is showing", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());

    await withClipboard(writeText, async () => {
      renderDialog();

      await act(async () => {
        screen.getByRole("button", { name: resting }).click();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0]?.[0]).toBe(
        screen.getByLabelText(/export preview/i).textContent,
      );
    });
  });
});

/** Stub the download plumbing and report what an anchor was asked to save. */
function captureDownloads(): string[] {
  const names: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stub");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

/**
 * The element itself, not a render call: the re-date test has to hand the SAME
 * component back to `rerender`, or it unmounts one dialog and mounts another —
 * which legitimately produces a fresh timestamp and would pass against a
 * broken implementation.
 */
describe.each([
  {
    what: "run export",
    element: <ExportDialog record={FIRST} onClose={noop} />,
    extension: "md",
  },
  {
    what: "comparison export",
    element: (
      <ComparisonExportDialog records={[FIRST, SECOND]} onClose={noop} />
    ),
    extension: "md",
  },
])("$what — provenance", ({ element, extension }) => {
  const renderDialog = () => render(element);

  it("dates the document and stamps the download with the same moment", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T19:04:31.000Z"));
    const downloads = captureDownloads();

    renderDialog();

    expect(screen.getByLabelText(/export preview/i).textContent).toContain(
      "> Exported from the QRE Dashboard on 2026-08-12T19:04:31.000Z.",
    );

    await act(async () => {
      screen.getByRole("button", { name: `Download .${extension}` }).click();
    });

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(new RegExp(`-20260812-1904\\.${extension}$`));
  });

  /**
   * The preview and the file must be the same document. Recomputing the clock
   * per render would date them differently the moment a re-render lands between
   * opening the dialog and pressing Download.
   */
  it("does not re-date the export while the dialog is open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T19:04:31.000Z"));
    const downloads = captureDownloads();

    const { rerender } = renderDialog();
    vi.setSystemTime(new Date("2026-08-12T23:59:00.000Z"));
    await act(async () => {
      rerender(element);
    });

    expect(screen.getByLabelText(/export preview/i).textContent).toContain(
      "on 2026-08-12T19:04:31.000Z.",
    );
    await act(async () => {
      screen.getByRole("button", { name: `Download .${extension}` }).click();
    });
    expect(downloads[0]).toContain("-20260812-1904.");
  });
});

/**
 * The Markdown is for reading and the CSV is for computing; a tool whose whole
 * output is a Pareto frontier should hand over the frontier in the form you
 * can plot.
 */
describe("export dialogs — CSV", () => {
  it("downloads the frontier as a .csv beside the .md", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T19:04:31.000Z"));
    const saved: { name: string; text: string }[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      void (source as Blob).text().then((text) => {
        const last = saved.at(-1);
        if (last) last.text = text;
      });
      return "blob:stub";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, text: "" });
    });

    render(<ExportDialog record={FIRST} onClose={noop} />);

    await act(async () => {
      screen.getByRole("button", { name: "Download .csv" }).click();
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toMatch(/-20260812-1904\.csv$/);
    expect(saved[0]?.text).toContain("Physical Qubits (qubits)");
  });

  it("downloads the comparison as a .csv, one row per run", async () => {
    const saved: { name: string; text: string }[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      void (source as Blob).text().then((text) => {
        const last = saved.at(-1);
        if (last) last.text = text;
      });
      return "blob:stub";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, text: "" });
    });

    render(
      <ComparisonExportDialog records={[FIRST, SECOND]} onClose={noop} />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "Download .csv" }).click();
    });

    expect(saved[0]?.name).toMatch(/\.csv$/);
    await vi.waitFor(() => expect(saved[0]?.text).toContain("Run ID,Run,Status"));
  });

  /**
   * There is no longer a mode in which the dialog offers less. It used to
   * default to a week-3 placeholder with neither download, which is what every
   * call site except `App.tsx` got.
   */
  it("always offers both formats, with no mode that withholds them", () => {
    render(<ExportDialog record={FIRST} onClose={noop} />);

    expect(screen.getByRole("button", { name: "Download .md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download .csv" })).toBeInTheDocument();
    expect(screen.getByLabelText(/export preview/i)).not.toHaveTextContent(/placeholder/i);
  });
});
