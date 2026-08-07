import { useEffect, useRef, useState, type ReactNode } from "react";

interface DefinitionTipProps {
  /** The field's own label, used to name the trigger for screen readers. */
  label: string;
  /**
   * Id given to the tooltip bubble. **The CONTROL must carry
   * `aria-describedby={id}`**, not just this trigger — otherwise a screen-reader
   * user who tabs to the input hears nothing, and only hears the definition if
   * they happen to land on the "?" button. `Field` and `NumberField` derive this
   * id as `${fieldId}-definition` and wire it for you.
   */
  id: string;
  children: ReactNode;
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
  id,
  children,
}: DefinitionTipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        aria-label={`${label} definition`}
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
      <span
        id={id}
        role="tooltip"
        className={`definition-tip__bubble${open ? " definition-tip__bubble--open" : ""}`}
      >
        {children}
      </span>
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
