import { useEffect, useState } from "react";

import type { ConversationSummary } from "../../shared/chatTypes";
import { ConversationActions } from "./ConversationActions";

interface ConversationListProps {
  conversations: readonly ConversationSummary[];
  activeId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onClearAll: () => void;
}

/**
 * Every stored conversation, as a table.
 *
 * This replaced a 280px sidebar of truncated titles, for two reasons. It was a
 * SECOND vertical rail next to the app's only other one, which no other page in
 * this app has — Run Configuration, Results, History and Comparison are each a
 * single full-width column of stacked cards. And a rail that narrow can only
 * show a title, while the columns here — last message, how many turns carried a
 * proposal, when it was last touched — are what actually tell one conversation
 * from another when there are thirty of them.
 *
 * The shape is deliberately Run History's. A conversation is the same kind of
 * saved object as a run, and the app already had a settled way to list those.
 */
export function ConversationList({
  conversations,
  activeId,
  searchQuery,
  onSearchChange,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onExport,
  onClearAll,
}: ConversationListProps): React.JSX.Element {
  const [armedClear, setArmedClear] = useState(false);
  const searching = searchQuery.trim().length > 0;

  // Never leave a primed "delete everything" behind when the list changes out
  // from under it.
  useEffect(() => {
    setArmedClear(false);
  }, [conversations]);

  return (
    <section className="conversation-list" aria-label="Conversations">
      <div className="conversation-list__toolbar">
        <label className="sr-only" htmlFor="conversation-search">
          Search conversations
        </label>
        <input
          id="conversation-search"
          type="search"
          className="conversation-list__search"
          value={searchQuery}
          placeholder="Search all conversations"
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <span className="conversation-list__spacer" />
        <button
          type="button"
          className="agent-secondary"
          /*
           * On what is VISIBLE, not on whether a search is running: a search
           * matching nothing must not leave a live delete-everything button
           * beside the words "no conversation matches".
           */
          disabled={conversations.length === 0}
          onClick={() => setArmedClear(true)}
        >
          Delete all history
        </button>
        <button type="button" className="run-button agent-primary" onClick={onNew}>
          New conversation
        </button>
      </div>

      {armedClear ? (
        <div className="conversation-list__confirm">
          <p className="agent-note">
            This permanently deletes every conversation and its transcript from this machine.
            Run history is stored separately and is not affected.
          </p>
          <div className="conversation-actions">
            <button
              type="button"
              className="agent-secondary agent-secondary--danger"
              onClick={() => {
                setArmedClear(false);
                onClearAll();
              }}
            >
              Delete everything
            </button>
            <button
              type="button"
              className="agent-secondary"
              onClick={() => setArmedClear(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {conversations.length === 0 ? (
        <p className="conversation-list__empty">
          {searching
            ? "No conversation matches that search."
            : "No conversations yet. Start one and it will be kept here."}
        </p>
      ) : (
        <div className="conversation-list__table-wrap">
          <table className="conversation-table">
            <thead>
              <tr>
                <th scope="col">Conversation</th>
                <th scope="col">Last message</th>
                <th scope="col" className="conversation-table__number">
                  Messages
                </th>
                <th scope="col" className="conversation-table__number">
                  Proposals
                </th>
                <th scope="col">Updated</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => (
                <tr
                  key={conversation.id}
                  className={
                    conversation.id === activeId ? "conversation-table__row--open" : undefined
                  }
                >
                  <td>
                    <button
                      type="button"
                      className="conversation-table__title"
                      onClick={() => onOpen(conversation.id)}
                    >
                      {conversation.title}
                    </button>
                  </td>
                  {/*
                    The search snippet where there is one, so a hit says why it
                    matched rather than making the analyst open three
                    conversations to find out.
                  */}
                  <td className="conversation-table__preview">
                    {conversation.snippet ?? conversation.lastMessage ?? "—"}
                  </td>
                  <td className="conversation-table__number">{conversation.messageCount}</td>
                  <td className="conversation-table__number">{conversation.proposalCount}</td>
                  <td className="conversation-table__when">
                    {formatUpdated(conversation.updatedAt)}
                  </td>
                  {/*
                    No separate "Open" button: the title in the first column is
                    already a button that opens it, and two controls in one row
                    doing the same thing is the duplication that pushed the
                    actions into the Updated column in the first place.
                  */}
                  <td className="conversation-table__actions">
                    <ConversationActions
                      id={conversation.id}
                      title={conversation.title}
                      onRename={onRename}
                      onDelete={onDelete}
                      onExport={onExport}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * A timestamp the analyst can scan. Absolute, never "3 hours ago": this column
 * sits beside Run History's own absolute timestamps, and two ways of saying
 * when something happened in one app is one too many.
 */
function formatUpdated(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
