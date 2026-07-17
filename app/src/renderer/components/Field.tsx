import type { ReactNode } from "react";

interface FieldProps {
  id: string;
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ReactNode;
}

/** Labeled form field wrapper: label + control + optional help/error text. */
export function Field({
  id,
  label,
  help,
  error,
  required,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__req" title="Required">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p className="field__help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
