import {
  DefinitionTip,
  definitionDescribedBy,
  definitionId,
} from "./DefinitionTip";

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
  /** Shown in place of the description when the option is disabled. */
  disabledReason?: string | undefined;
}

interface RadioGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
  /** Tooltip copy for the group as a whole, from `constants/configDefinitions`. */
  definition?: string | undefined;
}

/**
 * Accessible single-choice group built on native radios (arrow-key navigable,
 * disabled options skipped).
 *
 * ⚠️ **Nothing renders this today.** The doc comment used to say "used for every
 * type toggle in the form"; that stopped being true before week 5, and `grep -rn
 * RadioGroup app/src` now finds only this file. The `definition` support below
 * was added for the Application Type and Architecture selectors, which carry no
 * tooltip because the Config Descriptions tab has no copy for them yet — see the
 * comments at those two call sites. Wire it up when the copy lands, or delete
 * this file; do not let it drift as untested, unrendered code.
 */
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  definition,
}: RadioGroupProps<T>): React.JSX.Element {
  const legendTextId = `${name}-legend`;
  return (
    // aria-labelledby points at the legend's TEXT span rather than letting the
    // legend name the fieldset implicitly. Without that, the tooltip trigger
    // sitting inside the legend is walked by accessible-name computation and the
    // group announces as "Architecture Architecture definition".
    //
    // aria-describedby belongs on the FIELDSET, next to the name it qualifies.
    // It sat on the options <div> until 2026-08-07, which is a generic element
    // with no role: assistive technology does not expose it, so the description
    // reached nobody — neither the group nor the individual radios.
    <fieldset
      className="radio-group"
      aria-labelledby={legendTextId}
      aria-describedby={definitionDescribedBy(name, definition)}
    >
      <legend className="radio-group__legend">
        <span id={legendTextId}>{legend}</span>
        {definition ? (
          <DefinitionTip id={definitionId(name)} label={legend}>
            {definition}
          </DefinitionTip>
        ) : null}
      </legend>
      <div className="radio-group__options">
        {options.map((option) => {
          const disabled = option.disabled ?? false;
          const detail = disabled ? option.disabledReason : option.description;
          return (
            <label
              key={option.value}
              className={`radio-card${value === option.value ? " radio-card--selected" : ""}${
                disabled ? " radio-card--disabled" : ""
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="radio-card__body">
                <span className="radio-card__label">{option.label}</span>
                {detail ? (
                  <span className="radio-card__detail">{detail}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
