import type { ResultsAreaProps } from "../../shared/types";
import { summarizeConfig } from "./resultFields";

interface ConfigSummaryProps {
  config: ResultsAreaProps["config"];
  qreVersion: string;
}

export function ConfigSummary({ config, qreVersion }: ConfigSummaryProps) {
  const summaryItems = summarizeConfig(config, qreVersion);

  return (
    <section className="panel config-summary" aria-labelledby="config-summary-title">
      <h2 id="config-summary-title">Configuration Summary</h2>
      <dl className="config-grid">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
