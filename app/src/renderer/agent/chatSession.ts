/**
 * Minting the pieces of a conversation, kept out of the component.
 *
 * Everything here is a pure function of its arguments plus two ambient sources
 * — `crypto.randomUUID` and the clock — which is exactly why it is worth
 * separating: `ChatPage` is then a component that renders and calls a store,
 * and the rules about what an id, a title and a model attribution are can be
 * tested without rendering anything.
 */

import {
  GENERATION_SCHEMA_ID,
  type AgentChatRequest,
  type AgentChatResult,
  type ProviderId,
} from "../../shared/agentTypes";
import {
  titleFromFirstMessage,
  toChatTurns,
  type ChatMessage,
  type NewConversation,
} from "../../shared/chatTypes";

const now = (): string => new Date().toISOString();

/** The analyst's turn. Drafts and attribution belong to the model, never here. */
export function userTurn(text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    text,
    draft: null,
    model: null,
    createdAt: now(),
  };
}

/**
 * The model's turn.
 *
 * `provider/model` is stored per MESSAGE rather than per conversation, because
 * the picker is live: an analyst can start on Haiku, switch to Opus when the
 * answers get thin, and the transcript should say which turn came from which.
 * It is also the exact string `draftToFormState` stamps as run provenance, so a
 * saved run and the turn that proposed it name the same model the same way.
 */
export function assistantTurn(result: Extract<AgentChatResult, { ok: true }>): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: result.reply,
    draft: result.draft,
    model: `${result.provider}/${result.model}`,
    createdAt: now(),
  };
}

/**
 * A conversation and its opening turn, minted together.
 *
 * Created on the first SEND, not when the analyst clicks "New conversation":
 * a rail full of empty threads someone opened and thought better of is worse
 * than no rail at all.
 */
export function startConversation(text: string): {
  conversation: NewConversation;
  message: ChatMessage;
} {
  const message = userTurn(text);
  return {
    conversation: {
      id: crypto.randomUUID(),
      title: titleFromFirstMessage(text),
      createdAt: message.createdAt,
    },
    message,
  };
}

/**
 * The outbound request for the next turn.
 *
 * ONE function for both sending and previewing. `pending` is the text sitting
 * in the composer, unsent: the preview passes it and the stored transcript,
 * while `send` passes the transcript with that turn already appended and no
 * pending text. Both produce the same turns, because both go through
 * `toChatTurns` and append the same `{ role: "user", content }`.
 *
 * That equality is the point, and it is pinned by a test. The surface this
 * replaces had a separate `reviewing` boolean, and the bug it produced was
 * exactly this: the analyst approving payload A while payload B went out.
 * Deriving both from one function makes the drift unrepresentable rather than
 * merely watched for.
 */
export function buildChatRequest(
  messages: readonly ChatMessage[],
  provider: ProviderId,
  model: string,
  pending = "",
): AgentChatRequest {
  const turns = toChatTurns(messages);
  const text = pending.trim();
  return {
    messages: text.length === 0 ? turns : [...turns, { role: "user", content: text }],
    generationSchema: GENERATION_SCHEMA_ID,
    provider,
    model,
  };
}

/**
 * Whether the conversation is waiting on a reply that never came.
 *
 * A failed or cancelled turn leaves the analyst's message in the transcript on
 * purpose — it is what they wrote, and losing it to a rate limit is the exact
 * complaint that moved the prompt box into the shell in the first place. What
 * that costs is a transcript ending on an unanswered question, so the UI has to
 * be able to see that state and offer to send it again.
 */
export function awaitingReply(messages: readonly ChatMessage[]): boolean {
  return messages.at(-1)?.role === "user";
}
