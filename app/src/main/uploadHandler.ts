import type { IpcMain } from "electron";

import {
  preflightUploadedProgram,
  type UploadValidationResult,
} from "./engine/uploadValidation.js";
import type { UploadedProgramFormat } from "../shared/types.js";
import { UPLOAD_PREFLIGHT_CHANNEL } from "./ipcChannels.js";

/**
 * Expose the uploaded-program pre-flight to the renderer, so the FORM can reject
 * a bad file before the user ever clicks Run.
 *
 * The same check still runs inside `QreEngine.run` — that is deliberate defence
 * in depth, not duplication: a config can reach the engine from Rerun or a
 * hand-built record without passing through the form, and the file can be
 * deleted between the form check and the run. What this channel changes is WHERE
 * the analyst finds out: an inline form error instead of a failed run record in
 * History.
 *
 * The filesystem read is main-process only; the renderer never touches `fs`.
 */
export interface UploadPreflightRequest {
  filePath: string;
  format: UploadedProgramFormat;
}

export function registerUploadHandler(ipcMain: Pick<IpcMain, "handle">): void {
  ipcMain.handle(
    UPLOAD_PREFLIGHT_CHANNEL,
    async (_event, request: UploadPreflightRequest): Promise<UploadValidationResult> => {
      try {
        return await preflightUploadedProgram(request.filePath, request.format);
      } catch (error) {
        // A pre-flight that itself fails must not break the form — report it as
        // a validation failure the user can act on.
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: "INVALID_CONFIG",
          message: `Could not check "${request.filePath}": ${detail}.`,
        };
      }
    },
  );
}
