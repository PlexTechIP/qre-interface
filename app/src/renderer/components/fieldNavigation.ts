/**
 * Taking the analyst to a field.
 *
 * Split out of `fieldAnchors.ts`, which now holds only the anchor ids and
 * labels. Those are pure data that non-UI code legitimately needs — the agent
 * draft mapping labels its proposals with them — and keeping the two together
 * meant importing an anchor id also imported `document` and `window`. That
 * dragged a DOM into the MCP server, a process which has none.
 */

/**
 * Reveal a field that is inside one or more collapsed `<details>`.
 *
 * A closed `<details>` keeps its children in the document, so `getElementById`
 * finds them and every check short of looking at the screen reports success —
 * but the element has no box to scroll to and cannot take focus. The
 * Hyperparameters panel is a `<details>` that starts closed, so every
 * hyperparameter issue in the validation summary pointed at a control the
 * analyst could not be shown, and clicking one did nothing whatsoever.
 *
 * Ancestors are opened outermost-last (walking up), so a panel nested in
 * another panel is fully revealed rather than opened into a still-closed
 * parent.
 */
function revealAncestors(el: Element): void {
  for (
    let details = el.closest("details");
    details !== null;
    details = details.parentElement?.closest("details") ?? null
  ) {
    details.open = true;
  }
}

/** Scroll the first mounted candidate into view, flash it, and focus it. */
export function jumpToField(candidateIds: readonly string[]): void {
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    // Before anything else: a field inside a closed panel cannot be scrolled
    // to or focused, and every step below would silently do nothing.
    revealAncestors(el);
    // jsdom has no layout engine, so guard the scroll for the test environment.
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Flash the whole field group rather than the bare input, so the analyst's
    // eye lands on the label + control together. `.hparam` is the benchmark
    // parameters' group; without it those flashed the bare input instead.
    const target = el.closest(".field, .field-block, .micro-group, .hparam") ?? el;
    target.classList.add("field--flash");
    window.setTimeout(() => target.classList.remove("field--flash"), 1200);
    // Focus after the scroll settles; `preventScroll` keeps it from fighting the
    // smooth scroll above. Label anchors aren't focusable — that's fine.
    window.setTimeout(() => el.focus?.({ preventScroll: true }), 250);
    return;
  }
}
