import {
  BENCHMARK_HYPERPARAMS,
  type HyperparamError,
  type HyperparamField,
  type HyperparamValue,
} from "../constants/hyperparameters";
import type { BenchmarkId } from "../../shared/types";
import { findBenchmark } from "../constants/staticOptions";

interface HyperparametersPanelProps {
  benchmarkId: string;
  values: Record<string, HyperparamValue>;
  errors: readonly HyperparamError[];
  onChange: (key: string, value: HyperparamValue) => void;
}

/**
 * The collapsible per-benchmark hyperparameter panel. Fields, bounds, and
 * defaults come from the shared benchmark spec (shared/benchmarkParams.ts) by
 * way of constants/hyperparameters.ts; this component only renders + raises
 * changes. The values are serialized onto `RunConfig.parameters` and become the
 * arguments of the benchmark's Q# entry operation, so they size the circuit the
 * estimator traces.
 */
export function HyperparametersPanel({
  benchmarkId,
  values,
  errors,
  onChange,
}: HyperparametersPanelProps): React.JSX.Element | null {
  const fields = BENCHMARK_HYPERPARAMS[benchmarkId as BenchmarkId] ?? [];
  if (fields.length === 0) return null;

  const name = findBenchmark(benchmarkId)?.name ?? benchmarkId;
  const errorFor = (key: string): string | undefined =>
    errors.find((error) => error.key === key)?.message;

  return (
    <details className="hparams">
      <summary className="hparams__summary">
        <span className="hparams__chevron" aria-hidden="true">
          ›
        </span>
        <span className="hparams__title">Hyperparameters</span>
        <span className="hparams__context">· {name}</span>
      </summary>
      <div className="hparams__grid">
        {fields.map((field) => {
          const message = field.kind === "computed" ? undefined : errorFor(field.key);
          return (
            <div key={field.key} className={`hparam${message ? " hparam--error" : ""}`}>
              <label className="hparam__label" htmlFor={`hparam-${field.key}`}>
                {field.label}
              </label>
              <HyperparamControl
                field={field}
                value={values[field.key]}
                onChange={(next) => onChange(field.key, next)}
              />
              <p className="field__help">
                {field.kind === "computed" ? field.note : field.help}
              </p>
              {message ? (
                <p className="field__error" role="alert">
                  {message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

interface HyperparamControlProps {
  field: HyperparamField;
  value: HyperparamValue | undefined;
  onChange: (value: HyperparamValue) => void;
}

function HyperparamControl({ field, value, onChange }: HyperparamControlProps): React.JSX.Element {
  const id = `hparam-${field.key}`;

  if (field.kind === "computed") {
    return (
      <input
        id={id}
        className="field__input"
        value="Auto"
        readOnly
        disabled
        aria-label={`${field.label} (computed at estimation)`}
      />
    );
  }

  if (field.kind === "choice") {
    return (
      <select
        id={id}
        className="field__input"
        value={typeof value === "string" ? value : field.default}
        onChange={(event) => onChange(event.target.value)}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      className="field__input"
      type="number"
      inputMode={field.kind === "int" ? "numeric" : "decimal"}
      step={field.kind === "int" ? 1 : "any"}
      {...(field.min === undefined ? {} : { min: field.min })}
      {...(field.max === undefined ? {} : { max: field.max })}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(event) =>
        onChange(event.target.value === "" ? null : Number(event.target.value))
      }
    />
  );
}
