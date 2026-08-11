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
export const AGENT_DRAFT_CHANNEL = "agent:draft";
// Abandon the draft this window has in flight. A draft is a two-minute
// commitment; without this the analyst's only exit was to wait it out.
export const AGENT_CANCEL_CHANNEL = "agent:cancel";
// The exact outbound request body, credential-free, so the analyst can read
// what will leave the machine before it does (brief constraint 8). Returning a
// summary here instead would make the UI's "exact outbound request" a lie.
export const AGENT_PREVIEW_CHANNEL = "agent:preview";
