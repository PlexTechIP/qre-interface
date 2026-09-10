import { useEffect, useRef, useState } from "react";
 
import type { RunConfig, RunProvenance, RunResult } from "../shared/types";
import type { ProposedField } from "./agent/draftToFormState";
import { ApplicationSection } from "./components/ApplicationSection";
import { ArchitectureSection } from "./components/ArchitectureSection";
import { ConfigurationSummary } from "./components/ConfigurationSummary";
import { MicroArchitectureSection } from "./components/MicroArchitectureSection";
import { ModelProposalSummary } from "./components/ModelProposalSummary";
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
import { isConfigValid, validateForm, type FieldErrors } from "./state/validation";
import {
  blocksRun,
  useUploadPreflight,
} from "./state/useUploadPreflight";
 
/**
 * The configuration this page currently holds, and where it came from.
 *
 * Mirrored to the shell so it survives this page unmounting — every page here
 * is a conditional render, so navigating away used to discard the form
 * entirely, and later discarded only its provenance.
 */
export interface FormSnapshot {
  readonly state: FormState;
  /** Absent for a configuration the analyst authored. */
  readonly provenance?: RunProvenance;
  /** What the model chose, for the summary shown above the form. */
  readonly proposed: readonly ProposedField[];
  /** The conversation that proposed it, so a finished run can lead back. */
  readonly conversationId?: string;
}

interface RunConfigurationProps {
  /** Fired once when a run finishes, so the shell can persist it to History
   *  and surface it on the Results page. Optional — omitted in unit tests. */
  onRunComplete?: (
    config: RunConfig,
    result: RunResult,
    /** The conversation that authored it, when a model did. */
    conversationId?: string,
  ) => void;
  /** Saved configuration to load into the editable form for a Rerun. */
  initialConfig?: RunConfig | null;
  /** Model proposal already mapped into Team 3's existing editable form shape. */
  initialDraft?: FormState | undefined;
  /**
   * Provenance of `initialDraft`. Kept outside FormState and attached only when
   * Run is pressed. Read once, when the draft is loaded — see `draftProvenance`.
   */
  provenance?: RunProvenance | undefined;
  /**
   * What the model actually chose in `initialDraft`. Travels with the draft and
   * is read once alongside it, for the same reason `provenance` is.
   */
  proposed?: readonly ProposedField[] | undefined;
  /**
   * The conversation `initialDraft` came out of, so a finished run can lead
   * back to it. Same lifetime as `provenance`: it belongs to the configuration
   * in the form, not to the props that delivered it.
   */
  conversationId?: string | undefined;
  /**
   * The form as it stood when this page was last open.
   *
   * Every page in this app is a conditional render, so this component unmounts
   * on any sidebar click and used to take a half-filled form with it. The shell
   * keeps the last state and hands it back here, which is what makes "fill in
   * half the form, go ask the model about it, come back" a thing that works.
   *
   * Ranked BELOW `initialDraft` and `initialConfig`: a model proposal or a
   * rerun is something the analyst just asked for, and restoring over it would
   * undo the navigation they made to get it.
   */
  restoredState?: FormSnapshot | undefined;
  /**
   * Report the form upward on every change.
   *
   * The shell needs it for three things it cannot get any other way: seeding
   * the next mount, telling the model what the analyst has already decided (see
   * `formContextFromState`), and knowing that a draft handed down has been
   * taken up and can be retired.
   *
   * It carries the configuration's PROVENANCE as well as its values, because
   * both have the same lifetime and both die when this component unmounts. A
   * mirror of the values alone restored a model-authored configuration as an
   * anonymous one.
   */
  onStateChange?: (snapshot: FormSnapshot) => void;
}

/** The Run Configuration surface — the seven inputs + summary + validation. */
export function RunConfiguration({
  onRunComplete,
  initialConfig = null,
  initialDraft,
  provenance,
  proposed,
  conversationId,
  restoredState,
  onStateChange,
}: RunConfigurationProps = {}): React.JSX.Element {
  /*
   * Seed order: a draft the analyst just accepted, then a rerun they just
   * asked for, then whatever this page held last time, then a fresh form.
   *
   * `restoredState` ranks below the two ARRIVALS and above nothing else. The
   * shell retires a handoff as soon as this component reports having taken it
   * up, so a draft still present here is one that has not been seen yet — which
   * is what stops a remount re-seeding the original proposal over the analyst's
   * edits to it.
   */
  const [state, setState] = useState<FormState>(
    () =>
      initialDraft ??
      (initialConfig
        ? formStateFromRunConfig(initialConfig)
        : (restoredState?.state ?? createInitialFormState())),
  );
  /**
   * Who authored the configuration NOW IN THE FORM — held here rather than read
   * off the `provenance` prop at Run-click.
   *
   * The shell drops its draft handoff as soon as the first run finishes, but
   * this component stays mounted through the run panel: "Edit configuration"
   * returns to the very same `state`. Reading the prop at click time therefore
   * stamped run #1 `model_assisted` and run #2 — the same model-authored
   * configuration with one number changed — with nothing at all. Provenance
   * belongs to the configuration, so it lives exactly as long as the
   * configuration does, and is replaced only when a different source loads one.
   */
  const [draftProvenance, setDraftProvenance] = useState<RunProvenance | undefined>(
    () => (initialDraft ? provenance : restoredState?.provenance),
  );
  /** What the model chose in the configuration now in the form. Same lifetime
   *  as `draftProvenance`, and replaced by the same three writes. */
  const [draftProposal, setDraftProposal] = useState<readonly ProposedField[]>(
    () => (initialDraft ? (proposed ?? []) : (restoredState?.proposed ?? [])),
  );
  /**
   * Which conversation authored what is NOW IN THE FORM.
   *
   * Held here rather than read off the prop at run time, for exactly the reason
   * `draftProvenance` is: this component stays mounted through the run panel,
   * and "Edit configuration" returns to the same state. Reading the prop would
   * lose the thread on the second run of one configuration.
   */
  const [draftConversationId, setDraftConversationId] = useState<string | undefined>(
    () => (initialDraft ? conversationId : restoredState?.conversationId),
  );
  const { runState, start, retry, edit } = useRunFlow();

  // A Rerun hands a reconstructed config down as `initialConfig`; load it into
  // the editable form when it changes.
  useEffect(() => {
    if (initialDraft) {
      setState(initialDraft);
      setDraftProvenance(provenance);
      setDraftProposal(proposed ?? []);
      setDraftConversationId(conversationId);
    } else if (initialConfig) {
      setState(formStateFromRunConfig(initialConfig));
      // A Rerun replaces the model's draft with a saved config, so whatever
      // authored that draft no longer describes what is on screen — and neither
      // does the list of what that model chose.
      setDraftProvenance(undefined);
      setDraftProposal([]);
      // A Rerun replaces the model's draft, so the thread that produced the
      // draft no longer describes what is on screen either.
      setDraftConversationId(undefined);
    }
    // `provenance` and `proposed` are deliberately not dependencies: they travel
    // WITH a draft, and re-running this effect when only they changed would
    // re-apply a stale `initialDraft` over the analyst's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig, initialDraft]);
 
  /*
   * Mirror the form upward.
   *
   * An effect rather than a call inside `update`, because `state` also changes
   * through the seeding effect above and through `useRunFlow`'s edit path — a
   * notification wired into one writer would silently miss the others, and the
   * shell would restore a form the analyst had already moved on from.
   */
  useEffect(() => {
    onStateChange?.({
      state,
      ...(draftProvenance === undefined ? {} : { provenance: draftProvenance }),
      proposed: draftProposal,
      ...(draftConversationId === undefined ? {} : { conversationId: draftConversationId }),
    });
  }, [state, draftProvenance, draftProposal, draftConversationId, onStateChange]);

  // Notify the shell exactly once per finished run (keyed on the stamped id, so
  // Retry — which mints a fresh id — reports as a distinct run).
  const reportedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (runState.phase !== "done") return;
    if (reportedIdRef.current === runState.config.id) return;
    reportedIdRef.current = runState.config.id;
    onRunComplete?.(runState.config, runState.result, draftConversationId);
  }, [runState, onRunComplete, draftConversationId]);
 
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
  const validation = validateForm(state);
  // Only the scalar half takes the pre-flight message; hyperparameter errors
  // are a different shape and travel separately, which is what keeps every
  // value in `errors` a string.
  const errors: FieldErrors =
    preflight.status === "invalid"
      ? {
          ...validation.fields,
          // Saved programs and fresh uploads surface under different fields, but
          // both serialize to the contract's `uploaded` variant and both get
          // checked, so the message has to land on whichever control is showing.
          ...(state.application.type === "saved"
            ? { savedProgram: preflight.message }
            : { uploadFilePath: preflight.message }),
        }
      : validation.fields;
  const generatedName = generateName(state);
  // `draftProvenance` is passed to the gate and to Run from the same variable:
  // the config the gate approves is then the config that executes, provenance
  // included. Reading it in only one of the two places is the hole this closed.
  const valid = isConfigValid(state, draftProvenance) && !blocksRun(preflight);

  // Live serialized preview (placeholder stamp) so the dev inspector can prove
  // the draft validates against the contract schema before Run stamps it for real.
  const previewConfig = toRunConfig(state, schemaValidationStamp(draftProvenance));
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
        {/* Above the form, because it describes the form: the analyst reads
            what the model chose, then scrolls into the fields it chose them
            in. */}
        <ModelProposalSummary
          proposed={draftProposal}
          model={draftProvenance?.model}
        />

        <div className="run-config__form">
          <ApplicationSection
            value={state.application}
            errors={errors}
            hyperparamErrors={validation.hyperparams}
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
            magicStateFactoriesError={errors.magicStateFactories}
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
            computeCapacityError={errors.computeCapacityPercentage}
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
          <ValidationSummary errors={errors} hyperparams={validation.hyperparams} />
          <button
            type="button"
            className="run-button run-button--full"
            disabled={!valid}
            onClick={() => start(state, draftProvenance)}
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
