/**
 * A generated draft, raised back into a run form.
 *
 * `draftToFormState` is the one implementation of this mapping and stays that
 * way; this only re-exposes it without the chat provenance a non-chat caller
 * has no way to supply.
 *
 * Kept in its own module so a caller that only lowers a form to a draft does
 * not also take on this direction's dependency tree — `draftToFormState` pulls
 * in the benchmark hyperparameter tables, the label maps and the anchor ids.
 *
 * It used to be separate for a stronger reason: `draftToFormState` reached
 * `fieldAnchors.ts` back when that file also held `jumpToField`, so importing
 * an anchor id imported `document` and `window` too. That half now lives in
 * `fieldNavigation.ts`, and `importGraph.test.ts` asserts directly that nothing
 * the MCP server reaches touches a DOM — so the rule is enforced rather than
 * remembered.
 */

import { draftToFormState } from "../agent/draftToFormState.js";
import type { FormState } from "./formState.js";
import type { GeneratedRunDraft } from "../../shared/agentTypes.js";

/**
 * Map a generated draft onto a form, for a caller with no conversation behind
 * it.
 *
 * `draftToFormState` also builds a proposal log and stamps provenance, which
 * need a model name and a conversation id. Both are decoration on the handoff —
 * provenance is informational, and the conversation id is session-scoped and
 * deliberately never written into a RunConfig — so a caller that wants only the
 * resulting form can ask for it here rather than inventing a second mapping.
 */
export function formStateFromGeneratedDraft(
  draft: GeneratedRunDraft,
): { ok: true; state: FormState } | { ok: false; message: string } {
  const mapped = draftToFormState(draft, "", "");
  if (!mapped.ok) return { ok: false, message: mapped.message };
  return { ok: true, state: mapped.handoff.state };
}
