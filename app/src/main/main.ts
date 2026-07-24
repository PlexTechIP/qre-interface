import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killLiveEngineProcesses } from "./engine/execute.js";
import { resolvePythonBin } from "./engine/pythonBin.js";
import { QreEngine } from "./engine/qreEngine.js";
import { registerEstimatorHandler } from "./estimatorHandler.js";

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
registerEstimatorHandler(
  ipcMain,
  new QreEngine(resolvePythonBin(process.env, process.platform, engineDir)),
);
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", killLiveEngineProcesses);
app.on("window-all-closed", () => {
  killLiveEngineProcesses();
  if (process.platform !== "darwin") app.quit();
});
