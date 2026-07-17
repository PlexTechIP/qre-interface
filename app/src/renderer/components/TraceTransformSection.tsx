import type { TraceTransformType } from "../../shared/types";
import type { PsspcForm, TraceTransformForm } from "../state/formState";
import { RadioGroup } from "./RadioGroup";

interface TraceTransformSectionProps {
  value: TraceTransformForm;
  onChange: (value: TraceTransformForm) => void;
}

/** Input 5 — Trace Transform. Sub-fields swap with the transform type. */
export function TraceTransformSection({
  value,
  onChange,
}: TraceTransformSectionProps): React.JSX.Element {
  const setPsspc = (patch: Partial<PsspcForm>): void => {
    onChange({ ...value, psspc: { ...value.psspc, ...patch } });
  };

  return (
    <section className="form-section" aria-labelledby="transform-heading">
      <h2 id="transform-heading" className="form-section__title">
        5 · Trace Transform
      </h2>
      <p className="form-section__intro">
        How the algorithm is compiled to logical operations.
      </p>

      <RadioGroup
        legend="Transform type"
        name="trace-transform-type"
        value={value.type}
        options={[
          {
            value: "psspc" satisfies TraceTransformType,
            label: "PSSPC",
            description: "Parallel synthesis; tunable T-state budget",
          },
          {
            value: "latticeSurgery" satisfies TraceTransformType,
            label: "Lattice Surgery",
            description: "Optimistic fixed slowdown",
          },
        ]}
        onChange={(type) => onChange({ ...value, type })}
      />

      {value.type === "psspc" ? (
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="psspc-tstates">
              T states per rotation
              <span className="field__value-tag">
                {value.psspc.tStatesPerRotation}
              </span>
            </label>
            <input
              id="psspc-tstates"
              type="range"
              min={5}
              max={20}
              step={1}
              value={value.psspc.tStatesPerRotation}
              onChange={(event) =>
                setPsspc({ tStatesPerRotation: Number(event.target.value) })
              }
            />
            <p className="field__help">
              More T states per rotation → higher accuracy, more magic-state cost.
              Range 5–20.
            </p>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={value.psspc.ccxMagicStates}
              onChange={(event) =>
                setPsspc({ ccxMagicStates: event.target.checked })
              }
            />
            <span>
              <span className="checkbox-field__label">Use CCX magic states</span>
              <span className="checkbox-field__detail">
                Emit CCX states directly instead of decomposing to T.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="derived-field">
          <span className="derived-field__value">Slowdown factor: 1.0</span>
          <span className="derived-field__badge">Fixed</span>
          <p className="form-section__intro">
            Lattice Surgery uses an optimistic fixed slowdown; no other value is
            selectable.
          </p>
        </div>
      )}
    </section>
  );
}
