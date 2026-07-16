import type { FactoryUse, FieldMetric } from "../../shared/types";

const COMPACT_UNITS = [
  { value: 1_000_000_000_000, suffix: "T" },
  { value: 1_000_000_000, suffix: "B" },
  { value: 1_000_000, suffix: "M" },
  { value: 1_000, suffix: "k" },
] as const;

const TIME_UNITS = [
  { unit: "yr", ns: 365 * 24 * 60 * 60 * 1_000_000_000 },
  { unit: "hr", ns: 60 * 60 * 1_000_000_000 },
  { unit: "min", ns: 60 * 1_000_000_000 },
  { unit: "s", ns: 1_000_000_000 },
  { unit: "ms", ns: 1_000_000 },
  { unit: "µs", ns: 1_000 },
  { unit: "ns", ns: 1 },
] as const;

interface FormatMetricOptions {
  notation?: "standard" | "compact";
}

export function formatMetric(metric: FieldMetric | null | undefined, options: FormatMetricOptions = {}): string {
  if (!metric) {
    return "—";
  }

  const { value, unit } = metric;

  if (isFactoryUseArray(value)) {
    return formatFactories(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  if (unit === "ns") {
    return formatTimeFromNs(value);
  }

  if (unit === "probability") {
    return formatProbability(value);
  }

  if (options.notation === "compact") {
    return formatCompactNumber(value);
  }

  return formatStandardNumber(value);
}

export function formatStandardNumber(value: number): string {
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: shouldShowDecimals(value) ? 2 : 0,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }

  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const compactUnit = COMPACT_UNITS.find((candidate) => absoluteValue >= candidate.value);

  if (!compactUnit) {
    return `${sign}${trimTrailingZeros(absoluteValue.toFixed(absoluteValue < 10 ? 2 : 1))}`;
  }

  return `${sign}${trimTrailingZeros((absoluteValue / compactUnit.value).toFixed(1))}${compactUnit.suffix}`;
}

export function formatTimeFromNs(nanoseconds: number): string {
  if (Object.is(nanoseconds, -0) || nanoseconds === 0) {
    return "0 ns";
  }

  const sign = nanoseconds < 0 ? "-" : "";
  const absoluteNs = Math.abs(nanoseconds);
  const selectedUnit = TIME_UNITS.find((candidate) => absoluteNs >= candidate.ns) ?? { unit: "ns", ns: 1 };
  const promotedValue = absoluteNs / selectedUnit.ns;

  return `${sign}${formatPromotedNumber(promotedValue)} ${selectedUnit.unit}`;
}

export function formatProbability(value: number): string {
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }

  const absoluteValue = Math.abs(value);

  if (absoluteValue < 0.001 || absoluteValue >= 1_000_000) {
    return formatScientific(value);
  }

  return formatStandardNumber(value);
}

export function formatScientific(value: number): string {
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }

  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${trimTrailingZeros(mantissa.toFixed(2))}e${exponent}`;
}

export function formatFactories(factories: readonly FactoryUse[]): string {
  if (factories.length === 0) {
    return "none";
  }

  return factories.map((factory) => `${formatStandardNumber(factory.copies)} x ${factory.stateType}`).join(", ");
}

function isFactoryUseArray(value: unknown): value is FactoryUse[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "stateType" in item &&
        "copies" in item &&
        typeof item.stateType === "string" &&
        typeof item.copies === "number",
    )
  );
}

function shouldShowDecimals(value: number): boolean {
  return Math.abs(value) > 0 && Math.abs(value) < 100;
}

function formatPromotedNumber(value: number): string {
  if (value >= 100) {
    return trimTrailingZeros(value.toFixed(0));
  }

  if (value >= 10) {
    return trimTrailingZeros(value.toFixed(1));
  }

  return trimTrailingZeros(value.toFixed(2));
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
