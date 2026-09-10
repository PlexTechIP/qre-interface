import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface DefinitionTipProps {
  /** The field's own label, used to name the trigger for screen readers. */
  label: string;
  /**
   * Overrides the trigger's accessible name. Defaults to `${label} definition`,
   * which reads well for a field ("QEC Code definition") but not for everything
   * — a Settings section wants "About AI providers", not "AI providers
   * definition". Callers outside the config forms pass the whole name here.
   */
  triggerLabel?: string;
  /**
   * Id given to the tooltip bubble. **The CONTROL must carry
   * `aria-describedby={id}`**, not just this trigger — otherwise a screen-reader
   * user who tabs to the input hears nothing, and only hears the definition if
   * they happen to land on the "?" button. `Field` and `NumberField` derive this
   * id as `${fieldId}-definition` and wire it for you.
   */
  id: string;
  children: ReactNode;
  /**
   * Render the bubble in a portal, fixed-positioned next to the trigger, so it
   * overlays the page instead of being clipped or stacked behind a scroll /
   * `overflow` / sticky ancestor. Needed inside the comparison table, whose
   * horizontal scroll container clips its own overflow and whose sticky column
   * traps z-index. Default (`false`) keeps the CSS-positioned bubble the config
   * forms use, where there is no clipping ancestor.
   */
  portal?: boolean;
}

/**
 * An on-demand definition for one field: a "?" trigger and a tooltip bubble.
 *
 * Deliberately not a `title=` attribute. `title` is invisible to keyboard users,
 * announced inconsistently, and cannot be styled or dismissed — it fails most of
 * the accessibility bar this control has to clear.
 *
 * The bubble stays MOUNTED while hidden. `aria-describedby` resolves against
 * hidden elements by design, so the description is available to a screen reader
 * on the control at all times, while sighted users only see it on demand.
 */
export function DefinitionTip({
  label,
  triggerLabel,
  id,
  children,
  portal = false,
}: DefinitionTipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties>();

  // Escape dismisses the bubble whether it was opened by hover, focus or click.
  //
  // A keydown handler on the TRIGGER only fires while the trigger has focus,
  // which a hover-opened bubble never has — the pointer user's only escape was
  // to move the pointer away. WCAG 2.1 SC 1.4.13 (Content on Hover or Focus)
  // requires dismissal without moving pointer hover OR keyboard focus, so the
  // listener has to sit on the document. It is only attached while open, so a
  // form full of these fields adds at most one listener at a time.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // Swallow Escape ONLY when this trigger holds focus — i.e. the analyst
      // deliberately opened this bubble and it really is the topmost thing they
      // are interacting with.
      //
      // Swallowing unconditionally was wrong, and quietly so: this listener is
      // on `document` in the CAPTURE phase, while React delegates from the root
      // container (a descendant of `document`). An unconditional
      // stopPropagation therefore stopped the event before it ever reached the
      // React tree — so merely resting the pointer on a "?" glyph, which is all
      // it takes to open a bubble, made Escape dead for every other dismissible
      // surface in the app. A hover is not a claim on the key.
      if (document.activeElement === triggerRef.current) {
        event.stopPropagation();
      }
      setOpen(false);
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [open]);

  // Place the portaled bubble beside the trigger and keep it there. It is
  // `position: fixed`, so it is measured against the viewport and immune to the
  // table's clipping and stacking. Preferred spot is to the trigger's right,
  // vertically centred; it flips to the left if the right would run off-screen,
  // and the top is clamped into the viewport. Recomputed on scroll/resize so
  // scrolling the table keeps the bubble pinned to its "?". Layout effect so the
  // position is set before paint — no first-frame flash at 0,0.
  useLayoutEffect(() => {
    if (!portal || !open) return;
    // Shrink the box to its own text so the description fills it — the widest
    // wrapped line touches both edges, with no leftover width. CSS cannot size a
    // block to its longest line, so let the text wrap within the cap (with
    // `text-wrap: balance` evening the lines), measure the actual line boxes via
    // a Range, and set the box to the widest one. Widths are border-box (global
    // reset); NaN in a non-DOM test env is filtered by the caller.
    const sizeToText = (bubble: HTMLElement): number => {
      const style = getComputedStyle(bubble);
      const chromeX =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);

      // Wrap at the cap, then read each rendered line's width.
      const cap = Math.min(340, window.innerWidth * 0.8);
      bubble.style.maxWidth = "none";
      bubble.style.whiteSpace = "";
      bubble.style.width = `${cap}px`;
      const range = document.createRange();
      range.selectNodeContents(bubble);
      let widestLine = 0;
      for (const rect of range.getClientRects()) {
        widestLine = Math.max(widestLine, rect.width);
      }
      range.detach();
      bubble.style.maxWidth = "";

      // +1 absorbs sub-pixel rounding so the widest line never re-wraps.
      return Math.ceil(widestLine) + chromeX + 1;
    };

    const place = (): void => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;
      const margin = 8;
      // No layout in a non-DOM test environment — leave width to CSS then.
      const width = sizeToText(bubble);
      const sized = Number.isFinite(width);
      if (sized) bubble.style.width = `${width}px`;
      const t = trigger.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      let left = t.right + margin;
      if (left + b.width > window.innerWidth - margin) {
        left = Math.max(margin, t.left - margin - b.width);
      }
      const top = Math.min(
        Math.max(margin, t.top + t.height / 2 - b.height / 2),
        Math.max(margin, window.innerHeight - margin - b.height),
      );
      setFixedStyle(sized ? { top, left, width } : { top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [portal, open, children]);

  const bubble = (
    <span
      ref={bubbleRef}
      id={id}
      role="tooltip"
      className={`definition-tip__bubble${portal ? " definition-tip__bubble--portal" : ""}${open ? " definition-tip__bubble--open" : ""}`}
      style={portal ? fixedStyle : undefined}
    >
      {children}
    </span>
  );

  return (
    <span
      className="definition-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="definition-tip__trigger"
        aria-label={triggerLabel ?? `${label} definition`}
        aria-expanded={open}
        aria-controls={id}
        // Click OPENS rather than toggles. A toggle fights the hover handler:
        // the pointer has already opened the bubble by the time the click lands,
        // so toggling would close it and clicking would look broken. Escape and
        // moving away are the ways to dismiss it.
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {portal ? createPortal(bubble, document.body) : bubble}
    </span>
  );
}

/** The bubble id for a field, and the value its control's `aria-describedby` takes. */
export function definitionId(fieldId: string): string {
  return `${fieldId}-definition`;
}

/**
 * The `aria-describedby` a control should carry for its definition — or
 * `undefined` when there is no copy for that field.
 *
 * Use this rather than a bare `definitionId(id)` at any call site that renders
 * the tip conditionally. `Field` and `NumberField` only mount a `DefinitionTip`
 * when `definition` is truthy, and the copy tables are `Record<string, string>`
 * reads, which `noUncheckedIndexedAccess` correctly types as possibly
 * `undefined`. Hard-coding the id on the control therefore risks pointing
 * `aria-describedby` at an element that was never rendered — a dangling IDREF,
 * which drops the description AND, in most screen readers, the field's own help
 * line along with it.
 */
export function definitionDescribedBy(
  fieldId: string,
  definition: string | undefined,
): string | undefined {
  return definition ? definitionId(fieldId) : undefined;
}
