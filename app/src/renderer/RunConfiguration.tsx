import { useEffect, useRef, useState } from "react";

import type { RunConfig, RunResult } from "../shared/types";
import { ApplicationSection } from "./components/ApplicationSection";
import { ArchitectureSection } from "./components/ArchitectureSection";
import { ConfigurationSummary } from "./components/ConfigurationSummary";
import { MicroArchitectureSection } from "./components/MicroArchitectureSection";
import { RunConfigInspector } from "./components/RunConfigInspector";
import { RunFlowPanel } from "./components/RunFlowPanel";
import { RunNameSection } from "./components/RunNameSection";
import { ValidationSummary } from "./components/ValidationSummary";
import { QRE_VERSION } from "./constants/staticOptions";
import {
  createInitialFormState,
  isLitinski19AllowedInForm,
  normalizeFormState,
  type FormState,
} from "./state/formState";
import { validateRunConfigSchema } from "./state/schemaValidation";
import {
  generateName,
  schemaValidationStamp,
  toRunConfig,
} from "./state/toRunConfig";
import { useRunFlow } from "./state/useRunFlow";
import { isConfigValid, validateForm } from "./state/validation";

interface RunConfigurationProps {
  /** Fired once when a run finishes, so the shell can persist it to History
   *  and surface it on the Results page. Optional — omitted in unit tests. */
  onRunComplete?: (config: RunConfig, result: RunResult) => void;
}

/** The Run Configuration surface — the seven inputs + summary + validation. */
export function RunConfiguration({
  onRunComplete,
}: RunConfigurationProps = {}): React.JSX.Element {
  const [state, setState] = useState<FormState>(createInitialFormState);
  const { runState, engineMode, setEngineMode, start, retry, edit } = useRunFlow();

  // Notify the shell exactly once per finished run (keyed on the stamped id, so
  // Retry — which mints a fresh id — reports as a distinct run).
  const reportedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (runState.phase !== "done") return;
    if (reportedIdRef.current === runState.config.id) return;
    reportedIdRef.current = runState.config.id;
    onRunComplete?.(runState.config, runState.result);
  }, [runState, onRunComplete]);

  // Every update is normalized so cross-field coupling (Litinski19 fallback)
  // can never leave the draft internally inconsistent.
  const update = (updater: (prev: FormState) => FormState): void => {
    setState((prev) => normalizeFormState(updater(prev)));
  };

  const errors = validateForm(state);
  const generatedName = generateName(state);
  const litinski19Allowed = isLitinski19AllowedInForm(state.architecture);
  const valid = isConfigValid(state);

  // Live serialized preview (placeholder stamp) so the dev inspector can prove
  // the draft validates against the contract schema before Run stamps it for real.
  const previewConfig = toRunConfig(state, schemaValidationStamp());
  const previewValid =
    previewConfig !== null && validateRunConfigSchema(previewConfig).valid;

  if (runState.phase !== "idle") {
    return (
      <div className="run-config">
        <header className="run-config__header">
          <h1>Run Configuration</h1>
          <p className="run-config__subtitle">
            {runState.phase === "running"
              ? "Running your estimate against the engine…"
              : "Review the result, then retry or edit the configuration."}
          </p>
        </header>
        <RunFlowPanel runState={runState} onRetry={retry} onEdit={edit} />
      </div>
    );
  }

  return (
    <div className="run-config">
      <header className="run-config__header">
        <h1>Run Configuration</h1>
        <p className="run-config__subtitle">
          Configure an estimate, then run it against the engine.
        </p>
      </header>

      <div className="run-config__body">
        <div className="run-config__form">
          <ApplicationSection
            value={state.application}
            errors={errors}
            onChange={(application) => update((s) => ({ ...s, application }))}
          />
          <ArchitectureSection
            value={state.architecture}
            errors={errors}
            onChange={(architecture) => update((s) => ({ ...s, architecture }))}
          />
          <MicroArchitectureSection
            architecture={state.architecture}
            magicStateFactory={state.magicStateFactory}
            magicStateFactoryAllowed={litinski19Allowed}
            onMagicStateFactoryChange={(magicStateFactory) =>
              update((s) => ({ ...s, magicStateFactory }))
            }
            traceTransform={state.traceTransform}
            onTraceTransformChange={(traceTransform) =>
              update((s) => ({ ...s, traceTransform }))
            }
            maxError={state.maxError}
            maxErrorError={errors.maxError}
            onMaxErrorChange={(maxError) => update((s) => ({ ...s, maxError }))}
          />
        </div>

        {/* Summary, run name, and the primary CTA live full-width at the bottom. */}
        <section
          className="config-summary-card"
          aria-labelledby="summary-heading"
        >
          <ConfigurationSummary
            state={state}
            generatedName={generatedName}
            qreVersion={QRE_VERSION}
          />
          <hr className="micro-divider" />
          <RunNameSection
            name={state.name}
            generatedName={generatedName}
            onChange={(name) => update((s) => ({ ...s, name }))}
          />
          <ValidationSummary errors={errors} />
          <button
            type="button"
            className="run-button run-button--full"
            disabled={!valid}
            onClick={() => start(state)}
          >
            Run estimate
          </button>
        </section>

        <div className="run-config__dev">
          <fieldset className="engine-mode">
            <legend className="engine-mode__legend">Engine (dev)</legend>
            <label className="engine-mode__option">
              <input
                type="radio"
                name="engine-mode"
                checked={engineMode === "success"}
                onChange={() => setEngineMode("success")}
              />
              Success
            </label>
            <label className="engine-mode__option">
              <input
                type="radio"
                name="engine-mode"
                checked={engineMode === "failed"}
                onChange={() => setEngineMode("failed")}
              />
              Simulate failure
            </label>
          </fieldset>

          <RunConfigInspector
            config={previewConfig}
            valid={previewValid}
            title="Serialized RunConfig (dev)"
            note="Live preview with a placeholder id/timestamp; real values are stamped at Run."
          />
        </div>
      </div>
    </div>
  );
}
