/**
 * Reads a `text/event-stream` body into the JSON payloads it carries.
 *
 * Both providers stream with server-sent events and both encode each event's
 * payload as JSON on a `data:` line, so the framing is worth exactly one
 * implementation. What differs is what the payloads MEAN, and that stays in
 * each adapter.
 *
 * The buffering is the whole point. A network chunk is not an event: one read
 * can carry three events and half of a fourth, and a naive
 * `chunk.split("\n")` drops that half or emits it as a truncated line. Holding
 * the remainder until its newline arrives is what makes a token stream reliable
 * rather than usually-fine.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted === true) return;
      const { done, value } = await reader.read();
      if (done) break;

      // `stream: true` so a multi-byte character split across two chunks is
      // held rather than decoded into a replacement character.
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        const payload = readDataLine(line);
        if (payload !== undefined) yield payload;
      }
    }

    // A stream that ends without a trailing newline still has one event in it.
    const trailing = readDataLine(buffer.trim());
    if (trailing !== undefined) yield trailing;
  } finally {
    // Releasing the lock lets the caller cancel the body. Without it an aborted
    // request leaves the reader holding a stream nothing will ever drain.
    reader.releaseLock();
  }
}

/**
 * One `data:` line's JSON, or nothing.
 *
 * `event:` and `id:` lines, blank separators and comments are all framing this
 * layer has no use for. `[DONE]` is OpenAI's end sentinel and is deliberately
 * not JSON — parsing it would throw on every single stream.
 *
 * A `data:` line that will not parse is skipped rather than thrown: one
 * malformed event in a stream of hundreds should cost that event, not the
 * reply the analyst is watching arrive.
 */
function readDataLine(line: string): unknown {
  if (!line.startsWith("data:")) return undefined;
  const payload = line.slice("data:".length).trim();
  if (payload.length === 0 || payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}
