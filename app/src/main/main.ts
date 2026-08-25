import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerAgentHandlers } from "./agentHandler.js";
import { registerAppInfoHandlers } from "./appInfoHandler.js";
import { buildMcpSetup } from "./mcpSetup.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";
import { registerChatHandlers } from "./chatHandler.js";
import { SqliteChatStore } from "./sqliteChatStore.js";
import { registerCredentialHandlers } from "./credentialHandler.js";
import { CredentialStore, migrateLegacyAnthropicCredential } from "./credentialStore.js";
import { openAiDraftGenerator } from "./openAiDraftGenerator.js";
import { openRouterDraftGenerator } from "./openRouterDraftGenerator.js";
import { ModelCatalog } from "./modelCatalog.js";
import { OpenRouterCatalogClient } from "./openRouterCatalog.js";
import { OPENROUTER_SHORTLIST } from "../shared/providerModels.js";
import {
  AnthropicCredentialValidator,
  OpenAiCredentialValidator,
  OpenRouterCredentialValidator,
} from "./credentialValidator.js";
import { killLiveEngineProcesses } from "./engine/execute.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { QreEngine } from "./engine/qreEngine.js";
import { registerEstimatorHandler } from "./estimatorHandler.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import { publishRunDatabaseLocation } from "./publishDataLocation.js";
import { registerStoreHandlers } from "./storeHandler.js";
import { registerUploadHandler } from "./uploadHandler.js";
import { hardenWebContents } from "./windowSecurity.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(currentDir, "preload.cjs"),
    },
  });

  const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
  // Guards applied BEFORE the first load, so there is no window in which the
  // page exists unguarded. The dev server is allowed to navigate within its own
  // origin (reload and HMR do exactly that); the packaged build is allowed
  // nothing — a `file://` URL has origin "null", which would compare equal to
  // every other `file://` URL and wave through the whole filesystem.
  hardenWebContents(window.webContents, devServerUrl);

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(currentDir, "../dist/index.html"));
  }
}

const engineDir = app.isPackaged
  ? currentDir
  : path.resolve(process.cwd(), "src/main/engine");
// The real QRE engine (qdk[qre] Python subprocess) is the only estimator.
// resolvePythonBin locates the venv interpreter under engineDir.
const engine = new QreEngine(
  resolvePythonBin(process.env, process.platform, engineDir),
);
registerEstimatorHandler(ipcMain, engine);
// Form-level pre-flight for uploaded programs (main-process filesystem access).
registerUploadHandler(ipcMain);

// The stores are main-process only. Their DB files resolve under the app's
// per-user data dir, which is valid only after `whenReady` — so they're
// constructed and wired there (not at module top-level like the engine).
// QRE_DB_PATH / QRE_CHAT_DB_PATH override.
let runStore: SqliteRunStore | null = null;
let chatStore: SqliteChatStore | null = null;

app.whenReady().then(() => {
  const dbOverride = process.env["QRE_DB_PATH"];
  const dbPath =
    dbOverride && dbOverride.length > 0
      ? dbOverride
      : path.join(app.getPath("userData"), "run-history.sqlite");
  const store = new SqliteRunStore(dbPath);
  runStore = store;
  registerStoreHandlers(ipcMain, store);

  // Tell non-Electron processes where that resolved to. The MCP server cannot
  // call app.getPath(), and a second copy of Electron's per-platform rule would
  // drift the first time packaging sets a productName — so the process that
  // knows writes it down instead. Best effort; never fatal.
  publishRunDatabaseLocation(dbPath);

  // A separate file from run history, deliberately: see sqliteChatStore.ts.
  // Run records are immutable forever; a transcript is the analyst's own prose
  // and `chat:clear` has to be able to remove all of it without going anywhere
  // near the store that holds their results.
  const chatDbOverride = process.env["QRE_CHAT_DB_PATH"];
  const chatDbPath =
    chatDbOverride && chatDbOverride.length > 0
      ? chatDbOverride
      : path.join(app.getPath("userData"), "chat-history.sqlite");
  chatStore = new SqliteChatStore(chatDbPath);
  registerChatHandlers(ipcMain, chatStore);

  // Settings shows where these live. Resolved here rather than re-derived on
  // demand, because this is the only place that knows whether an env override
  // won — which is otherwise invisible everywhere in the app.
  registerAppInfoHandlers(
    ipcMain,
    [
      {
        id: "runDatabase",
        path: dbPath,
        overridden: Boolean(dbOverride && dbOverride.length > 0),
      },
      {
        id: "chatDatabase",
        path: chatDbPath,
        overridden: Boolean(chatDbOverride && chatDbOverride.length > 0),
      },
    ],
    // The MCP server ships beside this file — `build:mcp` writes it into the
    // same dist-electron directory `main.cjs` is loaded from — so resolving it
    // relative to `currentDir` keeps working wherever an installer puts them,
    // which no absolute path baked at build time would.
    async () =>
      buildMcpSetup({
        executablePath: process.execPath,
        serverBundlePath: path.join(currentDir, "mcp-server.mjs"),
        runDatabasePath: dbPath,
        // `RunStore` has no count, so this reads the history to answer a
        // yes/no. Settings is opened deliberately and rarely, which is what
        // makes that acceptable; a `count()` on the store is the cheaper
        // answer if this ever sits anywhere warmer.
        hasSavedRuns: (await store.list()).length > 0,
      }),
    (target) => shell.showItemInFolder(target),
  );

  // A separate, non-SQLite file for the encrypted provider key — never in
  // the same store as run history, never JSON.
  const legacyCredentialPath = path.join(app.getPath("userData"), "provider-credential.enc");
  const anthropicCredentialPath = path.join(
    app.getPath("userData"),
    "provider-credential-anthropic.enc",
  );
  migrateLegacyAnthropicCredential(legacyCredentialPath, anthropicCredentialPath);
  const vault = {
    anthropic: new CredentialStore(anthropicCredentialPath, safeStorage),
    openai: new CredentialStore(
      path.join(app.getPath("userData"), "provider-credential-openai.enc"),
      safeStorage,
    ),
    // One file per provider, so removing one key cannot disturb another and a
    // corrupt blob costs exactly one provider.
    openrouter: new CredentialStore(
      path.join(app.getPath("userData"), "provider-credential-openrouter.enc"),
      safeStorage,
    ),
  };
  registerCredentialHandlers(ipcMain, vault, {
    anthropic: new AnthropicCredentialValidator(),
    openai: new OpenAiCredentialValidator(),
    openrouter: new OpenRouterCredentialValidator(),
  });

  /*
   * OpenRouter's model list, held for this launch only.
   *
   * Constructed here rather than inside the handler because it is state with a
   * lifetime — everything else `registerAgentHandlers` receives is a factory or
   * a store — and because a cache owned by the handler would be rebuilt by any
   * future caller that registers handlers twice, silently discarding a
   * catalogue the analyst had just refreshed.
   */
  const openRouterCatalog = {
    cache: new ModelCatalog("openrouter", OPENROUTER_SHORTLIST),
    client: new OpenRouterCatalogClient(),
  };

  // The agent surface reads the key only here, in main, to attach it to an
  // outbound request. The store is passed whole; the renderer's window.agent
  // can reach neither `readForRequest` nor the value it returns.
  registerAgentHandlers(
    ipcMain,
    vault,
    {
      anthropic: { create: (model) => new AnthropicDraftGenerator(model) },
      openai: { create: (model) => openAiDraftGenerator(model) },
      openrouter: { create: (model) => openRouterDraftGenerator(model) },
    },
    { openrouter: openRouterCatalog },
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  killLiveEngineProcesses();
  runStore?.close();
  chatStore?.close();
});
app.on("window-all-closed", () => {
  killLiveEngineProcesses();
  if (process.platform !== "darwin") app.quit();
});
