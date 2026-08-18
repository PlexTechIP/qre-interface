import type { ProposedField } from "../agent/draftToFormState";
import { jumpToField } from "./fieldAnchors";

interface ModelProposalSummaryProps {
  /** Exactly what the model chose — see `DraftHandoff.proposed`. */
  proposed: readonly ProposedField[];
  /** Provider/model identifier from the draft's provenance. */
  model: string | undefined;
}

/**
 * What the model actually set, listed beside the form it filled in.
 *
 * "Review before you run" only means something if the thing under review is
 * legible. A proposal arrives as a fully-populated configuration — around forty
 * fields — with nothing to distinguish the handful the model decided from the
 * defaults it never mentioned, so the analyst was being asked to approve a
 * screen of numbers with no way to read it. This is that missing half of the
 * review step; it does not add a second one.
 *
 * It states what the model PROPOSED, not what the form currently holds. That
 * wording is deliberate: the analyst edits the form afterwards, and a panel
 * claiming to describe current values would start lying on the first keystroke.
 * As a record of the proposal it stays true for as long as it is on screen, and
 * the jump affordance takes the analyst to the live control to see the rest.
 */
export function ModelProposalSummary({
  proposed,
  model,
}: ModelProposalSummaryProps): React.JSX.Element | null {
  if (proposed.length === 0) return null;

  return (
    <section className="model-proposal" aria-labelledby="model-proposal-heading">
      <h2 id="model-proposal-heading" className="model-proposal__title">
        Drafted by {model ?? "a model"}
      </h2>
      <p className="model-proposal__lede">
        The model chose{" "}
        <strong>
          {proposed.length} {proposed.length === 1 ? "field" : "fields"}
        </strong>
        . Everything else below is this form&rsquo;s own default, not its
        suggestion. Edit anything you like — nothing runs until you press Run
        estimate.
      </p>
      <ul className="model-proposal__list">
        {proposed.map((field, index) => (
          <li key={`${field.label}-${index}`}>
            <button
              type="button"
              className="model-proposal__jump"
              onClick={() => jumpToField(field.anchors)}
              title={`Jump to ${field.label}`}
              // Named explicitly rather than left to the two spans: they sit at
              // opposite ends of a flex row with no text node between them, so
              // the computed name ran them together — "Gate time50".
              aria-label={`${field.label}: ${field.value}. Jump to this field.`}
            >
              <span className="model-proposal__field">{field.label}</span>
              <span className="model-proposal__value">{field.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
