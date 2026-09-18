// File header: console.* is never called in src/mcp/; process.stdout is never
// touched outside stdoutGuard.ts. All logging goes to stderr via this module.

export function logInfo(message: string, fields?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const fieldsStr = fields ? ` ${safeJson(fields)}` : "";
  process.stderr.write(`[INFO] ${timestamp} ${message}${fieldsStr}\n`);
}

/**
 * Log a failure with whatever the caller knows about it.
 *
 * `detail` used to be rendered only when it was an Error or a string, and
 * silently dropped otherwise. Every "Invalid run record in store" log passed
 * `{ id, errors }` — so the one line that could have said WHICH record was
 * unreadable, and WHY, said neither. Objects are rendered as JSON now.
 */
export function logError(message: string, detail?: unknown): void {
  const timestamp = new Date().toISOString();
  process.stderr.write(`[ERROR] ${timestamp} ${message}${describeDetail(detail)}\n`);
}

function describeDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return "";
  if (detail instanceof Error) return ` error=${detail.message}`;
  if (typeof detail === "string") return ` error=${detail}`;
  return ` detail=${safeJson(detail)}`;
}

/** JSON, or a best-effort string when the value cannot be serialised. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
