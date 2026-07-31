// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunConfiguration } from "../RunConfiguration";
import { createInitialFormState } from "./formState";
import { blocksRun, uploadedFileOf, type UploadPreflight } from "./useUploadPreflight";
import { buildSuccessResult, fakeEstimator } from "../../shared/testing";

/**
 * The DoD's wording is the whole point: upload validation must produce "a clear
 * message in the form BEFORE the run launches". Running it inside the engine
 * also produces a message, but only as a FAILED RUN in History — which is a
 * form-validation error masquerading as an estimation failure.
 *
 * So these assert the two things that distinguish the two designs: the message
 * appears without clicking Run, and Run is blocked while the file is bad.
 */

afterEach(() => {
  cleanup();
  delete (window as { uploads?: unknown }).uploads;
  delete (window as { files?: unknown }).files;
});

function stubPreflight(result: { ok: true } | { ok: false; code: "INVALID_CONFIG"; message: string }) {
  const preflight = vi.fn().mockResolvedValue(result);
  (window as { uploads?: unknown }).uploads = { preflight };
  return preflight;
}

const runButton = () => screen.getByRole("button", { name: /run estimate/i });

/** Fill the two GateBased times, the only fields with no defaults. */
async function fillRequiredTimes(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: /single-qubit gate time/i }), "50");
  await user.type(screen.getByRole("textbox", { name: /^measurement time/i }), "100");
}

/**
 * Pick a file in the Upload Program File tab.
 *
 * Stubs the webUtils bridge unless a test set its own: the renderer resolves the
 * real filesystem path through it and REFUSES to fall back to `file.name`, so
 * without a bridge nothing gets selected at all. The packaged app always has it
 * — the preload exposes it unconditionally — so stubbing it here is the
 * faithful default, not a convenience.
 */
async function chooseFile(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (!(window as { files?: unknown }).files) {
    (window as { files?: unknown }).files = {
      getPathForFile: (file: File) => `/Users/me/programs/${file.name}`,
    };
  }
  await user.click(screen.getByRole("radio", { name: /upload program file/i }));
  const input = document.querySelector<HTMLInputElement>("#upload-file");
  if (!input) throw new Error("upload input not found");
  await user.upload(input, new File(["OPENQASM 3.0; qubit q;"], name, { type: "text/plain" }));
}

describe("uploadedFileOf", () => {
  it("returns nothing for a benchmark or manual-counts draft", () => {
    const state = createInitialFormState();
    expect(uploadedFileOf(state.application)).toBeNull();
    expect(uploadedFileOf({ ...state.application, type: "manualCounts" })).toBeNull();
  });

  it("returns the chosen upload", () => {
    const state = createInitialFormState();
    expect(
      uploadedFileOf({
        ...state.application,
        type: "uploaded",
        upload: { filePath: "/tmp/x.qasm", format: "openqasm", addToLibrary: false },
      }),
    ).toEqual({ filePath: "/tmp/x.qasm", format: "openqasm" });
  });

  it("also covers saved programs — they serialize to the same uploaded variant", () => {
    const state = createInitialFormState();
    expect(
      uploadedFileOf({
        ...state.application,
        type: "saved",
        savedPrograms: [{ id: "s1", name: "x.qs", filePath: "/tmp/x.qs", format: "qsharp" }],
        selectedSavedId: "s1",
      }),
    ).toEqual({ filePath: "/tmp/x.qs", format: "qsharp" });
  });
});

describe("blocksRun", () => {
  it("blocks on an invalid file and while the check is still running", () => {
    // A pending check must block, or a fast click gets a bad file through.
    expect(blocksRun({ status: "checking" })).toBe(true);
    expect(blocksRun({ status: "invalid", message: "bad" })).toBe(true);
  });

  it("never blocks when there is nothing to check or no bridge", () => {
    const allowed: UploadPreflight[] = [
      { status: "idle" },
      { status: "ok" },
      { status: "unavailable" },
    ];
    for (const preflight of allowed) expect(blocksRun(preflight)).toBe(false);
  });
});

describe("upload pre-flight in the form", () => {
  it("shows the engine's reason in the form, without the user clicking Run", async () => {
    stubPreflight({
      ok: false,
      code: "INVALID_CONFIG",
      message: 'File type ".qasm" does not match the selected format Q#.',
    });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);

    await chooseFile(user, "bad-sample.qasm");

    // Surfaces twice by design — at the field and in the validation summary.
    const shown = await screen.findAllByText(/does not match the selected format/i);
    expect(shown.length).toBeGreaterThan(0);
  });

  it("blocks Run while the file is invalid — no failed run reaches History", async () => {
    stubPreflight({ ok: false, code: "INVALID_CONFIG", message: "The uploaded file is empty." });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    await chooseFile(user, "bad-sample.qasm");

    await screen.findAllByText(/the uploaded file is empty/i);
    expect(runButton()).toBeDisabled();
  });

  it("lets a good file through", async () => {
    stubPreflight({ ok: true });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    await chooseFile(user, "good.qasm");

    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("re-checks when the file changes and keeps the newest verdict", async () => {
    const preflight = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "INVALID_CONFIG", message: "The uploaded file is empty." })
      .mockResolvedValueOnce({ ok: true });
    (window as { uploads?: unknown }).uploads = { preflight };

    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);

    await chooseFile(user, "bad-sample.qasm");
    await screen.findAllByText(/the uploaded file is empty/i);

    await chooseFile(user, "good.qasm");
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(screen.queryAllByText(/the uploaded file is empty/i)).toHaveLength(0);
    expect(preflight).toHaveBeenCalledTimes(2);
  });

  it("refuses a File with no filesystem path, and says why", async () => {
    // webUtils.getPathForFile returns an EMPTY STRING (not null) for a File with
    // no path on disk. This used to fall back to `file.name` so the selection
    // still rendered — but a basename is not a path: the config then held a
    // filePath the engine cannot open, and "Save Program" would persist it to
    // the library. Refusing keeps the bad path out of the record entirely.
    //
    // It is not a silent no-op either: the reason appears in the form, which is
    // the concern the old fallback existed to address.
    (window as { files?: unknown }).files = { getPathForFile: () => "" };
    stubPreflight({ ok: true });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await chooseFile(user, "no-disk-path.qasm");

    // Surfaces at the field and again in the validation summary, as the other
    // form messages do.
    const shown = await screen.findAllByText(/could not be resolved/i);
    expect(shown.length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /remove no-disk-path\.qasm/i }),
    ).not.toBeInTheDocument();
  });

  it("prefers the absolute path Electron resolves", async () => {
    (window as { files?: unknown }).files = {
      getPathForFile: () => "/Users/me/programs/bell.qasm",
    };
    const preflight = stubPreflight({ ok: true });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await chooseFile(user, "bell.qasm");

    // The engine cannot open a bare basename, so the pre-flight must receive
    // the real path.
    await waitFor(() =>
      expect(preflight).toHaveBeenCalledWith("/Users/me/programs/bell.qasm", "openqasm"),
    );
    delete (window as { files?: unknown }).files;
  });

  it("does not gate the form when the pre-flight bridge is absent", async () => {
    // No window.uploads: isolated component tests must not be blocked, and must
    // not report a false failure either. (chooseFile still stubs window.files —
    // that is a different bridge, and without a real path there is nothing to
    // pre-flight in the first place.)
    window.estimator = fakeEstimator(buildSuccessResult(), { delayMs: 5 });
    const user = userEvent.setup();
    render(<RunConfiguration />);
    await fillRequiredTimes(user);
    await chooseFile(user, "anything.qasm");

    await waitFor(() => expect(runButton()).toBeEnabled());
  });
});
