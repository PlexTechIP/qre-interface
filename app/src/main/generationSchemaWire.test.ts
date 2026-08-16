// @vitest-environment node

import { describe, expect, it } from "vitest";

import generationSchema from "../shared/contracts/runconfig-generation.schema.json" with { type: "json" };
import { GENERATION_FIELD_GUIDE, WIRE_GENERATION_SCHEMA } from "./generationSchemaWire.js";

function countDescribed(node: unknown, total = { n: 0 }): number {
  if (Array.isArray(node)) {
    node.forEach((entry) => countDescribed(entry, total));
    return total.n;
  }
  if (typeof node !== "object" || node === null) return total.n;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "description" && typeof value === "string") total.n += 1;
    countDescribed(value, total);
  }
  return total.n;
}

describe("generation schema wire split", () => {
  /**
   * The reason this module exists. Descriptions are compiled into the decoding
   * grammar and a live request was rejected with "the compiled grammar is too
   * large"; as prompt text the same guidance costs only input tokens.
   */
  it("sends no description or title to the provider", () => {
    const wire = JSON.stringify(WIRE_GENERATION_SCHEMA);

    expect(wire).not.toContain('"description"');
    expect(wire).not.toContain('"title"');
    expect(wire.length).toBeLessThan(JSON.stringify(generationSchema).length);
  });

  it("keeps the structure the model must satisfy", () => {
    // Stripping prose must not strip meaning: the closed-object rules, the
    // discriminated unions and the enums all still have to be on the wire.
    expect(WIRE_GENERATION_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    const properties = WIRE_GENERATION_SCHEMA["properties"] as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(
      Object.keys(generationSchema.properties).sort(),
    );
    expect(JSON.stringify(WIRE_GENERATION_SCHEMA)).toContain("grovers-search");
  });

  /**
   * The guarantee that makes the split safe: both halves come from one file, so
   * a description added to the schema cannot be forgotten in the prompt.
   */
  it("relocates every description into the field guide, none lost", () => {
    const described = countDescribed(generationSchema);

    expect(described).toBeGreaterThan(40);
    expect(GENERATION_FIELD_GUIDE.split("\n").filter(Boolean)).toHaveLength(described);
  });

  it("qualifies union branches so bounds are not read as contradictory", () => {
    // Three architectures each describe a "measurement time"; unqualified, the
    // guidance would read as three conflicting rules for one field.
    expect(GENERATION_FIELD_GUIDE).toContain("architecture(gateBased).");
    expect(GENERATION_FIELD_GUIDE).toContain("architecture(neutralAtom).");
    expect(GENERATION_FIELD_GUIDE).toContain("application(manualCounts).");
  });

  /**
   * The `parameters` union is the one that actually needed this, and the one
   * that silently did not get it: its branches carry no `type` field, so every
   * one of the six was addressed as `parameters(variant)`.
   *
   * `generator` is the proof. It belongs to two branches with two different
   * companions — Shor's `bitSize` and Ekera-Hastad's `rsaInstance` — so under
   * one shared label the guide stated the same path twice and left the model to
   * infer which factoring routine a bound belonged to from prose alone.
   */
  it("qualifies the parameters branches, which carry no type discriminator", () => {
    expect(GENERATION_FIELD_GUIDE).not.toContain("parameters(variant)");

    expect(GENERATION_FIELD_GUIDE).toContain(
      "- parameters(Grover's search).searchQubits:",
    );
    expect(GENERATION_FIELD_GUIDE).toContain("- parameters(Shor's factoring).generator:");
    expect(GENERATION_FIELD_GUIDE).toContain(
      "- parameters(Ekera-Hastad factoring).generator:",
    );
  });

  /**
   * Every described field is reachable by a path that names exactly one field.
   * The `parameters(variant)` collapse made six branches share one prefix,
   * which this catches whatever union it happens to next.
   */
  it("gives every guide line a distinct field path", () => {
    const paths = GENERATION_FIELD_GUIDE.split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2, line.indexOf(":")));

    expect(new Set(paths).size).toBe(paths.length);
  });
});
