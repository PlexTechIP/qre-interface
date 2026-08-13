import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  /** The exact text to place on the clipboard. */
  value: string;
  label: string;
}

/**
 * What the last click did, and WHICH click did it.
 *
 * The `click` counter is load-bearing rather than debug detail. Holding only
 * `"copied" | "failed" | "idle"`, a second copy while the first was still
 * showing set the state to the value it already held — React bails out of an
 * identical update, so the effect below never re-ran and the ORIGINAL two-second
 * timer kept counting. Copy at t=0 and again at t=1950ms and the label snapped
 * back to "Copy JSON" fifty milliseconds after the second copy succeeded, which
 * reads as failure on the one control whose entire job is saying whether it
 * worked. A fresh object per click makes each one reset its own window.
 */
interface CopyOutcome {
  readonly tone: "copied" | "failed";
  readonly click: number;
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
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const clicks = useRef(0);

  // Back to the resting label on its own, rather than sitting on "Copied" over
  // a selection the analyst pasted somewhere else a minute ago.
  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), 2000);
    return () => clearTimeout(timer);
  }, [outcome]);

  return (
    <button
      type="button"
      className="chat-copy"
      onClick={() => {
        clicks.current += 1;
        const click = clicks.current;
        /*
         * Reported, never swallowed. The async clipboard is permission-gated
         * and absent outside a secure context, so this genuinely can refuse —
         * and a copy button that silently does nothing is worse than no copy
         * button, because the analyst pastes stale content and never learns it
         * was stale.
         */
        const clipboard = navigator.clipboard as Clipboard | undefined;
        if (clipboard === undefined) {
          setOutcome({ tone: "failed", click });
          return;
        }
        void clipboard.writeText(value).then(
          () => setOutcome({ tone: "copied", click }),
          () => setOutcome({ tone: "failed", click }),
        );
      }}
    >
      {outcome === null ? label : outcome.tone === "copied" ? "Copied" : "Could not copy"}
    </button>
  );
}
