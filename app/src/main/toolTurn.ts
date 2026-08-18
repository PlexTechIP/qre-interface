import type { AgentChatResult } from "../shared/agentTypes.js";
import { validateGeneratedDraft } from "./draftValidation.js";

/**
 * What the two tool-calling adapters agree on, which is everything except the
 * wire format.
 *
 * Both providers answer a turn with the same two independent halves — prose,
 * and optionally a call to `propose_run_config` — and the rules for turning
 * those into one stored turn belong to this app rather than to either API. They
 * live here so a rule fixed in one adapter cannot quietly not apply in the
 * other, which is exactly what happened to the status-to-message mapping before
 * the chat-completions core was extracted.
 */

/**
 * What the app "did" with a proposal, told back to the model on replay.
 *
 * Both APIs require every tool call to be answered before the next request is
 * accepted, and this app's execution of the tool is showing the draft to the
 * analyst — so that is what the answer says. Anything more specific would be a
 * claim about what they then did with it, which main has no way to know.
 */
export const TOOL_RESULT_TEXT = "Proposal shown to the analyst for review.";

/**
 * A tool-call id for a proposal being replayed, deterministic and unique within
 * one request.
 *
 * Synthesised rather than stored: the id only has to let the provider pair a
 * call with its result inside a single body, and persisting one would put a
 * wire detail of whichever provider happened to answer into the transcript on
 * disk — where the next request might be going somewhere else entirely.
 */
export const replayToolId = (index: number): string => `toolu_replay_${index}`;

/**
 * One turn, assembled from the two halves a tool-calling model answers with.
 *
 * Three rules, all of them this app's rather than the provider's:
 *
 * - A turn must be *something*. Under the old `{reply, draft}` envelope an
 *   empty turn was a schema violation; the halves are independent now, so the
 *   only unreadable turn is one carrying neither prose nor a proposal.
 * - A proposal must satisfy the generation contract before anything downstream
 *   treats it as a draft — see `draftValidation.ts` for the silent dead end a
 *   type-confused value produced.
 * - A turn whose proposal fails is refused WHOLE. Showing the prose alone would
 *   put "here is a configuration for Grover" in the transcript above a card
 *   that cannot be opened, and let the conversation carry on from a proposal
 *   that was never actually made.
 */
export function readToolTurn(
  prose: string,
  proposal: unknown,
  provider: string,
  model: string,
): AgentChatResult {
  if (proposal === MALFORMED_ARGUMENTS) {
    return { ok: false, code: "INVALID_RESPONSE", message: MALFORMED_ARGUMENTS_MESSAGE };
  }
  if (prose.length === 0 && proposal === null) {
    return {
      ok: false,
      code: "INVALID_RESPONSE",
      message: "The provider returned no reply to read.",
    };
  }
  if (proposal === null) {
    return { ok: true, reply: prose, draft: null, provider, model };
  }

  const validated = validateGeneratedDraft(proposal);
  if (!validated.ok) {
    return {
      ok: false,
      code: "INVALID_RESPONSE",
      message: `The provider's proposal did not match the generation contract (${validated.reason}). Nothing was added to the conversation.`,
    };
  }
  return { ok: true, reply: prose, draft: validated.draft, provider, model };
}

/**
 * A tool call's arguments that would not parse as JSON at all.
 *
 * Distinct from a schema failure because the analyst's fix is different and the
 * message has to say so: a schema failure names an offending field, while this
 * means the response ended mid-object and there is no field to name. Shared by
 * both adapters and both paths so one condition gets one explanation.
 */
export const MALFORMED_ARGUMENTS = Symbol("malformed tool arguments");

/** The message every path uses when arguments arrive unparseable. */
export const MALFORMED_ARGUMENTS_MESSAGE =
  "The provider's proposal was cut off before it was complete, so it was not valid JSON. Nothing was added to the conversation.";

/**
 * A tool call's arguments, buffered out of a stream and parsed.
 *
 * Streaming sends the arguments as JSON *fragments* — `input_json_delta` on
 * Anthropic, `tool_calls[].function.arguments` deltas on the chat-completions
 * path — which mean nothing until the object closes. Both adapters therefore
 * accumulate the string and hand it here at the end.
 *
 * An empty buffer means no call was made, which is a turn with no proposal
 * rather than a failure. A non-empty buffer that will not parse means the
 * stream ended mid-object, which reports as `MALFORMED_ARGUMENTS` rather than
 * being handed to the contract check — validating a half-written string would
 * blame the generation schema for a truncated response.
 */
export function parseBufferedArguments(buffer: string): unknown {
  if (buffer.length === 0) return null;
  try {
    return JSON.parse(buffer);
  } catch {
    return MALFORMED_ARGUMENTS;
  }
}
