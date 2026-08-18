// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { AGENT_NAME_PREFIX, withAgentPrefix } from "./runNaming";

describe("withAgentPrefix", () => {
  it("marks a name as model-authored", () => {
    expect(withAgentPrefix("Grover search")).toBe("(agent) Grover search");
  });

  /**
   * A Rerun loads a saved name that already carries the prefix and stamps
   * provenance again, so a naive prefix would name the third run of one
   * configuration "(agent) (agent) (agent) Grover search".
   */
  it("does not stack on a name that already carries it", () => {
    expect(withAgentPrefix("(agent) Grover search")).toBe("(agent) Grover search");
    expect(withAgentPrefix(withAgentPrefix(withAgentPrefix("Grover")))).toBe(
      "(agent) Grover",
    );
  });

  it("trims, so a padded name does not read as un-prefixed", () => {
    expect(withAgentPrefix("  Grover  ")).toBe("(agent) Grover");
    expect(withAgentPrefix("  (agent) Grover")).toBe("(agent) Grover");
  });

  it("degrades to the marker alone rather than to a dangling space", () => {
    expect(withAgentPrefix("   ")).toBe(AGENT_NAME_PREFIX);
  });
});

/**
 * The prefix test alone said "(agent)Grover" was already marked, so it came
 * back with the marker running into the name. Stripping and reapplying makes
 * the output shape the same whatever the input shape was.
 */
describe("withAgentPrefix — the separator", () => {
  it("normalises a marker with no space after it", () => {
    expect(withAgentPrefix("(agent)Grover search")).toBe("(agent) Grover search");
  });

  it("normalises extra space after the marker", () => {
    expect(withAgentPrefix("(agent)    Grover search")).toBe("(agent) Grover search");
  });

  it("still leaves a correctly separated name untouched", () => {
    expect(withAgentPrefix("(agent) Grover search")).toBe("(agent) Grover search");
  });

  it("does not mistake a longer word for the marker", () => {
    expect(withAgentPrefix("(agentic) Grover")).toBe("(agent) (agentic) Grover");
  });
});
