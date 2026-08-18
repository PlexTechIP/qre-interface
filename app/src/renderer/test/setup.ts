import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

import { InMemoryChatStore } from "../../shared/chatStore";
import { InMemoryRunStore } from "../../shared/runStore";
import { installMatchMedia } from "./matchMedia";

// jsdom implements no matchMedia, and the theme now SUBSCRIBES to it rather
// than reading it once. Installed for every test (defaulting to light, which
// is what the absent API effectively meant before) so no suite has to know
// the theme reaches for a browser API that isn't there.
beforeEach(() => {
  installMatchMedia();
});

// Give every renderer test a real, empty in-memory RunStore on `window.store`
// so the save-after-run path (useRunFlow) has somewhere to persist, and the
// same for `window.chats` — `node:sqlite` needs Node 24 and is unreachable from
// jsdom, so the in-memory twin held to the same contract suite is what the UI
// is exercised against. Tests that inject their own store (via props) or assert
// on saved records override these.
beforeEach(() => {
  window.store = new InMemoryRunStore();
  window.chats = new InMemoryChatStore();
});

// jsdom implements no scrolling at all, so `scrollIntoView` is simply absent —
// and the chat transcript calls it on mount to bring the newest turn into view,
// which without this stub throws inside an effect and takes the whole page down
// with it. A no-op is the honest double: jsdom reports every element as 0×0, so
// there is no scroll position here worth asserting on either way.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

// jsdom ships no ResizeObserver, which Recharts' ResponsiveContainer constructs
// on mount. A no-op stub lets the Comparison charts render in tests without
// throwing; the charts have a text-equivalent table, so tests assert against
// that rather than SVG geometry (which jsdom reports as 0×0 anyway).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
