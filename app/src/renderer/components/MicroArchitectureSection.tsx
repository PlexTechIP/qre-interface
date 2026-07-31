import {
  MAGIC_STATE_FACTORY_IDS,
  MEMORY_OPTIMIZATION_IDS,
  SECONDARY_FACTORY_IDS,
  type MagicStateFactoryId,
  type MemoryOptimizationId,
  type SecondaryFactoryId,
} from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  MEMORY_OPTIMIZATION_LABELS,
  QEC_LABELS,
  SECONDARY_FACTORY_LABELS,
} from "../constants/labels";
import {
  deriveQecCode,
  isGsj24AllowedInForm,
  isLitinski19AllowedInForm,
  type ArchitectureForm,
  type PsspcForm,
  type TraceTransformForm,
} from "../state/formState";
import { Field } from "./Field";
 
interface MicroArchitectureSectionProps {
  architecture: ArchitectureForm;
  /** Serialized primary magic-state factory set (multi-select, never empty). */
  magicStateFactories: readonly MagicStateFactoryId[];
  onMagicStateFactoriesChange: (value: MagicStateFactoryId[]) => void;
  /** Serialized secondary-factory set (multi-select). */
  secondaryFactories: readonly SecondaryFactoryId[];
  onSecondaryFactoriesChange: (value: SecondaryFactoryId[]) => void;
  /** Serialized memory optimization ("none" by default). */
  memoryOptimization: MemoryOptimizationId;
  onMemoryOptimizationChange: (value: MemoryOptimizationId) => void;
  traceTransform: TraceTransformForm;
  onTraceTransformChange: (value: TraceTransformForm) => void;
  maxError: number | null;
  maxErrorError?: string | undefined;
  onMaxErrorChange: (value: number | null) => void;
}
 
/**
 * The QEC-code catalogue for display. All three are contract values now; QEC is
 * locked to architecture, so the control's value always follows the derivation
 * and the control itself is inert.
 */
const QEC_CODE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "surface_code", label: "Surface Code" },
  { value: "three_aux", label: "Three-Aux" },
  { value: "low_move_surface_code", label: "Low-Move Surface Code" },
];
 
/**
 * Micro Architecture Settings — the consolidated QEC code, magic-state factory,
 * trace transform, and max-error controls. QEC is derived/locked; the primary
 * factory is a multi-select set carrying the per-architecture availability
 * rules; Secondary Factory and Memory Optimization are serialized multi-select
 * and single-select sets respectively.
 */
export function MicroArchitectureSection({
  architecture,
  magicStateFactories,
  onMagicStateFactoriesChange,
  secondaryFactories,
  onSecondaryFactoriesChange,
  memoryOptimization,
  onMemoryOptimizationChange,
  traceTransform,
  onTraceTransformChange,
  maxError,
  maxErrorError,
  onMaxErrorChange,
}: MicroArchitectureSectionProps): React.JSX.Element {
  const archLabel = ARCHITECTURE_LABELS[architecture.type];
  const derivedQec = deriveQecCode(architecture);
  const qecLabel = QEC_LABELS[derivedQec];
 
  const isMajorana = architecture.type === "majorana";
  const litinski19Allowed = isLitinski19AllowedInForm(architecture);
  const gsj24Allowed = isGsj24AllowedInForm(architecture);
 
  /**
   * Help text under the Magic State Factory control. When a factory is not
   * selectable, explain why — the availability rule is architecture- and
   * error-rate-dependent, and a bare disabled checkbox announces no reason.
   */
  const factoryHelp = isMajorana
    ? "Majorana supports Round-Based only. Selecting several factories asks the estimator to explore all of them and return one combined frontier."
    : litinski19Allowed && gsj24Allowed
      ? "Select one or more · the estimator explores every selected factory and returns one combined frontier."
      : "Unavailable factories are filtered by architecture and error rate. Litinski19 needs Superconducting ≤ 1e-3, or Neutral Atom with all errors ≤ 1e-3. GSJ24 needs Superconducting ≤ 1e-3, or Neutral Atom with Rydberg ≤ 1e-3 and single-qubit/measurement < 1e-2.";
 
  /** Whether a given primary factory id is selectable on the current architecture. */
  const isPrimaryAllowed = (id: MagicStateFactoryId): boolean => {
    if (id === "litinski19") return litinski19Allowed;
    if (id === "gsj24") return gsj24Allowed;
    return true;
  };
 
  const primarySet = new Set(magicStateFactories);

  /**
   * Toggle a primary factory. The set must never empty, so unchecking the last
   * remaining one is refused — the user picks the replacement first, rather than
   * passing through an invalid state the serializer would silently repair.
   */
  const togglePrimary = (id: MagicStateFactoryId): void => {
    const next = new Set(primarySet);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    onMagicStateFactoriesChange(MAGIC_STATE_FACTORY_IDS.filter((f) => next.has(f)));
  };

  const secondarySet = new Set(secondaryFactories);
 
  /**
   * Toggle a secondary factory. GSJ24 CCX is bound to the PSSPC ccxMagicStates
   * flag: turning it on turns the flag on, turning it off turns the flag off.
   */
  const toggleSecondary = (id: SecondaryFactoryId): void => {
    const next = new Set(secondarySet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    const ordered = SECONDARY_FACTORY_IDS.filter((f) => next.has(f));
    onSecondaryFactoriesChange(ordered);
 
    if (id === "gsj24_ccx") {
      const turningOn = next.has("gsj24_ccx");
      if (traceTransform.psspc.ccxMagicStates !== turningOn) {
        onTraceTransformChange({
          ...traceTransform,
          psspc: { ...traceTransform.psspc, ccxMagicStates: turningOn },
        });
      }
    }
  };
 
  const setPsspc = (patch: Partial<PsspcForm>): void => {
    // CCX Magic States is bound to the GSJ24 CCX secondary factory: keep them in
    // sync when the flag is toggled directly.
    if (patch.ccxMagicStates !== undefined) {
      const wantCcx = patch.ccxMagicStates;
      const hasGsj24Ccx = secondarySet.has("gsj24_ccx");
      if (wantCcx !== hasGsj24Ccx) {
        const next = new Set(secondarySet);
        if (wantCcx) next.add("gsj24_ccx");
        else next.delete("gsj24_ccx");
        onSecondaryFactoriesChange(SECONDARY_FACTORY_IDS.filter((f) => next.has(f)));
      }
    }
    onTraceTransformChange({
      ...traceTransform,
      psspc: { ...traceTransform.psspc, ...patch },
    });
  };
 
  const tStates = traceTransform.psspc.tStatesPerRotation;
 
  // Percent of the track filled left of the thumb, used to paint the accent fill.
  const tStatesFill = ((tStates - 5) / (20 - 5)) * 100;
  const maxErrorFill = (((maxError ?? 1) - 0.01) / (1 - 0.01)) * 100;
  const fillStyle = (pct: number): React.CSSProperties =>
    ({ "--fill": `${Math.min(100, Math.max(0, pct))}%` }) as React.CSSProperties;
 
  return (
    <section className="form-section micro-section" aria-labelledby="micro-heading">
      <header className="form-section__head">
        <h2 id="micro-heading" className="form-section__title">
          Micro Architecture Settings
        </h2>
      </header>
 
      <div className="micro-grid">
        {/* QEC code is locked to the architecture — the value tracks the
            derivation and the control is inert. */}
        <Field
          id="micro-qec"
          label="QEC Code"
          help={`Locked to architecture (${archLabel} → ${qecLabel}).`}
        >
          <select
            id="micro-qec"
            className="field__input"
            value={derivedQec}
            onChange={() => {
              /* locked to architecture — value is derived, never set here */
            }}
          >
            {QEC_CODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
 
        {/* Multi-select (v1.2.0): the estimator unions the checked factories
            into one ISA query, so the frontier is explored across all of them.
            Matches the Secondary Factory control's checkbox idiom below. */}
        <fieldset className="field" aria-labelledby="micro-factory-label">
          <legend className="field__label" id="micro-factory-label">
            Magic State Factory
          </legend>
          {MAGIC_STATE_FACTORY_IDS.map((id) => {
            const checked = primarySet.has(id);
            // Never let the user empty the set: the last checked factory stays
            // checked until another is picked.
            const isLastChecked = checked && primarySet.size === 1;
            return (
              <label key={id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!isPrimaryAllowed(id) || isLastChecked}
                  onChange={() => togglePrimary(id)}
                />
                <span>{MAGIC_STATE_FACTORY_LABELS[id]}</span>
              </label>
            );
          })}
          <p className="field__help">{factoryHelp}</p>
        </fieldset>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="micro-grid">
        <fieldset className="field" aria-labelledby="micro-secondary-label">
          <legend className="field__label" id="micro-secondary-label">
            Secondary Factory{" "}
            <span className="field-eyebrow__optional">(optional)</span>
          </legend>
          {SECONDARY_FACTORY_IDS.map((id) => {
            // Magic Up-to-Clifford is not compatible with Majorana.
            const disabled = id === "magic_up_to_clifford" && isMajorana;
            return (
              <label key={id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={secondarySet.has(id)}
                  disabled={disabled}
                  onChange={() => toggleSecondary(id)}
                />
                <span>{SECONDARY_FACTORY_LABELS[id]}</span>
              </label>
            );
          })}
        </fieldset>
 
        <Field
          id="micro-memory-opt"
          label={
            <>
              Memory Optimization{" "}
              <span className="field-eyebrow__optional">(optional)</span>
            </>
          }
          help="Optional · defaults to None"
        >
          <select
            id="micro-memory-opt"
            className="field__input"
            value={memoryOptimization}
            onChange={(event) => {
              const next = event.target.value;
              if ((MEMORY_OPTIMIZATION_IDS as readonly string[]).includes(next)) {
                onMemoryOptimizationChange(next as MemoryOptimizationId);
              }
            }}
          >
            {MEMORY_OPTIMIZATION_IDS.map((id) => (
              <option key={id} value={id}>
                {MEMORY_OPTIMIZATION_LABELS[id]}
              </option>
            ))}
          </select>
        </Field>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="field-block">
        <span className="field-eyebrow">Trace Transform</span>
 
        <div className="micro-transform">
        <div className="micro-subgroup">
          <span className="micro-subgroup__label">PSSPC Parameters</span>
          <div className="field">
            <label className="field__label" htmlFor="micro-tstates">
              T States / Rotation
            </label>
            <div className="slider-row">
              <input
                id="micro-tstates"
                type="range"
                className="slider"
                style={fillStyle(tStatesFill)}
                min={5}
                max={20}
                step={1}
                value={tStates}
                onChange={(event) =>
                  setPsspc({ tStatesPerRotation: Number(event.target.value) })
                }
              />
              <input
                type="number"
                className="field__input slider-row__number"
                min={5}
                max={20}
                step={1}
                aria-label="T states per rotation"
                value={tStates}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setPsspc({
                      tStatesPerRotation: Math.min(20, Math.max(5, next)),
                    });
                  }
                }}
              />
            </div>
            <div className="slider-row__scale">
              <span>5</span>
              <span>20</span>
            </div>
          </div>
 
          <label className="toggle-field">
            <span className="field__label">CCX Magic States</span>
            <button
              type="button"
              role="switch"
              aria-checked={traceTransform.psspc.ccxMagicStates}
              className={`toggle${traceTransform.psspc.ccxMagicStates ? " toggle--on" : ""}`}
              onClick={() =>
                setPsspc({ ccxMagicStates: !traceTransform.psspc.ccxMagicStates })
              }
            >
              <span className="toggle__knob" />
            </button>
            <span className="toggle-field__state">
              {traceTransform.psspc.ccxMagicStates ? "On" : "Off"}
            </span>
          </label>
        </div>
 
        <div className="micro-subgroup">
          <span className="micro-subgroup__label">Lattice Surgery Parameters</span>
          <Field
            id="micro-slowdown"
            label="Slow Down Factor"
            help="Fixed at 1.0 (optimistic)"
          >
            <input
              id="micro-slowdown"
              className="field__input"
              type="text"
              value="1.0"
              disabled
              readOnly
            />
          </Field>
        </div>
        </div>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="field-block">
        <span className="field-eyebrow">Max Error</span>
        <div className="field">
          <div className="slider-row">
            <input
              id="micro-max-error"
              type="range"
              className="slider"
              style={fillStyle(maxErrorFill)}
              min={0.01}
              max={1}
              step={0.01}
              aria-label="Maximum total error"
              value={maxError ?? 1}
              onChange={(event) => onMaxErrorChange(Number(event.target.value))}
            />
            <input
              type="number"
              className="field__input slider-row__number"
              min={0.01}
              max={1}
              step={0.01}
              aria-label="Maximum total error value"
              value={maxError ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                onMaxErrorChange(raw.trim() === "" ? null : Number(raw));
              }}
            />
          </div>
          <div className="slider-row__scale">
            <span>0.01</span>
            <span>1.0 (default)</span>
          </div>
          {maxErrorError ? (
            <p className="field__help field__help--error" role="alert">
              {maxErrorError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}