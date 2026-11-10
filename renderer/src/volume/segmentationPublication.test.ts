import { describe, expect, it } from "vitest";
import { adaptDenseGridVolume } from "./infrastructure";
import { connectedComponentsLabelMap, thresholdVolumeMask } from "./segmentation";
import { publishVolumeSegmentationEvidence } from "./segmentationPublication";

describe("Volume segmentation publication", () => {
  it("exports bounded applied regions and omits preview or stale measurements", () => {
    const grid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]) };
    const tracker = new Map();
    const makeSource = (now: number) => adaptDenseGridVolume({ id: "segmentation", label: "Field", sourceLabel: "fixture", dataset: { kind: "volume", grid }, grid, tracker, now });
    const source = makeSource(1);
    const map = connectedComponentsLabelMap(thresholdVolumeMask(grid, 0.5, Number.POSITIVE_INFINITY, {
      sourceVolumeId: source.identity.volumeId,
      sourceVolumeRevision: source.identity.volumeRevision,
      sourceSampledGridRevision: source.identity.sampledGridRevision,
    }));
    map.labels[0].name = "=HYPERLINK(\"bad\")";
    const current = publishVolumeSegmentationEvidence(map, source, 0.5, false);
    expect(current.publication.assessment.status).toBe("recorded");
    expect(current.csv).toContain("'=HYPERLINK");
    expect(JSON.parse(current.reportJson).totalLabeledVoxels).toBe(4);
    expect(current.reportJson).not.toContain('"data"');

    const preview = publishVolumeSegmentationEvidence(map, source, 0.5, true);
    expect(preview.publication.assessment.status).toBe("preview");
    expect(JSON.parse(preview.reportJson).regions).toBeNull();
    expect(preview.csv).toContain('"labelCount",""');
    expect(publishVolumeSegmentationEvidence(map, source, 0.6, false).publication.summary).toBeNull();
    grid.scalars[0] = 2;
    const changed = makeSource(2);
    const stale = publishVolumeSegmentationEvidence(map, changed, 0.5, false);
    expect(stale.publication.assessment.status).toBe("withheld");
    expect(stale.receiptJson).not.toContain("totalLabeledVoxels");
  });
});
