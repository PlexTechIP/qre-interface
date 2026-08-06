import { CONFIG_DEFINITIONS } from "../constants/configDefinitions";
import { NumberField } from "./NumberField";

interface MaxErrorSectionProps {
  value: number | null;
  error?: string | undefined;
  onChange: (value: number | null) => void;
}

/** Input 6 — Total Fault Tolerant Execution Error. 0 < x <= 1; 1.0 is valid. */
export function MaxErrorSection({
  value,
  error,
  onChange,
}: MaxErrorSectionProps): React.JSX.Element {
  // The slider is a coarse log (decade) control: max error spans many orders of
  // magnitude (1 down to ~1e-12), so a linear slider can't represent the range.
  // The number field on the left stays the source of truth for exact values.
  const sliderExponent =
    value === null || value <= 0
      ? 0
      : Math.min(0, Math.max(-12, Math.round(Math.log10(value))));

  return (
    <section className="form-section" aria-labelledby="max-error-heading">
      <h2 id="max-error-heading" className="form-section__title">
        6 · Total Fault Tolerant Execution Error
      </h2>
      <div className="form-grid">
        <NumberField
          id="max-error"
          label="Total Fault Tolerant Execution Error"
          definition={CONFIG_DEFINITIONS.maxError}
          required
          value={value}
          onChange={onChange}
          error={error}
          help="Cap on total error. 1.0 = unconstrained. Smaller cap → more physical qubits / longer runtime."
        />
        <div className="field">
          <label className="field__label" htmlFor="max-error-slider">
            Adjust (log scale)
            <span className="field__value-tag">
              {value === null ? "—" : value}
            </span>
          </label>
          <input
            id="max-error-slider"
            type="range"
            min={-12}
            max={0}
            step={1}
            value={sliderExponent}
            onChange={(event) => onChange(10 ** Number(event.target.value))}
          />
          <p className="field__help">
            Coarse decade control (1 down to 1e-12); type an exact value on the
            left. An in-range value that can't be met is a failed run, not an
            invalid configuration.
          </p>
        </div>
      </div>
    </section>
  );
}
