// File header: console.* is never called in src/mcp/; process.stdout is never
// touched outside stdoutGuard.ts. All logging goes to stderr via this module.

export function logInfo(message: string, fields?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const fieldsStr = fields ? ` ${JSON.stringify(fields)}` : "";
  process.stderr.write(`[INFO] ${timestamp} ${message}${fieldsStr}\n`);
}

export function logError(
  message: string,
  error?: unknown
): void {
  const timestamp = new Date().toISOString();
  let errorStr = "";
  if (error) {
    if (error instanceof Error) {
      errorStr = ` error=${error.message}`;
    } else if (typeof error === "string") {
      errorStr = ` error=${error}`;
    }
  }
  process.stderr.write(`[ERROR] ${timestamp} ${message}${errorStr}\n`);
}
