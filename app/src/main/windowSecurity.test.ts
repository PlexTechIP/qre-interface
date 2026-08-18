// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { hardenWebContents, type GuardableWebContents } from "./windowSecurity.js";

function fakeContents() {
  let willNavigate: ((event: { preventDefault(): void }, url: string) => void) | null = null;
  const setWindowOpenHandler = vi.fn();
  const contents: GuardableWebContents = {
    setWindowOpenHandler,
    on(_event, listener) {
      willNavigate = listener;
    },
  };
  const navigateTo = (url: string): boolean => {
    const preventDefault = vi.fn();
    willNavigate?.({ preventDefault }, url);
    return preventDefault.mock.calls.length === 0;
  };
  return { contents, setWindowOpenHandler, navigateTo };
}

describe("hardenWebContents", () => {
  it("denies every new window", () => {
    const { contents, setWindowOpenHandler } = fakeContents();
    hardenWebContents(contents, "http://localhost:5173");

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as (details: { url: string }) => {
      action: string;
    };
    expect(handler({ url: "https://example.com" })).toEqual({ action: "deny" });
    // Including one that claims to be us — there is no second window in this
    // app, so the answer does not depend on the URL.
    expect(handler({ url: "http://localhost:5173/" })).toEqual({ action: "deny" });
  });

  it("allows the dev server to navigate within its own origin", () => {
    // Reload and HMR both do exactly this; pinning the full URL would make
    // every reload look like an attack.
    const { contents, navigateTo } = fakeContents();
    hardenWebContents(contents, "http://localhost:5173");

    expect(navigateTo("http://localhost:5173/")).toBe(true);
    expect(navigateTo("http://localhost:5173/index.html")).toBe(true);
  });

  it("blocks navigation off that origin", () => {
    const { contents, navigateTo } = fakeContents();
    hardenWebContents(contents, "http://localhost:5173");

    expect(navigateTo("https://example.com/")).toBe(false);
    expect(navigateTo("http://localhost:5174/")).toBe(false);
    expect(navigateTo("file:///etc/passwd")).toBe(false);
    // Unparseable is refused too: a URL this cannot read is not one it can
    // vouch for.
    expect(navigateTo("not a url")).toBe(false);
  });

  it("blocks every navigation in the packaged build", () => {
    // The packaged renderer is loaded with `loadFile`, and a `file://` URL has
    // origin "null" — which compares EQUAL to every other `file://` URL. Passing
    // the loaded path as the allowed origin would wave through the entire
    // filesystem, so the packaged case allows nothing at all.
    const { contents, navigateTo } = fakeContents();
    hardenWebContents(contents);

    expect(navigateTo("file:///Applications/QRE.app/Contents/dist/index.html")).toBe(false);
    expect(navigateTo("file:///Users/someone/.ssh/id_rsa")).toBe(false);
    expect(navigateTo("https://example.com/")).toBe(false);
  });
});
