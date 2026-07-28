# Agentic Integration Design Memo

**Recommendation: defer implementation.** Do not add an LLM SDK, token UI,
network calls, or automated circuit generation to the app until Microsoft
explicitly accepts the privacy and procurement tradeoffs and the core offline
tool is complete.

The right deliverable now is a design record. The product's current
non-negotiables are offline core workflows, no cloud service, no accounts, and
no telemetry. A bring-your-own LLM feature is networked, token-authenticated,
and likely sends user configuration or circuit content to a third party. That
can be valuable later, but it should not enter the product by accident.

## Options considered

### Option A: no implementation now

Document the likely integration path, ask Microsoft the blocking policy
questions, and keep the app fully offline while Teams finish the core QRE
workflow.

This preserves the current architecture: renderer surfaces stay local, the
engine stays behind `EstimatorService`, and no user content leaves the machine.

### Option B: local-first natural-language config helper

A future version could parse natural-language intent into a draft `RunConfig`
without calling a remote model. The user would review the generated config in
the existing Run Configuration form before execution.

This is the safest smallest product shape, but it is not the feature Microsoft
asked about if they specifically expect a networked third-party agent to drive
the app.

### Option C: bring-your-own LLM connectivity

The app could let a user provide a token for an external model provider during
onboarding, then ask that provider to turn user intent into a config or program.

This conflicts with the current offline/no-account posture unless it is
strictly optional and visibly networked. It also introduces token storage,
provider approval, content disclosure, failure handling, and procurement review.

### Option D: automated circuit creation

The app could ask an agent to generate a circuit from a prompt, then upload that
circuit into the existing estimation flow.

This has the highest risk. Generated circuits may be wrong, malicious,
unsupported, or merely expensive to estimate. Anything generated must pass the
same upload validation and engine failure paths as user-provided programs before
the app executes it.

## Decision

Defer all agentic implementation for now. The smallest future version worth
shipping is not token onboarding; it is a consent-gated draft assistant that
never executes generated output directly.

A future design should follow these rules:

- Core estimation, history, comparison, and export must remain fully usable
  offline.
- No prompt, config, circuit, raw result, file path, token, or telemetry leaves
  the machine without an explicit user action.
- The user sees the exact content being sent before a network call.
- The model returns drafts only: draft form fields, draft `RunConfig`, or a
  draft uploaded program.
- Existing validation remains the execution gate. Generated configs go through
  `toRunConfig`/schema validation and engine validation; generated circuits go
  through upload checks and QDK compile/estimate failure handling.
- Tokens, if ever supported, must use OS credential storage rather than plain
  project files, app config JSON, or SQLite run history.

## Codebase seams

The likely integration points are:

- Renderer Run Configuration: show a draft created from natural-language intent,
  but keep the user in control of final form values.
- Shared contract validation: reject generated configs that do not match the
  committed schema.
- Upload path: treat generated circuit files like user uploads; no direct engine
  bypass.
- Electron main/preload: if a networked provider is approved, expose a narrow
  agent surface instead of giving renderer code general network or token access.
- Run history: record that a run was user-reviewed; do not store provider tokens
  or hidden prompt metadata in `RunRecord`.

The estimator boundary should not change. An agent may help produce a
`RunConfig` or program, but `QreEngine` should still only receive validated
contract inputs.

## What Microsoft needs to answer

- Are target users allowed to send QRE configurations, uploaded circuits, or raw
  results to third-party LLM providers?
- Which providers are acceptable for government and industry analysts?
- Should the app support only local/offline models, only approved cloud models,
  or both?
- Can API tokens be stored locally, and must they use OS credential storage?
- Does Microsoft want natural-language configuration, automated circuit
  generation, or both?
- What audit trail is required when model-generated content affects a run?

## What would reverse this recommendation

Implementation should be reconsidered if Microsoft provides written approval
for networked LLM use, a provider/security policy, token storage requirements,
and a priority order for the three asks. Core offline workflows should also be
stable first: configuration, local execution, history, comparison, and export.

Until those conditions are true, building agentic features would create product,
security, and procurement risk without improving the core tool Microsoft needs
finished first.
