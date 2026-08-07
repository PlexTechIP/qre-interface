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
}

/**
 * Accessible single-choice group built on native radios (arrow-key navigable,
 * disabled options skipped).
 *
 * ⚠️ **Nothing renders this today.** The doc comment used to say "used for every
 * type toggle in the form"; that stopped being true before week 5, and `grep -rn
 * RadioGroup app/src` now finds only this file.
 *
 * Week 5 briefly grew tooltip support here — a `definition` prop, a
 * `DefinitionTip` in the legend, and reworked `aria-labelledby` /
 * `aria-describedby` wiring — for the Application Type and Architecture
 * selectors. Those selectors do not use this component, and carry no tooltip
 * anyway because the Config Descriptions tab has no copy for them yet, so all
 * of it was unreachable and untested from the moment it was written. It has
 * been taken back out rather than left to drift.
 *
 * Wire this component up when the copy lands, or delete it — `MaxErrorSection`
 * went the second way on this branch for the same reason. What it must not do
 * is accumulate more untested, unrendered detail.
 */
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: RadioGroupProps<T>): React.JSX.Element {
  return (
    <fieldset className="radio-group">
      <legend className="radio-group__legend">{legend}</legend>
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
