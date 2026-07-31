import type { ArchitectureType, MajoranaArchitecture } from "../../shared/types";
import { MAJORANA_ERROR_RATES } from "../constants/staticOptions";
import type {
  ArchitectureForm,
  GateBasedForm,
  MajoranaForm,
  NeutralAtomForm,
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
 * The architecture options shown in the segmented control. All three are
 * contract-supported and selectable: Superconducting (gateBased), Majorana, and
 * Neutral Atom.
 */
const ARCH_OPTIONS: readonly { value: ArchitectureType; label: string }[] = [
  { value: "gateBased", label: "Superconducting" },
  { value: "majorana", label: "Majorana" },
  { value: "neutralAtom", label: "Neutral Atom" },
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
  const setNeutralAtom = (patch: Partial<NeutralAtomForm>): void => {
    onChange({ ...value, neutralAtom: { ...value.neutralAtom, ...patch } });
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
          {ARCH_OPTIONS.map((option) => (
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
          ))}
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
      ) : value.type === "majorana" ? (
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
      ) : (
        <div className="form-grid">
          <NumberField
            id="na-rydberg-time"
            label="Rydberg Time (ns)"
            value={value.neutralAtom.rydbergTime}
            onChange={(v) => setNeutralAtom({ rydbergTime: v ?? 0 })}
            error={errors.rydbergTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-rydberg-error"
            label="Rydberg Error"
            value={value.neutralAtom.rydbergError}
            onChange={(v) => setNeutralAtom({ rydbergError: v ?? 0 })}
            error={errors.rydbergError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-single-qubit-time"
            label="Single-Qubit Time (ns)"
            value={value.neutralAtom.singleQubitTime}
            onChange={(v) => setNeutralAtom({ singleQubitTime: v ?? 0 })}
            error={errors.singleQubitTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-single-qubit-error"
            label="Single-Qubit Error"
            value={value.neutralAtom.singleQubitError}
            onChange={(v) => setNeutralAtom({ singleQubitError: v ?? 0 })}
            error={errors.singleQubitError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-measurement-time"
            label="Measurement Time (ns)"
            value={value.neutralAtom.measurementTime}
            onChange={(v) => setNeutralAtom({ measurementTime: v ?? 0 })}
            error={errors.measurementTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-measurement-error"
            label="Measurement Error"
            value={value.neutralAtom.measurementError}
            onChange={(v) => setNeutralAtom({ measurementError: v ?? 0 })}
            error={errors.measurementError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-handoff-time"
            label="Handoff Time (ns)"
            value={value.neutralAtom.handoffTime}
            onChange={(v) => setNeutralAtom({ handoffTime: v ?? 0 })}
            error={errors.handoffTime}
            help="Integer · 0 ≤ time"
          />
          <NumberField
            id="na-atom-spacing"
            label="Atom Spacing (µm)"
            value={value.neutralAtom.atomSpacing}
            onChange={(v) => setNeutralAtom({ atomSpacing: v ?? 0 })}
            error={errors.atomSpacing}
            help="0 < spacing"
          />
          <NumberField
            id="na-max-velocity"
            label="Max Velocity (m/s)"
            value={value.neutralAtom.maxVelocity}
            onChange={(v) => setNeutralAtom({ maxVelocity: v ?? 0 })}
            error={errors.maxVelocity}
            help="0 < velocity"
          />
          <NumberField
            id="na-max-acceleration"
            label="Max Acceleration (m/s²)"
            value={value.neutralAtom.maxAcceleration}
            onChange={(v) => setNeutralAtom({ maxAcceleration: v ?? 0 })}
            error={errors.maxAcceleration}
            help="0 < acceleration"
          />
          <NumberField
            id="na-sc-one-qubit-factor"
            label="Surface Code 1-Qubit Time Factor"
            value={value.neutralAtom.surfaceCodeOneQubitTimeFactor}
            onChange={(v) => setNeutralAtom({ surfaceCodeOneQubitTimeFactor: v ?? 1 })}
            error={errors.surfaceCodeOneQubitTimeFactor}
            help="Integer ≥ 1"
          />
          <NumberField
            id="na-sc-two-qubit-factor"
            label="Surface Code 2-Qubit Time Factor"
            value={value.neutralAtom.surfaceCodeTwoQubitTimeFactor}
            onChange={(v) => setNeutralAtom({ surfaceCodeTwoQubitTimeFactor: v ?? 1 })}
            error={errors.surfaceCodeTwoQubitTimeFactor}
            help="Integer ≥ 1"
          />
        </div>
      )}
    </section>
  );
}