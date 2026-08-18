import type { Conversation } from "../../shared/chatTypes";
import { CopyButton } from "../CopyButton";
import { downloadMarkdown } from "../download";
import { useExportedAt } from "../exportProvenance";
import { Modal } from "../Modal";
import { buildConversationMarkdown } from "./exportConversation";

/**
 * One conversation, exported — the same shape the run and comparison exports
 * have: read the document, copy it, or save it.
 *
 * This surface used to write the file straight to Downloads on the first
 * click. That is the one export you most want to look at before you send it
 * anywhere: it is a transcript of things the analyst typed, and the export is
 * usually on its way into a ticket or a message. Reading it required going and
 * opening the file, and there was no way to copy it without one.
 *
 * No CSV here, unlike the other two. A transcript is prose and proposals, not
 * a table; there is nothing to put in columns.
 */
export interface ConversationExportDialogProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ConversationExportDialog({
  conversation,
  onClose,
}: ConversationExportDialogProps): React.JSX.Element {
  const exportedAt = useExportedAt();
  const preview = buildConversationMarkdown(conversation, exportedAt);

  return (
    <Modal
      titleId="conversation-export-title"
      title="Export conversation"
      onClose={onClose}
      footer={
        <>
          <CopyButton value={preview} label="Copy Markdown" />
          <button
            type="button"
            onClick={() =>
              downloadMarkdown(preview, conversation.title, {
                fallback: "qre-conversation",
                exportedAt,
              })
            }
          >
            Download .md
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="muted">
        The whole transcript in order, with every proposal inlined as the JSON
        the model produced.
      </p>
      <pre className="code-block" aria-label="Conversation export preview">
        {preview}
      </pre>
    </Modal>
  );
}
