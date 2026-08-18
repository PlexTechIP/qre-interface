/**
 * Theme preference versus the theme actually applied.
 *
 * These are two different values and conflating them is the bug this module
 * exists to prevent: "system" is a thing the analyst can *choose*, but it is
 * never a thing the document can *be*. `data-theme` is always resolved to
 * light or dark, so the CSS needs no `prefers-color-scheme` block and the
 * palette keeps a single source of truth in `:root` / `:root[data-theme]`.
 */

/** What the document is painted as. */
export type Theme = "light" | "dark";

/** What the analyst asked for, which may be "whatever the OS is doing". */
export type ThemePreference = Theme | "system";

const PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/** The media query the OS answers. Exported so callers cannot mistype it. */
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (PREFERENCES as readonly string[]).includes(value);
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/**
 * A stored preference, or the safe default.
 *
 * "system" rather than "light" for an unreadable value: before this preference
 * existed the app consulted `prefers-color-scheme` whenever nothing was
 * stored, so anything else would quietly change first-launch behaviour for
 * every existing install.
 */
export function readStoredPreference(stored: string | null): ThemePreference {
  return isThemePreference(stored) ? stored : "system";
}

/** Whether the OS currently wants dark. Absent in jsdom, hence the guard. */
export function systemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}
