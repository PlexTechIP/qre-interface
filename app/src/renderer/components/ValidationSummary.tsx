import type { FieldErrors } from "../state/validation";

interface ValidationSummaryProps {
  errors: FieldErrors;
}

const LABELS: Record<keyof FieldErrors, string> = {
  benchmarkId: "Benchmark",
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
}: ValidationSummaryProps): React.JSX.Element {
  const entries = (Object.keys(errors) as (keyof FieldErrors)[])
    .map((key) => ({ key, message: errors[key] }))
    .filter((entry): entry is { key: keyof FieldErrors; message: string } =>
      Boolean(entry.message),
    );

  if (entries.length === 0) {
    return (
      <div className="validation-box validation-box--ok" role="status">
        <strong>Ready to run.</strong> Your configuration is valid.
      </div>
    );
  }

  return (
    <div className="validation-box validation-box--error" role="alert">
      <strong>
        Resolve {entries.length} {entries.length === 1 ? "issue" : "issues"} to
        run:
      </strong>
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            <span className="validation-box__field">{LABELS[entry.key]}:</span>{" "}
            {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
