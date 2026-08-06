import { useMemo, useState } from "react";

import type { UploadedProgramFormat } from "../../shared/types";
import { CONFIG_DEFINITIONS } from "../constants/configDefinitions";
import { BENCHMARKS } from "../constants/staticOptions";
import type { HyperparamValue } from "../constants/hyperparameters";
import type {
  ApplicationForm,
  ApplicationFormType,
  SavedProgram,
} from "../state/formState";
import type { FieldErrors } from "../state/validation";
import { DefinitionTip } from "./DefinitionTip";
import { HyperparametersPanel } from "./HyperparametersPanel";

interface ApplicationSectionProps {
  value: ApplicationForm;
  errors: FieldErrors;
  onChange: (value: ApplicationForm) => void;
}

const TYPE_OPTIONS: readonly { value: ApplicationFormType; label: string }[] = [
  { value: "benchmark", label: "Benchmark" },
  { value: "saved", label: "Saved Programs" },
  { value: "uploaded", label: "Upload Program File" },
];

/** The file's basename, used as a saved program's default display name. */
function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** Infer the program format from a filename's extension; defaults to Q#. */
function inferFormat(filePath: string): UploadedProgramFormat {
  const ext = filePath.toLowerCase().split(".").pop() ?? "";
  if (ext === "qasm") return "openqasm";
  if (ext === "ll" || ext === "bc") return "qir";
  return "qsharp";
}

/**
 * Input 1 — Application. Three sources share one contract surface: Benchmark
 * (searchable chips + per-benchmark hyperparameters), Saved Programs (a session
 * library of earlier uploads), and Upload Program File (pick + format + a "save
 * to my programs" option). Saved + Upload both serialize to the contract's
 * `uploaded` variant; only two contract variants exist. Presentation matches the
 * configuration mockup: segmented type control, uppercase eyebrows, chip grid.
 */
export function ApplicationSection({
  value,
  errors,
  onChange,
}: ApplicationSectionProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [savedQuery, setSavedQuery] = useState("");
  const [dragging, setDragging] = useState(false);

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

  const patch = (next: Partial<ApplicationForm>): void => onChange({ ...value, ...next });

  const setHyperparam = (key: string, next: HyperparamValue): void => {
    patch({
      hyperparams: {
        ...value.hyperparams,
        [value.benchmarkId]: {
          ...value.hyperparams[value.benchmarkId],
          [key]: next,
        },
      },
    });
  };

  const onPickFile = (filePath: string): void => {
    const format = inferFormat(filePath);
    patch({ upload: { ...value.upload, filePath, format } });
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onPickFile(file.name);
  };

  const clearUpload = (): void => {
    patch({ upload: { ...value.upload, filePath: "" } });
  };

  /**
   * Save the uploaded file to the session library, then jump to Saved Programs
   * with it selected. Re-saving an identical file just re-selects the existing
   * entry rather than duplicating it.
   */
  const saveProgram = (): void => {
    const filePath = value.upload.filePath.trim();
    if (filePath.length === 0) return;
    const format = value.upload.format;
    const existing = value.savedPrograms.find(
      (p) => p.filePath === filePath && p.format === format,
    );
    const id = existing?.id ?? crypto.randomUUID();
    const savedPrograms: SavedProgram[] = existing
      ? value.savedPrograms
      : [...value.savedPrograms, { id, name: basename(filePath), filePath, format }];
    patch({
      savedPrograms,
      selectedSavedId: id,
      type: "saved",
      upload: { ...value.upload, filePath: "" },
    });
  };

  const removeSaved = (id: string): void => {
    patch({
      savedPrograms: value.savedPrograms.filter((p) => p.id !== id),
      ...(value.selectedSavedId === id ? { selectedSavedId: "" } : {}),
    });
  };

  const savedFiltered = useMemo(() => {
    const q = savedQuery.trim().toLowerCase();
    if (q === "") return value.savedPrograms;
    return value.savedPrograms.filter((p) => p.name.toLowerCase().includes(q));
  }, [savedQuery, value.savedPrograms]);

  return (
    <section className="form-section application-section" aria-labelledby="application-heading">
      <header className="form-section__head">
        <h2 id="application-heading" className="form-section__title">
          Application
        </h2>
      </header>

      <div className="field-block">
        <span className="field-eyebrow" id="application-type-label">
          Application Type
          <DefinitionTip label="Application Type">
            {CONFIG_DEFINITIONS.applicationType}
          </DefinitionTip>
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="application-type-label">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value.type === option.value}
              className={`seg__btn${value.type === option.value ? " seg__btn--active" : ""}`}
              onClick={() => patch({ type: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {value.type === "benchmark" ? (
        <>
          <div className="field-block">
            <span className="field-eyebrow" id="select-benchmark-label">
              Select Benchmark
              <DefinitionTip label="Select Benchmark">
                {CONFIG_DEFINITIONS.benchmark}
              </DefinitionTip>
            </span>
            <div className="search-field">
              <SearchIcon />
              <input
                type="search"
                className="search-field__input"
                placeholder="Search benchmarks…"
                value={query}
                aria-label="Search benchmarks"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="chip-grid" role="radiogroup" aria-labelledby="select-benchmark-label">
              {filtered.map((benchmark) => (
                <button
                  key={benchmark.id}
                  type="button"
                  role="radio"
                  aria-checked={value.benchmarkId === benchmark.id}
                  title={benchmark.description}
                  className={`chip${value.benchmarkId === benchmark.id ? " chip--selected" : ""}`}
                  onClick={() => patch({ benchmarkId: benchmark.id })}
                >
                  {benchmark.name}
                </button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <p className="chip-grid__empty">No benchmarks match “{query}”.</p>
            ) : null}
            {errors.benchmarkId ? (
              <p className="field__error" role="alert">
                {errors.benchmarkId}
              </p>
            ) : null}
          </div>

          <HyperparametersPanel
            benchmarkId={value.benchmarkId}
            values={value.hyperparams[value.benchmarkId] ?? {}}
            errors={errors.hyperparams ?? []}
            onChange={setHyperparam}
          />
        </>
      ) : value.type === "saved" ? (
        <div className="field-block">
          <span className="field-eyebrow" id="saved-program-label">
            Your Programs
            <DefinitionTip label="Your Programs">
              {CONFIG_DEFINITIONS.savedPrograms}
            </DefinitionTip>
          </span>
          {value.savedPrograms.length === 0 ? (
            <div className="saved-empty">
              <FileIcon className="saved-empty__icon" />
              <span className="saved-empty__title">No saved programs yet</span>
              <button
                type="button"
                className="saved-empty__link"
                onClick={() => patch({ type: "uploaded" })}
              >
                Upload a program →
              </button>
            </div>
          ) : (
            <>
              <div className="search-field">
                <SearchIcon />
                <input
                  type="search"
                  className="search-field__input"
                  placeholder="Search saved programs…"
                  value={savedQuery}
                  aria-label="Search saved programs"
                  onChange={(event) => setSavedQuery(event.target.value)}
                />
              </div>
              <div className="saved-list" role="radiogroup" aria-labelledby="saved-program-label">
                {savedFiltered.map((program) => {
                  const selected = value.selectedSavedId === program.id;
                  return (
                    <div
                      key={program.id}
                      className={`saved-row${selected ? " saved-row--selected" : ""}`}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="saved-row__pick"
                        onClick={() => patch({ selectedSavedId: program.id })}
                      >
                        <FileIcon className="saved-row__icon" />
                        <span className="saved-row__name">{program.name}</span>
                      </button>
                      <button
                        type="button"
                        className="saved-row__delete"
                        aria-label={`Delete ${program.name}`}
                        onClick={() => removeSaved(program.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
                {savedFiltered.length === 0 ? (
                  <p className="chip-grid__empty">No programs match “{savedQuery}”.</p>
                ) : null}
              </div>
            </>
          )}
          {errors.savedProgram ? (
            <p className="field__error" role="alert">
              {errors.savedProgram}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="upload-picker">
          <span className="field-eyebrow field-eyebrow--with-tip">
            Upload Program
            <DefinitionTip label="Upload Program">
              {CONFIG_DEFINITIONS.uploadProgram}
            </DefinitionTip>
          </span>
          <label
            className={`dropzone${dragging ? " dropzone--active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              id="upload-file"
              type="file"
              className="dropzone__input"
              accept=".qs,.qasm,.ll,.bc"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file.name);
              }}
            />
            <UploadIcon />
            <span className="dropzone__prompt">Click to upload</span>
          </label>

          {value.upload.filePath ? (
            <div className="file-pill">
              <FileIcon className="file-pill__icon" />
              <span className="file-pill__name">{value.upload.filePath}</span>
              <button
                type="button"
                className="file-pill__save"
                onClick={saveProgram}
              >
                Save Program
              </button>
              <button
                type="button"
                className="file-pill__remove"
                aria-label={`Remove ${value.upload.filePath}`}
                onClick={clearUpload}
              >
                ×
              </button>
            </div>
          ) : null}

          <p className="dropzone__formats">
            Supported: .qs (Q#), .qasm (OpenQASM), .ll / .bc (QIR)
          </p>

          {errors.uploadFilePath ? (
            <p className="field__error" role="alert">
              {errors.uploadFilePath}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Inline document glyph (saved program rows, file pill, empty state). */
function FileIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-5-5 5 5m-5-5v5h5"
      />
    </svg>
  );
}

/** Inline trash glyph for deleting a saved program. */
function TrashIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7h16M10 11v6m4-6v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
      />
    </svg>
  );
}

/** Inline upload glyph for the dropzone (tray with an upward arrow). */
function UploadIcon(): React.JSX.Element {
  return (
    <svg
      className="dropzone__icon"
      viewBox="0 0 24 24"
      width="26"
      height="26"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v11m0-11 4 4m-4-4-4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
      />
    </svg>
  );
}

/** Inline magnifier for the benchmark search field (self-contained, themeable). */
function SearchIcon(): React.JSX.Element {
  return (
    <svg
      className="search-field__icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M7 2.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6ZM10.6 10.6 14 14"
      />
    </svg>
  );
}
