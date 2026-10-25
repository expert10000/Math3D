import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createScientificDatasetLink, createScientificDerivedView,
  scientificAxisCoordinate, scientificCoordinateIndex, scientificPointWithinBounds,
  scientificVelocityUnit, parseScientificSceneManifest, sha256Checksum,
  validateScientificLineCoordinates } from "@math3d/core";

const manifest = readFileSync(fileURLToPath(new URL(
  "../../../tests/fixtures/scientific-scene/complex-wave-volume.sscene/manifest.json", import.meta.url)), "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
const locator = { kind: "preset" as const, value: "complexWaveVolume" };
const real = createGraph2DFieldReference(manifest, fingerprint, locator, "field", "real");
const imaginary = createGraph2DFieldReference(manifest, fingerprint, locator, "field", "imaginary");

describe("SCI-01 scientific coordinates", () => {
  const axes = real.axes.map((axis, index) => ({ ...axis, count: real.shape[index]! }));
  it("separates sample indices from physical coordinates and rejects outside values", () => {
    expect(scientificAxisCoordinate(axes[1]!, 10)).toBe(-2);
    expect(scientificCoordinateIndex(axes[1]!, -2)).toBe(10);
    expect(() => scientificCoordinateIndex(axes[1]!, 10)).toThrow(/outside/);
    expect(() => scientificCoordinateIndex(axes[1]!, -1.9)).toThrow(/between grid samples/);
    expect(scientificCoordinateIndex(axes[1]!, -1.9, "nearest")).toBe(11);
    expect(() => scientificAxisCoordinate(axes[1]!, -1)).toThrow(/outside/);
  });
  it("validates the complete selected line and rejects nonuniform arrays", () => {
    expect(() => validateScientificLineCoordinates(axes, 0,
      [{ axis: 2, index: 4 }, { axis: 1, index: 10 }])).not.toThrow();
    expect(() => validateScientificLineCoordinates(axes, 0,
      [{ axis: 2, index: 17 }, { axis: 1, index: 10 }])).toThrow(/outside/);
    expect(() => scientificAxisCoordinate({ ...axes[1]!, coordinates: [0, 2, 1] }, 1))
      .toThrow(/Nonuniform coordinate arrays/);
    const nonuniform = JSON.parse(manifest);
    nonuniform.coordinates[0].axes[1].coordinates = [-4, -3.6, -3.8];
    expect(parseScientificSceneManifest(JSON.stringify(nonuniform)).ok).toBe(false);
    expect(() => validateScientificLineCoordinates(axes, 0,
      [{ axis: 2, index: 4 }, { axis: 2, index: 10 }])).toThrow(/one fixed index/);
  });
  it("uses the same finite bounds and unit rule for seed and trajectory validation", () => {
    const bounds = [{ min: -4, max: 4, unit: "m" }, { min: -4, max: 4, unit: "m" },
      { min: -2, max: 2, unit: "m" }];
    expect(scientificPointWithinBounds([2, 0, -1], bounds)).toBe(true);
    expect(scientificPointWithinBounds([10, 0, 0], bounds)).toBe(false);
    expect(scientificPointWithinBounds([NaN, 0, 0], bounds)).toBe(false);
    expect(scientificVelocityUnit("m", "s")).toBe("m/s");
  });
});

describe("SCI-03 immutable dataset and derived-view links", () => {
  it("shares one verified source across distinct lines without embedding values", () => {
    const link = createScientificDatasetLink([real, imaginary]);
    const first = createScientificDerivedView(link, { kind: "line", component: "real", varyingAxis: 0,
      fixed: [{ axis: 2, index: 4 }, { axis: 1, index: 10 }] });
    const second = createScientificDerivedView(link, { kind: "line", component: "imaginary", varyingAxis: 1,
      fixed: [{ axis: 2, index: 4 }, { axis: 0, index: 10 }] });
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.viewHash).not.toBe(second.viewHash);
    expect(first.selection).toMatchObject({ fixed: [
      { coordinate: -1, unit: "m" }, { coordinate: -2, unit: "m" }] });
    expect(JSON.stringify({ link, first, second })).not.toContain('"values"');
    const movedImaginary = createGraph2DFieldReference(manifest, fingerprint,
      { kind: "directory", value: "C:\\moved\\complex.sscene" }, "field", "imaginary");
    expect(() => createScientificDatasetLink([real, movedImaginary])).toThrow(/share one verified bundle/);
    expect(() => createScientificDerivedView({ ...link, sourceHash: "0".repeat(64) },
      { kind: "line", component: "real", varyingAxis: 0,
        fixed: [{ axis: 2, index: 4 }, { axis: 1, index: 10 }] })).toThrow(/Invalid verified/);
    const changedManifest = JSON.parse(manifest);
    changedManifest.resources[0].sha256 = "0".repeat(64);
    const changedJson = JSON.stringify(changedManifest);
    const changedFingerprint = sha256Checksum(new TextEncoder().encode(changedJson)).slice(7);
    const changedReal = createGraph2DFieldReference(changedJson, changedFingerprint, locator, "field", "real");
    const changedImaginary = createGraph2DFieldReference(changedJson, changedFingerprint, locator, "field", "imaginary");
    expect(createScientificDatasetLink([changedReal, changedImaginary]).sourceHash).not.toBe(link.sourceHash);
  });
});
