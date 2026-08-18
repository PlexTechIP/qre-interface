/**
 * Navigation guards for every `WebContents` the app creates.
 *
 * `contextIsolation`, `sandbox` and `nodeIntegration: false` already make the
 * renderer a poor place to run someone else's code. What they do not do is stop
 * that renderer from *becoming* someone else's page: a `window.open`, a
 * `target="_blank"`, or a navigation to an off-origin URL replaces the document
 * with remote content that still sits inside the app frame, still looks like the
 * app, and — without this — still has a preload bridge attached.
 *
 * Both hooks deny by default. This app has no external links and no second
 * window: every screen is a React route inside one document, so anything that
 * tries to navigate away is either a bug or not us.
 *
 * Written as a plain function over a structural type rather than inside
 * `main.ts` so it can be tested without booting Electron — the same reason the
 * credential store takes a `SafeStorageLike`.
 */

export interface GuardableWebContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  on(
    event: "will-navigate",
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): void;
}

/**
 * @param allowedUrl The document this window is meant to be showing. A
 * navigation back to it is a reload, which is legitimate; anything else is not.
 * Absent (the packaged `loadFile` case) means no navigation is permitted at all.
 */
export function hardenWebContents(
  contents: GuardableWebContents,
  allowedUrl?: string,
): void {
  // No new windows, ever. Returning "deny" also covers target="_blank" and
  // window.open from any script that somehow runs in the page.
  contents.setWindowOpenHandler(() => ({ action: "deny" }));

  contents.on("will-navigate", (event, url) => {
    if (!isSameDocument(url, allowedUrl)) event.preventDefault();
  });
}

/**
 * Compared by ORIGIN, not by string equality: the dev server navigates within
 * `http://localhost:5173` on reload and HMR, and pinning the exact URL would
 * make every reload look like an attack. Anything unparseable is refused —
 * a URL this cannot read is not one it can vouch for.
 */
function isSameDocument(url: string, allowedUrl?: string): boolean {
  if (allowedUrl === undefined) return false;
  try {
    return new URL(url).origin === new URL(allowedUrl).origin;
  } catch {
    return false;
  }
}
