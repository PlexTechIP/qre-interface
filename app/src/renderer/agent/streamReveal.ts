/**
 * How fast to show text that has already arrived.
 *
 * A provider does not deliver prose evenly. Fragments land in clumps shaped by
 * tokenisation, network buffering and the provider's own flushing, so painting
 * whatever has accumulated — which is what the 60ms batch this replaces did —
 * moves the text in steps as uneven as the network. The reply is legible, but
 * it lurches, and a long line can appear all at once after a visible stall.
 *
 * Arrival and display are separated instead. Everything received goes into a
 * buffer, and the buffer is drained toward the screen at a rate chosen to keep
 * the amount not-yet-shown roughly constant. Bursts are absorbed by the buffer
 * rather than shown as jumps, and a pause in delivery is covered by the text
 * still waiting to be revealed.
 *
 * Rate follows the backlog: aim to be caught up in about
 * `REVEAL_TARGET_LATENCY_MS`, so a bigger backlog drains proportionally
 * faster and the lag the reader perceives does not grow with the burst.
 */

/** How long the reveal aims to stay behind what has arrived. */
export const REVEAL_TARGET_LATENCY_MS = 320;

/**
 * Floor, in characters per second.
 *
 * Without one, a nearly-drained buffer would reveal ever more slowly — the
 * rate is proportional to what is left — and the last characters of a reply
 * would crawl.
 */
export const REVEAL_MIN_CPS = 40;

/**
 * Ceiling, in characters per second.
 *
 * A reconnect, or a provider that buffers a whole paragraph, can deliver
 * kilobytes in one event. Draining that at the rate the target latency implies
 * would be near-instant and defeat the point; leaving it unbounded at the
 * proportional rate is the same thing. This is the fastest the text is allowed
 * to move while still reading as text arriving.
 */
export const REVEAL_MAX_CPS = 1800;

/**
 * Characters to move from buffer to screen for a frame of `elapsedMs`.
 *
 * Pure, and the only place the pacing is decided — the frame loop that calls
 * it holds no policy of its own.
 */
export function charsToReveal(backlog: number, elapsedMs: number): number {
  if (backlog <= 0) return 0;
  const proportional = (backlog * 1000) / REVEAL_TARGET_LATENCY_MS;
  const cps = Math.min(REVEAL_MAX_CPS, Math.max(REVEAL_MIN_CPS, proportional));
  const chars = Math.round((cps * elapsedMs) / 1000);
  // At least one character, so a frame too short to round up still advances and
  // the tail of a reply cannot stall short of the end.
  return Math.min(backlog, Math.max(1, chars));
}

/**
 * Measured cost of rendering assistant prose, per character.
 *
 * Every paint re-parses the whole accumulated reply — that is how
 * `react-markdown` works, and it is why the batching this file replaces
 * existed. Rendering `AssistantProse` at growing lengths in jsdom gave roughly
 * 1.35ms at 236 characters, 2.75ms at 944, 7.96ms at 3776 and 15.59ms at 9440:
 * linear, at about 1.7 microseconds a character. (That harness mounts and
 * unmounts each time, so it overstates a React re-render somewhat; the slope is
 * the part being used here.)
 *
 * A frame is 16.7ms, so at the top of that range painting every frame would
 * spend the entire budget parsing and the reply would stutter — the opposite of
 * the point.
 */
export const REVEAL_PARSE_MS_PER_CHAR = 0.0017;

/** Share of wall-clock time the reveal may spend re-parsing. */
export const REVEAL_PARSE_BUDGET = 0.25;

/** Fastest and slowest the screen is allowed to be updated, in milliseconds. */
export const REVEAL_MIN_COMMIT_MS = 16;
export const REVEAL_MAX_COMMIT_MS = 80;

/**
 * How long to wait between paints for a reply of `length` characters.
 *
 * Short replies paint every frame, which is what makes them smooth and costs
 * almost nothing. Long ones paint less often, so the parse stays inside its
 * budget. The cursor keeps advancing on the frame clock either way — a slower
 * paint shows more characters, it does not show them later — and the ceiling
 * means the worst case is no worse than the fixed batch this replaced, while
 * every reply shorter than about 2,400 characters is strictly smoother.
 */
export function minCommitIntervalMs(length: number): number {
  const perPaint = Math.max(0, length) * REVEAL_PARSE_MS_PER_CHAR;
  const needed = perPaint / REVEAL_PARSE_BUDGET;
  return Math.min(REVEAL_MAX_COMMIT_MS, Math.max(REVEAL_MIN_COMMIT_MS, needed));
}
