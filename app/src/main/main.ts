import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerCredentialHandlers } from "./credentialHandler.js";
import { CredentialStore } from "./credentialStore.js";
import { AnthropicCredentialValidator } from "./credentialValidator.js";
import { killLiveEngineProcesses } from "./engine/execute.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { QreEngine } from "./engine/qreEngine.js";
import { registerEstimatorHandler } from "./estimatorHandler.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import { registerStoreHandlers } from "./storeHandler.js";
import { registerUploadHandler } from "./uploadHandler.js";

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

// The run store is main-process only. Its DB file resolves under the app's
// per-user data dir, which is valid only after `whenReady` — so it's constructed
// and wired there (not at module top-level like the engine). QRE_DB_PATH overrides.
let runStore: SqliteRunStore | null = null;

app.whenReady().then(() => {
  const dbOverride = process.env["QRE_DB_PATH"];
  const dbPath =
    dbOverride && dbOverride.length > 0
      ? dbOverride
      : path.join(app.getPath("userData"), "run-history.sqlite");
  runStore = new SqliteRunStore(dbPath);
  registerStoreHandlers(ipcMain, runStore);

  // A separate, non-SQLite file for the encrypted provider key — never in
  // the same store as run history, never JSON.
  const credentialPath = path.join(app.getPath("userData"), "provider-credential.enc");
  const credentialStore = new CredentialStore(credentialPath, safeStorage);
  registerCredentialHandlers(ipcMain, credentialStore, new AnthropicCredentialValidator());

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  killLiveEngineProcesses();
  runStore?.close();
});
app.on("window-all-closed", () => {
  killLiveEngineProcesses();
  if (process.platform !== "darwin") app.quit();
});
