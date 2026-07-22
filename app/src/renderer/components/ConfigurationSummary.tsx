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
  const file = app.upload.filePath || "no file chosen";
  return `${file} (${FORMAT_LABELS[app.upload.format]})`;
}

function architectureSummary(arch: FormState["architecture"]): string {
  const label = ARCHITECTURE_LABELS[arch.type];
  if (arch.type === "gateBased") {
    const rate = arch.gateBased.errorRate;
    return `${label} · error rate ${rate ?? "—"}`;
  }
  return `${label} · error rate ${arch.majorana.errorRate}`;
}

function transformSummary(tt: FormState["traceTransform"]): string {
  const label = TRANSFORM_LABELS[tt.type];
  if (tt.type === "psspc") {
    return `${label} · ${tt.psspc.tStatesPerRotation} T/rotation${
      tt.psspc.ccxMagicStates ? " · CCX" : ""
    }`;
  }
  return `${label} · slowdown 1.0`;
}

/** Read-only configuration summary panel mirroring the current draft. */
export function ConfigurationSummary({
  state,
  generatedName,
  qreVersion,
}: ConfigurationSummaryProps): React.JSX.Element {
  const displayName =
    state.name.trim().length > 0 ? state.name.trim() : generatedName;

  const rows: readonly { label: string; value: string }[] = [
    { label: "Name", value: displayName },
    { label: "Application", value: applicationSummary(state.application) },
    { label: "Architecture", value: architectureSummary(state.architecture) },
    { label: "QEC code", value: QEC_LABELS[deriveQecCode(state.architecture)] },
    {
      label: "Magic factory",
      value: MAGIC_STATE_FACTORY_LABELS[state.magicStateFactory],
    },
    { label: "Transform", value: transformSummary(state.traceTransform) },
    { label: "Max error", value: state.maxError === null ? "—" : String(state.maxError) },
    { label: "QRE version", value: qreVersion },
  ];

  return (
    <section className="summary-panel" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="summary-panel__title">
        Configuration Summary
      </h2>
      <dl className="summary-panel__list">
        {rows.map((row) => (
          <div key={row.label} className="summary-panel__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
