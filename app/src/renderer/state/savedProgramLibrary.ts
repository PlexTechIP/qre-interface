/**
 * The analyst's saved-program library, kept across launches.
 *
 * "Save Program" used to add the file to the form's in-memory state and
 * nothing else. The form is rebuilt from scratch by every Rerun, every model
 * draft and every launch, so the library a person had built up vanished on all
 * three — a Save button whose effect lasted until the next click elsewhere.
 *
 * What is stored is a list of references (name, path, format), not the files:
 * a program still has to exist where it was when it is run, and the upload
 * pre-flight says so if it has moved. That makes this a renderer preference of
 * the same kind as the theme, so it lives in `localStorage` beside it rather
 * than in the run store, whose records are immutable results.
 */

import { UPLOADED_PROGRAM_FORMATS } from "../../shared/types";
import type { FormState, SavedProgram } from "./formState";

export const SAVED_PROGRAMS_STORAGE_KEY = "qre-saved-programs";

function isSavedProgram(value: unknown): value is SavedProgram {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.filePath === "string" &&
    (UPLOADED_PROGRAM_FORMATS as readonly unknown[]).includes(candidate.format)
  );
}

/**
 * The stored library, or an empty one. Never throws: a library this cannot
 * read is one the analyst can rebuild, and a malformed preference must not
 * stop the form opening.
 */
export function loadSavedPrograms(): SavedProgram[] {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(SAVED_PROGRAMS_STORAGE_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(stored) ? stored.filter(isSavedProgram) : [];
  } catch {
    return [];
  }
}

/** Replace the stored library. Best effort, like every other preference. */
export function storeSavedPrograms(programs: readonly SavedProgram[]): void {
  try {
    window.localStorage.setItem(SAVED_PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
  } catch {
    // Site data blocked: the library still works for this session.
  }
}

/**
 * `state` with the stored library in its Saved Programs list.
 *
 * Applied wherever the form is seeded — fresh, restored, from a rerun, or from
 * a model's draft — since each of those starts from a form that knows nothing
 * of the library. Programs already in `state` that the store lacks are kept
 * after the stored ones, so a restored form loses nothing either.
 */
export function withSavedProgramLibrary(state: FormState): FormState {
  const stored = loadSavedPrograms();
  const storedIds = new Set(stored.map((program) => program.id));
  const savedPrograms = [
    ...stored,
    ...state.application.savedPrograms.filter((program) => !storedIds.has(program.id)),
  ];
  return { ...state, application: { ...state.application, savedPrograms } };
}
