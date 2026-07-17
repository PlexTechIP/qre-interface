import {
  MAGIC_STATE_FACTORY_IDS,
  type MagicStateFactoryId,
} from "../../shared/types";
import { MAGIC_STATE_FACTORY_LABELS } from "../constants/labels";
import { RadioGroup } from "./RadioGroup";

interface MagicStateFactorySectionProps {
  value: MagicStateFactoryId;
  /** Whether Litinski19 is currently selectable (GateBased, error rate <= 1e-3). */
  allowed: boolean;
  onChange: (value: MagicStateFactoryId) => void;
}

const LITINSKI19_REASON =
  "Needs Superconducting hardware with error rate ≤ 1e-3. Using Round-Based instead.";

/**
 * Input 4 — Magic State Factory. Litinski19 auto-disables (with a visible
 * reason) and falls back to Round-Based unless the architecture qualifies.
 */
export function MagicStateFactorySection({
  value,
  allowed,
  onChange,
}: MagicStateFactorySectionProps): React.JSX.Element {
  return (
    <section className="form-section" aria-labelledby="factory-heading">
      <h2 id="factory-heading" className="form-section__title">
        4 · Magic State Factory
      </h2>
      <p className="form-section__intro">
        Litinski19 needs better qubits, but its factories are cheaper to run.
      </p>
      <RadioGroup
        legend="Factory"
        name="magic-state-factory"
        value={value}
        options={MAGIC_STATE_FACTORY_IDS.map((id) => {
          const isLitinski = id === "litinski19";
          return {
            value: id,
            label: MAGIC_STATE_FACTORY_LABELS[id],
            disabled: isLitinski && !allowed,
            description: isLitinski
              ? "Cheaper factories; requires low error rate"
              : "Works with any architecture",
            disabledReason: isLitinski ? LITINSKI19_REASON : undefined,
          };
        })}
        onChange={onChange}
      />
    </section>
  );
}
