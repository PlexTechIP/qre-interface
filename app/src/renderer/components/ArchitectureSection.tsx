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
import { RadioGroup } from "./RadioGroup";

interface ArchitectureSectionProps {
  value: ArchitectureForm;
  errors: FieldErrors;
  onChange: (value: ArchitectureForm) => void;
}

/** Input 2 — Physical Architecture. Reveals only the selected type's fields. */
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
    <section className="form-section" aria-labelledby="architecture-heading">
      <h2 id="architecture-heading" className="form-section__title">
        2 · Physical Architecture
      </h2>
      <p className="form-section__intro">
        The qubit hardware model. This drives the error-correction code and which
        magic-state factories are available.
      </p>

      <RadioGroup
        legend="Architecture type"
        name="architecture-type-toggle"
        value={value.type}
        options={[
          {
            value: "gateBased" satisfies ArchitectureType,
            label: "Superconducting",
            description: "Gate-based qubits · Surface Code",
          },
          {
            value: "majorana" satisfies ArchitectureType,
            label: "Majorana",
            description: "Topological qubits · Three-Aux",
          },
        ]}
        onChange={(type) => onChange({ ...value, type })}
      />

      {value.type === "gateBased" ? (
        <div className="form-grid">
          <NumberField
            id="gb-error-rate"
            label="Error rate"
            value={value.gateBased.errorRate}
            onChange={(v) => setGate({ errorRate: v })}
            error={errors.errorRate}
            help="Lower error rate → fewer physical qubits, but assumes better hardware. Range 0–0.01."
          />
          <NumberField
            id="gb-gate-time"
            label="Gate time"
            required
            unit="ns"
            placeholder="e.g. 50"
            value={value.gateBased.gateTime}
            onChange={(v) => setGate({ gateTime: v })}
            error={errors.gateTime}
            help="Required, no default. How long one physical gate takes."
          />
          <NumberField
            id="gb-measurement-time"
            label="Measurement time"
            required
            unit="ns"
            placeholder="e.g. 100"
            value={value.gateBased.measurementTime}
            onChange={(v) => setGate({ measurementTime: v })}
            error={errors.measurementTime}
            help="Required, no default. How long one physical measurement takes."
          />
          <NumberField
            id="gb-two-qubit-time"
            label="Two-qubit gate time"
            unit="ns"
            value={value.gateBased.twoQubitGateTime}
            onChange={(v) => setGate({ twoQubitGateTime: v })}
            error={errors.twoQubitGateTime}
            help="Optional. Leave blank to use the engine's default model."
          />
        </div>
      ) : (
        <div className="form-grid">
          <Field
            id="mj-error-rate"
            label="Error rate"
            help="Assumed hardware error rate for topological qubits."
          >
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
            label="Operation time"
            required
            unit="ns"
            value={value.majorana.operationTime}
            onChange={(v) => setMajorana({ operationTime: v })}
            error={errors.operationTime}
            help="Time per topological operation."
          />
        </div>
      )}
    </section>
  );
}
