/**
 * Pure serialization: FormState -> RunConfig (or null when the draft can't form
 * a structurally complete config). Value-range validity is the schema's job
 * (see schemaValidation.ts); this module only assembles the object and derives
 * the coupled fields (qecCode, magicStateFactory) so the output is never
 * internally inconsistent with the architecture.
 */

import {
  SCHEMA_VERSION,
  expectedQecCode,
  isLitinski19Allowed,
  type Application,
  type Architecture,
  type MagicStateFactoryId,
  type RunConfig,
  type TraceTransform,
} from "../../shared/types";
import {
  ARCHITECTURE_LABELS,
  QEC_LABELS,
  TRANSFORM_LABELS,
} from "../constants/labels";
import { QRE_VERSION, findBenchmark } from "../constants/staticOptions";
import { deriveQecCode } from "./formState";
import type {
  ApplicationForm,
  ArchitectureForm,
  FormState,
  TraceTransformForm,
} from "./formState";

/** id + createdAt are stamped at Run-click and passed in (keeps this pure). */
export interface RunStamp {
  id: string;
  createdAt: string;
}

/**
 * A schema-valid placeholder stamp for validation/preview only — id/createdAt
 * are real only at Run-click, and neither affects whether a config validates.
 */
export function schemaValidationStamp(): RunStamp {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    createdAt: "2000-01-01T00:00:00.000Z",
  };
}

function buildApplication(app: ApplicationForm): Application | null {
  if (app.type === "benchmark") {
    if (app.benchmarkId.length === 0) return null;
    return { type: "benchmark", benchmarkId: app.benchmarkId };
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
  if (arch.majorana.operationTime === null) return null;
  return {
    type: "majorana",
    errorRate: arch.majorana.errorRate,
    operationTime: arch.majorana.operationTime,
  };
}

function buildTraceTransform(tt: TraceTransformForm): TraceTransform {
  if (tt.type === "psspc") {
    return {
      type: "psspc",
      tStatesPerRotation: tt.psspc.tStatesPerRotation,
      ccxMagicStates: tt.psspc.ccxMagicStates,
    };
  }
  return { type: "latticeSurgery", slowDownFactor: 1.0 };
}

/**
 * Litinski19 survives serialization only when the architecture actually permits
 * it; otherwise it falls back to round_based so the output always satisfies the
 * schema's factory/architecture coupling. The UI shows this fallback visibly.
 */
function effectiveFactory(
  selected: MagicStateFactoryId,
  architecture: Architecture,
): MagicStateFactoryId {
  return selected === "litinski19" && isLitinski19Allowed(architecture)
    ? "litinski19"
    : "round_based";
}

function applicationLabel(app: ApplicationForm): string {
  if (app.type === "benchmark") {
    const known = findBenchmark(app.benchmarkId);
    if (known) return known.name;
    return app.benchmarkId.length > 0 ? app.benchmarkId : "Custom program";
  }
  const base = app.upload.filePath.split(/[\\/]/).pop() ?? "";
  return base.length > 0 ? base : "Uploaded program";
}

/**
 * Deterministic auto-name: benchmark · architecture · QEC · transform. Shown in
 * the UI before Run and serialized when the user leaves the name blank.
 */
export function generateName(state: FormState): string {
  return [
    applicationLabel(state.application),
    ARCHITECTURE_LABELS[state.architecture.type],
    QEC_LABELS[deriveQecCode(state.architecture)],
    TRANSFORM_LABELS[state.traceTransform.type],
  ].join(" · ");
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
  if (application === null || architecture === null || state.maxError === null) {
    return null;
  }

  const name =
    state.name.trim().length > 0 ? state.name.trim() : generateName(state);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: stamp.id,
    name,
    createdAt: stamp.createdAt,
    application,
    architecture,
    qecCode: expectedQecCode(architecture),
    magicStateFactory: effectiveFactory(state.magicStateFactory, architecture),
    traceTransform: buildTraceTransform(state.traceTransform),
    maxError: state.maxError,
    qreVersion: QRE_VERSION,
  };
}
