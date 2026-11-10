import { describe, expect, it } from "vitest";
import { compareVolumes } from "./comparison";
import { publishVolumeComparisonEvidence } from "./comparisonPublication";
import { adaptDenseGridVolume } from "./infrastructure";
import { createVolumeTypedArrayStore } from "./typedArrayStore";

describe("Volume comparison publication", () => {
  it("checks both captured sources before exposing metrics", () => {
    const aGrid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array(8).fill(1) };
    const bGrid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array(8).fill(2) };
    const tracker = new Map();
    const a = adaptDenseGridVolume({ id: "a", label: "A", sourceLabel: "fixture", dataset: { kind: "volume", grid: aGrid }, grid: aGrid, tracker, now: 1 });
    const makeB = (now: number) => adaptDenseGridVolume({ id: "b", label: "B", sourceLabel: "fixture", dataset: { kind: "volume", grid: bGrid }, grid: bGrid, tracker, now });
    const b = makeB(2);
    const summary = compareVolumes({ a: { volume: a, grid: aGrid }, b: { volume: b, grid: bGrid }, alignment: "exact-grid", store: createVolumeTypedArrayStore() });
    const snapshot = { aKey: a.identity.key, bKey: b.identity.key, summary };
    const current = publishVolumeComparisonEvidence(a, b, snapshot);
    expect(current.publication.assessment.status).toBe("recorded");
    expect(current.csv).toContain('"signedMeanDifference","1"');
    expect(current.reportJson).toContain('"comparison"');

    bGrid.scalars[0] = 3;
    const changedB = makeB(3);
    const withheld = publishVolumeComparisonEvidence(a, changedB, snapshot);
    expect(withheld.publication.assessment.status).toBe("withheld");
    expect(withheld.publication.summary).toBeNull();
    expect(withheld.csv).toBeNull();
    expect(withheld.reportJson).toBeNull();
    expect(publishVolumeComparisonEvidence(null, b, snapshot).reportJson).toBeNull();
  });
});
