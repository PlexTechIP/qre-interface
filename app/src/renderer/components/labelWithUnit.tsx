import type { ReactNode } from "react";

/** A trailing parenthetical: "Atom Spacing (µm)" → "Atom Spacing", "(µm)". */
const TRAILING_UNIT = /^(.*\S)\s+(\([^()]+\))$/;

/**
 * A field label with its trailing unit set apart, so the unit keeps its case.
 *
 * Some sections set labels in uppercase with CSS, and a unit is not text that
 * survives that: "ns" becomes "NS", and the micro sign in "µm" becomes a
 * capital Greek mu — the same glyph as Latin "M" — so a spacing in micrometres
 * read as millimetres. The span opts the unit out (`.field__label-unit`); the
 * label still reads as one name, because the span is inline text inside it.
 */
export function labelWithUnit(label: ReactNode): ReactNode {
  if (typeof label !== "string") return label;
  const match = TRAILING_UNIT.exec(label);
  if (match === null) return label;
  return (
    <>
      {match[1]} <span className="field__label-unit">{match[2]}</span>
    </>
  );
}
