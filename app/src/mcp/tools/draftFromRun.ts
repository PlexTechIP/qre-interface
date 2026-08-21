/**
 * MCP tool: qre_draft_from_run
 *
 * Converts a saved run into a GeneratedRunDraft that can be edited and re-run.
 * Uses formStateFromRunConfig to convert the config to editable FormState,
 * then projects the FormState to GeneratedRunDraft.
 *
 * Which runs cannot be drafted is decided by `generatedDraftFromFormState`, not
 * restated here: the list is a property of what the generation contract can
 * carry, and a copy of it in this header would drift the first time that
 * changed. Uploaded applications are the one exception, refused before the
 * adapter runs so the analyst is told which case they hit.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "../logger.js";
import { boundedText, runTool, toolFailure, toolSuccess } from "../toolResult.js";
import { validateGeneratedDraft } from "../../main/draftValidation.js";
import { generatedDraftFromFormState } from "../../renderer/state/generatedDraft.js";
import { getRunStore } from "../runStoreAccess.js";
import { validateRunRecord } from "../../shared/runRecordValidation.js";
import { formStateFromRunConfig } from "../../renderer/state/formState.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

export interface DraftFromRunInput {
  id: string;
}

export interface DraftFromRunOutput {
  draft: GeneratedRunDraft;
}

/**
 * Tool handler for qre_draft_from_run.
 */
export async function handleDraftFromRun(
  input: DraftFromRunInput,
): Promise<CallToolResult> {
  return runTool(
    "draftFromRun",
    { code: "DRAFT_UNSUPPORTED", message: "Failed to generate a draft from the run." },
    async () => {
    if (!input.id || input.id.trim() === "") {
      return toolFailure("STORE_READ_FAILED", "Run ID is required and must not be empty");
    }

    const store = getRunStore();
    const record = await store.get(input.id);

    if (!record) {
      return toolFailure(
        "RUN_NOT_FOUND",
        `No run found with ID: ${boundedText(input.id, 100)}`,
      );
    }

    // Validate the record
    const validation = validateRunRecord(record);
    if (!validation.valid) {
      logError("Invalid run record in store", { id: record.id, errors: validation.errors });
      return toolFailure("STORE_READ_FAILED", "The stored run record is corrupted.");
    }

    if (record.config.application.type === "uploaded") {
      return toolFailure(
        "DRAFT_UNSUPPORTED",
        "This run used an uploaded program. A draft cannot name a local file, " +
          "so uploaded runs cannot be re-drafted.",
      );
    }

    // Convert config to FormState
    let formState;
    try {
      formState = formStateFromRunConfig(record.config);
    } catch (error) {
      logError("Error converting config to FormState", error);
      return toolFailure(
        "DRAFT_UNSUPPORTED",
        "The run configuration could not be converted to a draft form.",
      );
    }

    // Convert FormState to GeneratedRunDraft
    let draft: GeneratedRunDraft;
    try {
      draft = generatedDraftFromFormState(formState);
    } catch (error) {
      // This catch cannot distinguish a deliberate refusal from an internal
      // fault, so the adapter's own message never reaches the client.
      logError("Error converting FormState to GeneratedRunDraft", error);
      return toolFailure(
        "DRAFT_UNSUPPORTED",
        "This run cannot be expressed as an editable draft.",
      );
    }

    // Sanity check: draft should have no identity fields
    const draftAsRecord = draft as Record<string, unknown>;
    if ("id" in draftAsRecord || "createdAt" in draftAsRecord || "qecCode" in draftAsRecord || "provenance" in draftAsRecord) {
      logError("Draft unexpectedly contains identity fields", { id: input.id });
      return toolFailure(
        "DRAFT_UNSUPPORTED",
        "The generated draft contains identity fields that should never be set by a model.",
      );
    }

    // The committed generation schema is the arbiter of what a draft may look
    // like, so check the projection against that artifact rather than trusting
    // it. A draft this rejects cannot be handed to anything that validates.
    const validated = validateGeneratedDraft(draft);
    if (!validated.ok) {
      logError("Projected draft does not satisfy the generation schema", {
        id: input.id,
        reason: validated.reason,
      });
      return toolFailure(
        "DRAFT_UNSUPPORTED",
        "This run cannot be expressed as an editable draft.",
      );
    }

    return toolSuccess({ draft } satisfies DraftFromRunOutput);
    },
  );
}

