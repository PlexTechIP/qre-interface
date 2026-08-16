import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerAgentHandlers } from "./agentHandler.js";
import { registerAppInfoHandlers } from "./appInfoHandler.js";
import { AnthropicDraftGenerator } from "./anthropicDraftGenerator.js";
import { registerChatHandlers } from "./chatHandler.js";
import { SqliteChatStore } from "./sqliteChatStore.js";
import { registerCredentialHandlers } from "./credentialHandler.js";
import { CredentialStore, migrateLegacyAnthropicCredential } from "./credentialStore.js";
import { OpenAiDraftGenerator } from "./openAiDraftGenerator.js";
import { AnthropicCredentialValidator, OpenAiCredentialValidator } from "./credentialValidator.js";
import { killLiveEngineProcesses } from "./engine/execute.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { QreEngine } from "./engine/qreEngine.js";
import { registerEstimatorHandler } from "./estimatorHandler.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
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
  runStore = new SqliteRunStore(dbPath);
  registerStoreHandlers(ipcMain, runStore);

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
  };
  registerCredentialHandlers(ipcMain, vault, {
    anthropic: new AnthropicCredentialValidator(),
    openai: new OpenAiCredentialValidator(),
  });

  // The agent surface reads the key only here, in main, to attach it to an
  // outbound request. The store is passed whole; the renderer's window.agent
  // can reach neither `readForRequest` nor the value it returns.
  registerAgentHandlers(ipcMain, vault, {
    anthropic: { create: (model) => new AnthropicDraftGenerator(model) },
    openai: { create: (model) => new OpenAiDraftGenerator(model) },
  });

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
