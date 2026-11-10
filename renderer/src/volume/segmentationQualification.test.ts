import { describe, expect, it } from "vitest";
import { adaptDenseGridVolume } from "./infrastructure";
import { connectedComponentsLabelMap, thresholdVolumeMask } from "./segmentation";
import { qualifyVolumeSegmentation } from "./segmentationQualification";

describe("Volume segmentation qualification", () => {
  it("binds preview and applied labels to the exact source grid and threshold", () => {
    const grid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]) };
    const tracker = new Map();
    const makeSource = (now: number) => adaptDenseGridVolume({ id: "labels", label: "Labels", sourceLabel: "fixture", dataset: { kind: "volume", grid }, grid, tracker, now });
    const source = makeSource(1);
    const mask = thresholdVolumeMask(grid, 0.5, Number.POSITIVE_INFINITY, {
      sourceVolumeId: source.identity.volumeId,
      sourceVolumeRevision: source.identity.volumeRevision,
      sourceSampledGridRevision: source.identity.sampledGridRevision,
    });
    const map = connectedComponentsLabelMap(mask);
    expect(qualifyVolumeSegmentation(map, source, 0.5, true)).toMatchObject({ status: "preview", showValues: true, canApply: true, canEdit: false });
    expect(qualifyVolumeSegmentation(map, source, 0.5, false)).toMatchObject({ status: "current", showValues: true, canEdit: true });
    expect(qualifyVolumeSegmentation(map, source, 0.6, true)).toMatchObject({ status: "stale", showValues: false, canApply: false });
    grid.scalars[0] = 2;
    const changed = makeSource(2);
    expect(qualifyVolumeSegmentation(map, changed, 0.5, false)).toMatchObject({ status: "stale", showValues: false, canEdit: false });
    expect(qualifyVolumeSegmentation(null, changed, 0.5, false).status).toBe("unavailable");
  });
});
