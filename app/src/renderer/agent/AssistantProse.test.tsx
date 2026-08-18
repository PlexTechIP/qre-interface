// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantProse } from "./AssistantProse";

const html = (text: string): string => {
  const { container } = render(<AssistantProse text={text} />);
  return container.innerHTML;
};

describe("AssistantProse", () => {
  it("renders emphasis, lists and inline code the way they were written", () => {
    render(
      <AssistantProse text={"Use **gate-based** for this.\n\n- `errorRate` 1e-4\n- 20 qubits"} />,
    );

    expect(screen.getByText("gate-based").tagName).toBe("STRONG");
    expect(screen.getByText("errorRate").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a GFM table", () => {
    render(
      <AssistantProse
        text={"| Model | Qubits |\n| --- | --- |\n| Grover | 20 |"}
      />,
    );

    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Qubits" })).toBeVisible();
  });

  /**
   * This is the one surface in the app that renders text a third party wrote,
   * so what it REFUSES to render matters more than what it styles.
   */
  describe("what it will not render", () => {
    it("does not turn markup in the prose into markup on the page", () => {
      const rendered = html("<script>alert(1)</script> and <b>bold</b>");

      expect(rendered).not.toContain("<script");
      expect(rendered).not.toContain("<b>");
    });

    /**
     * The renderer's CSP is `connect-src 'none'` and there is no navigation
     * surface here, so a model-authored href is a click target whose
     * destination the analyst never chose. The label survives; the href does not.
     */
    it("keeps a link's words and drops its destination", () => {
      render(<AssistantProse text="see [the docs](https://example.com/evil)" />);

      expect(screen.getByText("the docs")).toBeVisible();
      expect(screen.queryByRole("link")).toBeNull();
      expect(html("see [the docs](https://example.com/evil)")).not.toContain("example.com");
    });

    /**
     * A remote image would be an outbound request from a renderer whose whole
     * posture is that it makes none — and would tell whoever the model named
     * that this transcript had been read.
     */
    it("reduces an image to its alt text", () => {
      const rendered = html("![a diagram](https://tracker.example/pixel.png)");

      expect(rendered).not.toContain("<img");
      expect(rendered).not.toContain("tracker.example");
      expect(screen.getByText("a diagram")).toBeVisible();
    });

    it("does not follow a javascript: url either", () => {
      const rendered = html("[click](javascript:alert(1))");

      expect(rendered).not.toContain("javascript:");
    });
  });

  /**
   * A streaming reply is rendered on every fragment, so it spends most of its
   * life as half-written markdown — an unclosed backtick, a dangling `|`.
   * Throwing on any of those would blank the transcript mid-reply.
   */
  it("renders half-finished markdown without throwing", () => {
    for (const partial of ["Use **gate", "| Model | Qub", "```ts\nconst a =", "- item\n- "]) {
      expect(() => render(<AssistantProse text={partial} />)).not.toThrow();
    }
  });

  it("renders an empty reply as nothing rather than failing", () => {
    expect(() => render(<AssistantProse text="" />)).not.toThrow();
  });
});
