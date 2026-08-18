/**
 * Swap in a fake clipboard for one test and put the real descriptor back.
 *
 * `await body()`, not `return body()`. Taking a non-async signature around an
 * async body ran the `finally` the moment the body first suspended — so the
 * clipboard was torn down after the first click and every later one saw
 * `navigator.clipboard === undefined` and reported a refusal that never
 * happened.
 *
 * Shared rather than copied: it started in `CopyButton.test.tsx`, and the
 * export dialogs need the same fake now that they use the same button. The
 * subtlety above is exactly the kind that survives in one copy and not the
 * other.
 */
export async function withClipboard(
  writeText: (text: string) => Promise<void>,
  body: () => Promise<void>,
): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  try {
    await body();
  } finally {
    if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
    else Object.defineProperty(navigator, "clipboard", original);
  }
}
