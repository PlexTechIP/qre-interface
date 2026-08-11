import type { Conversation } from "../../shared/chatTypes";

/**
 * A conversation as Markdown.
 *
 * The whole transcript, in order, with every proposal inlined as the JSON the
 * model actually produced. An export that summarised the drafts — or dropped
 * them, as a naive "just the prose" version would — would be a record of a
 * conversation about configurations with the configurations missing, which is
 * the one thing anyone exporting this wants to keep.
 *
 * Deliberately NOT the run exporter's shape (`buildRunExportMarkdown`). That
 * one describes a single immutable record with a frontier table; this is a
 * chronology. Sharing a generator between them would mean one function with a
 * mode flag and two disjoint halves.
 */
export function buildConversationMarkdown(conversation: Conversation): string {
  const proposals = conversation.messages.filter((message) => message.draft !== null).length;

  const lines = [
    `# ${conversation.title}`,
    "",
    `- **Messages:** ${conversation.messages.length}`,
    `- **Proposals:** ${proposals}`,
    `- **Started:** ${conversation.createdAt}`,
    `- **Last updated:** ${conversation.updatedAt}`,
    "",
    "> Exported from the QRE Dashboard. Proposals are recorded as they were",
    "> made; a run is only created when an analyst opens one in Run",
    "> Configuration and executes it.",
    "",
  ];

  if (conversation.messages.length === 0) {
    lines.push("_This conversation has no messages._");
    return lines.join("\n");
  }

  for (const message of conversation.messages) {
    lines.push(
      "---",
      "",
      // The model that produced an assistant turn, so an exported transcript
      // stays attributable after it leaves the app — the same string the run
      // record carries as provenance.
      `## ${message.role === "user" ? "You" : (message.model ?? "Assistant")}`,
      "",
      `*${message.createdAt}*`,
      "",
      message.text,
      "",
    );

    if (message.draft !== null) {
      lines.push(
        "### Proposed configuration",
        "",
        "```json",
        JSON.stringify(message.draft, null, 2),
        "```",
        "",
      );
    }
  }

  return lines.join("\n");
}
