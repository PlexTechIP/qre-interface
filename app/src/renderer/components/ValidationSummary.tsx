import type { FieldErrors } from "../state/validation";
import type { HyperparamError } from "../constants/hyperparameters";
import {
  FIELD_ANCHORS,
  FIELD_LABELS,
  hyperparamAnchor,
} from "./fieldAnchors";
import { jumpToField } from "./fieldNavigation";

/**
 * The field name, emphasised once.
 *
 * Messages are authored to stand alone, because the same string is rendered
 * under the input where nothing else identifies the field. Prefixing the label
 * on top of that read as "Trotter Step: Trotter Step must be at most Total
 * Time." — named twice inside eight words.
 *
 * Stripping the subject was the first attempt and it left verb fragments
 * ("Gate time: is required — enter a value in nanoseconds."). So the sentence
 * is never edited: where it already opens with the field name, that opening is
 * simply the bold part, and the colon-prefix is used only for the messages
 * that do not name their field at all. Either way the list keeps one bold
 * field name per row to scan down.
 */
function labelled(message: string, label: string): React.JSX.Element {
  if (message.toLowerCase().startsWith(label.toLowerCase())) {
    return (
      <>
        {/* Sliced from the message, not the table, so the message's own casing wins. */}
        <span className="validation-box__field">{message.slice(0, label.length)}</span>
        {message.slice(label.length)}
      </>
    );
  }
  return (
    <>
      <span className="validation-box__field">{label}:</span> {message}
    </>
  );
}

interface ValidationSummaryProps {
  /** Scalar field errors. Every value is a string. */
  errors: FieldErrors;
  /** Benchmark hyperparameter errors, which carry their own key and label. */
  hyperparams?: readonly HyperparamError[];
  pending?: boolean;
}

/** Inline error box — lists every unresolved field so there's no dead end. */
export function ValidationSummary({
  errors,
  hyperparams = [],
  pending = false,
}: ValidationSummaryProps): React.JSX.Element {
  // No destructuring-to-exclude any more: `errors` is uniformly string-valued,
  // so walking it is safe by construction.
  const scalarErrors = errors;
  const entries: {
    key: string;
    label: string;
    message: string;
    anchors: readonly string[];
  }[] = [];

  for (const key of Object.keys(scalarErrors) as (keyof typeof scalarErrors)[]) {
    const message = scalarErrors[key];
    if (message) {
      entries.push({
        key,
        label: FIELD_LABELS[key],
        message,
        anchors: FIELD_ANCHORS[key],
      });
    }
  }
  // Hyperparameter errors carry their own field label from the schema, and their
  // inputs are rendered with a `hparam-<key>` id by HyperparametersPanel.
  for (const error of hyperparams) {
    entries.push({
      key: `hyperparam-${error.key}`,
      label: error.label,
      message: error.message,
      anchors: [hyperparamAnchor(error.key)],
    });
  }

  if (entries.length === 0) {
    return (
      <div className="validation-box validation-box--ok" role="status">
        <strong>Ready to run.</strong> Your configuration is valid.
      </div>
    );
  }

  return (
    <div
      className={`validation-box ${
        pending ? "validation-box--pending" : "validation-box--error"
      }`}
      role={pending ? "status" : "alert"}
    >
      <strong>
        {pending
          ? `Complete ${entries.length} required ${
              entries.length === 1 ? "field" : "fields"
            } to run:`
          : `Resolve ${entries.length} ${
              entries.length === 1 ? "issue" : "issues"
            } to run:`}
      </strong>
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              className="validation-box__jump"
              onClick={() => jumpToField(entry.anchors)}
              title={`Jump to ${entry.label}`}
            >
              {labelled(entry.message, entry.label)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
