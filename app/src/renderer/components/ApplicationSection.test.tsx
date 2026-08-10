// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialFormState, type ApplicationForm } from "../state/formState";
import { ApplicationSection } from "./ApplicationSection";

afterEach(() => {
  cleanup();
  delete window.files;
});

const ABSOLUTE = "/Users/analyst/programs/shor.qs";

function uploadForm(): ApplicationForm {
  return { ...createInitialFormState().application, type: "uploaded" };
}

/** Render the upload tab and hand back the change spy. */
function renderUpload(): {
  onChange: ReturnType<typeof vi.fn>;
  rerenderWith: (value: ApplicationForm) => void;
} {
  const onChange = vi.fn();
  const { rerender } = render(
    <ApplicationSection value={uploadForm()} errors={{}} onChange={onChange} />,
  );
  return {
    onChange,
    rerenderWith: (value) =>
      rerender(
        <ApplicationSection value={value} errors={{}} onChange={onChange} />,
      ),
  };
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("input[type='file']")!;
}

function pick(name: string): void {
  fireEvent.change(fileInput(), {
    target: { files: [new File(["// program"], name)] },
  });
}

describe("upload picker resolves a real filesystem path", () => {
  it("stores the absolute path, not the bare filename", () => {
    // The engine stat()s and readFile()s application.filePath. A basename
    // resolves against the process CWD, so every upload outside it failed with
    // "File not found".
    window.files = { getPathForFile: () => ABSOLUTE };
    const { onChange } = renderUpload();

    pick("shor.qs");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].upload.filePath).toBe(ABSOLUTE);
  });

  it("stores the absolute path for a dropped file too", () => {
    window.files = { getPathForFile: () => ABSOLUTE };
    const { onChange } = renderUpload();

    fireEvent.drop(document.querySelector(".dropzone")!, {
      dataTransfer: { files: [new File(["// program"], "shor.qs")] },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].upload.filePath).toBe(ABSOLUTE);
  });

  it("infers the format from the resolved path, not the browser filename", () => {
    window.files = { getPathForFile: () => "/Users/analyst/circuit.qasm" };
    const { onChange } = renderUpload();

    pick("circuit.qasm");

    expect(onChange.mock.calls[0]![0].upload.format).toBe("openqasm");
  });

  it("reports an actionable error and stores nothing when the path cannot be resolved", () => {
    window.files = { getPathForFile: () => "" };
    const { onChange } = renderUpload();

    pick("shor.qs");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be resolved/i);
  });

  it("reports an actionable error when the preload bridge is missing", () => {
    const { onChange } = renderUpload();

    pick("shor.qs");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears a previous resolution error once a file resolves", () => {
    const { onChange, rerenderWith } = renderUpload();

    pick("shor.qs");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    window.files = { getPathForFile: () => ABSOLUTE };
    pick("shor.qs");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const next = onChange.mock.calls[0]![0] as ApplicationForm;
    rerenderWith(next);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("upload pill", () => {
  it("shows the file's name, not the whole absolute path", () => {
    const value = uploadForm();
    value.upload = { ...value.upload, filePath: ABSOLUTE, format: "qsharp" };

    render(<ApplicationSection value={value} errors={{}} onChange={vi.fn()} />);

    expect(screen.getByText("shor.qs")).toBeInTheDocument();
    expect(screen.queryByText(ABSOLUTE)).not.toBeInTheDocument();
  });

  it("keeps the full path reachable for the analyst", () => {
    const value = uploadForm();
    value.upload = { ...value.upload, filePath: ABSOLUTE, format: "qsharp" };

    render(<ApplicationSection value={value} errors={{}} onChange={vi.fn()} />);

    expect(screen.getByText("shor.qs")).toHaveAttribute("title", ABSOLUTE);
  });

  it("flashes a popup when Save targets a program already in the library", () => {
    const value = uploadForm();
    value.upload = { ...value.upload, filePath: ABSOLUTE, format: "qsharp" };
    // The same file+format is already saved, so Save re-selects rather than
    // duplicating — and says so instead of looking like it did nothing.
    value.savedPrograms = [
      { id: "saved-1", name: "shor.qs", filePath: ABSOLUTE, format: "qsharp" },
    ];

    render(<ApplicationSection value={value} errors={{}} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Program" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /saved program already exists/i,
    );
  });
});

/**
 * Watch writes to the file input's `value`.
 *
 * A real browser fires `change` only when the selection CHANGES, so leaving the
 * previous file in the input makes re-picking that same file a silent no-op —
 * which is exactly what a user does after a failed resolution. Resetting
 * `value` to "" is what restores the event. jsdom cannot reproduce the
 * suppressed event (fireEvent dispatches unconditionally), so this asserts the
 * reset itself rather than pretending to observe the browser behaviour.
 */
function watchValueWrites(input: HTMLInputElement): string[] {
  const writes: string[] = [];
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => "",
    set: (next: string) => writes.push(next),
  });
  return writes;
}

describe("retrying an upload after a failure", () => {
  it("clears the input after a failed pick, so re-picking the same file fires", () => {
    const { onChange } = renderUpload();
    const writes = watchValueWrites(fileInput());

    pick("shor.qs");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(writes).toContain("");
  });

  it("clears the input after a successful pick too, so re-picking a cleared file fires", () => {
    window.files = { getPathForFile: () => ABSOLUTE };
    const { onChange } = renderUpload();
    const writes = watchValueWrites(fileInput());

    pick("shor.qs");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(writes).toContain("");
  });
});

describe("switching application type", () => {
  it("drops a stale path error", () => {
    // The component stays mounted across type changes, so pathError survived
    // and reappeared on returning to the Upload tab with nothing picked.
    const { onChange, rerenderWith } = renderUpload();

    pick("shor.qs");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Benchmark" }));
    const switched = onChange.mock.calls.at(-1)![0] as ApplicationForm;
    rerenderWith(switched);
    rerenderWith({ ...switched, type: "uploaded" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
