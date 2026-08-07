/**
 * Reads a provider's error response into a short human-readable reason.
 *
 * Both providers answer a rejected request with a body that says *why* — an
 * unsupported JSON Schema keyword, a bad parameter, a model that does not exist.
 * Swallowing it and reporting only "status 400" leaves the analyst, and whoever
 * they escalate to, with nothing to act on: every 400 looks identical, and the
 * one piece of information that distinguishes them was thrown away at the seam.
 *
 * Never throws. A diagnostic that can fail the request it is describing is
 * worse than no diagnostic, so every path here degrades to `null`.
 */
export async function readProviderErrorReason(
  response: Pick<Response, "text">,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — an HTML error page from a proxy, most likely. Still better
    // than nothing, but truncated so a whole page cannot land in the UI.
    return truncate(raw);
  }

  // Anthropic: { error: { type, message } }. OpenAI: { error: { message, code } }.
  // Same shape either way, which is why one helper serves both.
  const message = asRecord(asRecord(parsed)?.["error"])?.["message"];
  if (typeof message === "string" && message.trim().length > 0) {
    return truncate(message);
  }
  return truncate(raw);
}

/**
 * Long enough for the provider to name the offending field and path, short
 * enough that a runaway body cannot flood the panel.
 */
function truncate(value: string, limit = 400): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
