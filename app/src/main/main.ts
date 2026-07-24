import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EstimatorService } from "../shared/types.js";
import { MockEngine } from "../shared/mockEngine.js";
import { killLiveEngineProcesses } from "./engine/execute.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { QreEngine } from "./engine/qreEngine.js";
import { registerEstimatorHandler } from "./estimatorHandler.js";
import { SqliteRunStore } from "./sqliteRunStore.js";
import { registerStoreHandlers } from "./storeHandler.js";

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
// Engine selection: the real QRE engine by default; QRE_ENGINE=mock swaps in the
// MockEngine so the app runs end-to-end without a provisioned Python runtime
// (demos, or machines without the qdk[qre] venv). Both implement EstimatorService,
// so nothing downstream — including save-after-run — changes.
const engine: Pick<EstimatorService, "run"> =
  process.env["QRE_ENGINE"] === "mock"
    ? new MockEngine({ delayMs: 400 })
    : new QreEngine(resolvePythonBin(process.env, process.platform, engineDir));
registerEstimatorHandler(ipcMain, engine);

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
