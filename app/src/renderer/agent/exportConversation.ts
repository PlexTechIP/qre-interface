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
/**
 * A code fence longer than any backtick run in the content it must survive.
 *
 * A three-backtick fence is not safe here: message text is model prose and
 * routinely contains its own fenced snippet, and a `name` the model chose can
 * contain backticks too. An unbalanced run in the prose above would otherwise
 * be closed by this block's opener, after which the configuration JSON renders
 * as body text and everything below it inherits the confusion.
 */
function fenceFor(content: string): string {
  const longest = [...content.matchAll(/`+/g)].reduce(
    (max, match) => Math.max(max, match[0].length),
    0,
  );
  return "`".repeat(Math.max(3, longest + 1));
}

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
      const json = JSON.stringify(message.draft, null, 2);
      const fence = fenceFor(`${message.text}\n${json}`);
      lines.push(
        "### Proposed configuration",
        "",
        `${fence}json`,
        json,
        fence,
        "",
      );
    }
  }

  return lines.join("\n");
}
