interface RunNameSectionProps {
  name: string;
  generatedName: string;
  qreVersion: string;
  onChange: (name: string) => void;
}

/** Input 7 — Run Name (optional; auto-generated when blank) + QRE version. */
export function RunNameSection({
  name,
  generatedName,
  qreVersion,
  onChange,
}: RunNameSectionProps): React.JSX.Element {
  const usingGenerated = name.trim().length === 0;
  return (
    <section className="form-section" aria-labelledby="run-name-heading">
      <h2 id="run-name-heading" className="form-section__title">
        7 · Run Name
      </h2>
      <div className="field">
        <label className="field__label" htmlFor="run-name">
          Name <span className="field__optional">(optional)</span>
        </label>
        <input
          id="run-name"
          type="text"
          className="field__input"
          value={name}
          placeholder={generatedName}
          onChange={(event) => onChange(event.target.value)}
        />
        <p className="field__help">
          {usingGenerated ? (
            <>
              Leave blank to auto-name. Will be saved as:{" "}
              <strong>{generatedName}</strong>
            </>
          ) : (
            "Custom name — clear it to auto-generate from your configuration."
          )}
        </p>
      </div>
      <div className="derived-field">
        <span className="derived-field__label">QRE version</span>
        <span className="derived-field__value">{qreVersion}</span>
        <span className="derived-field__badge">Read-only</span>
      </div>
    </section>
  );
}
