import type { RunConfig } from "../../shared/types";

interface RunConfigInspectorProps {
  /** The serialized config, or null when the draft isn't structurally complete. */
  config: RunConfig | null;
  /** Whether `config` passes the committed JSON Schema. Only meaningful when config is non-null. */
  valid: boolean;
  title: string;
  /** Note under the summary — e.g. why the config is a preview vs. the stamped run. */
  note?: string | undefined;
}

/**
 * Dev inspector: shows the live serialized RunConfig so it's provable the draft
 * validates against the contract schema at Run. Collapsed by default.
 */
export function RunConfigInspector({
  config,
  valid,
  title,
  note,
}: RunConfigInspectorProps): React.JSX.Element {
  const badge =
    config === null
      ? { text: "incomplete", cls: "config-inspector__badge--incomplete" }
      : valid
        ? { text: "schema-valid", cls: "config-inspector__badge--valid" }
        : { text: "schema-invalid", cls: "config-inspector__badge--invalid" };

  return (
    <details className="config-inspector">
      <summary className="config-inspector__summary">
        <span>{title}</span>
        <span className={`config-inspector__badge ${badge.cls}`}>{badge.text}</span>
      </summary>
      {note && <p className="config-inspector__note">{note}</p>}
      <pre className="config-inspector__json">
        {config === null
          ? "// Draft is not yet structurally complete — fill the required fields."
          : JSON.stringify(config, null, 2)}
      </pre>
    </details>
  );
}
