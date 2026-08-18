import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Assistant prose, rendered as markdown.
 *
 * It could not be, until M3. The reply used to be a string field inside a
 * strict JSON envelope, so the system prompt forbade markdown outright —
 * formatting inside a JSON string value is noise the analyst reads literally.
 * With the draft moved to a tool call the prose is just prose, and a model
 * explaining a trade-off reaches for a short list or an emphasised value the
 * way anyone would.
 *
 * `react-markdown` produces React elements — there is no `innerHTML` anywhere
 * in this path — and the component map below is an allow-list rather than a
 * theme: anything not named here still renders, but nothing renders as an
 * image, an iframe or a raw HTML block, because no `rehype-raw` is configured
 * and images are mapped away explicitly. That matters more than usual here:
 * this is the one surface in the app that renders text a third party wrote.
 */

/**
 * What each element becomes. Two of these are security decisions rather than
 * styling ones, and are commented as such.
 */
const COMPONENTS: Components = {
  /*
   * A link is text, not a link.
   *
   * The renderer's CSP is `connect-src 'none'` and there is no navigation
   * surface here, but a model-authored `<a href>` inside a transcript is a
   * click target whose destination the analyst did not choose — and this app
   * has no business opening one. The label survives; the href does not.
   */
  a: ({ children }) => <span className="chat-md__link">{children}</span>,
  /*
   * An image is its alt text.
   *
   * A remote `<img src>` would be an outbound request from a renderer whose
   * whole security posture is that it makes none, and would leak the fact that
   * this transcript was read to whoever the model named.
   */
  img: ({ alt }) => <span className="chat-md__image">{alt ?? "[image]"}</span>,
  // Wide content scrolls inside itself rather than stretching the transcript.
  table: ({ children }) => (
    <div className="chat-md__table-scroll">
      <table className="chat-md__table">{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre className="chat-md__pre">{children}</pre>,
};

export function AssistantProse({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="chat-turn__text chat-md">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
