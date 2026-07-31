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
  formStateFromRunConfig,
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
import {
  blocksRun,
  useUploadPreflight,
} from "./state/useUploadPreflight";
 
interface RunConfigurationProps {
  /** Fired once when a run finishes, so the shell can persist it to History
   *  and surface it on the Results page. Optional — omitted in unit tests. */
  onRunComplete?: (config: RunConfig, result: RunResult) => void;
  /** Saved configuration to load into the editable form for a Rerun. */
  initialConfig?: RunConfig | null;
}
 
/** The Run Configuration surface — the seven inputs + summary + validation. */
export function RunConfiguration({
  onRunComplete,
  initialConfig = null,
}: RunConfigurationProps = {}): React.JSX.Element {
  const [state, setState] = useState<FormState>(() =>
    initialConfig ? formStateFromRunConfig(initialConfig) : createInitialFormState(),
  );
  const { runState, start, retry, edit } = useRunFlow();
 
  // A Rerun hands a reconstructed config down as `initialConfig`; load it into
  // the editable form when it changes.
  useEffect(() => {
    if (initialConfig) {
      setState(formStateFromRunConfig(initialConfig));
    }
  }, [initialConfig]);
 
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
 
  // Pre-flight the chosen program file IN THE FORM, before Run. Asynchronous
  // (the check reads the filesystem in the main process), so it cannot live in
  // the synchronous validateForm/isConfigValid pair — it is merged into both the
  // field errors and the Run gate here instead.
  const preflight = useUploadPreflight(state.application);
  const baseErrors = validateForm(state);
  const errors =
    preflight.status === "invalid"
      ? {
          ...baseErrors,
          // Saved programs and fresh uploads surface under different fields, but
          // both serialize to the contract's `uploaded` variant and both get
          // checked, so the message has to land on whichever control is showing.
          ...(state.application.type === "saved"
            ? { savedProgram: preflight.message }
            : { uploadFilePath: preflight.message }),
        }
      : baseErrors;
  const generatedName = generateName(state);
  const valid = isConfigValid(state) && !blocksRun(preflight);
 
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
            isCheckingFile={preflight.status === "checking"}
            onChange={(application) => update((s) => ({ ...s, application }))}
          />
          <ArchitectureSection
            value={state.architecture}
            errors={errors}
            onChange={(architecture) => update((s) => ({ ...s, architecture }))}
          />
          <MicroArchitectureSection
            architecture={state.architecture}
            magicStateFactories={state.magicStateFactories}
            onMagicStateFactoriesChange={(magicStateFactories) =>
              update((s) => ({ ...s, magicStateFactories }))
            }
            secondaryFactories={state.secondaryFactories}
            onSecondaryFactoriesChange={(secondaryFactories) =>
              update((s) => ({ ...s, secondaryFactories }))
            }
            memoryOptimization={state.memoryOptimization}
            onMemoryOptimizationChange={(memoryOptimization) =>
              update((s) => ({ ...s, memoryOptimization }))
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