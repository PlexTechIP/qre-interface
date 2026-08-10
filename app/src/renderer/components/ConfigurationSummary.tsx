import { useState } from "react";

import type { FormState } from "../state/formState";
import { advancedConfigDetails, summarizeFormState } from "./configSummaryFields";

interface ConfigurationSummaryProps {
  state: FormState;
  generatedName: string;
  qreVersion: string;
}

/**
 * Read-only configuration summary at the bottom of the form. A flat, curated
 * recap of the draft's headline facts, with an expandable panel that breaks out
 * every value — the same shape and visuals as the results page's summary, so a
 * draft and its saved run read identically. The run name lives in its own
 * control beneath this (see RunNameSection), so it is not repeated here.
 */
export function ConfigurationSummary({
  state,
  generatedName,
  qreVersion,
}: ConfigurationSummaryProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const summaryItems = summarizeFormState(state);
  const advancedGroups = advancedConfigDetails(state, generatedName, qreVersion);

  return (
    <div className="config-summary">
      <header className="form-section__head">
        <h2 id="summary-heading" className="form-section__title">
          Configuration Summary
        </h2>
      </header>

      <dl className="config-grid">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <details
        className="advanced-details"
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="advanced-details__summary">Advanced details</summary>
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
    </div>
  );
}
