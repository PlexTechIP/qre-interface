import type { FieldErrors } from "../state/validation";

interface ValidationSummaryProps {
  errors: FieldErrors;
  pending?: boolean;
}

const LABELS: Record<Exclude<keyof FieldErrors, "hyperparams">, string> = {
  benchmarkId: "Benchmark",
  savedProgram: "Saved program",
  uploadFilePath: "Program file",
  errorRate: "Error rate",
  gateTime: "Gate time",
  measurementTime: "Measurement time",
  twoQubitGateTime: "Two-qubit gate time",
  operationTime: "Operation time",
  tStatesPerRotation: "T states per rotation",
  maxError: "Max error",
};

/** Inline error box — lists every unresolved field so there's no dead end. */
export function ValidationSummary({
  errors,
  pending = false,
}: ValidationSummaryProps): React.JSX.Element {
  const { hyperparams, ...scalarErrors } = errors;
  const entries: { key: string; label: string; message: string }[] = [];

  for (const key of Object.keys(scalarErrors) as (keyof typeof scalarErrors)[]) {
    const message = scalarErrors[key];
    if (message) entries.push({ key, label: LABELS[key], message });
  }
  // Hyperparameter errors carry their own field label from the schema.
  for (const error of hyperparams ?? []) {
    entries.push({ key: `hyperparam-${error.key}`, label: error.label, message: error.message });
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
            <span className="validation-box__field">{entry.label}:</span>{" "}
            {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
