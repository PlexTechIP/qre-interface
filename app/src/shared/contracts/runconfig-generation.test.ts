import Ajv from "ajv";
import { describe, expect, it } from "vitest";

import type { GeneratedRunDraft } from "../agentTypes";
import { editableParams } from "../benchmarkParams";
import { BENCHMARK_IDS, type BenchmarkId } from "../types";
import canonicalSchema from "./runconfig.schema.json";
import generationSchema from "./runconfig-generation.schema.json";
import {
  APP_CONTROLLED_CANONICAL_PATHS,
  EXCLUDED_CANONICAL_PATHS,
  GENERATED_CANONICAL_PATHS,
} from "./runconfigGenerationCoverage";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function variants(node: JsonObject): unknown[] {
  return ["oneOf", "anyOf"].flatMap((keyword) => {
    const value = node[keyword];
    return Array.isArray(value) ? value : [];
  });
}

/** Collect property leaves while merging discriminated-union branches by path. */
function collectPropertyLeaves(
  value: unknown,
  prefix = "",
  leaves = new Set<string>(),
): Set<string> {
  const node = asObject(value);
  if (node === null) {
    if (prefix) leaves.add(prefix);
    return leaves;
  }

  const properties = asObject(node["properties"]);
  if (properties !== null) {
    for (const [key, child] of Object.entries(properties)) {
      collectPropertyLeaves(child, prefix ? `${prefix}.${key}` : key, leaves);
    }
    return leaves;
  }

  const branches = variants(node);
  const structuredBranches = branches.filter((branch) => {
    const candidate = asObject(branch);
    return (
      candidate !== null &&
      (asObject(candidate["properties"]) !== null ||
        variants(candidate).length > 0)
    );
  });
  if (structuredBranches.length > 0) {
    for (const branch of structuredBranches) {
      collectPropertyLeaves(branch, prefix, leaves);
    }
    return leaves;
  }

  if (prefix) leaves.add(prefix);
  return leaves;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function collectKeywordPaths(
  value: unknown,
  wanted: ReadonlySet<string>,
  path = "$",
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectKeywordPaths(entry, wanted, `${path}[${index}]`, found),
    );
    return found;
  }

  const node = asObject(value);
  if (node === null) return found;
  for (const [key, child] of Object.entries(node)) {
    if (wanted.has(key)) found.push(`${path}.${key}`);
    collectKeywordPaths(child, wanted, `${path}.${key}`, found);
  }
  return found;
}

function collectUnexpectedSchemaKeywords(
  value: unknown,
  allowed: ReadonlySet<string>,
  path = "$",
  found: string[] = [],
): string[] {
  const node = asObject(value);
  if (node === null) return found;

  for (const [key, child] of Object.entries(node)) {
    if (!allowed.has(key)) found.push(`${path}.${key}`);

    if (key === "properties") {
      const properties = asObject(child);
      if (properties !== null) {
        for (const [propertyName, propertySchema] of Object.entries(
          properties,
        )) {
          collectUnexpectedSchemaKeywords(
            propertySchema,
            allowed,
            `${path}.properties.${propertyName}`,
            found,
          );
        }
      }
      continue;
    }

    if (Array.isArray(child)) {
      child.forEach((entry, index) =>
        collectUnexpectedSchemaKeywords(
          entry,
          allowed,
          `${path}.${key}[${index}]`,
          found,
        ),
      );
    } else {
      collectUnexpectedSchemaKeywords(child, allowed, `${path}.${key}`, found);
    }
  }
  return found;
}

function assertClosedObjectsRequireEveryProperty(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertClosedObjectsRequireEveryProperty);
    return;
  }

  const node = asObject(value);
  if (node === null) return;
  const properties = asObject(node["properties"]);
  if (node["type"] === "object" && properties !== null) {
    expect(node["additionalProperties"]).toBe(false);
    const required = node["required"];
    expect(Array.isArray(required)).toBe(true);
    expect(sorted((required as unknown[]).map(String))).toEqual(
      sorted(Object.keys(properties)),
    );
  }
  Object.values(node).forEach(assertClosedObjectsRequireEveryProperty);
}

function generationProperties(): JsonObject {
  const properties = asObject(generationSchema.properties);
  if (properties === null)
    throw new Error("Generation schema has no properties.");
  return properties;
}

const KNOWN_PARAMETER_KEYS = new Set(
  BENCHMARK_IDS.flatMap((benchmarkId) =>
    editableParams(benchmarkId).map((parameter) => parameter.key),
  ),
);

const VALID_GENERATED_DRAFT = {
  name: null,
  application: { type: "benchmark", benchmarkId: "shors-factoring" },
  architecture: {
    type: "gateBased",
    errorRate: 0.0001,
    gateTime: 50,
    measurementTime: 100,
    twoQubitGateTime: null,
  },
  magicStateFactories: ["round_based"],
  secondaryFactories: [],
  memoryOptimization: "none",
  parameters: {
    bitSize: 31,
    generator: 11,
    rsaInstance: null,
    latticeN1: null,
    latticeN2: null,
    totalTime: null,
    trotterStep: null,
    couplingJ: null,
    fieldG: null,
    searchQubits: null,
    precision: null,
    registerSize: null,
  },
  traceTransform: {
    tStatesPerRotation: 20,
    ccxMagicStates: false,
    slowDownFactor: 1,
    dynamicMemoryCompute: null,
    unmemory: false,
  },
  maxError: 1,
} satisfies GeneratedRunDraft;

describe("lowered RunConfig generation schema", () => {
  it("uses only the documented strict-output subset shared by both providers", () => {
    const unsupported = new Set([
      "if",
      "then",
      "not",
      "allOf",
      "oneOf",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "minimum",
      "maximum",
      "format",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "uniqueItems",
      "contains",
      "pattern",
    ]);
    expect(collectKeywordPaths(generationSchema, unsupported)).toEqual([]);

    const allowed = new Set([
      "title",
      "description",
      "type",
      "properties",
      "required",
      "items",
      "enum",
      "anyOf",
      "additionalProperties",
    ]);
    expect(collectUnexpectedSchemaKeywords(generationSchema, allowed)).toEqual(
      [],
    );
  });

  it("closes every object and requires every property", () => {
    assertClosedObjectsRequireEveryProperty(generationSchema);
  });

  it("accepts a complete unstamped proposal and rejects unknown fields", () => {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      generationSchema,
    );
    expect(validate(VALID_GENERATED_DRAFT)).toBe(true);
    expect(
      validate({ ...VALID_GENERATED_DRAFT, id: crypto.randomUUID() }),
    ).toBe(false);
  });

  it("does not let the model select an uploaded program path", () => {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      generationSchema,
    );
    expect(
      validate({
        ...VALID_GENERATED_DRAFT,
        application: {
          type: "uploaded",
          filePath: "/tmp/generated.qs",
          format: "qsharp",
          addToLibrary: false,
        },
      }),
    ).toBe(false);
  });
});

describe("generation-schema drift protection", () => {
  it("classifies every canonical RunConfig leaf exactly once", () => {
    const canonicalLeaves = collectPropertyLeaves(canonicalSchema);
    const classifications = [
      ...GENERATED_CANONICAL_PATHS,
      ...APP_CONTROLLED_CANONICAL_PATHS,
      ...EXCLUDED_CANONICAL_PATHS,
    ];

    expect(new Set(classifications).size).toBe(classifications.length);
    expect(sorted(classifications)).toEqual(sorted(canonicalLeaves));
  });

  it("keeps every generated canonical field represented in the lowered schema", () => {
    const generationLeaves = collectPropertyLeaves(generationSchema);
    const canonicalizedGenerationLeaves = new Set(
      [...generationLeaves].map((path) =>
        path.startsWith("parameters.") ? "parameters" : path,
      ),
    );
    expect(sorted(canonicalizedGenerationLeaves)).toEqual(
      sorted(GENERATED_CANONICAL_PATHS),
    );
  });

  it("tracks every bundled benchmark and editable parameter", () => {
    const properties = generationProperties();
    const application = asObject(properties["application"]);
    const appBranches = application ? variants(application) : [];
    const benchmarkBranch = appBranches.map(asObject).find((branch) => {
      const branchProperties = branch ? asObject(branch["properties"]) : null;
      const type = branchProperties ? asObject(branchProperties["type"]) : null;
      return Array.isArray(type?.["enum"]) && type?.["enum"][0] === "benchmark";
    });
    const benchmarkProperties = benchmarkBranch
      ? asObject(benchmarkBranch["properties"])
      : null;
    const benchmarkId = benchmarkProperties
      ? asObject(benchmarkProperties["benchmarkId"])
      : null;
    expect(sorted((benchmarkId?.["enum"] as unknown[]).map(String))).toEqual(
      sorted(BENCHMARK_IDS),
    );

    const parameters = asObject(properties["parameters"]);
    const parameterProperties = parameters
      ? asObject(parameters["properties"])
      : null;
    expect(sorted(Object.keys(parameterProperties ?? {}))).toEqual(
      sorted(KNOWN_PARAMETER_KEYS),
    );

    for (const benchmarkIdValue of BENCHMARK_IDS) {
      const id: BenchmarkId = benchmarkIdValue;
      expect(
        editableParams(id).every((parameter) =>
          KNOWN_PARAMETER_KEYS.has(parameter.key),
        ),
      ).toBe(true);
    }
  });
});
