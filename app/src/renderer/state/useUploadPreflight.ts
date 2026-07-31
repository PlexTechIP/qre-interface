/**
 * Form-level pre-flight for an uploaded program.
 *
 * The engine's Q#/OpenQASM/QIR compilers only discover a broken or wrong-type
 * file after they spawn, and `QreEngine` turning that into an INVALID_CONFIG is
 * still a FAILED RUN — it lands in History as an estimation failure, which is
 * not what a bad file is. This hook moves the same check ahead of the Run
 * button: the verdict arrives while the user is still looking at the form.
 *
 * The check itself lives in the main process (it reads the filesystem); this is
 * only the renderer's view of it, reached over `window.uploads`. Outside
 * Electron that bridge is absent, and the hook reports "unavailable" so isolated
 * component tests are neither gated nor falsely failed.
 */

import { useEffect, useState } from "react";

import type { UploadedProgramFormat } from "../../shared/types";
import type { ApplicationForm } from "./formState";

export type UploadPreflight =
  /** Nothing to check: not an uploaded program, or no file chosen yet. */
  | { status: "idle" }
  /** No bridge (component tests / browser) — never gates Run. */
  | { status: "unavailable" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "invalid"; message: string };

/** The file a draft would actually send, or null. Saved programs count too —
 *  they serialize to the same contract `uploaded` variant as a fresh upload. */
export function uploadedFileOf(
  application: ApplicationForm,
): { filePath: string; format: UploadedProgramFormat } | null {
  if (application.type === "uploaded") {
    const filePath = application.upload.filePath.trim();
    return filePath.length === 0
      ? null
      : { filePath, format: application.upload.format };
  }
  if (application.type === "saved") {
    const chosen = application.savedPrograms.find(
      (program) => program.id === application.selectedSavedId,
    );
    return chosen ? { filePath: chosen.filePath, format: chosen.format } : null;
  }
  return null;
}

export function useUploadPreflight(application: ApplicationForm): UploadPreflight {
  const target = uploadedFileOf(application);
  const filePath = target?.filePath ?? "";
  const format = target?.format ?? "qsharp";

  const [preflight, setPreflight] = useState<UploadPreflight>({ status: "idle" });

  useEffect(() => {
    if (filePath.length === 0) {
      setPreflight({ status: "idle" });
      return;
    }
    const bridge = window.uploads;
    if (!bridge) {
      setPreflight({ status: "unavailable" });
      return;
    }

    // A newer selection must win: an in-flight check for a file the user has
    // already replaced would otherwise overwrite the current verdict.
    let cancelled = false;
    setPreflight({ status: "checking" });
    void bridge
      .preflight(filePath, format)
      .then((result) => {
        if (cancelled) return;
        setPreflight(
          result.ok ? { status: "ok" } : { status: "invalid", message: result.message },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setPreflight({ status: "invalid", message: `Could not check the file: ${detail}.` });
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, format]);

  return preflight;
}

/** Does this verdict block Run? An unfinished check does, so a bad file can
 *  never slip through by clicking fast. */
export function blocksRun(preflight: UploadPreflight): boolean {
  return preflight.status === "invalid" || preflight.status === "checking";
}
