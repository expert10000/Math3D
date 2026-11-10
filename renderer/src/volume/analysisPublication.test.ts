import { describe, expect, it } from "vitest";
import { adaptDenseGridVolume } from "./infrastructure";
import { runVolumeAnalysis } from "./analysis";
import { publishVolumeAnalysisEvidence } from "./analysisPublication";
import { createVolumeTypedArrayStore } from "./typedArrayStore";

describe("Volume analysis publication", () => {
  it("exports current statistics and withholds them after the sampled grid changes", () => {
    const grid = { dims: [3, 3, 3] as [number, number, number], scalars: new Float32Array(27).map((_, i) => i) };
    const tracker = new Map();
    const makeVolume = (now: number) => adaptDenseGridVolume({
      id: "analysis-publication", label: "Field", sourceLabel: "fixture", dataset: { kind: "volume", grid }, grid, tracker, now,
    });
    const volume = makeVolume(1);
    const summary = runVolumeAnalysis({ volume, grid, store: createVolumeTypedArrayStore(), threshold: 10, now: 2 });
    const settings = { threshold: 10, isoValue: 10 };
    const snapshot = { identityKey: volume.identity.key, ...settings, summary };
    const current = publishVolumeAnalysisEvidence(volume, snapshot, settings);
    expect(current.publication.assessment.status).toBe("recorded");
    expect(current.csv).toContain('"finiteCount","27"');
    expect(current.reportJson).toContain('"analysis"');

    grid.scalars[0] = 99;
    const changed = makeVolume(3);
    const withheld = publishVolumeAnalysisEvidence(changed, snapshot, settings);
    expect(withheld.publication.assessment.status).toBe("withheld");
    expect(withheld.publication.summary).toBeNull();
    expect(withheld.csv).toBeNull();
    expect(withheld.reportJson).toBeNull();
    expect(withheld.receiptJson).toContain("source or settings changed");
    expect(publishVolumeAnalysisEvidence(volume, snapshot, { threshold: 11, isoValue: 10 }).reportJson).toBeNull();
    expect(publishVolumeAnalysisEvidence(volume, snapshot, { threshold: 10, isoValue: 11 }).csv).toBeNull();
  });
});
