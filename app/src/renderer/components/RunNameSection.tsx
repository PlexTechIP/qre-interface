interface RunNameSectionProps {
  name: string;
  generatedName: string;
  onChange: (name: string) => void;
}

/** Run Name — optional; auto-generated when blank (QRE version lives in the summary grid). */
export function RunNameSection({
  name,
  generatedName,
  onChange,
}: RunNameSectionProps): React.JSX.Element {
  return (
    <div className="field-block run-name-block">
      <label className="field-eyebrow" htmlFor="run-name">
        Run Name <span className="field-eyebrow__optional">(optional)</span>
      </label>
      <input
        id="run-name"
        type="text"
        className="field__input"
        value={name}
        placeholder={generatedName}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="field__help">Auto-generated when blank</p>
    </div>
  );
}
