import { useEffect, useRef, type ReactNode } from "react";

/**
 * A small accessible dialog, used by the Run History per-run actions (Delete
 * confirm, Export, Rerun preview), the comparison export, and the conversation
 * export. Pure presentation — it owns no store or record knowledge; the caller
 * renders it conditionally and handles `onClose`.
 *
 * Hoisted out of `history/` when the chat export became its sixth caller and
 * its first outside that folder, following the same rule `download.ts` and
 * `CopyButton.tsx` did: a shared thing lives beside the surfaces that share it,
 * not inside whichever one happened to need it first.
 *
 * Accessibility: role="dialog" + aria-modal, labelled by the caller's title id,
 * closes on Escape or backdrop click, moves focus into the dialog on open and
 * restores it on close, and traps Tab within the dialog while open.
 *
 * Two header shapes. The default renders the dialog's own title bar (an `<h2>`
 * and a close button) from `title`/`titleId`. A surface whose content already
 * carries its own heading — Settings, whose page owns an `<h1>` — instead passes
 * `ariaLabel` and no `title`: the dialog is labelled by that string, gets a
 * floating close button, and does not stamp a second "Settings" above the one
 * the page already renders.
 */
export interface ModalProps {
  /** Id of the rendered title `<h2>`. Required with `title`; unused without it. */
  titleId?: string;
  /** The dialog's visible title bar. Omit it when the content owns its heading. */
  title?: string;
  /** Accessible name when there is no `title` to label the dialog by. */
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer actions (usually buttons). */
  footer?: ReactNode;
  /** Optional width/variant class, e.g. "modal-narrow". */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  titleId,
  title,
  ariaLabel,
  onClose,
  children,
  footer,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // A dialog must be named exactly one way: by the title bar it renders, or by
  // `ariaLabel` when it renders none.
  const labelling =
    title !== undefined
      ? { "aria-labelledby": titleId }
      : { "aria-label": ariaLabel };

  return (
    // Backdrop click (mousedown on the backdrop itself) closes; clicks inside the
    // card stop propagation so they never reach the backdrop.
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`modal-card${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        {...labelling}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {title !== undefined ? (
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>
        ) : (
          // Headerless: the content owns its heading, so the close control floats
          // over the top-right corner rather than sitting in a title bar.
          <button
            type="button"
            className="modal-close modal-close--float"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        )}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
