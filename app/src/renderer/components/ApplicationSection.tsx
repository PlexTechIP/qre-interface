import { useMemo, useState } from "react";

import {
  UPLOADED_PROGRAM_FORMATS,
  type UploadedProgramFormat,
} from "../../shared/types";
import { BENCHMARKS, FORMAT_LABELS } from "../constants/staticOptions";
import type { ApplicationForm } from "../state/formState";
import type { FieldErrors } from "../state/validation";
import { RadioGroup } from "./RadioGroup";

interface ApplicationSectionProps {
  value: ApplicationForm;
  errors: FieldErrors;
  onChange: (value: ApplicationForm) => void;
}

/**
 * Input 1 — Application. Benchmark = searchable list of the five contract
 * benchmarks; Upload = file pick + format + "Add Program" (addToLibrary).
 * Only two contract variants exist; "saved programs" is the same benchmark list.
 */
export function ApplicationSection({
  value,
  errors,
  onChange,
}: ApplicationSectionProps): React.JSX.Element {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return BENCHMARKS;
    return BENCHMARKS.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query]);

  const setUpload = (patch: Partial<ApplicationForm["upload"]>): void => {
    onChange({ ...value, upload: { ...value.upload, ...patch } });
  };

  return (
    <section className="form-section" aria-labelledby="application-heading">
      <h2 id="application-heading" className="form-section__title">
        1 · Application
      </h2>
      <p className="form-section__intro">
        Pick a benchmark program to estimate, or upload your own.
      </p>

      <RadioGroup
        legend="Program source"
        name="application-type"
        value={value.type}
        options={[
          { value: "benchmark", label: "Benchmark", description: "Choose from the standard programs" },
          { value: "uploaded", label: "Upload program", description: "Q# / OpenQASM / QIR file" },
        ]}
        onChange={(type) => onChange({ ...value, type })}
      />

      {value.type === "benchmark" ? (
        <div className="benchmark-picker">
          <input
            type="search"
            className="field__input"
            placeholder="Search benchmarks…"
            value={query}
            aria-label="Search benchmarks"
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="benchmark-list" role="radiogroup" aria-label="Benchmarks">
            {filtered.map((benchmark) => (
              <li key={benchmark.id}>
                <label
                  className={`benchmark-option${
                    value.benchmarkId === benchmark.id
                      ? " benchmark-option--selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="benchmark"
                    checked={value.benchmarkId === benchmark.id}
                    onChange={() => onChange({ ...value, benchmarkId: benchmark.id })}
                  />
                  <span>
                    <span className="benchmark-option__name">{benchmark.name}</span>
                    <span className="benchmark-option__desc">
                      {benchmark.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="benchmark-list__empty">No benchmarks match “{query}”.</li>
            ) : null}
          </ul>
          {errors.benchmarkId ? (
            <p className="field__error" role="alert">
              {errors.benchmarkId}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="upload-picker">
          <div className="field">
            <label className="field__label" htmlFor="upload-file">
              Program file <span className="field__req">*</span>
            </label>
            <input
              id="upload-file"
              type="file"
              className="field__input"
              accept=".qs,.qasm,.ll,.bc,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setUpload({ filePath: file.name });
              }}
            />
            {value.upload.filePath ? (
              <p className="field__help">Selected: {value.upload.filePath}</p>
            ) : null}
            {errors.uploadFilePath ? (
              <p className="field__error" role="alert">
                {errors.uploadFilePath}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="upload-format">
              Format
            </label>
            <select
              id="upload-format"
              className="field__input"
              value={value.upload.format}
              onChange={(event) =>
                setUpload({ format: event.target.value as UploadedProgramFormat })
              }
            >
              {UPLOADED_PROGRAM_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={value.upload.addToLibrary}
              onChange={(event) => setUpload({ addToLibrary: event.target.checked })}
            />
            <span>
              <span className="checkbox-field__label">
                Add Program to benchmark library
              </span>
              <span className="checkbox-field__detail">
                Keeps this program in the list for this session.
              </span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
