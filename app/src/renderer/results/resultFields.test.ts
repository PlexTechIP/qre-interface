import { describe, expect, it } from "vitest";

import { buildFrontierRow, buildRunConfig } from "../../shared/testing";
import { getAdditionalFieldDefinitions, summarizeConfig } from "./resultFields";

describe("renamed configuration labels", () => {
  it("uses the approved max-error label in the shared Results/History summary", () => {
    const labels = summarizeConfig(buildRunConfig(), "qdk-test").map(
      (item) => item.label,
    );

    expect(labels).toContain("Total Fault Tolerant Execution Error");
    expect(labels).not.toContain("Max Error");
  });

  it("uses the approved T-count label for the reported rotation field", () => {
    const definitions = getAdditionalFieldDefinitions([
      buildFrontierRow({
        additional: {
          numTsPerRotation: {
            value: 20,
            unit: "T states",
            display: "20",
          },
        },
      }),
    ]);

    expect(definitions).toContainEqual(
      expect.objectContaining({
        key: "numTsPerRotation",
        label: "T Count Per Rotation",
      }),
    );
  });
});
