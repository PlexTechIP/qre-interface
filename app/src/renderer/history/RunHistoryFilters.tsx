import { useMemo } from "react";
 
import {
  applicationKey,
  type RunFilter,
  type RunRecord,
} from "../../shared/types";
import { findBenchmark } from "../constants/staticOptions";
import { ARCHITECTURE_LABELS, FACTORY_LABELS, QEC_LABELS } from "./historyLabels";
 
/**
 * The Run History search + filter bar — a PURE function of the full record set
 * + the current filter + a change callback. It produces a `RunFilter` object;
 * the container re-queries the store with it (query semantics live in the
 * contract's queryRunRecords, not here).
 *
 * Option lists derive from `allRecords` (the whole set, NOT the filtered view),
 * so a dropdown always offers every value that exists in some record and never
 * shrinks as filters combine. Nothing here is hardcoded from the enums — an
 * option appears only if a record actually uses it (per the SOW).
 */
 
export interface RunHistoryFiltersProps {
  /** The full, unfiltered record set — the source of every dropdown's options. */
  allRecords: RunRecord[];
  filter: RunFilter;
  onFilterChange: (next: RunFilter) => void;
}
 
interface Option {
  value: string;
  label: string;
}
 
/** Distinct values present across the records, as {value,label}, stable-sorted by label. */
function distinct(
  records: RunRecord[],
  pick: (record: RunRecord) => string,
  label: (value: string) => string,
): Option[] {
  const values = new Set<string>();
  for (const record of records) values.add(pick(record));
  return [...values]
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
 
/** `distinct` for a field that is a SET on each record: every member counts. */
function distinctMany(
  records: RunRecord[],
  pick: (record: RunRecord) => readonly string[],
  label: (value: string) => string,
): Option[] {
  const values = new Set<string>();
  for (const record of records) for (const value of pick(record)) values.add(value);
  return [...values]
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function applicationLabel(key: string): string {
  if (key.startsWith("uploaded:")) {
    return `Uploaded: ${key.slice("uploaded:".length).split(/[\\/]/).pop()}`;
  }
  return findBenchmark(key)?.name ?? key;
}
 
export function RunHistoryFilters({ allRecords, filter, onFilterChange }: RunHistoryFiltersProps) {
  const applicationOptions = useMemo(
    () => distinct(allRecords, (r) => applicationKey(r.config), applicationLabel),
    [allRecords],
  );
  const architectureOptions = useMemo(
    () => distinct(allRecords, (r) => r.config.architecture.type, (v) => ARCHITECTURE_LABELS[v] ?? v),
    [allRecords],
  );
  const qecOptions = useMemo(
    () => distinct(allRecords, (r) => r.config.qecCode, (v) => QEC_LABELS[v] ?? v),
    [allRecords],
  );
  const factoryOptions = useMemo(
    // A run can now use several factories, so it contributes each of them to the
    // option list — and the filter matches runs that used the chosen one.
    () => distinctMany(allRecords, (r) => r.config.magicStateFactories, (v) => FACTORY_LABELS[v] ?? v),
    [allRecords],
  );
  const versionOptions = useMemo(
    // Authoritative engine version is result.qreVersion, not config.qreVersion.
    () => distinct(allRecords, (r) => r.result.qreVersion, (v) => v),
    [allRecords],
  );
 
  /**
   * Set (or clear) one filter key. An empty value removes the key entirely
   * rather than setting it to `undefined` — under exactOptionalPropertyTypes an
   * explicit `undefined` is rejected, and an omitted key is the correct
   * "no constraint" signal the contract's matcher expects.
   */
  const setKey = <K extends keyof RunFilter>(key: K, value: string) => {
    const next: RunFilter = { ...filter };
    if (value) {
      next[key] = value as RunFilter[K];
    } else {
      delete next[key];
    }
    onFilterChange(next);
  };
 
  return (
    <section className="panel filter-bar" aria-label="Search and filter runs">
      <div className="filter-field">
        <label htmlFor="filter-name">Search run name</label>
        <input
          id="filter-name"
          type="search"
          placeholder="Search runs…"
          value={filter.nameSearch ?? ""}
          onChange={(e) => setKey("nameSearch", e.target.value)}
        />
      </div>
 
      <Dropdown
        id="filter-application"
        label="Application"
        value={filter.application ?? ""}
        options={applicationOptions}
        onChange={(v) => setKey("application", v)}
      />
      <Dropdown
        id="filter-architecture"
        label="Architecture"
        value={filter.architecture ?? ""}
        options={architectureOptions}
        onChange={(v) => setKey("architecture", v)}
      />
      <Dropdown
        id="filter-qec"
        label="QEC Code"
        value={filter.qecCode ?? ""}
        options={qecOptions}
        onChange={(v) => setKey("qecCode", v)}
      />
      <Dropdown
        id="filter-factory"
        label="Factory"
        value={filter.magicStateFactory ?? ""}
        options={factoryOptions}
        onChange={(v) => setKey("magicStateFactory", v)}
      />
      <Dropdown
        id="filter-version"
        label="QRE Version"
        value={filter.qreVersion ?? ""}
        options={versionOptions}
        onChange={(v) => setKey("qreVersion", v)}
      />
    </section>
  );
}
 
interface DropdownProps {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}
 
function Dropdown({ id, label, value, options, onChange }: DropdownProps) {
    return (
      <div className="filter-field">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">All</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
