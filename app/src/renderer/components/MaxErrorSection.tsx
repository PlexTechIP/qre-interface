import { NumberField } from "./NumberField";

interface MaxErrorSectionProps {
  value: number | null;
  error?: string | undefined;
  onChange: (value: number | null) => void;
}

/** Input 6 — Max Error. 0 < x <= 1; 1.0 (unconstrained) is valid. */
export function MaxErrorSection({
  value,
  error,
  onChange,
}: MaxErrorSectionProps): React.JSX.Element {
  return (
    <section className="form-section" aria-labelledby="max-error-heading">
      <h2 id="max-error-heading" className="form-section__title">
        6 · Max Error
      </h2>
      <div className="form-grid">
        <NumberField
          id="max-error"
          label="Maximum total error"
          required
          value={value}
          onChange={onChange}
          error={error}
          help="Cap on total error. 1.0 = unconstrained. Smaller cap → more physical qubits / longer runtime."
        />
        <div className="field">
          <label className="field__label" htmlFor="max-error-slider">
            Adjust
            <span className="field__value-tag">
              {value === null ? "—" : value}
            </span>
          </label>
          <input
            id="max-error-slider"
            type="range"
            min={0.01}
            max={1}
            step={0.01}
            value={value ?? 1}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <p className="field__help">
            An in-range value that can't be met is a failed run, not an invalid
            configuration.
          </p>
        </div>
      </div>
    </section>
  );
}
