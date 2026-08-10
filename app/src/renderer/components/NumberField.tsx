import { useEffect, useState, type ReactNode } from "react";

import {
  DefinitionTip,
  definitionDescribedBy,
  definitionId,
} from "./DefinitionTip";

interface NumberFieldProps {
  id: string;
  label: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  definition?: string | undefined;
  help?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  unit?: string | undefined;
  placeholder?: string | undefined;
  /**
   * Whole numbers only — the analogue of `step={1}` for this control, which is a
   * text input with a local buffer rather than `type="number"` (it has to be, to
   * keep "1e-4" and in-progress "0." from being clobbered).
   *
   * Contract v1.4.0's follow-up typed `gateTime`, `measurementTime`,
   * `twoQubitGateTime` and `operationTime` as `integer`, matching qdk — which
   * rejects `50.5` outright with "'float' object cannot be interpreted as an
   * integer". Without this the form still accepts `50.5`, and the refusal
   * arrives as an INVALID_CONFIG at Run-click instead of under the field.
   */
  integer?: boolean | undefined;
  /** Greys the input out — used for a pipeline stage's parameters while off. */
  disabled?: boolean | undefined;
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
  definition,
  help,
  error,
  required,
  unit,
  placeholder,
  integer,
  disabled,
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
  // A fractional value in an integer-only field is a FORMAT error, not a range
  // error: it is reported live, like unparseable text, rather than waiting for
  // the field to be touched. This is the step={1} equivalent — see the prop.
  const integerInvalid =
    Boolean(integer) && !isEmpty && !formatInvalid && !Number.isInteger(Number(text));
  // Reveal a required/range error immediately once the user has typed something;
  // hold an empty-required error until the field has been touched.
  const showError =
    formatInvalid || integerInvalid || (Boolean(error) && (isEmpty ? touched : true));
  const descriptor = formatInvalid
    ? "Enter a valid number."
    : integerInvalid
      ? "Enter a whole number."
      : help;
  // The control carries BOTH descriptions: its own descriptor line and the
  // tooltip bubble. Pointing aria-describedby at only the trigger button would
  // mean a screen-reader user who tabs to the input hears no definition at all.
  const describedBy =
    [
      descriptor ? `${id}-desc` : undefined,
      definitionDescribedBy(id, definition),
    ]
      .filter((part): part is string => part !== undefined)
      .join(" ") || undefined;

  return (
    <div className={`field${showError ? " field--error" : ""}`}>
      <div className="field__label-row">
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? (
            <span className="field__req" title="Required">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {definition ? (
          <DefinitionTip
            id={definitionId(id)}
            label={typeof label === "string" ? label : id}
          >
            {definition}
          </DefinitionTip>
        ) : null}
      </div>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
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
