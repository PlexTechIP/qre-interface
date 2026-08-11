import type { FieldErrors } from "../state/validation";
import {
  FIELD_ANCHORS,
  FIELD_LABELS,
  hyperparamAnchor,
  jumpToField,
} from "./fieldAnchors";

interface ValidationSummaryProps {
  errors: FieldErrors;
  pending?: boolean;
}

/** Inline error box — lists every unresolved field so there's no dead end. */
export function ValidationSummary({
  errors,
  pending = false,
}: ValidationSummaryProps): React.JSX.Element {
  const { hyperparams, ...scalarErrors } = errors;
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
  for (const error of hyperparams ?? []) {
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
              <span className="validation-box__field">{entry.label}:</span>{" "}
              {entry.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
