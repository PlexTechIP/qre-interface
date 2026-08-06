import { useState } from "react";

import {
  MAGIC_STATE_FACTORY_IDS,
  type MagicStateFactoryId,
} from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  QEC_LABELS,
} from "../constants/labels";
import { CONFIG_DEFINITIONS } from "../constants/configDefinitions";
import {
  deriveQecCode,
  type ArchitectureForm,
  type PsspcForm,
  type TraceTransformForm,
} from "../state/formState";
import { DefinitionTip } from "./DefinitionTip";
import { Field } from "./Field";

interface MicroArchitectureSectionProps {
  architecture: ArchitectureForm;
  magicStateFactory: MagicStateFactoryId;
  /** Whether Litinski19 is currently selectable (GateBased, error rate <= 1e-3). */
  magicStateFactoryAllowed: boolean;
  onMagicStateFactoryChange: (value: MagicStateFactoryId) => void;
  traceTransform: TraceTransformForm;
  onTraceTransformChange: (value: TraceTransformForm) => void;
  maxError: number | null;
  maxErrorError?: string | undefined;
  onMaxErrorChange: (value: number | null) => void;
}

/**
 * The full QEC-code catalogue for display. Only `surface_code` and `three_aux`
 * are contract values and reachable (their architectures are available); the
 * rest are shown greyed. Low-Move belongs to Neutral Atom (not available yet),
 * and the last four are private builds — displayed, never selectable. QEC is
 * locked to architecture, so the control's value always follows the derivation.
 */
const QEC_CODE_OPTIONS: readonly {
  value: string;
  label: string;
  disabled: boolean;
}[] = [
  { value: "surface_code", label: "Surface Code", disabled: false },
  { value: "three_aux", label: "Three-Aux", disabled: false },
  { value: "low_move", label: "Low-Move Surface Code · Neutral Atom", disabled: true },
  { value: "beryllium", label: "Beryllium · Private", disabled: true },
  { value: "phenom_beryllium", label: "Phenomenological Beryllium · Private", disabled: true },
  { value: "aft_surface", label: "AFT Surface Code · Private", disabled: true },
  { value: "bicycle", label: "Bicycle Code · Private", disabled: true },
];

/**
 * Magic State Factory options. `round_based`/`litinski19` are the contract
 * values (Litinski19 auto-disables and falls back per the availability rule);
 * GSJ24 is a private build — displayed, never selectable.
 */
const GSJ24_VALUE = "gsj24";

const SECONDARY_FACTORY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "magic_up_to_clifford", label: "Magic Up-to-Clifford" },
  { value: "gsj24_ccx", label: "GSJ24 CCX Factory" },
] as const;

const MEMORY_OPTIMIZATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "yoked_1d", label: "1D Yoked Surface Code" },
  { value: "yoked_2d", label: "2D Yoked Surface Code" },
] as const;

/**
 * Micro Architecture Settings — the consolidated QEC code, magic-state factory,
 * trace transform, and max-error controls. QEC is derived/locked; the factory
 * carries the Litinski19 fallback rule; Secondary Factory / Memory Optimization
 * are optional renderer-only placeholders (no contract field yet — not
 * serialized); Dynamic Memory Compute is a private, view-only block.
 */
export function MicroArchitectureSection({
  architecture,
  magicStateFactory,
  magicStateFactoryAllowed,
  onMagicStateFactoryChange,
  traceTransform,
  onTraceTransformChange,
  maxError,
  maxErrorError,
  onMaxErrorChange,
}: MicroArchitectureSectionProps): React.JSX.Element {
  // Renderer-only, non-serialized selections (no contract field yet).
  const [secondaryFactory, setSecondaryFactory] = useState("none");
  const [memoryOptimization, setMemoryOptimization] = useState("none");

  const archLabel = ARCHITECTURE_LABELS[architecture.type];
  const derivedQec = deriveQecCode(architecture);
  const qecLabel = QEC_LABELS[derivedQec];

  const setPsspc = (patch: Partial<PsspcForm>): void => {
    onTraceTransformChange({
      ...traceTransform,
      psspc: { ...traceTransform.psspc, ...patch },
    });
  };

  const tStates = traceTransform.psspc.tStatesPerRotation;
  const isMajorana = architecture.type === "majorana";

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
          definition={CONFIG_DEFINITIONS.qecCode}
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
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="micro-factory"
          label="Magic State Factory"
          definition={CONFIG_DEFINITIONS.magicStateFactory}
          help={
            magicStateFactoryAllowed
              ? "Filtered by architecture and error rate."
              : "Litinski19 needs Superconducting hardware with error rate ≤ 1e-3. Using Round-Based instead."
          }
        >
          <select
            id="micro-factory"
            className="field__input"
            value={magicStateFactory}
            onChange={(event) => {
              const next = event.target.value;
              if ((MAGIC_STATE_FACTORY_IDS as readonly string[]).includes(next)) {
                onMagicStateFactoryChange(next as MagicStateFactoryId);
              }
            }}
          >
            {MAGIC_STATE_FACTORY_IDS.map((id) => (
              <option
                key={id}
                value={id}
                disabled={id === "litinski19" && !magicStateFactoryAllowed}
              >
                {MAGIC_STATE_FACTORY_LABELS[id]} Factory
              </option>
            ))}
            <option value={GSJ24_VALUE} disabled>
              GSJ24 Factory · Private
            </option>
          </select>
        </Field>
      </div>

      <hr className="micro-divider" />

      <div className="micro-grid">
        <Field
          id="micro-secondary-factory"
          label={
            <>
              Secondary Factory{" "}
              <span className="field-eyebrow__optional">(optional)</span>
            </>
          }
          definition={CONFIG_DEFINITIONS.secondaryFactory}
          help="Optional · defaults to None"
        >
          <select
            id="micro-secondary-factory"
            className="field__input"
            value={secondaryFactory}
            onChange={(event) => setSecondaryFactory(event.target.value)}
          >
            {SECONDARY_FACTORY_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                // Magic Up-to-Clifford is not compatible with Majorana.
                disabled={option.value === "magic_up_to_clifford" && isMajorana}
              >
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="micro-memory-opt"
          label={
            <>
              Memory Optimization{" "}
              <span className="field-eyebrow__optional">(optional)</span>
            </>
          }
          definition={CONFIG_DEFINITIONS.memoryOptimization}
          help="Optional · defaults to None"
        >
          <select
            id="micro-memory-opt"
            className="field__input"
            value={memoryOptimization}
            onChange={(event) => setMemoryOptimization(event.target.value)}
          >
            {MEMORY_OPTIMIZATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <hr className="micro-divider" />

      <div className="field-block">
        <span className="field-eyebrow field-eyebrow--with-tip">
          Trace Transform
          <DefinitionTip label="Trace Transform">
            {CONFIG_DEFINITIONS.traceTransform}
          </DefinitionTip>
        </span>

        <div className="micro-transform">
        <div className="micro-subgroup">
          <span className="micro-subgroup__label">PSSPC Parameters</span>
          <div className="field">
            <div className="field__label-row">
              <label className="field__label" htmlFor="micro-tstates">
                T Count Per Rotation
              </label>
              <DefinitionTip label="T Count Per Rotation">
                {CONFIG_DEFINITIONS.tStatesPerRotation}
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
                aria-label="T Count Per Rotation"
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

          <div className="toggle-field">
            <span className="field__label-row">
              <span className="field__label">CCX Magic States</span>
              <DefinitionTip label="CCX Magic States">
                {CONFIG_DEFINITIONS.ccxMagicStates}
              </DefinitionTip>
            </span>
            <button
              type="button"
              role="switch"
              aria-label="CCX Magic States"
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
          </div>
        </div>

        <div className="micro-subgroup">
          <span className="micro-subgroup__label">Lattice Surgery Parameters</span>
          <Field
            id="micro-slowdown"
            label="Slow Down Factor"
            definition={CONFIG_DEFINITIONS.latticeSlowdown}
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

        <div className="micro-subgroup micro-subgroup--private">
          <span className="micro-subgroup__label">
            Dynamic Memory Compute
            <span className="private-badge">Private · View only</span>
          </span>
          <div className="micro-grid">
            <Field
              id="micro-compute-capacity"
              label="Compute Capacity Percentage"
              help="Default 50%"
            >
              <select id="micro-compute-capacity" className="field__input" value="50" disabled>
                <option value="50">50%</option>
              </select>
            </Field>
            <Field id="micro-eviction" label="Eviction Strategy" help="Default LRU">
              <select id="micro-eviction" className="field__input" value="lru" disabled>
                <option value="lru">LRU</option>
              </select>
            </Field>
          </div>
        </div>
        </div>
      </div>

      <hr className="micro-divider" />

      <div className="field-block">
        <span className="field-eyebrow field-eyebrow--with-tip">
          Total Fault Tolerant Execution Error
          <DefinitionTip label="Total Fault Tolerant Execution Error">
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
              aria-label="Total Fault Tolerant Execution Error"
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
