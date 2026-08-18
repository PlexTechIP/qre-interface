// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readEventStream } from "./serverSentEvents.js";

/** A body that hands out exactly the chunks given, byte for byte. */
function streamOf(...chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const events: unknown[] = [];
  for await (const event of readEventStream(stream, signal)) events.push(event);
  return events;
}

describe("readEventStream", () => {
  it("yields the JSON on each data line", async () => {
    const events = await collect(
      streamOf('data: {"n":1}\n', 'data: {"n":2}\n', 'data: {"n":3}\n'),
    );

    expect(events).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  /**
   * A network chunk is not an event. One read routinely carries several events
   * and half of the next, and splitting each chunk on its own drops that half —
   * which shows up as a token silently missing from the middle of a reply.
   */
  it("reassembles an event split across two chunks", async () => {
    const events = await collect(streamOf('data: {"tex', 't":"hello"}\n'));

    expect(events).toEqual([{ text: "hello" }]);
  });

  it("handles several events arriving in one chunk", async () => {
    const events = await collect(streamOf('data: {"n":1}\ndata: {"n":2}\n'));

    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("emits a final event that arrived without a trailing newline", async () => {
    const events = await collect(streamOf('data: {"n":1}\n', 'data: {"n":2}'));

    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  /** `event:`, `id:`, comments and blank separators are framing, not payload. */
  it("ignores every line that is not a data line", async () => {
    const events = await collect(
      streamOf('event: message_start\n', ': keep-alive\n', '\n', 'data: {"n":1}\n', 'id: 7\n'),
    );

    expect(events).toEqual([{ n: 1 }]);
  });

  /** OpenAI's end sentinel is deliberately not JSON. */
  it("does not try to parse the [DONE] sentinel", async () => {
    const events = await collect(streamOf('data: {"n":1}\n', "data: [DONE]\n"));

    expect(events).toEqual([{ n: 1 }]);
  });

  /**
   * One malformed event costs that event, not the reply. Throwing here would
   * abandon a stream the analyst is already watching arrive, over a fragment
   * nothing downstream needed.
   */
  it("skips a data line that will not parse", async () => {
    const events = await collect(
      streamOf('data: {"n":1}\n', "data: {not json}\n", 'data: {"n":2}\n'),
    );

    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  /**
   * A multi-byte character can straddle a chunk boundary. Decoding each chunk
   * independently turns it into U+FFFD — visible to the analyst as a black
   * diamond in the middle of a word.
   */
  it("does not mangle a character split across chunks", async () => {
    const encoded = new TextEncoder().encode('data: {"text":"café"}\n');
    const split = encoded.length - 4;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, split));
        controller.enqueue(encoded.slice(split));
        controller.close();
      },
    });

    await expect(collect(stream)).resolves.toEqual([{ text: "café" }]);
  });

  it("stops early when the caller has given up", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(collect(streamOf('data: {"n":1}\n'), controller.signal)).resolves.toEqual([]);
  });
});
