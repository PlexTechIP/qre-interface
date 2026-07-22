import { QEC_LABELS } from "../constants/labels";
import { deriveQecCode, type ArchitectureForm } from "../state/formState";

interface QecSectionProps {
  architecture: ArchitectureForm;
}

const WHY: Record<ArchitectureForm["type"], string> = {
  gateBased: "Superconducting hardware is corrected with the Surface Code.",
  majorana: "Majorana hardware is corrected with the Three-Aux code.",
};

/** Input 3 — Error Correction Code. Derived, read-only, with a one-line why. */
export function QecSection({ architecture }: QecSectionProps): React.JSX.Element {
  const code = deriveQecCode(architecture);
  return (
    <section className="form-section" aria-labelledby="qec-heading">
      <h2 id="qec-heading" className="form-section__title">
        3 · Error Correction Code
      </h2>
      <div className="derived-field">
        <span className="derived-field__value">{QEC_LABELS[code]}</span>
        <span className="derived-field__badge">Derived</span>
      </div>
      <p className="form-section__intro">{WHY[architecture.type]}</p>
    </section>
  );
}
