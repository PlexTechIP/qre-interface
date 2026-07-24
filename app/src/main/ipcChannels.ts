export const ESTIMATOR_RUN_CHANNEL = "estimator:run";

// RunStore over IPC — one flat channel per operation, mirroring the estimator's
// "domain:verb" convention. Backed by the main-process SqliteRunStore.
export const STORE_SAVE_CHANNEL = "store:save";
export const STORE_LIST_CHANNEL = "store:list";
export const STORE_GET_CHANNEL = "store:get";
export const STORE_DELETE_CHANNEL = "store:delete";
export const STORE_QUERY_CHANNEL = "store:query";
