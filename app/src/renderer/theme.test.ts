// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DARK_QUERY,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
} from "./theme";

describe("resolveTheme", () => {
  it("returns an explicit choice regardless of what the system wants", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when the preference is to follow it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("isThemePreference", () => {
  it("accepts the three the app can act on", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isThemePreference("solarized")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    // `in`-style checks walk the prototype chain; this must not.
    expect(isThemePreference("toString")).toBe(false);
  });
});

describe("readStoredPreference", () => {
  it("reads back a stored preference", () => {
    expect(readStoredPreference("dark")).toBe("dark");
    expect(readStoredPreference("system")).toBe("system");
  });

  /**
   * Following the system is the right default for a desktop app, and it is
   * also what the app did before there was a preference: with nothing stored
   * it consulted `prefers-color-scheme`. Defaulting to "light" here would
   * silently change first-launch behaviour for everyone.
   */
  it("follows the system when nothing has been stored", () => {
    expect(readStoredPreference(null)).toBe("system");
  });

  it("falls back to following the system rather than trusting junk", () => {
    expect(readStoredPreference("solarized")).toBe("system");
  });
});

/**
 * The boot script in index.html duplicates `readStoredPreference` and
 * `resolveTheme` because it has to run before any module loads and therefore
 * cannot import them. Nothing else makes the two agree, so this does: it runs
 * the real script text against every combination and checks it lands on the
 * same theme this module would.
 *
 * The failure it exists to catch is silent — the document painted with one
 * theme before hydration and repainted with another right after, which is the
 * dark-mode launch flash the script was added to prevent.
 */
describe("the index.html boot script", () => {
  // Resolved from the Vitest root rather than `import.meta.url`: under jsdom
  // that URL is the dev server's http:// address, which readFileSync rejects.
  const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");

  /** Run the page's own script with a controlled localStorage + matchMedia. */
  function bootThemeFor(stored: string | null, prefersDark: boolean): string {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (script === undefined) throw new Error("No boot script found in index.html");

    const documentElement = { dataset: {} as Record<string, string> };
    new Function(
      "localStorage",
      "window",
      "document",
      script,
    )(
      { getItem: () => stored },
      { matchMedia: (query: string) => ({ matches: query === DARK_QUERY && prefersDark }) },
      { documentElement },
    );
    const applied = documentElement.dataset["theme"];
    if (applied === undefined) throw new Error("Boot script set no theme");
    return applied;
  }

  const cases: readonly (string | null)[] = [null, "light", "dark", "system", "solarized"];

  for (const stored of cases) {
    for (const prefersDark of [true, false]) {
      it(`agrees with theme.ts for stored=${String(stored)} prefersDark=${prefersDark}`, () => {
        expect(bootThemeFor(stored, prefersDark)).toBe(
          resolveTheme(readStoredPreference(stored), prefersDark),
        );
      });
    }
  }
});
