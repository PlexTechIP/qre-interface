import { humanizeKey } from "./resultFields";

interface RawExplorerProps {
  raw: Record<string, unknown> | null;
}

export function RawExplorer({ raw }: RawExplorerProps) {
  const groups = raw ? Object.entries(raw) : [];

  return (
    <section className="panel raw-explorer" aria-labelledby="raw-explorer-title">
      <div className="panel-header">
        <div>
          <h2 id="raw-explorer-title">Full Engine Output</h2>
          <p>Everything the QRE engine reported for this run, verbatim — nothing here is filtered.</p>
        </div>
      </div>
      {raw === null ? (
        <p className="muted raw-empty-note">
          No raw output was produced for this run — the engine returned nothing to report (a TIMEOUT or
          ENGINE_CRASH failure).
        </p>
      ) : groups.length === 0 ? (
        <p className="muted raw-empty-note">The engine returned an empty output object for this run.</p>
      ) : (
        <div className="raw-groups">
          {groups.map(([key, value]) => (
            <details key={key} className="raw-group" open>
              <summary>{humanizeKey(key)}</summary>
              <div className="raw-group-body">
                <JsonNode value={value} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function JsonNode({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="raw-scalar raw-empty-value">[ ] (empty list)</span>;
    }

    return (
      <ol className="raw-list">
        {value.map((item, index) => (
          <li key={index}>
            <JsonEntry label={`[${index}]`} value={item} />
          </li>
        ))}
      </ol>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return <span className="raw-scalar raw-empty-value">{"{ } (empty object)"}</span>;
    }

    return (
      <ul className="raw-object">
        {entries.map(([key, entryValue]) => (
          <li key={key}>
            <JsonEntry label={key} value={entryValue} />
          </li>
        ))}
      </ul>
    );
  }

  return <JsonScalar value={value} />;
}

function JsonEntry({ label, value }: { label: string; value: unknown }) {
  if (isExpandable(value)) {
    return (
      <details className="raw-node">
        <summary>{label}</summary>
        <JsonNode value={value} />
      </details>
    );
  }

  return (
    <div className="raw-leaf">
      <span className="raw-key">{label}</span>
      <JsonScalar value={value} />
    </div>
  );
}

function JsonScalar({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="raw-scalar raw-null">null</span>;
  }

  if (value === undefined) {
    return <span className="raw-scalar raw-null">undefined</span>;
  }

  if (typeof value === "string") {
    return <span className="raw-scalar raw-string">{`"${value}"`}</span>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="raw-scalar raw-number">{String(value)}</span>;
  }

  return <span className="raw-scalar">{String(value)}</span>;
}

function isExpandable(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return isPlainObject(value) && Object.keys(value).length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
