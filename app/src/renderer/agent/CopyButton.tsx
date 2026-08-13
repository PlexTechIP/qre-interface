import { useEffect, useState } from "react";

interface CopyButtonProps {
  /** The exact text to place on the clipboard. */
  value: string;
  label: string;
}

/**
 * Put a block of JSON on the clipboard.
 *
 * The proposal and the outbound preview are both things the analyst is invited
 * to read literally and then take somewhere else — into a ticket, a note, a
 * message to whoever owns the parameters. Both were selectable text in a
 * scrolling `<pre>` nested inside the page's own scroll, which is the one
 * shape where dragging a selection reliably scrolls the wrong box.
 */
export function CopyButton({ value, label }: CopyButtonProps): React.JSX.Element {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  // Back to the resting label on its own, rather than sitting on "Copied" over
  // a selection the analyst pasted somewhere else a minute ago.
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className="chat-copy"
      onClick={() => {
        /*
         * Reported, never swallowed. The async clipboard is permission-gated
         * and absent outside a secure context, so this genuinely can refuse —
         * and a copy button that silently does nothing is worse than no copy
         * button, because the analyst pastes stale content and never learns it
         * was stale.
         */
        const clipboard = navigator.clipboard as Clipboard | undefined;
        if (clipboard === undefined) {
          setState("failed");
          return;
        }
        void clipboard.writeText(value).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </button>
  );
}
