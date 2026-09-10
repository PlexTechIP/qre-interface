import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UploadedProgramFormat } from "../../shared/types";
import {
  MANUAL_COUNTS_SECTION,
  MANUAL_COUNT_DEFINITIONS,
} from "../constants/configDefinitions";
import { BENCHMARKS } from "../constants/staticOptions";
import type { HyperparamValue, HyperparamError } from "../constants/hyperparameters";
import type {
  ApplicationForm,
  ApplicationFormType,
  ManualCountsForm,
  SavedProgram,
} from "../state/formState";
import { resolveUploadPath } from "../state/uploadPath";
import type { FieldErrors } from "../state/validation";
import { HyperparametersPanel } from "./HyperparametersPanel";
import { NumberField } from "./NumberField";

interface ApplicationSectionProps {
  value: ApplicationForm;
  errors: FieldErrors;
  /** Benchmark hyperparameter errors, which are not FieldErrors' shape. */
  hyperparamErrors?: readonly HyperparamError[];
  onChange: (value: ApplicationForm) => void;
  /** True while the chosen program file is being pre-flighted. Run is gated on
   *  it, so the wait needs to be visible rather than looking like a dead button. */
  isCheckingFile?: boolean;
}

const TYPE_OPTIONS: readonly { value: ApplicationFormType; label: string }[] = [
  { value: "benchmark", label: "Benchmark" },
  { value: "saved", label: "Saved Programs" },
  { value: "uploaded", label: "Upload Program File" },
  { value: "manualCounts", label: "Manual Logical Counts" },
];

/** The seven Manual Logical Counts fields, in spec order. */
const MANUAL_COUNT_FIELDS: readonly {
  key: keyof ManualCountsForm;
  label: string;
  help: string;
}[] = [
  // Renamed from "Number of Qubits" in the 2026-07-31 update. Display only —
  // `numQubits` stays as the contract id, schema description and validation key.
  // The new name earns its place: this counts LOGICAL qubits, and the results
  // surface reports physical qubit counts on the same screen.
  { key: "numQubits", label: "Logical Qubit Count", help: "Required · integer ≥ 1" },
  { key: "tCount", label: "T Count", help: "Required · integer ≥ 0" },
  { key: "rotationCount", label: "Rotation Count", help: "Required · integer ≥ 0" },
  { key: "rotationDepth", label: "Rotation Depth", help: "Required · 0 ≤ depth ≤ Rotation Count" },
  { key: "cczCount", label: "CCZ Count", help: "Required · integer ≥ 0" },
  { key: "ccixCount", label: "CCiX Count", help: "Required · integer ≥ 0" },
  { key: "measurementCount", label: "Measurement Count", help: "Required · integer ≥ 0" },
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
  hyperparamErrors,
  onChange,
  isCheckingFile = false,
}: ApplicationSectionProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [savedQuery, setSavedQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  /** Why the last pick/drop could not be turned into a real path, if it couldn't. */
  const [pathError, setPathError] = useState<string | null>(null);

  // Transient popup, e.g. when a Save targets a program already in the library.
  // Keyed by an incrementing seq so a repeat action mounts a NEW live-region
  // node (a screen reader re-announces it) and it auto-clears on a timer.
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

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

  /**
   * Change application type. Clears any upload path error on the way out: this
   * component stays mounted across type changes, so the error would otherwise
   * still be on screen when the user came back to the Upload tab having picked
   * nothing this visit.
   */
  const setType = (next: ApplicationFormType): void => {
    if (next !== value.type) setPathError(null);
    patch({ type: next });
  };

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

  /**
   * Take a picked or dropped File and store the path the engine can open. The
   * browser filename is never used as a path: it is a basename, and storing one
   * yields a config that validates and then fails at Run with "File not found".
   */
  const onPickFile = (file: File): void => {
    const resolved = resolveUploadPath(file);
    if (!resolved.ok) {
      setPathError(resolved.message);
      return;
    }
    setPathError(null);
    patch({
      upload: {
        ...value.upload,
        filePath: resolved.filePath,
        format: inferFormat(resolved.filePath),
      },
    });
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onPickFile(file);
  };

  const clearUpload = (): void => {
    setPathError(null);
    patch({ upload: { ...value.upload, filePath: "" } });
  };

  const setManualCount = (
    key: keyof ManualCountsForm,
    next: number | null,
  ): void => {
    patch({ manualCounts: { ...value.manualCounts, [key]: next } });
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
    if (existing) {
      // Already in the library — re-select it rather than duplicating, and say
      // so, since the Save button otherwise looks like it did nothing new.
      showToast("Saved program already exists.");
    }
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
      {/* Transient popup, e.g. saving a program already in the library. Keyed so
          a repeat action re-announces; auto-dismisses on a timer. */}
      {toast ? (
        <p key={toast.key} role="alert" className="toast">
          {toast.message}
        </p>
      ) : null}
      <header className="form-section__head">
        <h2 id="application-heading" className="form-section__title">
          Application
        </h2>
      </header>

      <div className="field-block">
        {/* No tooltip: the Config Descriptions tab has no copy for the type
            selector, and an invented one would read as reviewed product copy.
            Requested in the PR description. */}
        <span className="field-eyebrow" id="application-type-label">
          Application Type
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="application-type-label">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value.type === option.value}
              className={`seg__btn${value.type === option.value ? " seg__btn--active" : ""}`}
              onClick={() => setType(option.value)}
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
            errors={hyperparamErrors ?? []}
            onChange={setHyperparam}
          />
        </>
      ) : value.type === "saved" ? (
        <div className="field-block">
          <span className="field-eyebrow" id="saved-program-label">
            Your Programs
          </span>
          {value.savedPrograms.length === 0 ? (
            <div className="saved-empty">
              <FileIcon className="saved-empty__icon" />
              <span className="saved-empty__title">No saved programs yet</span>
              <button
                type="button"
                className="saved-empty__link"
                onClick={() => setType("uploaded")}
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
          {isCheckingFile ? (
            <p className="field__help" role="status">
              Checking file…
            </p>
          ) : null}
          {errors.savedProgram ? (
            <p className="field__error" role="alert">
              {errors.savedProgram}
            </p>
          ) : null}
        </div>
      ) : value.type === "uploaded" ? (
        <div className="upload-picker">
          <span className="field-eyebrow">Upload Program</span>
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
                // Clear the input before handling: a file input fires `change`
                // only when the selection changes, so keeping the last file in
                // it makes re-picking that same file a silent no-op — which is
                // precisely what the user does after a failed resolution, or
                // after clearing the pill and choosing the same file again.
                event.target.value = "";
                if (file) onPickFile(file);
              }}
            />
            <UploadIcon />
            <span className="dropzone__prompt">Click to upload</span>
          </label>

          {value.upload.filePath ? (
            <div className="file-pill">
              <FileIcon className="file-pill__icon" />
              {/* Name for reading, full path on hover — an absolute path is too
                  long for the pill but is what actually gets estimated. */}
              <span className="file-pill__name" title={value.upload.filePath}>
                {basename(value.upload.filePath)}
              </span>
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
                aria-label={`Remove ${basename(value.upload.filePath)}`}
                onClick={clearUpload}
              >
                ×
              </button>
            </div>
          ) : null}

          <p className="dropzone__formats">
            Supported: .qs (Q#), .qasm (OpenQASM), .ll / .bc (QIR)
          </p>

          {/* Precedence matters: a path that could not be resolved has nothing
              to pre-flight, so its error outranks both the progress line and the
              pre-flight's own verdict. */}
          {pathError ? (
            <p className="field__error" role="alert">
              {pathError}
            </p>
          ) : isCheckingFile ? (
            <p className="field__help" role="status">
              Checking file…
            </p>
          ) : errors.uploadFilePath ? (
            <p className="field__error" role="alert">
              {errors.uploadFilePath}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="field-block">
          <p className="dropzone__formats" id="manual-counts-label">
            {MANUAL_COUNTS_SECTION}
          </p>
          <div className="form-grid" role="group" aria-labelledby="manual-counts-label">
            {MANUAL_COUNT_FIELDS.map((field) => (
              <NumberField
                key={field.key}
                id={`manual-${field.key}`}
                label={field.label}
                definition={MANUAL_COUNT_DEFINITIONS[field.key]}
                placeholder="None"
                integer
                value={value.manualCounts[field.key]}
                onChange={(next) => setManualCount(field.key, next)}
                error={errors[field.key]}
                help={field.help}
                required
              />
            ))}
          </div>
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
