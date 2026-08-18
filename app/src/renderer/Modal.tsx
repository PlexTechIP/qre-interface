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
 */
export interface ModalProps {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer actions (usually buttons). */
  footer?: ReactNode;
  /** Optional width/variant class, e.g. "modal-narrow". */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({ titleId, title, onClose, children, footer, className }: ModalProps) {
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

  return (
    // Backdrop click (mousedown on the backdrop itself) closes; clicks inside the
    // card stop propagation so they never reach the backdrop.
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`modal-card${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
