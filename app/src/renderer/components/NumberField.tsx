import { useEffect, useState } from "react";

import { Field } from "./Field";

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

  const formatInvalid = text.trim() !== "" && !Number.isFinite(Number(text));
  const shownError = formatInvalid ? "Enter a valid number." : error;
  const describedBy =
    [help ? `${id}-help` : null, shownError ? `${id}-error` : null]
      .filter((x): x is string => x !== null)
      .join(" ") || undefined;

  return (
    <Field id={id} label={label} help={help} error={shownError} required={required}>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
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
    </Field>
  );
}
