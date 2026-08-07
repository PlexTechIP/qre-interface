import { useState, type ReactNode } from "react";

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

  return (
    <span
      className="definition-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
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
        onKeyDown={(event) => {
          // Dismissible without moving focus. stopPropagation so Escape closes
          // the tooltip rather than whatever dialog encloses the form.
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
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
