import { useId, type ReactNode } from "react";

interface DefinitionTipProps {
  label: string;
  children: ReactNode;
}

export function DefinitionTip({
  label,
  children,
}: DefinitionTipProps): React.JSX.Element {
  const id = useId();

  return (
    <span className="definition-tip">
      <button
        type="button"
        className="definition-tip__trigger"
        aria-label={`${label} definition`}
        aria-describedby={id}
      >
        ?
      </button>
      <span id={id} role="tooltip" className="definition-tip__bubble">
        {children}
      </span>
    </span>
  );
}
