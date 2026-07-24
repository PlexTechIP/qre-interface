import "@testing-library/jest-dom/vitest";

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
