import { describe, expect, it } from "vitest";
import { createVolumeDerivedResult, adaptDenseGridVolume } from "./infrastructure";
import { qualifyVolumeDerivedResult } from "./derivedQualification";
import type { VolumeIsosurfaceMetadata } from "./contracts";

describe("Volume derived-result qualification", () => {
  it("requires exact source, settings, metadata and geometry while retaining snapshots", () => {
    const grid = { dims: [2, 2, 2] as [number, number, number], scalars: new Float32Array(8) };
    const tracker = new Map();
    const makeSource = (now: number) => adaptDenseGridVolume({ id: "field", label: "Field", sourceLabel: "fixture", dataset: { kind: "volume", grid }, grid, tracker, now });
    const source = makeSource(1);
    const metadata = { isoValue: 0, correspondence: { sourceSampledGridRevision: source.identity.sampledGridRevision } } as VolumeIsosurfaceMetadata;
    const result = createVolumeDerivedResult({ id: "iso", label: "Iso", kind: "isosurface", source, parameters: { isoValue: 0 }, isosurface: metadata, now: 2 });
    expect(qualifyVolumeDerivedResult(result, source, { isoValue: 0 }, true)).toMatchObject({ status: "current", showMetrics: true, canTransfer: true });
    expect(qualifyVolumeDerivedResult(result, source, { isoValue: 1 }, true)).toMatchObject({ status: "stale", showMetrics: false, canTransfer: false, canBake: true });
    expect(qualifyVolumeDerivedResult(result, source, { isoValue: 0 }, false)).toMatchObject({ status: "unavailable", showMetrics: false, canBake: false });
    grid.scalars[0] = 1;
    const changed = makeSource(3);
    expect(qualifyVolumeDerivedResult(result, changed, { isoValue: 0 }, true)).toMatchObject({ status: "stale", showMetrics: false });
    expect(qualifyVolumeDerivedResult({ ...result, state: "snapshot" }, changed, { isoValue: 1 }, true)).toMatchObject({ status: "snapshot", showMetrics: true, canTransfer: true, canBake: false });
    expect(qualifyVolumeDerivedResult({ ...result, state: "detached" }, changed, { isoValue: 1 }, true)).toMatchObject({ status: "detached", showMetrics: true, canTransfer: true });
    expect(qualifyVolumeDerivedResult({ ...result, isosurface: { ...metadata, isoValue: 2 } }, source, { isoValue: 0 }, true)).toMatchObject({ status: "unavailable" });
  });
});
