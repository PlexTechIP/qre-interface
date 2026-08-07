import type { ReactNode } from "react";

import { DefinitionTip, definitionId } from "./DefinitionTip";

interface FieldProps {
  id: string;
  label: ReactNode;
  /**
   * Tooltip copy for this field, from `constants/configDefinitions`.
   *
   * Field renders arbitrary children, so it cannot reach the control to wire the
   * association itself: **the caller must put
   * `aria-describedby={definitionId(id)}` on the control it passes in.**
   * `NumberField` owns its input and does this for you; a raw `<select>` here
   * does not.
   */
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
          <DefinitionTip
            id={definitionId(id)}
            label={typeof label === "string" ? label : id}
          >
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
