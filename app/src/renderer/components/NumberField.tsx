import { useEffect, useState } from "react";

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  help?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  unit?: string | undefined;
  placeholder?: string | undefined;
}

/**
 * Numeric input over `number | null` (null = empty). Keeps a local text buffer
 * so scientific notation (e.g. "1e-4") and in-progress input ("0.") aren't
 * clobbered, and rejects non-numeric text with an inline message.
 *
 * A single descriptor line sits under the control: it shows `help` in a muted
 * tone and recolors to red when the field is in error. An empty required field
 * only turns red after it has been TOUCHED (focused then left) — so a fresh form
 * doesn't shout before the user has engaged — while a field the user has typed
 * something into validates live. The verbose validation message still surfaces
 * in the sidebar ValidationSummary; this line stays concise.
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  help,
  error,
  required,
  unit,
  placeholder,
}: NumberFieldProps): React.JSX.Element {
  const [text, setText] = useState(() => (value === null ? "" : String(value)));
  const [touched, setTouched] = useState(false);

  // Re-sync only when the external value diverges from what the text already
  // represents (e.g. a programmatic reset), never during normal typing.
  useEffect(() => {
    const parsed = text.trim() === "" ? null : Number(text);
    const normalized = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    if (normalized !== value) {
      setText(value === null ? "" : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isEmpty = text.trim() === "";
  const formatInvalid = !isEmpty && !Number.isFinite(Number(text));
  // Reveal a required/range error immediately once the user has typed something;
  // hold an empty-required error until the field has been touched.
  const showError = formatInvalid || (Boolean(error) && (isEmpty ? touched : true));
  const descriptor = formatInvalid ? "Enter a valid number." : help;
  const describedBy = descriptor ? `${id}-desc` : undefined;

  return (
    <div className={`field${showError ? " field--error" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__req" title="Required">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={showError ? true : undefined}
          aria-describedby={describedBy}
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            if (raw.trim() === "") {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
        />
        {unit ? <span className="field__unit">{unit}</span> : null}
      </div>
      {descriptor ? (
        <p
          className={`field__help${showError ? " field__help--error" : ""}`}
          id={`${id}-desc`}
          {...(showError ? { role: "alert" as const } : {})}
        >
          {descriptor}
        </p>
      ) : null}
    </div>
  );
}
