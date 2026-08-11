import { useEffect, useState } from "react";

interface ConversationActionsProps {
  id: string;
  title: string;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Write the whole transcript out as Markdown. */
  onExport: (id: string) => void;
}

/**
 * Rename and delete for one conversation, in the two places that offer them:
 * the open thread's header and each row of the conversation list.
 *
 * One component rather than two copies, because the delete is a two-step arm —
 * the pattern the credential panel established for key removal — and a
 * confirmation implemented twice is a confirmation that will eventually only be
 * implemented once. `window.confirm` would have avoided the duplication and is
 * the wrong trade: it cannot be styled, cannot be tested, and is modal over an
 * app with other things on screen worth reading while you decide.
 */
export function ConversationActions({
  id,
  title,
  onRename,
  onDelete,
  onExport,
}: ConversationActionsProps): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  /**
   * Disarm and stop renaming when this becomes a different conversation.
   * List rows are keyed by id, but the thread header is one instance that
   * changes identity underneath itself when the analyst opens another thread —
   * without this it would carry a primed delete across.
   */
  useEffect(() => {
    setArmed(false);
    setRenaming(false);
  }, [id]);

  if (renaming) {
    return (
      <form
        className="conversation-actions conversation-actions--renaming"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draftTitle.trim();
          // An empty title would leave an unclickable blank row, so it cancels
          // rather than erasing the name.
          if (next.length > 0) onRename(id, next);
          setRenaming(false);
        }}
      >
        <label className="sr-only" htmlFor={`rename-${id}`}>
          Conversation name
        </label>
        <input
          id={`rename-${id}`}
          className="conversation-actions__input"
          value={draftTitle}
          autoFocus
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setRenaming(false);
          }}
        />
        <button type="submit" className="agent-secondary">
          Save name
        </button>
        <button type="button" className="agent-secondary" onClick={() => setRenaming(false)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="conversation-actions">
      <button
        type="button"
        className="agent-secondary"
        onClick={() => {
          setDraftTitle(title);
          setRenaming(true);
        }}
      >
        Rename
      </button>
      <button type="button" className="agent-secondary" onClick={() => onExport(id)}>
        Export
      </button>
      {armed ? (
        <>
          <button
            type="button"
            className="agent-secondary agent-secondary--danger"
            onClick={() => {
              setArmed(false);
              onDelete(id);
            }}
          >
            Confirm delete
          </button>
          <button type="button" className="agent-secondary" onClick={() => setArmed(false)}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" className="agent-secondary" onClick={() => setArmed(true)}>
          Delete
        </button>
      )}
    </div>
  );
}
