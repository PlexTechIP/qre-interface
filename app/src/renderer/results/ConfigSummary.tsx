import { useState } from "react";

import type { ResultsAreaProps } from "../../shared/types";
import { advancedConfigDetails, summarizeConfig } from "./resultFields";

interface ConfigSummaryProps {
  config: ResultsAreaProps["config"];
}

export function ConfigSummary({ config }: ConfigSummaryProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const summaryItems = summarizeConfig(config);
  // The exhaustive breakdown needs a real config; the seven-row recap above
  // renders "Unknown" without one, but there is nothing to expand into.
  const advancedGroups = config ? advancedConfigDetails(config) : null;

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

      {advancedGroups ? (
        <details
          className="advanced-details"
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="advanced-details__summary">
            Advanced details
          </summary>
          {advancedOpen ? (
          <div className="advanced-details__body">
            {advancedGroups.map((group) => (
              <div key={group.title} className="advanced-details__group">
                <h3 className="advanced-details__group-title">{group.title}</h3>
                <dl className="config-grid">
                  {group.items.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
