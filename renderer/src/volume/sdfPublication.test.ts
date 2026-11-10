import { describe, expect, it } from "vitest";
import type { VolumeDataset } from "../scene/datasets";
import { adaptDenseGridVolume } from "./infrastructure";
import { createSdfMetadata } from "./sdf";
import { publishSdfEvidence } from "./sdfPublication";

describe("SDF publication", () => {
  it("records only an applied matching output and withholds changed or preview sign values", () => {
    const grid = { dims: [2, 2, 1] as [number, number, number], scalars: new Float32Array([1, 2, 3, 4]) };
    const sign = { reliable: true, confidence: "high" as const, watertight: true, orientation: "outward" as const,
      boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, signedVolume: 1, message: "closed" };
    const metadata = createSdfMetadata({ grid, output: "signed-distance", operation: "distance", sources: [], sign,
      sourceMeshFingerprint: "mesh-pin", backend: "fixture" });
    const dataset: VolumeDataset = { kind: "volume", grid, sourceId: "sdf-a", sdf: metadata };
    const volume = adaptDenseGridVolume({ id: "sdf-a", label: "SDF", sourceLabel: "fixture", dataset, grid, tracker: new Map() });
    const current = publishSdfEvidence(dataset, volume, "mesh-pin", false);
    expect(current.publication.assessment.status).toBe("recorded");
    expect(current.csv).toContain('"signedVolume","1"');
    expect(current.reportJson).not.toContain('"scalars"');
    expect(publishSdfEvidence(dataset, volume, "mesh-pin", true).publication.assessment.status).toBe("preview");
    const historical = publishSdfEvidence(dataset, volume, "other-mesh", false);
    expect(historical.publication.summary).toBeNull();
    expect(JSON.parse(historical.reportJson).sign).toBeNull();
    grid.scalars[0] = 9;
    expect(publishSdfEvidence(dataset, volume, "mesh-pin", false).publication.assessment.status).toBe("withheld");
  });
});
