/**
 * Resolve a picked or dropped `File` to the path the engine can actually open.
 *
 * A browser `File` exposes only `name` — a basename. The engine `stat()`s and
 * `readFile()`s `application.filePath`, so a basename resolves against the main
 * process's working directory and every upload from anywhere else fails with
 * "File not found". Electron's `webUtils.getPathForFile` is the supported way to
 * get the real path (it replaced the removed `File.path` property), and the
 * preload exposes it as `window.files.getPathForFile`.
 *
 * There is deliberately no fallback to `file.name`: a basename is not a path,
 * and storing one produces a config that looks valid and fails at Run.
 */

export type ResolvedUploadPath =
  | { ok: true; filePath: string }
  | { ok: false; message: string };

export function resolveUploadPath(file: File): ResolvedUploadPath {
  const bridge = window.files;
  if (!bridge) {
    return {
      ok: false,
      message:
        "File paths are only available in the desktop app. Open this window from the QRE Interface application to upload a program.",
    };
  }

  let filePath: string;
  try {
    filePath = bridge.getPathForFile(file);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `That file's location could not be resolved: ${detail}. Try choosing it again from the file picker.`,
    };
  }

  if (filePath.length === 0) {
    return {
      ok: false,
      message:
        "That file's location could not be resolved, so the engine would not be able to read it. Save the program to disk and choose it again.",
    };
  }

  return { ok: true, filePath };
}
