import { spawn } from "node:child_process";
import { connect } from "node:net";

function run(command, args, options = {}) {
  return spawn(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
}

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Command exited with ${code}`)));
  });
}

function waitForPort(port, attempts = 100) {
  return new Promise((resolve, reject) => {
    const tryConnect = (remaining) => {
      const socket = connect({ host: "127.0.0.1", port: Number(port) });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (remaining === 0) reject(new Error("Vite dev server did not start"));
        else setTimeout(() => tryConnect(remaining - 1), 100);
      });
    };
    tryConnect(attempts);
  });
}

await waitFor(run("vite", ["build", "--config", "vite.main.config.ts"]));
await waitFor(run("vite", ["build", "--config", "vite.preload.config.ts"]));

const port = "5173";
const vite = run("vite", ["--host", "127.0.0.1", "--port", port, "--strictPort"]);
await waitForPort(port);
const electron = run("electron", ["."], {
  env: { ...process.env, VITE_DEV_SERVER_URL: `http://127.0.0.1:${port}` },
});

const stop = () => {
  vite.kill();
  electron.kill();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
electron.once("exit", () => {
  vite.kill();
  process.exitCode = 0;
});
