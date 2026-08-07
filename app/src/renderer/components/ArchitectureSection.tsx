import type { ArchitectureType, MajoranaArchitecture } from "../../shared/types";
import {
  GATE_BASED_DEFINITIONS,
  MAJORANA_DEFINITIONS,
  NEUTRAL_ATOM_DEFINITIONS,
} from "../constants/configDefinitions";
import { MAJORANA_ERROR_RATES } from "../constants/staticOptions";
import type {
  ArchitectureForm,
  GateBasedForm,
  MajoranaForm,
  NeutralAtomForm,
} from "../state/formState";
import type { FieldErrors } from "../state/validation";
import { definitionId } from "./DefinitionTip";
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
        {/* No tooltip: the Config Descriptions tab carries copy for each
            architecture's FIELDS but not for the selector itself, and an
            invented definition would read as reviewed copy. Listed in the PR
            description as copy to request. */}
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
            definition={GATE_BASED_DEFINITIONS.errorRate}
            value={value.gateBased.errorRate}
            onChange={(v) => setGate({ errorRate: v })}
            error={errors.errorRate}
            help="0 < rate < 0.01"
          />
          {/* The three GateBased times are `integer` in the schema as of the
              2026-08-02 follow-up, and qdk rejects 50.5 outright — so the form
              refuses a decimal under the field rather than at Run-click. */}
          <NumberField
            id="gb-gate-time"
            label="Single-Qubit Gate Time (ns)"
            definition={GATE_BASED_DEFINITIONS.gateTime}
            placeholder="None"
            integer
            value={value.gateBased.gateTime}
            onChange={(v) => setGate({ gateTime: v })}
            error={errors.gateTime}
            help="Required · whole number · 0 < gate time"
          />
          <NumberField
            id="gb-measurement-time"
            label="Measurement Time (ns)"
            definition={GATE_BASED_DEFINITIONS.measurementTime}
            placeholder="None"
            integer
            value={value.gateBased.measurementTime}
            onChange={(v) => setGate({ measurementTime: v })}
            error={errors.measurementTime}
            help="Required · whole number · 0 < meas. time"
          />
          <NumberField
            id="gb-two-qubit-time"
            label="Two-Qubit Gate Time (ns)"
            definition={GATE_BASED_DEFINITIONS.twoQubitGateTime}
            placeholder="None"
            integer
            value={value.gateBased.twoQubitGateTime}
            onChange={(v) => setGate({ twoQubitGateTime: v })}
            error={errors.twoQubitGateTime}
            help="Optional · whole number"
          />
        </div>
      ) : value.type === "majorana" ? (
        <div className="form-grid">
          <Field
            id="mj-error-rate"
            label="Error rate"
            definition={MAJORANA_DEFINITIONS.errorRate}
            help="1e-4 / 1e-5 / 1e-6"
          >
            <select
              id="mj-error-rate"
              className="field__input"
              aria-describedby={definitionId("mj-error-rate")}
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
            definition={MAJORANA_DEFINITIONS.operationTime}
            placeholder="None"
            integer
            value={value.majorana.operationTime}
            onChange={(v) => setMajorana({ operationTime: v })}
            error={errors.operationTime}
            help="Required · whole number · 0 < op. time"
          />
          {/* v1.4.0. T Error Rate is NOT recorded-only: left blank, qdk derives
              it from Error Rate in Majorana.__post_init__ (1e-4 -> 0.05,
              1e-5 -> 0.015, 1e-6 -> 0.01); set, it is genuinely live. The help
              text says which, because "optional" alone would not. The (0, 0.05]
              bound is ours — qdk accepts 0.9 and -0.1 without complaint. */}
          <NumberField
            id="mj-t-error-rate"
            label="T Error Rate"
            definition={MAJORANA_DEFINITIONS.tErrorRate}
            placeholder="Derived"
            value={value.majorana.tErrorRate}
            onChange={(v) => setMajorana({ tErrorRate: v })}
            error={errors.tErrorRate}
            help="Optional · derived from Error Rate when left blank · 0 < rate ≤ 0.05"
          />
          {/* v1.4.0. Recorded, not influential — qdk sets it on MEAS_XX/MEAS_ZZ
              as a property, and no stage of our pipeline consumes a target year.
              Different reason from T Error Rate above, so different wording. */}
          <NumberField
            id="mj-target-year"
            label="Target Year"
            definition={MAJORANA_DEFINITIONS.targetYear}
            placeholder="None"
            integer
            value={value.majorana.targetYear}
            onChange={(v) => setMajorana({ targetYear: v })}
            error={errors.targetYear}
            help="Optional · recorded, does not affect the estimate"
          />
        </div>
      ) : (
        <div className="form-grid">
          <NumberField
            id="na-rydberg-time"
            label="Rydberg Time (ns)"
            definition={NEUTRAL_ATOM_DEFINITIONS.rydbergTime}
            integer
            value={value.neutralAtom.rydbergTime}
            onChange={(v) => setNeutralAtom({ rydbergTime: v ?? 0 })}
            error={errors.rydbergTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-rydberg-error"
            label="Rydberg Error"
            definition={NEUTRAL_ATOM_DEFINITIONS.rydbergError}
            value={value.neutralAtom.rydbergError}
            onChange={(v) => setNeutralAtom({ rydbergError: v ?? 0 })}
            error={errors.rydbergError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-single-qubit-time"
            label="Single-Qubit Time (ns)"
            definition={NEUTRAL_ATOM_DEFINITIONS.singleQubitTime}
            integer
            value={value.neutralAtom.singleQubitTime}
            onChange={(v) => setNeutralAtom({ singleQubitTime: v ?? 0 })}
            error={errors.singleQubitTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-single-qubit-error"
            label="Single-Qubit Error"
            definition={NEUTRAL_ATOM_DEFINITIONS.singleQubitError}
            value={value.neutralAtom.singleQubitError}
            onChange={(v) => setNeutralAtom({ singleQubitError: v ?? 0 })}
            error={errors.singleQubitError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-measurement-time"
            label="Measurement Time (ns)"
            definition={NEUTRAL_ATOM_DEFINITIONS.measurementTime}
            integer
            value={value.neutralAtom.measurementTime}
            onChange={(v) => setNeutralAtom({ measurementTime: v ?? 0 })}
            error={errors.measurementTime}
            help="Integer · 0 < time"
          />
          <NumberField
            id="na-measurement-error"
            label="Measurement Error"
            definition={NEUTRAL_ATOM_DEFINITIONS.measurementError}
            value={value.neutralAtom.measurementError}
            onChange={(v) => setNeutralAtom({ measurementError: v ?? 0 })}
            error={errors.measurementError}
            help="0 ≤ error < 0.01"
          />
          <NumberField
            id="na-handoff-time"
            label="Handoff Time (ns)"
            definition={NEUTRAL_ATOM_DEFINITIONS.handoffTime}
            integer
            value={value.neutralAtom.handoffTime}
            onChange={(v) => setNeutralAtom({ handoffTime: v ?? 0 })}
            error={errors.handoffTime}
            help="Integer · 0 ≤ time"
          />
          <NumberField
            id="na-atom-spacing"
            label="Atom Spacing (µm)"
            definition={NEUTRAL_ATOM_DEFINITIONS.atomSpacing}
            value={value.neutralAtom.atomSpacing}
            onChange={(v) => setNeutralAtom({ atomSpacing: v ?? 0 })}
            error={errors.atomSpacing}
            help="0 < spacing"
          />
          {/* v1.4.0, placed after Atom Spacing to match the spec's order.
              Recorded, not influential: qdk attaches it to PHYSICAL_MOVE as a
              bit-encoded property alongside atom_spacing / velocity /
              acceleration, and it was measured bit-identical across 6.0 / 12.0 /
              30.0. Blank means qdk's own 12.0, which is what every pre-v1.4.0
              record ran with. */}
          <NumberField
            id="na-data-qubit-spacing"
            label="Data Qubit Spacing (µm)"
            definition={NEUTRAL_ATOM_DEFINITIONS.dataQubitSpacing}
            placeholder="12.0"
            value={value.neutralAtom.dataQubitSpacing}
            onChange={(v) => setNeutralAtom({ dataQubitSpacing: v })}
            error={errors.dataQubitSpacing}
            help="Optional · recorded, does not affect the estimate · blank = 12.0"
          />
          <NumberField
            id="na-max-velocity"
            label="Max Velocity (m/s)"
            definition={NEUTRAL_ATOM_DEFINITIONS.maxVelocity}
            value={value.neutralAtom.maxVelocity}
            onChange={(v) => setNeutralAtom({ maxVelocity: v ?? 0 })}
            error={errors.maxVelocity}
            help="0 < velocity"
          />
          <NumberField
            id="na-max-acceleration"
            label="Max Acceleration (m/s²)"
            definition={NEUTRAL_ATOM_DEFINITIONS.maxAcceleration}
            value={value.neutralAtom.maxAcceleration}
            onChange={(v) => setNeutralAtom({ maxAcceleration: v ?? 0 })}
            error={errors.maxAcceleration}
            help="0 < acceleration"
          />
          <NumberField
            id="na-sc-one-qubit-factor"
            label="Surface Code 1-Qubit Time Factor"
            definition={NEUTRAL_ATOM_DEFINITIONS.surfaceCodeOneQubitTimeFactor}
            integer
            value={value.neutralAtom.surfaceCodeOneQubitTimeFactor}
            onChange={(v) => setNeutralAtom({ surfaceCodeOneQubitTimeFactor: v ?? 1 })}
            error={errors.surfaceCodeOneQubitTimeFactor}
            help="Integer ≥ 1"
          />
          <NumberField
            id="na-sc-two-qubit-factor"
            label="Surface Code 2-Qubit Time Factor"
            definition={NEUTRAL_ATOM_DEFINITIONS.surfaceCodeTwoQubitTimeFactor}
            integer
            value={value.neutralAtom.surfaceCodeTwoQubitTimeFactor}
            onChange={(v) => setNeutralAtom({ surfaceCodeTwoQubitTimeFactor: v ?? 1 })}
            error={errors.surfaceCodeTwoQubitTimeFactor}
            help="Integer ≥ 1"
          />
          {/* v1.4.0. Same inertness as Majorana's, same wording. */}
          <NumberField
            id="na-target-year"
            label="Target Year"
            definition={NEUTRAL_ATOM_DEFINITIONS.targetYear}
            placeholder="None"
            integer
            value={value.neutralAtom.targetYear}
            onChange={(v) => setNeutralAtom({ targetYear: v })}
            error={errors.targetYear}
            help="Optional · recorded, does not affect the estimate"
          />
        </div>
      )}
    </section>
  );
}