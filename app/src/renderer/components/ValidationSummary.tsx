import type { FieldErrors } from "../state/validation";
 
interface ValidationSummaryProps {
  errors: FieldErrors;
  pending?: boolean;
}
 
/**
 * Where each validation key lives in the form, as a list of candidate element
 * ids. Only one architecture's fields are mounted at a time, so a key that can
 * surface under more than one architecture (e.g. `errorRate`) lists every id it
 * could carry; the click resolves to whichever is actually in the DOM. Ids that
 * are not simple inputs point at the block's labelling element instead — good
 * enough to scroll to, and the field takes over from there.
 */
const FIELD_ANCHORS: Record<Exclude<keyof FieldErrors, "hyperparams">, string[]> = {
  benchmarkId: ["select-benchmark-label"],
  savedProgram: ["saved-program-label"],
  uploadFilePath: ["upload-file"],
  numQubits: ["manual-numQubits"],
  tCount: ["manual-tCount"],
  rotationCount: ["manual-rotationCount"],
  rotationDepth: ["manual-rotationDepth"],
  cczCount: ["manual-cczCount"],
  ccixCount: ["manual-ccixCount"],
  measurementCount: ["manual-measurementCount"],
  errorRate: ["gb-error-rate", "mj-error-rate"],
  gateTime: ["gb-gate-time"],
  measurementTime: ["gb-measurement-time", "na-measurement-time"],
  twoQubitGateTime: ["gb-two-qubit-time"],
  operationTime: ["mj-operation-time"],
  rydbergTime: ["na-rydberg-time"],
  rydbergError: ["na-rydberg-error"],
  singleQubitTime: ["na-single-qubit-time"],
  singleQubitError: ["na-single-qubit-error"],
  measurementError: ["na-measurement-error"],
  handoffTime: ["na-handoff-time"],
  atomSpacing: ["na-atom-spacing"],
  maxVelocity: ["na-max-velocity"],
  maxAcceleration: ["na-max-acceleration"],
  surfaceCodeOneQubitTimeFactor: ["na-sc-one-qubit-factor"],
  surfaceCodeTwoQubitTimeFactor: ["na-sc-two-qubit-factor"],
  tErrorRate: ["mj-t-error-rate"],
  targetYear: ["mj-target-year", "na-target-year"],
  dataQubitSpacing: ["na-data-qubit-spacing"],
  tStatesPerRotation: ["micro-tstates"],
  computeCapacityPercentage: ["micro-dmc-capacity"],
  maxError: ["micro-max-error"],
  magicStateFactories: ["micro-factory-label"],
};

/** Scroll the first mounted candidate into view, flash it, and focus it. */
function jumpToField(candidateIds: string[]): void {
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    // jsdom has no layout engine, so guard the scroll for the test environment.
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Flash the whole field group rather than the bare input, so the analyst's
    // eye lands on the label + control together.
    const target = el.closest(".field, .field-block, .micro-group") ?? el;
    target.classList.add("field--flash");
    window.setTimeout(() => target.classList.remove("field--flash"), 1200);
    // Focus after the scroll settles; `preventScroll` keeps it from fighting the
    // smooth scroll above. Label anchors aren't focusable — that's fine.
    window.setTimeout(() => el.focus?.({ preventScroll: true }), 250);
    return;
  }
}

const LABELS: Record<Exclude<keyof FieldErrors, "hyperparams">, string> = {
  benchmarkId: "Benchmark",
  savedProgram: "Saved program",
  uploadFilePath: "Program file",
  numQubits: "Number of qubits",
  tCount: "T count",
  rotationCount: "Rotation count",
  rotationDepth: "Rotation depth",
  cczCount: "CCZ count",
  ccixCount: "CCiX count",
  measurementCount: "Measurement count",
  errorRate: "Error rate",
  gateTime: "Gate time",
  measurementTime: "Measurement time",
  twoQubitGateTime: "Two-qubit gate time",
  operationTime: "Operation time",
  rydbergTime: "Rydberg time",
  rydbergError: "Rydberg error",
  singleQubitTime: "Single-qubit time",
  singleQubitError: "Single-qubit error",
  measurementError: "Measurement error",
  handoffTime: "Handoff time",
  atomSpacing: "Atom spacing",
  maxVelocity: "Max velocity",
  maxAcceleration: "Max acceleration",
  surfaceCodeOneQubitTimeFactor: "Surface code 1-qubit time factor",
  surfaceCodeTwoQubitTimeFactor: "Surface code 2-qubit time factor",
  tErrorRate: "T Error Rate",
  targetYear: "Target Year",
  dataQubitSpacing: "Data Qubit Spacing",
  tStatesPerRotation: "T Count Per Rotation",
  computeCapacityPercentage: "Compute Capacity Percentage",
  maxError: "Total Fault Tolerant Execution Error",
  magicStateFactories: "Magic State Factory",
};
 
/** Inline error box — lists every unresolved field so there's no dead end. */
export function ValidationSummary({
  errors,
  pending = false,
}: ValidationSummaryProps): React.JSX.Element {
  const { hyperparams, ...scalarErrors } = errors;
  const entries: { key: string; label: string; message: string; anchors: string[] }[] = [];
 
  for (const key of Object.keys(scalarErrors) as (keyof typeof scalarErrors)[]) {
    const message = scalarErrors[key];
    if (message) entries.push({ key, label: LABELS[key], message, anchors: FIELD_ANCHORS[key] });
  }
  // Hyperparameter errors carry their own field label from the schema, and their
  // inputs are rendered with a `hparam-<key>` id by HyperparametersPanel.
  for (const error of hyperparams ?? []) {
    entries.push({
      key: `hyperparam-${error.key}`,
      label: error.label,
      message: error.message,
      anchors: [`hparam-${error.key}`],
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