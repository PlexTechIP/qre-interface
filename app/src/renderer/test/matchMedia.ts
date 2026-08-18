/**
 * A drivable `window.matchMedia` for jsdom, which ships none at all.
 *
 * "Follow the system theme" is a subscription, not a read: the analyst flips
 * macOS to dark at sunset and the app is supposed to follow without a
 * relaunch. A stub that only answered `matches` could prove the initial paint
 * and nothing else — the listener could be missing entirely and every test
 * would still pass. This one dispatches change events so the subscription is
 * the thing under test.
 */

import { DARK_QUERY } from "../theme";

type Listener = (event: MediaQueryListEvent) => void;

let prefersDark = false;
const listeners = new Set<Listener>();

/**
 * Install the stub and reset to light. Called per test; the reset matters
 * because both the flag and the listener set outlive a single render.
 */
export function installMatchMedia(): void {
  prefersDark = false;
  listeners.clear();

  window.matchMedia = ((query: string) => {
    const isDarkQuery = query === DARK_QUERY;
    return {
      get matches() {
        return isDarkQuery && prefersDark;
      },
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: Listener) => {
        if (type === "change" && isDarkQuery) listeners.add(listener);
      },
      removeEventListener: (type: string, listener: Listener) => {
        if (type === "change") listeners.delete(listener);
      },
      // Retained so a caller using the deprecated API does not throw; the
      // app uses addEventListener.
      addListener: (listener: Listener) => {
        if (isDarkQuery) listeners.add(listener);
      },
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

/** Change what the OS reports, and tell everyone who subscribed. */
export function setSystemPrefersDark(value: boolean): void {
  prefersDark = value;
  for (const listener of listeners) {
    listener({ matches: value, media: DARK_QUERY } as MediaQueryListEvent);
  }
}

/** How many live subscriptions there are — proves teardown actually happens. */
export function systemThemeListenerCount(): number {
  return listeners.size;
}
