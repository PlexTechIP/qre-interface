// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { registerUploadHandler, type UploadPreflightRequest } from "./uploadHandler.js";
import { UPLOAD_PREFLIGHT_CHANNEL } from "./ipcChannels.js";
import type { UploadValidationResult } from "./engine/uploadValidation.js";

/**
 * The IPC seam that lets the FORM pre-flight a file. Graded against the repo's
 * own `uploads/bad-sample.qasm` — the file the DoD names — so the check is
 * proved against a real bad file rather than a synthetic one.
 */

const UPLOADS_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "engine",
  "uploads",
);

/** Minimal ipcMain double: captures the single registered handler. */
function registerAndGetHandler() {
  const handlers = new Map<
    string,
    (event: unknown, request: UploadPreflightRequest) => Promise<UploadValidationResult>
  >();
  registerUploadHandler({
    handle: (channel: string, listener: never) => {
      handlers.set(channel, listener as never);
    },
  } as never);

  const handler = handlers.get(UPLOAD_PREFLIGHT_CHANNEL);
  if (!handler) throw new Error("upload pre-flight handler was not registered");
  return (request: UploadPreflightRequest) => handler(null, request);
}

describe("upload pre-flight over IPC", () => {
  it("passes a well-formed OpenQASM program", async () => {
    const preflight = registerAndGetHandler();
    const result = await preflight({
      filePath: join(UPLOADS_DIR, "sample-bell.qasm"),
      format: "openqasm",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects uploads/bad-sample.qasm with an analyst-facing reason", async () => {
    const preflight = registerAndGetHandler();
    const result = await preflight({
      filePath: join(UPLOADS_DIR, "bad-sample.qasm"),
      format: "openqasm",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_CONFIG");
    expect(result.message).toMatch(/no recognizable statements/i);
  });

  it("rejects a missing file", async () => {
    const preflight = registerAndGetHandler();
    const result = await preflight({
      filePath: join(UPLOADS_DIR, "does-not-exist.qasm"),
      format: "openqasm",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/file not found/i);
  });

  it("rejects an extension that contradicts the declared format", async () => {
    const preflight = registerAndGetHandler();
    const result = await preflight({
      filePath: join(UPLOADS_DIR, "sample-bell.qasm"),
      format: "qsharp",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/does not match the selected format/i);
  });

  it("reports a pre-flight crash as a validation failure, never a rejection", async () => {
    // The form must always get a verdict it can render — a thrown handler would
    // reject the invoke and leave the field with no message at all.
    const preflight = registerAndGetHandler();
    const result = await preflight({
      filePath: "",
      format: "openqasm",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/no file was selected/i);
  });
});
