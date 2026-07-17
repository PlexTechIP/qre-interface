import { useState } from "react";

import { ApplicationSection } from "./components/ApplicationSection";
import { ArchitectureSection } from "./components/ArchitectureSection";
import { ConfigurationSummary } from "./components/ConfigurationSummary";
import { MagicStateFactorySection } from "./components/MagicStateFactorySection";
import { MaxErrorSection } from "./components/MaxErrorSection";
import { QecSection } from "./components/QecSection";
import { RunConfigInspector } from "./components/RunConfigInspector";
import { RunFlowPanel } from "./components/RunFlowPanel";
import { RunNameSection } from "./components/RunNameSection";
import { TraceTransformSection } from "./components/TraceTransformSection";
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

/** The Run Configuration surface — the seven inputs + summary + validation. */
export function RunConfiguration(): React.JSX.Element {
  const [state, setState] = useState<FormState>(createInitialFormState);
  const { runState, engineMode, setEngineMode, start, retry, edit } = useRunFlow();

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
          Configure an estimate, then run it against the engine. The fastest valid
          run is: pick a benchmark, enter gate time and measurement time, Run.
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
          <QecSection architecture={state.architecture} />
          <MagicStateFactorySection
            value={state.magicStateFactory}
            allowed={litinski19Allowed}
            onChange={(magicStateFactory) =>
              update((s) => ({ ...s, magicStateFactory }))
            }
          />
          <TraceTransformSection
            value={state.traceTransform}
            onChange={(traceTransform) => update((s) => ({ ...s, traceTransform }))}
          />
          <MaxErrorSection
            value={state.maxError}
            error={errors.maxError}
            onChange={(maxError) => update((s) => ({ ...s, maxError }))}
          />
          <RunNameSection
            name={state.name}
            generatedName={generatedName}
            qreVersion={QRE_VERSION}
            onChange={(name) => update((s) => ({ ...s, name }))}
          />
        </div>

        <aside className="run-config__side">
          <ConfigurationSummary
            state={state}
            generatedName={generatedName}
            qreVersion={QRE_VERSION}
          />
          <ValidationSummary errors={errors} />
          <button
            type="button"
            className="run-button"
            disabled={!valid}
            onClick={() => start(state)}
          >
            Run estimate
          </button>

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
        </aside>
      </div>
    </div>
  );
}
