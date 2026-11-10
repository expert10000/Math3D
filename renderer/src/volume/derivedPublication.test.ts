import { describe, expect, it } from "vitest";
import type { VolumeIsosurfaceMetadata } from "./contracts";
import { publishVolumeDerivedEvidence } from "./derivedPublication";
import { adaptDenseGridVolume, createVolumeDerivedResult } from "./infrastructure";

describe("Volume derived-result publication", () => {
  it("publishes measured geometry only with an exact source or self-contained snapshot", () => {
    const grid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array(8) };
    const tracker = new Map();
    const makeSource = (now: number) => adaptDenseGridVolume({ id: "field", label: "Field", sourceLabel: "fixture", dataset: { kind: "volume", grid }, grid, tracker, now });
    const source = makeSource(1);
    const metadata = {
      algorithm: "marching-cubes", backend: "cpu-fallback", isoValue: 0,
      correspondence: { sourceSampledGridRevision: source.identity.sampledGridRevision },
      metrics: { vertexCount: 123, faceCount: 42, surfaceArea: 7 },
      profile: { wallTimeMs: 12 }, warnings: [],
    } as VolumeIsosurfaceMetadata;
    const result = createVolumeDerivedResult({ id: "iso:field", label: "Iso", kind: "isosurface", source, parameters: { isoValue: 0 }, isosurface: metadata, now: 2 });
    const current = publishVolumeDerivedEvidence(result, source, { isoValue: 0 }, true);
    expect(current.publication.assessment.status).toBe("recorded");
    expect(current.csv).toContain('"vertexCount","123"');
    expect(current.reportJson).toContain('"surfaceArea": 7');

    grid.scalars[0] = 1;
    const changed = makeSource(3);
    const stale = publishVolumeDerivedEvidence(result, changed, { isoValue: 0 }, true);
    expect(stale.publication.assessment.status).toBe("withheld");
    expect(JSON.parse(stale.reportJson).metrics).toBeNull();
    expect(stale.csv).toContain('"vertexCount",""');
    expect(stale.receiptJson).not.toContain('"vertexCount"');
    const snapshot = publishVolumeDerivedEvidence({ ...result, state: "snapshot" }, changed, { isoValue: 1 }, true);
    expect(snapshot.publication.assessment.status).toBe("recorded");
    expect(snapshot.publication.assessment.sourceStatus).toBe("snapshot");
    expect(publishVolumeDerivedEvidence(result, source, { isoValue: 0 }, false).publication.assessment.status).toBe("withheld");
  });
});
