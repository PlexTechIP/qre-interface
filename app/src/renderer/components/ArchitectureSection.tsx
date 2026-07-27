import type { ArchitectureType, MajoranaArchitecture } from "../../shared/types";
import { MAJORANA_ERROR_RATES } from "../constants/staticOptions";
import type {
  ArchitectureForm,
  GateBasedForm,
  MajoranaForm,
} from "../state/formState";
import type { FieldErrors } from "../state/validation";
import { Field } from "./Field";
import { NumberField } from "./NumberField";

interface ArchitectureSectionProps {
  value: ArchitectureForm;
  errors: FieldErrors;
  onChange: (value: ArchitectureForm) => void;
}

/**
 * The architecture options shown in the segmented control. Only the two the
 * contract supports (`gateBased`, `majorana`) are selectable; Neutral Atom and
 * Trapped Ion are displayed but disabled — Trapped Ion is marked Private, and
 * neither is available in this build (no contract variant + no engine support).
 */
type ArchOption =
  | { value: ArchitectureType; label: string; available: true }
  | { value: string; label: string; available: false; reason: string };

const ARCH_OPTIONS: readonly ArchOption[] = [
  { value: "gateBased", label: "Superconducting", available: true },
  { value: "majorana", label: "Majorana", available: true },
  { value: "neutral-atom", label: "Neutral Atom", available: false, reason: "Not available in this build yet." },
  { value: "trapped-ion", label: "Trapped Ion · Private", available: false, reason: "Private — not available." },
];

/** Input 2 — QPU Specifications. Reveals only the selected architecture's fields. */
export function ArchitectureSection({
  value,
  errors,
  onChange,
}: ArchitectureSectionProps): React.JSX.Element {
  const setGate = (patch: Partial<GateBasedForm>): void => {
    onChange({ ...value, gateBased: { ...value.gateBased, ...patch } });
  };
  const setMajorana = (patch: Partial<MajoranaForm>): void => {
    onChange({ ...value, majorana: { ...value.majorana, ...patch } });
  };

  return (
    <section className="form-section qpu-section" aria-labelledby="qpu-heading">
      <header className="form-section__head">
        <h2 id="qpu-heading" className="form-section__title">
          QPU Specifications
        </h2>
      </header>

      <div className="field-block">
        <span className="field-eyebrow" id="architecture-label">
          Architecture
        </span>
        <div className="seg seg--solid" role="radiogroup" aria-labelledby="architecture-label">
          {ARCH_OPTIONS.map((option) =>
            option.available ? (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value.type === option.value}
                className={`seg__btn${value.type === option.value ? " seg__btn--active" : ""}`}
                onClick={() => onChange({ ...value, type: option.value })}
              >
                {option.label}
              </button>
            ) : (
              <button
                key={option.value}
                type="button"
                className="seg__btn seg__btn--disabled"
                disabled
                aria-disabled="true"
                title={option.reason}
              >
                {option.label}
              </button>
            ),
          )}
        </div>
      </div>

      {value.type === "gateBased" ? (
        <div className="form-grid">
          <NumberField
            id="gb-error-rate"
            label="Error rate"
            value={value.gateBased.errorRate}
            onChange={(v) => setGate({ errorRate: v })}
            error={errors.errorRate}
            help="0 < rate < 0.01"
          />
          <NumberField
            id="gb-gate-time"
            label="Single-Qubit Gate Time (ns)"
            placeholder="None"
            value={value.gateBased.gateTime}
            onChange={(v) => setGate({ gateTime: v })}
            error={errors.gateTime}
            help="Required · 0 < gate time"
          />
          <NumberField
            id="gb-measurement-time"
            label="Measurement Time (ns)"
            placeholder="None"
            value={value.gateBased.measurementTime}
            onChange={(v) => setGate({ measurementTime: v })}
            error={errors.measurementTime}
            help="Required · 0 < meas. time"
          />
          <NumberField
            id="gb-two-qubit-time"
            label="Two-Qubit Gate Time (ns)"
            placeholder="None"
            value={value.gateBased.twoQubitGateTime}
            onChange={(v) => setGate({ twoQubitGateTime: v })}
            error={errors.twoQubitGateTime}
            help="Optional · None or integer"
          />
        </div>
      ) : (
        <div className="form-grid">
          <Field id="mj-error-rate" label="Error rate" help="1e-4 / 1e-5 / 1e-6">
            <select
              id="mj-error-rate"
              className="field__input"
              value={String(value.majorana.errorRate)}
              onChange={(event) =>
                setMajorana({
                  errorRate: Number(
                    event.target.value,
                  ) as MajoranaArchitecture["errorRate"],
                })
              }
            >
              {MAJORANA_ERROR_RATES.map((option) => (
                <option key={option.label} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            id="mj-operation-time"
            label="Operation Time (ns)"
            placeholder="None"
            value={value.majorana.operationTime}
            onChange={(v) => setMajorana({ operationTime: v })}
            error={errors.operationTime}
            help="Required · 0 < op. time"
          />
        </div>
      )}
    </section>
  );
}
