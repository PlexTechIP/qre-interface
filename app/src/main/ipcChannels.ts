export const ESTIMATOR_RUN_CHANNEL = "estimator:run";

// Pre-flight for an uploaded program file, so the FORM can reject a missing,
// unreadable, wrong-extension or implausible file before Run is ever clicked.
export const UPLOAD_PREFLIGHT_CHANNEL = "uploads:preflight";

// RunStore over IPC — one flat channel per operation, mirroring the estimator's
// "domain:verb" convention. Backed by the main-process SqliteRunStore.
export const STORE_SAVE_CHANNEL = "store:save";
export const STORE_LIST_CHANNEL = "store:list";
export const STORE_GET_CHANNEL = "store:get";
export const STORE_DELETE_CHANNEL = "store:delete";
export const STORE_QUERY_CHANNEL = "store:query";

// Provider credential storage. Three channels: whether a key is configured,
// configuring one, and removing one. There is still no channel that reads a key
// back — see credentialHandler.ts. `clear` is the exit from the one-way street
// `configure` puts the analyst on; without it the only way to revoke a key was
// to find the encrypted blob in userData and delete it by hand.
export const CREDENTIAL_STATUS_CHANNEL = "credential:status";
export const CREDENTIAL_CONFIGURE_CHANNEL = "credential:configure";
export const CREDENTIAL_CLEAR_CHANNEL = "credential:clear";

// window.agent — the fifth preload surface (docs/architecture.md's estimator
// convention: provider failures resolve carrying a typed failure; only a
// programmer error rejects). See agentHandler.ts.
export const AGENT_STATUS_CHANNEL = "agent:status";
// One turn of a conversation. Was `agent:draft`, which could only ever answer
// with a configuration; a turn may now also be a question, so the channel is
// named for the exchange rather than for one of its two outcomes.
export const AGENT_REPLY_CHANNEL = "agent:reply";
// Abandon the turn this window has in flight. A reply is a two-minute
// commitment; without this the analyst's only exit was to wait it out.
export const AGENT_CANCEL_CHANNEL = "agent:cancel";
// The exact outbound request body, credential-free, so the analyst can read
// what will leave the machine before it does (brief constraint 8). Returning a
// summary here instead would make the UI's "exact outbound request" a lie.
export const AGENT_PREVIEW_CHANNEL = "agent:preview";
// Re-read an aggregating provider's model list, and its credit balance if it
// publishes one. Only OpenRouter has either: the first-party providers offer
// three pinned models apiece and no balance endpoint, so there is nothing to
// go and ask. It is on the agent surface rather than a new one because it needs
// the stored key, and the key is only ever readable where `agent:reply` reads
// it — the renderer names the provider and never learns the secret.
export const AGENT_CATALOG_CHANNEL = "agent:catalog";

// ChatStore over IPC — the same one-channel-per-operation shape as the run
// store, backed by the main-process SqliteChatStore and its OWN database file.
// `chat:clear` has no run-store counterpart on purpose: run records are
// immutable history, while a transcript is the analyst's own prose and they are
// entitled to take it back off the disk it was put on.
export const CHAT_LIST_CHANNEL = "chat:list";
export const CHAT_GET_CHANNEL = "chat:get";
export const CHAT_CREATE_CHANNEL = "chat:create";
export const CHAT_APPEND_CHANNEL = "chat:append";
export const CHAT_RENAME_CHANNEL = "chat:rename";
export const CHAT_DELETE_CHANNEL = "chat:delete";
export const CHAT_CLEAR_CHANNEL = "chat:clear";
export const CHAT_SEARCH_CHANNEL = "chat:search";

// Where this install keeps its data. Read-only: the analyst can find their own
// files and open the folder, and that is the whole surface. There is no
// "move the database" counterpart — relocating a live SQLite file is a
// different feature, and a channel that could only half-do it would be worse
// than none.
export const APP_INFO_STORAGE_CHANNEL = "appInfo:storage";
// Show one stored file in the OS file manager. Takes a location ID, never a
// path: main maps the id onto a path it resolved itself, so no string from the
// renderer can steer the file manager.
export const APP_INFO_REVEAL_CHANNEL = "appInfo:reveal";

// Prose arriving mid-request, pushed rather than invoked.
//
// The only channel here that main initiates. `agent:reply` keeps its invoke
// shape and still resolves with the whole validated turn — persistence and
// error handling are untouched — while this carries the fragments that make the
// wait legible. It is one-way and carries no credential, no draft and no
// conversation id: just a request id and a string, so a listener that leaked
// would leak prose the analyst is already reading on their own screen.
export const AGENT_REPLY_DELTA_CHANNEL = "agent:replyDelta";
