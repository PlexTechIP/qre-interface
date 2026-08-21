import {
  MAGIC_STATE_FACTORY_IDS,
  MEMORY_OPTIMIZATION_IDS,
  SECONDARY_FACTORY_IDS,
  type ArchitectureType,
  type MagicStateFactoryId,
  type MemoryOptimizationId,
  type QecCodeId,
  type SecondaryFactoryId,
} from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  MEMORY_OPTIMIZATION_LABELS,
  SECONDARY_FACTORY_LABELS,
} from "../constants/labels";
import {
  CONFIG_DEFINITIONS,
  FACTORY_DEFINITIONS,
  MEMORY_OPTIMIZATION_SECTION,
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
  isSecondaryFactoryAllowed,
} from "../state/formState";
import { EVICTION_STRATEGIES, type EvictionStrategy } from "../../shared/traceTransform";
import {
  DefinitionTip,
  definitionDescribedBy,
  definitionId,
} from "./DefinitionTip";
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

/**
 * The hard requirement each factory carries, shown in parentheses beside the
 * option. Only factories with a requirement appear here — Round-Based and
 * GSJ24 CCX have none. The same condition drives whether the checkbox is
 * disabled (see `isMemberDisabled`), so the greyed-out box always reads together
 * with the reason it is greyed out.
 */
const FACTORY_REQUIREMENTS: Partial<Record<FactoryMemberId, string>> = {
  litinski19:
    "requires Superconducting ≤ 1e-3, or Neutral Atom with all errors ≤ 1e-3",
  gsj24:
    "requires Superconducting ≤ 1e-3, or Neutral Atom with Rydberg ≤ 1e-3 and single-qubit/measurement < 1e-2",
  magic_up_to_clifford: "not compatible with Majorana",
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
  /** Serialized primary magic-state factory set (multi-select; may be emptied,
   *  which surfaces `magicStateFactoriesError` and blocks Run). */
  magicStateFactories: readonly MagicStateFactoryId[];
  onMagicStateFactoriesChange: (value: MagicStateFactoryId[]) => void;
  /** Set when the primary set is empty — no factory is selected. */
  magicStateFactoriesError?: string | undefined;
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
 * The QEC-code catalogue for display. All three are contract values; QEC is
 * locked to architecture (each code is produced by exactly one architecture —
 * see `expectedQecCode`), so the control's value always follows the derivation.
 * The `architecture` here is the one that yields the code, used to grey out and
 * annotate the options the current architecture doesn't produce.
 */
const QEC_CODE_OPTIONS: readonly {
  value: QecCodeId;
  label: string;
  architecture: ArchitectureType;
}[] = [
  { value: "surface_code", label: "Surface Code", architecture: "gateBased" },
  { value: "three_aux", label: "Three-Aux", architecture: "majorana" },
  {
    value: "low_move_surface_code",
    label: "Low-Move Surface Code",
    architecture: "neutralAtom",
  },
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
  magicStateFactoriesError,
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
  const derivedQec = deriveQecCode(architecture);

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
    : "Select one or more · the estimator explores every selected factory and returns one combined frontier.";
 
  const primarySet = new Set(magicStateFactories);

  /**
   * Toggle a primary factory. The set may be emptied — unchecking the last one
   * is allowed and surfaces `magicStateFactoriesError`, which blocks Run until a
   * factory is re-selected, rather than the control refusing the click.
   */
  const togglePrimary = (id: MagicStateFactoryId): void => {
    const next = new Set(primarySet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onMagicStateFactoriesChange(MAGIC_STATE_FACTORY_IDS.filter((f) => next.has(f)));
  };

  /**
   * Whether one of the five options is unselectable on the current architecture.
   * Litinski19 and GSJ24 gate on the error-rate rules; Magic Up-to-Clifford is
   * ruled out under Majorana. The reason for each is shown as the parenthetical
   * requirement beside the option (see FACTORY_REQUIREMENTS).
   */
  const isMemberDisabled = (id: FactoryMemberId): boolean => {
    if (id === "litinski19") return !litinski19Allowed;
    if (id === "gsj24") return !gsj24Allowed;
    if (id === "magic_up_to_clifford") {
      return !isSecondaryFactoryAllowed(id, architecture.type);
    }
    return false;
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
 
  // Percent of the track filled left of the thumb, used to paint the accent fill
  // AND to position the value bubble over the thumb.
  const tStatesFill = ((tStates - 5) / (20 - 5)) * 100;
  const maxErrorFill = (((maxError ?? 1) - 0.01) / (1 - 0.01)) * 100;
  // `--fill` is the percentage the track gradient reads; `--pos` is the same
  // number, unitless, which the bubble's `left` calc scales by the thumb width
  // so it stays centred on the thumb at both ends of the track. Both live on the
  // shell so the slider (custom props inherit) and the bubble share one source.
  const fillStyle = (pct: number): React.CSSProperties => {
    const clamped = Math.min(100, Math.max(0, pct));
    return { "--fill": `${clamped}%`, "--pos": clamped } as React.CSSProperties;
  };
 
  return (
    <section className="form-section micro-section" aria-labelledby="micro-heading">
      <header className="form-section__head">
        <h2 id="micro-heading" className="form-section__title">
          Micro Architecture Settings
        </h2>
      </header>
 
      <div className="micro-group micro-group--card">
        <span className="micro-group__title">Error Correction</span>
        <div className="micro-grid">
        {/* QEC code is locked to the architecture — the value tracks the
            derivation and the control is inert. */}
        <Field
          id="micro-qec"
          label="QEC Code"
          definition={QEC_CODE_DEFINITIONS[derivedQec]}
        >
          <select
            id="micro-qec"
            className="field__input"
            aria-describedby={definitionDescribedBy(
              "micro-qec",
              QEC_CODE_DEFINITIONS[derivedQec],
            )}
            value={derivedQec}
            onChange={() => {
              /* locked to architecture — value is derived, never set here */
            }}
          >
            {QEC_CODE_OPTIONS.map((option) => {
              // The derived code is the only selectable one. The rest are greyed
              // out and annotated with the architecture that would produce them,
              // so the pairing is legible without letting the analyst pick a code
              // the current architecture never yields.
              const isDerived = option.value === derivedQec;
              return (
                <option key={option.value} value={option.value} disabled={!isDerived}>
                  {isDerived
                    ? option.label
                    : `${option.label} (must use ${
                        ARCHITECTURE_LABELS[option.architecture]
                      } architecture)`}
                </option>
              );
            })}
          </select>
        </Field>
 
        {/* Memory Optimization sits beside QEC — both are code-level error
            correction choices. Unavailable rather than optional: the field is
            wired through to build_isa_query, but on qdk 1.30.0 the yoked codes
            leave the estimate unchanged even with Dynamic Memory Compute
            supplying the memory demand they serve, so the control says why
            instead of pretending to be optional. */}
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
              {MEMORY_OPTIMIZATION_SECTION}
            </DefinitionTip>
          </div>
          <select
            id="micro-memory-opt"
            className="field__input"
            aria-describedby={definitionId("micro-memory-opt")}
            value={memoryOptimization}
            onChange={(event) => {
              const next = event.target.value;
              if ((MEMORY_OPTIMIZATION_IDS as readonly string[]).includes(next)) {
                onMemoryOptimizationChange(next as MemoryOptimizationId);
              }
            }}
          >
            {MEMORY_OPTIMIZATION_IDS.map((id) => (
              // The dropdown lists the yoked codes so their existence is visible,
              // but each is disabled — selecting one changes nothing on the
              // current engine, so only "None" is choosable. A yoked value a
              // stored record already carries stays selectable so Rerun can keep
              // displaying it rather than snapping to None.
              <option
                key={id}
                value={id}
                disabled={id !== "none" && id !== memoryOptimization}
              >
                {MEMORY_OPTIMIZATION_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
        </div>
      </div>

      {/* ONE control, five options — the 2026-07-31 POC ask. The analyst never
          sees "primary" or "secondary"; the split lives at the boundary, where
          it has to, because the estimator unions the first three into a single
          factory query and multiplies the last two onto it as modifiers. */}
      {/* A div with role="group", not a <fieldset>: a <legend> does not render as
          a clean full-width block for the card's underlined eyebrow, so this uses
          the same div/span pairing as the Trace Transform group. The grouping
          semantics are preserved by role + aria-labelledby. */}
      <div
        className="field micro-group micro-group--card"
        role="group"
        aria-labelledby="micro-factory-label"
      >
        <span className="micro-group__title" id="micro-factory-label">
          Magic State Factory
        </span>
          <p className="field__help">{factoryHelp}</p>
          {FACTORY_MEMBERS.map((id) => {
            const checked = isSecondaryMember(id)
              ? secondarySet.has(id)
              : primarySet.has(id);
            const requirement = FACTORY_REQUIREMENTS[id];
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
                  disabled={isMemberDisabled(id)}
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
                {requirement ? (
                  <span className="checkbox-field__requirement">
                    ({requirement})
                  </span>
                ) : null}
              </div>
            );
          })}
          {magicStateFactoriesError ? (
            <p className="field__help field__help--error" role="alert">
              {magicStateFactoriesError}
            </p>
          ) : null}
        </div>

      <div className="micro-group micro-group--card">
        <span className="micro-group__title">Trace Transform</span>
        {/* An ORDERED pipeline, not a choice. Two stages always run and two are
            optional; the order is a correctness property of qdk, not a
            presentation preference — PSSPC alone yields an empty frontier, and
            LatticeSurgery × PSSPC raises "unsupported instruction
            LATTICE_SURGERY in trace transformation 'PSSPC'". */}
        <p className="field__help">
          An ordered pipeline:{" "}
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
            help="0 < capacity ≤ 1.0"
          />

          <Field
            id="micro-dmc-eviction"
            label="Eviction Strategy"
            definition={TRACE_TRANSFORM_DEFINITIONS.evictionStrategy}
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
              <div className="slider-shell" style={fillStyle(tStatesFill)}>
                <input
                  id="micro-tstates"
                  type="range"
                  className="slider"
                  min={5}
                  max={20}
                  step={1}
                  aria-describedby={definitionId("micro-tstates")}
                  value={tStates}
                  onChange={(event) =>
                    setTransform({ tStatesPerRotation: Number(event.target.value) })
                  }
                />
                {/* Persistent value pinned over the thumb. aria-hidden: the
                    paired number input already exposes the value to AT. */}
                <output className="slider__bubble" aria-hidden="true">
                  {tStates}
                </output>
              </div>
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
          {dmcEnabled ? null : (
            <p className="field__help">
              Needs Dynamic Memory Compute — there is no memory model to reverse
              without it.
            </p>
          )}
        </div>
        </div>
      </div>
 
      <div className="micro-group micro-group--card">
        <span className="micro-group__title field-eyebrow--with-tip">
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
            <div className="slider-shell" style={fillStyle(maxErrorFill)}>
              <input
                id="micro-max-error"
                type="range"
                className="slider"
                min={0.01}
                max={1}
                step={0.01}
                aria-labelledby="micro-max-error-label"
                aria-describedby={definitionId("micro-max-error")}
                value={maxError ?? 1}
                onChange={(event) => onMaxErrorChange(Number(event.target.value))}
              />
              {/* Persistent value pinned over the thumb. aria-hidden: the paired
                  number input already exposes the value to AT. */}
              <output className="slider__bubble" aria-hidden="true">
                {maxError ?? 1}
              </output>
            </div>
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