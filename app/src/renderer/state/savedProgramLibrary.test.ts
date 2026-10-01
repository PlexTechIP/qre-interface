import { beforeEach, describe, expect, it } from "vitest";

import {
  SAVED_PROGRAMS_STORAGE_KEY,
  loadSavedPrograms,
  storeSavedPrograms,
} from "./savedProgramLibrary";
import type { SavedProgram } from "./formState";

const PROGRAM: SavedProgram = {
  id: "saved-1",
  name: "shor.qs",
  filePath: "/Users/analyst/programs/shor.qs",
  format: "qsharp",
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("the saved-program library", () => {
  it("keeps a program saved in an earlier session", () => {
    storeSavedPrograms([PROGRAM]);

    expect(loadSavedPrograms()).toEqual([PROGRAM]);
  });

  it("starts empty when nothing has been saved", () => {
    expect(loadSavedPrograms()).toEqual([]);
  });

  it("starts empty rather than failing on a library it cannot read", () => {
    window.localStorage.setItem(SAVED_PROGRAMS_STORAGE_KEY, "{not json");

    expect(loadSavedPrograms()).toEqual([]);
  });

  it("drops entries that are not programs instead of handing them to the form", () => {
    window.localStorage.setItem(
      SAVED_PROGRAMS_STORAGE_KEY,
      JSON.stringify([PROGRAM, { id: 7 }, { ...PROGRAM, id: "saved-2", format: "exe" }, null]),
    );

    expect(loadSavedPrograms()).toEqual([PROGRAM]);
  });
});
