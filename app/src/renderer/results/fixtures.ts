import type { ResultsAreaProps, RunConfig, RunResult } from "../../shared/types";
import benchmarkConfig from "../../../../contracts/fixtures/runconfig.benchmark.json";
import failingConfig from "../../../../contracts/fixtures/runconfig.failing.json";
import largeConfig from "../../../../contracts/fixtures/runconfig.large.json";
import sparseConfig from "../../../../contracts/fixtures/runconfig.sparse.json";
import failedResult from "../../../../contracts/fixtures/runresult.failed.json";
import largeResult from "../../../../contracts/fixtures/runresult.success-large.json";
import sparseResult from "../../../../contracts/fixtures/runresult.success-sparse.json";
import successResult from "../../../../contracts/fixtures/runresult.success.json";

export interface FixtureScenario extends ResultsAreaProps {
  id: FixtureScenarioId;
  label: string;
}

export type FixtureScenarioId = "idle" | "running" | "success" | "large" | "sparse" | "failed";

const configs = {
  benchmark: benchmarkConfig as RunConfig,
  failing: failingConfig as RunConfig,
  large: largeConfig as RunConfig,
  sparse: sparseConfig as RunConfig,
};

const results = {
  failed: failedResult as RunResult,
  large: largeResult as RunResult,
  sparse: sparseResult as RunResult,
  success: successResult as RunResult,
};

export const FIXTURE_SCENARIOS = [
  {
    id: "idle",
    label: "Empty / no run",
    phase: "idle",
    result: null,
    config: null,
  },
  {
    id: "running",
    label: "Running",
    phase: "running",
    result: null,
    config: configs.benchmark,
  },
  {
    id: "success",
    label: "Success / multi-row frontier",
    phase: "done",
    result: results.success,
    config: configs.benchmark,
  },
  {
    id: "large",
    label: "Formatting stress",
    phase: "done",
    result: results.large,
    config: configs.large,
  },
  {
    id: "sparse",
    label: "Sparse / one-row frontier",
    phase: "done",
    result: results.sparse,
    config: configs.sparse,
  },
  {
    id: "failed",
    label: "Failed",
    phase: "done",
    result: results.failed,
    config: configs.failing,
  },
] as const satisfies readonly FixtureScenario[];

export const DEFAULT_FIXTURE_SCENARIO = FIXTURE_SCENARIOS[0];
