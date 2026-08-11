/**
 * The renderer's Content-Security-Policy, as directives.
 *
 * Shared rather than written into `index.html`, because two things need it and
 * they run at different times: the Vite build injects it as a `<meta>` (with the
 * hashes of whatever inline scripts survived the build appended to
 * `script-src`), and a test asserts the directives that carry the guarantees
 * below are still present. A policy nobody checks decays into a comment.
 *
 * **`connect-src 'none'` is the load-bearing one.** The renderer makes no
 * network requests at all — every provider call happens in the main process,
 * which is the whole reason the API key can live there and never cross the
 * bridge. Saying so in the policy turns an architectural fact into an enforced
 * one: even if something did reach the renderer, it has nowhere to send what it
 * found. It is the natural completion of "the key never enters the renderer".
 *
 * `style-src` keeps `'unsafe-inline'` because the chart library sets `style`
 * attributes (`ComparisonCharts.tsx`'s `LabelList`), and CSP counts those.
 * Dropping it would need a rewrite of third-party rendering for no security
 * benefit worth the churn — inline style cannot exfiltrate with `connect-src`
 * shut.
 */
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  // Build-time inline-script hashes are appended to this one; see
  // `contentSecurityPolicyPlugin` in vite.config.ts.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // The renderer talks to main over IPC and to nothing else.
  "connect-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  // Nothing here submits a form or needs a document base; both are common
  // pivots once an injection exists, and both cost nothing to close.
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];

/** The policy as a single header/meta value. */
export function contentSecurityPolicy(scriptHashes: readonly string[] = []): string {
  return CSP_DIRECTIVES.map((directive) =>
    directive.startsWith("script-src") && scriptHashes.length > 0
      ? `${directive} ${scriptHashes.map((hash) => `'${hash}'`).join(" ")}`
      : directive,
  ).join("; ");
}
