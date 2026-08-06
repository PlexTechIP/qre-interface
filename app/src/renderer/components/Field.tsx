import type { ReactNode } from "react";

import { DefinitionTip } from "./DefinitionTip";

interface FieldProps {
  id: string;
  label: ReactNode;
  definition?: string | undefined;
  help?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ReactNode;
}

/** Labeled form field wrapper: label + control + optional help/error text. */
export function Field({
  id,
  label,
  definition,
  help,
  error,
  required,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={`field${error ? " field--error" : ""}`}>
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
          <DefinitionTip label={typeof label === "string" ? label : id}>
            {definition}
          </DefinitionTip>
        ) : null}
      </div>
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
