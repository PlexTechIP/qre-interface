import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

import { InMemoryRunStore } from "../../shared/runStore";

// Give every renderer test a real, empty in-memory RunStore on `window.store`
// so the save-after-run path (useRunFlow) has somewhere to persist. Tests that
// inject their own store (via props) or assert on saved records override this.
beforeEach(() => {
  window.store = new InMemoryRunStore();
});

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
