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
  CONFIG_DEFINITIONS,
  FACTORY_DEFINITIONS,
  MEMORY_OPTIMIZATION_DEFINITIONS,
  QEC_CODE_DEFINITIONS,
  TRACE_TRANSFORM_DEFINITIONS,
} from "../constants/configDefinitions";
import {
  deriveQecCode,
  isGsj24AllowedInForm,
  isLitinski19AllowedInForm,
  type ArchitectureForm,
  type DynamicMemoryComputeForm,
  type TraceTransformForm,
} from "../state/formState";
import { EVICTION_STRATEGIES, type EvictionStrategy } from "../../shared/traceTransform";
import { DefinitionTip, definitionId } from "./DefinitionTip";
import { Field } from "./Field";
import { NumberField } from "./NumberField";

/**
 * The five factory options as ONE list, which is how the analyst sees them since
 * the 2026-07-31 update. The split below the surface is real and load-bearing:
 * `build_isa_query` UNIONS the first three into a single factory query, then
 * MULTIPLIES the last two onto it as modifiers. Those are different operations,
 * so the two contract fields stay distinct on the wire and this control
 * partitions by member id at the boundary.
 */
type FactoryMemberId = MagicStateFactoryId | SecondaryFactoryId;

const FACTORY_MEMBERS: readonly FactoryMemberId[] = [
  ...MAGIC_STATE_FACTORY_IDS,
  ...SECONDARY_FACTORY_IDS,
];

const FACTORY_MEMBER_LABELS: Record<FactoryMemberId, string> = {
  ...MAGIC_STATE_FACTORY_LABELS,
  ...SECONDARY_FACTORY_LABELS,
};

const SECONDARY_MEMBERS = new Set<string>(SECONDARY_FACTORY_IDS);

/** Whether a member is a modifier (secondary) rather than a primary factory. */
function isSecondaryMember(id: FactoryMemberId): id is SecondaryFactoryId {
  return SECONDARY_MEMBERS.has(id);
}

/** Eviction strategy display names, from the Config Descriptions tab's enum. */
const EVICTION_STRATEGY_LABELS: Record<EvictionStrategy, string> = {
  least_recently_used: "Least Recently Used",
  least_frequently_used: "Least Frequently Used",
  first_available: "First Available",
};
 
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
  /** Stage 0's capacity error, only ever set while the stage is enabled. */
  computeCapacityError?: string | undefined;
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
 * secondary factories, memory optimization, trace transform, and max-error
 * controls.
 *
 * QEC is derived from the architecture and locked. The primary factory is a
 * multi-select set carrying the per-architecture availability rules. Secondary
 * factories are a multi-select set and reach the engine. Memory Optimization is
 * serialized but DISABLED and labelled unavailable — see the control below for
 * why. The trace transform is one two-stage pipeline, not a choice.
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
  computeCapacityError,
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

  /**
   * Why one of the five options is unselectable, or undefined when it is. Every
   * disabled checkbox gets a reason — a greyed-out box with no explanation is
   * its own bug, and the rules here are not guessable from the screen.
   */
  const memberDisabledReason = (id: FactoryMemberId): string | undefined => {
    if (id === "litinski19" && !litinski19Allowed) {
      return "Needs Superconducting with Error Rate ≤ 1e-3, or Neutral Atom with all three errors ≤ 1e-3.";
    }
    if (id === "gsj24" && !gsj24Allowed) {
      return "Needs Superconducting with Error Rate ≤ 1e-3, or Neutral Atom with Rydberg ≤ 1e-3 and single-qubit/measurement < 1e-2.";
    }
    if (id === "magic_up_to_clifford" && isMajorana) {
      return "Not compatible with Majorana.";
    }
    // The primary set must never empty: at least one of the first three has to
    // stay selected, so the last one standing is held checked until the user
    // picks a replacement. Modifiers alone is not a valid selection — there
    // would be no factory query for them to modify.
    if (
      !isSecondaryMember(id) &&
      primarySet.has(id) &&
      primarySet.size === 1
    ) {
      return "At least one of Round-Based, Litinski19 or GSJ24 must stay selected.";
    }
    return undefined;
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
      if (traceTransform.ccxMagicStates !== turningOn) {
        onTraceTransformChange({ ...traceTransform, ccxMagicStates: turningOn });
      }
    }
  };
 
  const setTransform = (patch: Partial<TraceTransformForm>): void => {
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
    onTraceTransformChange({ ...traceTransform, ...patch });
  };
 
  const dmc = traceTransform.dynamicMemoryCompute;
  const dmcEnabled = dmc !== null;

  /**
   * Toggle stage 0. Turning it OFF sets the stage to `null` rather than leaving
   * an object at its defaults: an absent stage and a stage running at its
   * defaults are different pipelines, and therefore different estimates.
   *
   * Turning it off also clears Unmemory, which REVERSES this stage and has
   * nothing to act on without it.
   */
  const toggleDynamicMemoryCompute = (): void => {
    onTraceTransformChange(
      dmcEnabled
        ? { ...traceTransform, dynamicMemoryCompute: null, unmemory: false }
        : {
            ...traceTransform,
            dynamicMemoryCompute: {
              computeCapacityPercentage: 0.5,
              evictionStrategy: "least_recently_used",
            },
          },
    );
  };

  const setDmc = (patch: Partial<DynamicMemoryComputeForm>): void => {
    if (dmc === null) return;
    onTraceTransformChange({
      ...traceTransform,
      dynamicMemoryCompute: { ...dmc, ...patch },
    });
  };

  const tStates = traceTransform.tStatesPerRotation;
 
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
          definition={QEC_CODE_DEFINITIONS[derivedQec]}
          help={`Locked to architecture (${archLabel} → ${qecLabel}).`}
        >
          <select
            id="micro-qec"
            className="field__input"
            aria-describedby={definitionId("micro-qec")}
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
 
        {/* ONE control, five options — the 2026-07-31 POC ask. The analyst never
            sees "primary" or "secondary"; the split lives at the boundary, where
            it has to, because the estimator unions the first three into a single
            factory query and multiplies the last two onto it as modifiers. */}
        <fieldset className="field" aria-labelledby="micro-factory-label">
          <legend className="field__label" id="micro-factory-label">
            Magic State Factory
          </legend>
          {FACTORY_MEMBERS.map((id) => {
            const checked = isSecondaryMember(id)
              ? secondarySet.has(id)
              : primarySet.has(id);
            const disabledReason = memberDisabledReason(id);
            // A <div> wrapper with an explicit htmlFor, NOT a wrapping <label>.
            // Anything inside a label is walked by accessible-name computation,
            // so a nested tooltip trigger would make this checkbox announce as
            // "Litinski19 Litinski19 definition". The name stays exactly the
            // factory's label; the definition arrives via aria-describedby.
            return (
              <div key={id} className="checkbox-field">
                <input
                  id={`micro-factory-${id}`}
                  type="checkbox"
                  checked={checked}
                  disabled={disabledReason !== undefined}
                  aria-describedby={definitionId(`micro-factory-${id}`)}
                  onChange={() =>
                    isSecondaryMember(id) ? toggleSecondary(id) : togglePrimary(id)
                  }
                />
                <label htmlFor={`micro-factory-${id}`}>
                  {FACTORY_MEMBER_LABELS[id]}
                </label>
                <DefinitionTip
                  id={definitionId(`micro-factory-${id}`)}
                  label={FACTORY_MEMBER_LABELS[id]}
                >
                  {FACTORY_DEFINITIONS[id]}
                </DefinitionTip>
                {disabledReason ? (
                  <span className="checkbox-field__reason">{disabledReason}</span>
                ) : null}
              </div>
            );
          })}
          <p className="field__help">{factoryHelp}</p>
        </fieldset>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="micro-grid">
        {/* The Secondary Factory fieldset that used to sit here was merged into
            the single Magic State Factory control above (2026-07-31 POC ask).
            `secondaryFactories` is unchanged on the wire — see the partition in
            that control. */}

        {/* Unavailable rather than optional — and as of week 5 that is a
            MEASURED claim, not an inferred one. The field now reaches
            build_isa_query, and with Dynamic Memory Compute supplying the
            READ_FROM_MEMORY / WRITE_TO_MEMORY demand the yoked codes exist to
            serve, the estimate is still bit-identical (memoryOptimization.test.ts).
            An enabled control that silently changes nothing is worse than a
            disabled one that says why. */}
        <div className="field">
          <div className="field__label-row">
            <label className="field__label" htmlFor="micro-memory-opt">
              Memory Optimization{" "}
              <span className="field-eyebrow__optional">(unavailable)</span>
            </label>
            <DefinitionTip
              id={definitionId("micro-memory-opt")}
              label="Memory Optimization"
            >
              {MEMORY_OPTIMIZATION_DEFINITIONS.section}
            </DefinitionTip>
          </div>
          <select
            id="micro-memory-opt"
            className="field__input"
            aria-describedby={definitionId("micro-memory-opt")}
            value={memoryOptimization}
            disabled
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
          <p
            className="field__help"
            id="micro-memory-opt-help"
            data-testid="memory-opt-help"
          >
            Unavailable in this build — measured, not assumed. The yoked surface
            codes now reach the estimator, and on qdk 1.30.0 they leave the
            estimate unchanged even with Dynamic Memory Compute enabled, which is
            what supplies the memory demand they optimize.
          </p>
        </div>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="field-block">
        <span className="field-eyebrow">Trace Transform</span>
        {/* An ORDERED pipeline, not a choice. Two stages always run and two are
            optional; the order is a correctness property of qdk, not a
            presentation preference — PSSPC alone yields an empty frontier, and
            LatticeSurgery × PSSPC raises "unsupported instruction
            LATTICE_SURGERY in trace transformation 'PSSPC'". */}
        <p className="field__help">
          An ordered pipeline —{" "}
          <strong>
            Dynamic Memory Compute → PSSPC → Lattice Surgery → Unmemory
          </strong>
          . PSSPC and Lattice Surgery run on every estimate; the other two are
          optional and are absent from the pipeline when off, not run at their
          defaults.
        </p>

        <div className="micro-transform">
        {/* Stage 0 — optional, off by default. Its parameters only become live
            when the stage is enabled, and turning it off drops the whole object
            rather than keeping it at 0.5 / LRU. */}
        <div className={`micro-subgroup${dmcEnabled ? "" : " micro-subgroup--off"}`}>
          <span className="micro-subgroup__label">
            <span id="micro-dmc-name">Stage 0 · Dynamic Memory Compute</span>
            <span className="field-eyebrow__optional"> (optional)</span>
            <DefinitionTip
              id={definitionId("micro-dmc")}
              label="Dynamic Memory Compute"
            >
              {TRACE_TRANSFORM_DEFINITIONS.dynamicMemoryCompute}
            </DefinitionTip>
          </span>

          <div className="toggle-field">
            <span className="field__label" id="micro-dmc-label">
              Enable stage
            </span>
            {/* Named by the stage AND the visible "Enable stage" text: there are
                two of these switches, and "Enable stage" alone does not say
                which one. The visible text stays part of the name. */}
            <button
              type="button"
              role="switch"
              aria-checked={dmcEnabled}
              aria-labelledby="micro-dmc-name micro-dmc-label"
              aria-describedby={definitionId("micro-dmc")}
              className={`toggle${dmcEnabled ? " toggle--on" : ""}`}
              onClick={toggleDynamicMemoryCompute}
            >
              <span className="toggle__knob" />
            </button>
            <span className="toggle-field__state">{dmcEnabled ? "On" : "Off"}</span>
          </div>

          <NumberField
            id="micro-dmc-capacity"
            label="Compute Capacity Percentage"
            definition={TRACE_TRANSFORM_DEFINITIONS.computeCapacityPercentage}
            value={dmc?.computeCapacityPercentage ?? null}
            onChange={(v) => setDmc({ computeCapacityPercentage: v })}
            error={computeCapacityError}
            disabled={!dmcEnabled}
            placeholder="0.5"
            help="0 < capacity ≤ 1.0 · qdk default 0.5"
          />

          <Field
            id="micro-dmc-eviction"
            label="Eviction Strategy"
            definition={TRACE_TRANSFORM_DEFINITIONS.evictionStrategy}
            help="qdk default: Least Recently Used"
          >
            <select
              id="micro-dmc-eviction"
              className="field__input"
              disabled={!dmcEnabled}
              aria-describedby={definitionId("micro-dmc-eviction")}
              value={dmc?.evictionStrategy ?? "least_recently_used"}
              onChange={(event) =>
                setDmc({ evictionStrategy: event.target.value as EvictionStrategy })
              }
            >
              {EVICTION_STRATEGIES.map((id) => (
                <option key={id} value={id}>
                  {EVICTION_STRATEGY_LABELS[id]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="micro-subgroup">
          <span className="micro-subgroup__label">
            Stage 1 · PSSPC
            <DefinitionTip id={definitionId("micro-psspc")} label="PSSPC">
              {TRACE_TRANSFORM_DEFINITIONS.psspc}
            </DefinitionTip>
          </span>
          <div className="field">
            <div className="field__label-row">
              <label className="field__label" htmlFor="micro-tstates">
                T Count Per Rotation
              </label>
              <DefinitionTip
                id={definitionId("micro-tstates")}
                label="T Count Per Rotation"
              >
                {TRACE_TRANSFORM_DEFINITIONS.tStatesPerRotation}
              </DefinitionTip>
            </div>
            <div className="slider-row">
              <input
                id="micro-tstates"
                type="range"
                className="slider"
                style={fillStyle(tStatesFill)}
                min={5}
                max={20}
                step={1}
                aria-describedby={definitionId("micro-tstates")}
                value={tStates}
                onChange={(event) =>
                  setTransform({ tStatesPerRotation: Number(event.target.value) })
                }
              />
              <input
                type="number"
                className="field__input slider-row__number"
                min={5}
                max={20}
                step={1}
                aria-label="T Count Per Rotation"
                value={tStates}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setTransform({
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

          {/* A <div>, not a <label>: the tooltip trigger is a button, and a
              button inside a label makes clicking the tooltip toggle the switch.
              The switch is named explicitly instead. */}
          <div className="toggle-field">
            <span className="field__label-row">
              <span className="field__label" id="micro-ccx-label">
                CCX Magic States
              </span>
              <DefinitionTip
                id={definitionId("micro-ccx")}
                label="CCX Magic States"
              >
                {TRACE_TRANSFORM_DEFINITIONS.ccxMagicStates}
              </DefinitionTip>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={traceTransform.ccxMagicStates}
              aria-labelledby="micro-ccx-label"
              aria-describedby={definitionId("micro-ccx")}
              className={`toggle${traceTransform.ccxMagicStates ? " toggle--on" : ""}`}
              onClick={() =>
                setTransform({ ccxMagicStates: !traceTransform.ccxMagicStates })
              }
            >
              <span className="toggle__knob" />
            </button>
            <span className="toggle-field__state">
              {traceTransform.ccxMagicStates ? "On" : "Off"}
            </span>
          </div>
        </div>

        <div className="micro-subgroup">
          <span className="micro-subgroup__label">
            Stage 2 · Lattice Surgery
            <DefinitionTip
              id={definitionId("micro-lattice")}
              label="Lattice Surgery"
            >
              {TRACE_TRANSFORM_DEFINITIONS.latticeSurgery}
            </DefinitionTip>
          </span>
          {/* Slow Down Factor stays `const: 1` and read-only — deliberately. */}
          <Field
            id="micro-slowdown"
            label="Slow Down Factor"
            definition={TRACE_TRANSFORM_DEFINITIONS.slowDownFactor}
            help="Fixed at 1.0 (optimistic)"
          >
            <input
              id="micro-slowdown"
              className="field__input"
              type="text"
              value="1.0"
              disabled
              readOnly
              aria-describedby={definitionId("micro-slowdown")}
            />
          </Field>
        </div>

        {/* Stage 3 — optional, and GATED on stage 0 rather than labelled
            recorded-only. Unmemory reverses Dynamic Memory Compute, so with
            stage 0 off there is no memory model to remove and an unchanged
            estimate is the correct result, not a dead control. Measured on
            1.30.0: Unmemory alone leaves Ising Model (2D) 3×3 at 477 qubits /
            1,363,950 ns, identical to the two-stage pipeline. */}
        <div className={`micro-subgroup${dmcEnabled ? "" : " micro-subgroup--off"}`}>
          <span className="micro-subgroup__label">
            <span id="micro-unmemory-name">Stage 3 · Unmemory</span>
            <span className="field-eyebrow__optional"> (optional)</span>
            <DefinitionTip id={definitionId("micro-unmemory")} label="Unmemory">
              {TRACE_TRANSFORM_DEFINITIONS.unmemory}
            </DefinitionTip>
          </span>
          <div className="toggle-field">
            <span className="field__label" id="micro-unmemory-label">
              Enable stage
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={traceTransform.unmemory}
              aria-labelledby="micro-unmemory-name micro-unmemory-label"
              aria-describedby={definitionId("micro-unmemory")}
              disabled={!dmcEnabled}
              className={`toggle${traceTransform.unmemory ? " toggle--on" : ""}`}
              onClick={() => setTransform({ unmemory: !traceTransform.unmemory })}
            >
              <span className="toggle__knob" />
            </button>
            <span className="toggle-field__state">
              {traceTransform.unmemory ? "On" : "Off"}
            </span>
          </div>
          <p className="field__help">
            {dmcEnabled
              ? "Reverses stage 0, mapping memory qubits back to compute qubits."
              : "Needs Dynamic Memory Compute — there is no memory model to reverse without it."}
          </p>
        </div>
        </div>
      </div>
 
      <hr className="micro-divider" />
 
      <div className="field-block">
        <span className="field-eyebrow field-eyebrow--with-tip">
          <span id="micro-max-error-label">Total Fault Tolerant Execution Error</span>
          <DefinitionTip
            id={definitionId("micro-max-error")}
            label="Total Fault Tolerant Execution Error"
          >
            {CONFIG_DEFINITIONS.maxError}
          </DefinitionTip>
        </span>
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
              aria-labelledby="micro-max-error-label"
              aria-describedby={definitionId("micro-max-error")}
              value={maxError ?? 1}
              onChange={(event) => onMaxErrorChange(Number(event.target.value))}
            />
            <input
              type="number"
              className="field__input slider-row__number"
              min={0.01}
              max={1}
              step={0.01}
              aria-label="Total Fault Tolerant Execution Error value"
              aria-describedby={definitionId("micro-max-error")}
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