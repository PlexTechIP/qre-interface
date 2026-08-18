import type { Theme, ThemePreference } from "./theme";

interface ThemeToggleProps {
  /** The theme in force. Never "system" — see `theme.ts`. */
  theme: Theme;
  /**
   * What was actually chosen. The button behaves the same either way, but a
   * click while following the system pins an explicit theme, and a control
   * with a side effect that big should say so before it is pressed.
   */
  preference: ThemePreference;
  onToggle: () => void;
}

export function ThemeToggle({ theme, preference, onToggle }: ThemeToggleProps) {
  const isDark = theme === "dark";
  const action = isDark ? "Switch to light mode" : "Switch to dark mode";
  /*
   * One string for both the tooltip and the accessible name.
   *
   * `aria-label` overrides `title` in the accessible-name computation, so
   * warning about the side effect only in `title` told sighted mouse users
   * and no one else — and following the system is a setting people choose for
   * accessibility reasons, which makes that exactly the wrong audience to
   * drop out of it silently. The action leads, so the name still opens with
   * what the button does.
   */
  const label =
    preference === "system"
      ? `${action}. This stops the app following your system theme.`
      : action;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.36-.02-.71-.05-1.06A7 7 0 0 1 12 3Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="12" y1="1.5" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22.5" y2="12" />
            <line x1="4.2" y1="4.2" x2="5.9" y2="5.9" />
            <line x1="18.1" y1="18.1" x2="19.8" y2="19.8" />
            <line x1="4.2" y1="19.8" x2="5.9" y2="18.1" />
            <line x1="18.1" y1="5.9" x2="19.8" y2="4.2" />
          </g>
        </svg>
      )}
    </button>
  );
}
