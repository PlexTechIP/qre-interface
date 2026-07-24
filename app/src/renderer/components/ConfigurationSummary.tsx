import {
  ARCHITECTURE_LABELS,
  MAGIC_STATE_FACTORY_LABELS,
  QEC_LABELS,
  TRANSFORM_LABELS,
} from "../constants/labels";
import { FORMAT_LABELS, findBenchmark } from "../constants/staticOptions";
import { deriveQecCode, type FormState } from "../state/formState";

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
      label: "Factory",
      value: `${MAGIC_STATE_FACTORY_LABELS[state.magicStateFactory]} Factory`,
    },
    {
      label: "Trace Transform",
      value: TRANSFORM_LABELS[state.traceTransform.type],
    },
    { label: "Error Rate", value: errorRateSummary(state.architecture) },
    { label: "Max Error", value: state.maxError === null ? "—" : String(state.maxError) },
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
