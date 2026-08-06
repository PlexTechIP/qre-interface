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

// Provider credential storage. Deliberately just two channels: whether a key
// is configured, and configuring one. There is no channel that reads a key
// back — see credentialHandler.ts.
export const CREDENTIAL_STATUS_CHANNEL = "credential:status";
export const CREDENTIAL_CONFIGURE_CHANNEL = "credential:configure";

// window.agent — the fifth preload surface (docs/architecture.md's estimator
// convention: provider failures resolve carrying a typed failure; only a
// programmer error rejects). See agentHandler.ts.
export const AGENT_STATUS_CHANNEL = "agent:status";
export const AGENT_DRAFT_CHANNEL = "agent:draft";
