import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScientificSceneManifest } from "@math3d/core";
import { scientificExplorerEligibility } from "./scientificExplorerEligibility";

const manifest = (directory: string) => {
  const parsed = parseScientificSceneManifest(readFileSync(resolve(directory, "manifest.json"), "utf8"));
  if (!parsed.ok) throw new Error(parsed.errors.join(" "));
  return parsed.value;
};

describe("Field Explorer dataset eligibility", () => {
  it("recognizes all three bundled 3D vector scenes", () => {
    for (const directory of ["tests/fixtures/scientific-scene/vortex-volume.sscene",
      "output/scientific-vortex-80-overview.sscene",
      "output/scientific-burgers-horizontal-level1.sscene"]) {
      const source = manifest(directory);
      expect(source.datasets.map(dataset => scientificExplorerEligibility(source, dataset)))
        .toEqual([expect.objectContaining({ ready: true, timeUnit: "s" })]);
    }
  });

  it("explains why 3D scalar and 2D vector scenes cannot open as 3D vectors", () => {
    const scalar = manifest("tests/fixtures/scientific-scene/quadratic-volume.sscene");
    expect(scientificExplorerEligibility(scalar, scalar.datasets[0]!))
      .toMatchObject({ ready: false, reason: "Explorer requires three vector components." });
    const planar = manifest("tests/fixtures/scientific-scene/vortex-flow.sscene");
    expect(scientificExplorerEligibility(planar, planar.datasets[0]!))
      .toMatchObject({ ready: false, reason: "Requires three spatial axes." });
  });
});
