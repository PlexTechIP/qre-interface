// @vitest-environment jsdom
/**
 * Units inside field labels keep their case.
 *
 * The QPU and micro-architecture sections set their labels in uppercase with
 * CSS. Uppercasing a unit changes what it says: "ns" read as "NS", and the
 * micro sign in "µm" became a capital Greek mu — the same glyph as Latin "M" —
 * so "Atom Spacing (µm)" was displayed as "ATOM SPACING (MM)", a unit a
 * thousand times larger than the one the field expects.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Field } from "./Field";
import { NumberField } from "./NumberField";

afterEach(cleanup);

const stylesheet = readFileSync(path.join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("a unit in a field label", () => {
  it("is set apart from the label text in a NumberField", () => {
    render(
      <NumberField id="atom-spacing" label="Atom Spacing (µm)" value={3} onChange={() => {}} />,
    );

    const unit = document.querySelector(".field__label-unit");
    expect(unit).toHaveTextContent("(µm)");
    // The label still reads as one name to assistive technology.
    expect(screen.getByRole("textbox", { name: "Atom Spacing (µm)" })).toBeInTheDocument();
  });

  it("is set apart from the label text in a Field", () => {
    render(
      <Field id="gate-time" label="Single-Qubit Gate Time (ns)">
        <input id="gate-time" />
      </Field>,
    );

    expect(document.querySelector(".field__label-unit")).toHaveTextContent("(ns)");
    expect(
      screen.getByRole("textbox", { name: "Single-Qubit Gate Time (ns)" }),
    ).toBeInTheDocument();
  });

  it("leaves a label with no unit as plain text", () => {
    render(<NumberField id="rydberg-error" label="Rydberg Error" value={0.001} onChange={() => {}} />);

    expect(document.querySelector(".field__label-unit")).toBeNull();
  });

  it("is exempt from the uppercase label style", () => {
    const rule = /\.field__label-unit\s*\{[^}]*text-transform:\s*none/;
    expect(stylesheet).toMatch(rule);
  });
});
