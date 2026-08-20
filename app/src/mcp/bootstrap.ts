// This module MUST be the first import in server.ts because ESM evaluates all
// imports before the module body runs. A guard installed later would miss any
// module that logs at import time.
import { installStdoutGuard } from "./stdoutGuard.js";

const { protocolStream } = installStdoutGuard({
  stdout: process.stdout,
  stderr: process.stderr,
  console: console,
});

export { protocolStream };
