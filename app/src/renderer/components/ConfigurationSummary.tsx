import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  QEC_LABELS,
} from "../constants/labels";
import { FORMAT_LABELS, findBenchmark } from "../constants/staticOptions";
import { describeTraceTransform } from "../../shared/traceTransform";
import { buildTraceTransform, deriveQecCode, type FormState } from "../state/formState";

interface ConfigurationSummaryProps {
  state: FormState;
  generatedName: string;
  qreVersion: string;
}

function applicationSummary(app: FormState["application"]): string {
  if (app.type === "benchmark") {
    return findBenchmark(app.benchmarkId)?.name ?? app.benchmarkId ?? "—";
  }
  if (app.type === "saved") {
    const chosen = app.savedPrograms.find((p) => p.id === app.selectedSavedId);
    if (!chosen) return "no saved program chosen";
    return `${chosen.name} (${FORMAT_LABELS[chosen.format]})`;
  }
  const file = app.upload.filePath || "no file chosen";
  return `${file} (${FORMAT_LABELS[app.upload.format]})`;
}

function errorRateSummary(arch: FormState["architecture"]): string {
  const rate =
    arch.type === "gateBased" ? arch.gateBased.errorRate : arch.majorana.errorRate;
  return rate === null ? "—" : String(rate);
}

/**
 * Read-only configuration summary — a horizontal grid of the draft's key facts,
 * rendered at the bottom of the form. The run name lives in its own control
 * beneath this (see RunNameSection), so it is not repeated here.
 */
export function ConfigurationSummary({
  state,
  qreVersion,
}: ConfigurationSummaryProps): React.JSX.Element {
  const cells: readonly { label: string; value: string }[] = [
    { label: "Application", value: applicationSummary(state.application) },
    { label: "Architecture", value: ARCHITECTURE_LABELS[state.architecture.type] },
    { label: "QEC Code", value: QEC_LABELS[deriveQecCode(state.architecture)] },
    {
      label: state.magicStateFactories.length > 1 ? "Factories" : "Factory",
      value: state.magicStateFactories
        .map((factory) => `${MAGIC_STATE_FACTORY_LABELS[factory]} Factory`)
        .join(" + "),
    },
    {
      // Every stage present, not a single name: the old row read as a selection.
      // A half-entered stage 0 serializes to null, and the summary then shows
      // the two always-on stages rather than claiming a stage that won't run.
      label: "Trace Transform",
      value: describeTraceTransform(
        buildTraceTransform(state.traceTransform) ?? {
          tStatesPerRotation: state.traceTransform.tStatesPerRotation,
          ccxMagicStates: state.traceTransform.ccxMagicStates,
          slowDownFactor: state.traceTransform.slowDownFactor,
        },
      ),
    },
    { label: "Error Rate", value: errorRateSummary(state.architecture) },
    {
      label: "Total Fault Tolerant Execution Error",
      value: state.maxError === null ? "—" : String(state.maxError),
    },
    { label: "QRE Version", value: qreVersion },
  ];

  return (
    <div className="summary-block">
      <header className="form-section__head">
        <h2 id="summary-heading" className="form-section__title">
          Configuration Summary
        </h2>
      </header>
      <dl className="summary-grid">
        {cells.map((cell) => (
          <div key={cell.label} className="summary-grid__cell">
            <dt>{cell.label}</dt>
            <dd>{cell.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
