/**
 * Pure serialization: FormState -> RunConfig (or null when the draft can't form
 * a structurally complete config). Value-range validity is the schema's job
 * (see schemaValidation.ts); this module only assembles the object and derives
 * the coupled fields (qecCode, magicStateFactories) so the output is never
 * internally inconsistent with the architecture.
 */
 
import {
  SCHEMA_VERSION,
  expectedQecCode,
  isMagicStateFactoryAllowed,
  type Application,
  type Architecture,
  type BenchmarkId,
  type HyperparameterValues,
  type MagicStateFactoryId,
  type MajoranaArchitecture,
  type NeutralAtomArchitecture,
  type RunConfig,
  type RunProvenance,
  type SecondaryFactoryId,
} from "../../shared/types";
import { ARCHITECTURE_LABELS, QEC_LABELS } from "../constants/labels";
import { QRE_VERSION, findBenchmark } from "../constants/staticOptions";
import { BENCHMARK_HYPERPARAMS } from "../constants/hyperparameters";
import { buildTraceTransform, deriveQecCode } from "./formState";
import type {
  ApplicationForm,
  ArchitectureForm,
  FormState,
} from "./formState";
 
/**
 * id + createdAt are stamped at Run-click and passed in (keeps this pure).
 *
 * `provenance` rides along for the same reason the other two do: it is
 * app-controlled metadata about the run rather than something the form edits,
 * and the model can never mint it. Putting it here rather than letting the
 * caller assign it afterwards is what keeps the object the Run gate validates
 * and the object the engine executes the SAME object — see the note on
 * `isConfigValid`.
 */
export interface RunStamp {
  id: string;
  createdAt: string;
  /** Omitted, never `undefined`: absence is the contract's "human-authored". */
  provenance?: RunProvenance;
}

/**
 * A schema-valid placeholder stamp for validation/preview only — id/createdAt
 * are real only at Run-click, and neither affects whether a config validates.
 *
 * Provenance is different: it IS part of what validates, so the gate and the
 * preview both have to pass the draft's real provenance through.
 */
export function schemaValidationStamp(provenance?: RunProvenance): RunStamp {
  const stamp: RunStamp = {
    id: "00000000-0000-4000-8000-000000000000",
    createdAt: "2000-01-01T00:00:00.000Z",
  };
  if (provenance !== undefined) stamp.provenance = provenance;
  return stamp;
}
 
function buildApplication(app: ApplicationForm): Application | null {
  if (app.type === "benchmark") {
    if (app.benchmarkId.length === 0) return null;
    // Hyperparameter VALUES live on RunConfig.parameters (not on the benchmark
    // application variant, whose shape is frozen). toRunConfig serializes them
    // from app.hyperparams[benchmarkId] — see buildParameters below.
    return { type: "benchmark", benchmarkId: app.benchmarkId };
  }
  if (app.type === "saved") {
    // A saved program is a remembered upload, so it serializes to the same
    // contract `uploaded` variant (addToLibrary is true — it's in the library).
    const chosen = app.savedPrograms.find((p) => p.id === app.selectedSavedId);
    if (!chosen) return null;
    return {
      type: "uploaded",
      filePath: chosen.filePath,
      format: chosen.format,
      addToLibrary: true,
    };
  }
  if (app.type === "manualCounts") {
    const m = app.manualCounts;
    // All seven counts are required; any unset field gates serialization. The
    // schema/adapter enforce ranges and the rotationDepth <= rotationCount bound.
    if (
      m.numQubits === null ||
      m.tCount === null ||
      m.rotationCount === null ||
      m.rotationDepth === null ||
      m.cczCount === null ||
      m.ccixCount === null ||
      m.measurementCount === null
    ) {
      return null;
    }
    return {
      type: "manualCounts",
      numQubits: m.numQubits,
      tCount: m.tCount,
      rotationCount: m.rotationCount,
      rotationDepth: m.rotationDepth,
      cczCount: m.cczCount,
      ccixCount: m.ccixCount,
      measurementCount: m.measurementCount,
    };
  }
  if (app.upload.filePath.length === 0) return null;
  return {
    type: "uploaded",
    filePath: app.upload.filePath,
    format: app.upload.format,
    addToLibrary: app.upload.addToLibrary,
  };
}
 
function buildArchitecture(arch: ArchitectureForm): Architecture | null {
  if (arch.type === "gateBased") {
    const g = arch.gateBased;
    // The two intentionally undefaulted required fields gate serialization.
    if (g.errorRate === null || g.gateTime === null || g.measurementTime === null) {
      return null;
    }
    return {
      type: "gateBased",
      errorRate: g.errorRate,
      gateTime: g.gateTime,
      measurementTime: g.measurementTime,
      twoQubitGateTime: g.twoQubitGateTime,
    };
  }
  if (arch.type === "majorana") {
    if (arch.majorana.operationTime === null) return null;
    const majorana: MajoranaArchitecture = {
      type: "majorana",
      errorRate: arch.majorana.errorRate,
      operationTime: arch.majorana.operationTime,
    };
    // v1.4.0 optionals are OMITTED when unset, never written as null. An absent
    // tErrorRate is what makes qdk derive it from errorRate, so writing one in
    // would silently replace a derived value with a fixed one.
    if (arch.majorana.tErrorRate !== null) {
      majorana.tErrorRate = arch.majorana.tErrorRate;
    }
    if (arch.majorana.targetYear !== null) {
      majorana.targetYear = arch.majorana.targetYear;
    }
    return majorana;
  }
  // Neutral Atom: every field is defaulted in the form, so nothing gates
  // serialization — the draft is always structurally complete.
  const n = arch.neutralAtom;
  const neutralAtom: NeutralAtomArchitecture = {
    type: "neutralAtom",
    rydbergTime: n.rydbergTime,
    rydbergError: n.rydbergError,
    singleQubitTime: n.singleQubitTime,
    singleQubitError: n.singleQubitError,
    measurementTime: n.measurementTime,
    measurementError: n.measurementError,
    handoffTime: n.handoffTime,
    atomSpacing: n.atomSpacing,
    maxVelocity: n.maxVelocity,
    maxAcceleration: n.maxAcceleration,
    surfaceCodeOneQubitTimeFactor: n.surfaceCodeOneQubitTimeFactor,
    surfaceCodeTwoQubitTimeFactor: n.surfaceCodeTwoQubitTimeFactor,
  };
  // v1.4.0 optionals stay OMITTED until set, keeping a default Neutral Atom
  // record byte-identical to the twelve-field v1.1.0 shape.
  if (n.dataQubitSpacing !== null) {
    neutralAtom.dataQubitSpacing = n.dataQubitSpacing;
  }
  if (n.targetYear !== null) {
    neutralAtom.targetYear = n.targetYear;
  }
  return neutralAtom;
}

 
/**
 * The primary factory SET that survives serialization. A non-round_based member
 * survives only when the architecture actually permits it (litinski19 / gsj24
 * each have their own availability rule). This mirrors `normalizeFormState`'s
 * form-side rule, so the serialized config never disagrees with what the UI
 * showed. The UI surfaces the fallback visibly.
 */
function effectiveFactories(
  selected: readonly MagicStateFactoryId[],
  architecture: Architecture,
): MagicStateFactoryId[] {
  // Order preserved, duplicates removed, ineligible members dropped. The schema
  // requires a NON-EMPTY set, so an empty result falls back to round_based —
  // the one factory every architecture accepts.
  const kept = [...new Set(selected)].filter((factory) =>
    isMagicStateFactoryAllowed(factory, architecture),
  );
  return kept.length > 0 ? kept : ["round_based"];
}
 
/**
 * Secondary factories that survive serialization: magic_up_to_clifford is dropped
 * under Majorana (schema-forbidden), the rest pass through. Order is preserved,
 * duplicates are removed. Empty in => empty out.
 */
function effectiveSecondaryFactories(
  selected: readonly SecondaryFactoryId[],
  architecture: Architecture,
): SecondaryFactoryId[] {
  const seen = new Set<SecondaryFactoryId>();
  const out: SecondaryFactoryId[] = [];
  for (const factory of selected) {
    if (seen.has(factory)) continue;
    if (
      factory === "magic_up_to_clifford" &&
      architecture.type === "majorana"
    ) {
      continue;
    }
    seen.add(factory);
    out.push(factory);
  }
  return out;
}
 
function applicationLabel(app: ApplicationForm): string {
  if (app.type === "benchmark") {
    const known = findBenchmark(app.benchmarkId);
    if (known) return known.name;
    return app.benchmarkId.length > 0 ? app.benchmarkId : "Custom program";
  }
  if (app.type === "saved") {
    const chosen = app.savedPrograms.find((p) => p.id === app.selectedSavedId);
    if (!chosen) return "Saved program";
    return chosen.name || (chosen.filePath.split(/[\\/]/).pop() ?? "Saved program");
  }
  if (app.type === "manualCounts") {
    return "Manual Logical Counts";
  }
  const base = app.upload.filePath.split(/[\\/]/).pop() ?? "";
  return base.length > 0 ? base : "Uploaded program";
}
 
/**
 * Deterministic auto-name: benchmark · architecture · QEC · T states. Shown in
 * the UI before Run and serialized when the user leaves the name blank.
 *
 * The last component used to be the trace transform's name, which was always
 * "PSSPC" — the discriminant no control ever changed. The pipeline is fixed, so
 * its T-states-per-rotation is the part that actually varies between runs and
 * the part worth having in a History row.
 */
export function generateName(state: FormState): string {
  return [
    applicationLabel(state.application),
    ARCHITECTURE_LABELS[state.architecture.type],
    QEC_LABELS[deriveQecCode(state.architecture)],
    `PSSPC ${state.traceTransform.tStatesPerRotation} T/rot`,
  ].join(" · ");
}
 
/**
 * Benchmark hyperparameter values for the selected benchmark, or null when there
 * are none to record (non-benchmark application, or an empty value map). Only the
 * selected benchmark's values are serialized — the form seeds every benchmark, so
 * we must not dump the whole keyed map. These become the arguments of the
 * benchmark's Q# entry operation at Run, so what is serialized here is what the
 * estimator runs.
 */
function buildParameters(state: FormState): HyperparameterValues | null {
  const app = state.application;
  if (app.type !== "benchmark" || app.benchmarkId.length === 0) return null;
  const values = app.hyperparams[app.benchmarkId];
  if (values === undefined) return null;
 
  // Serialize only the benchmark's real, user-editable fields, taking the value
  // from the form. Computed fields (e.g. Grover's "iterations", derived by the
  // engine at estimation) are excluded — they carry no user value. A field the
  // user cleared (null) is dropped: its absence means "use the engine default",
  // which is the honest record and matches the contract's number | string type.
  const fields = BENCHMARK_HYPERPARAMS[app.benchmarkId as BenchmarkId] ?? [];
  const params: HyperparameterValues = {};
  for (const field of fields) {
    if (field.kind === "computed") continue;
    const value = values[field.key];
    if (value === null || value === undefined) continue;
    params[field.key] = value;
  }
  return Object.keys(params).length > 0 ? params : null;
}
 
/**
 * Serialize a draft to a contract RunConfig, or null if it isn't structurally
 * complete (missing required numbers, unset maxError, or an empty application).
 * A non-null result is guaranteed internally consistent, but callers must still
 * schema-validate it for value-range correctness before Run.
 */
export function toRunConfig(state: FormState, stamp: RunStamp): RunConfig | null {
  const application = buildApplication(state.application);
  const architecture = buildArchitecture(state.architecture);
  const traceTransform = buildTraceTransform(state.traceTransform);
  if (
    application === null ||
    architecture === null ||
    traceTransform === null ||
    state.maxError === null
  ) {
    return null;
  }
 
  const name =
    state.name.trim().length > 0 ? state.name.trim() : generateName(state);
 
  const secondaryFactories = effectiveSecondaryFactories(
    state.secondaryFactories,
    architecture,
  );
  const parameters = buildParameters(state);
 
  const config: RunConfig = {
    schemaVersion: SCHEMA_VERSION,
    id: stamp.id,
    name,
    createdAt: stamp.createdAt,
    application,
    architecture,
    qecCode: expectedQecCode(architecture),
    magicStateFactories: effectiveFactories(state.magicStateFactories, architecture),
    traceTransform,
    maxError: state.maxError,
    qreVersion: QRE_VERSION,
  };
 
  // Optional fields are OMITTED when empty/default, not written as undefined —
  // exactOptionalPropertyTypes requires absence, and it keeps v1.0.0-shaped
  // records byte-identical for runs that use no v1.1.0 feature.
  if (secondaryFactories.length > 0) {
    config.secondaryFactories = secondaryFactories;
  }
  if (state.memoryOptimization !== "none") {
    config.memoryOptimization = state.memoryOptimization;
  }
  if (parameters !== null) {
    config.parameters = parameters;
  }
  if (stamp.provenance !== undefined) {
    config.provenance = stamp.provenance;
  }

  return config;
}