import { describe, expect, it } from "vitest";
import { marchingCubesVolume } from "../math/marchingCubes";
import { buildVolumeGridFromPreset } from "../scene/volume/volumePresets";
import { adaptAnalyticVolume, reconcileVolumeDerivedResult, createVolumeDerivedResult, type VolumeRevisionTracker } from "./infrastructure";
import { analyzeVolumeIsosurface, computeVolumeIsosurfaceNormals, createVolumeIsosurfaceMesh } from "./isosurface";

describe("first-class Volume isosurface results", () => {
  it("reports sphere bounds, topology, area, volume, and gradient-derived normals", () => {
    const grid = buildVolumeGridFromPreset("sphere", { dims: [32, 32, 32] });
    const tracker: VolumeRevisionTracker = new Map();
    const dataset = { kind: "volume" as const, label: "Sphere", grid };
    const volume = adaptAnalyticVolume({ id: "sphere", label: "Sphere", presetId: "sphere", expression: "x²+y²+z²-R²", parameters: { R: 1 }, dataset, grid, tracker });
    const extracted = marchingCubesVolume(grid, 0);
    expect(extracted).not.toBeNull();
    if (!extracted) return;
    const normalResult = computeVolumeIsosurfaceNormals(volume, grid, extracted.positions);
    const geometry = { ...extracted, normals: normalResult.normals };
    const metrics = analyzeVolumeIsosurface(geometry);
    expect(normalResult.method).toBe("gradient-derived");
    expect(metrics.connectedComponents).toBe(1);
    expect(metrics.boundaryEdgeCount).toBe(0);
    expect(metrics.nonManifoldEdgeCount).toBe(0);
    expect(metrics.watertight).toBe(true);
    expect(metrics.bounds?.min[0]).toBeCloseTo(-1.1, 1);
    expect(metrics.bounds?.max[0]).toBeCloseTo(1.1, 1);
    expect(metrics.surfaceArea).toBeCloseTo(4 * Math.PI * 1.1 ** 2, 0);
    expect(metrics.enclosedVolume).toBeCloseTo(4 * Math.PI * 1.1 ** 3 / 3, 0);

    const metadata = {
      algorithm: "marching-cubes" as const,
      algorithmVersion: "marching-cubes-v1",
      backend: "native-worker" as const,
      isoValue: 0,
      inputTransform: { dimensions: [...grid.dims] as [number, number, number], origin: [...(grid.origin ?? [0, 0, 0])] as [number, number, number], spacing: [...(grid.spacing ?? [1, 1, 1])] as [number, number, number], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const },
      profile: { wallTimeMs: 2, peakWorkingSetBytes: grid.scalars.byteLength * 2, transferredBytes: grid.scalars.byteLength + geometry.positions.byteLength + geometry.indices.byteLength, cacheHit: false },
      normalMethod: normalResult.method,
      warnings: normalResult.warnings,
      correspondence: { kind: "volume-grid" as const, id: "sphere-grid", sourceSampledGridRevision: 1 },
      metrics,
    };
    const mesh = createVolumeIsosurfaceMesh({ resultId: "sphere-iso", label: "Sphere iso", sourceVolumeId: "sphere", sourceVolumeRevision: 1, sourceSampledGridRevision: 1, metadata, geometry, role: "live" });
    expect(mesh.source).toMatchObject({ kind: "derivedVolume", sourceVolumeId: "sphere", isoValue: 0, algorithm: "marching-cubes" });
    expect(mesh.positions).not.toBe(geometry.positions);
  });

  it("keeps ellipsoid, torus, gyroid, and SDF fixtures within reviewed geometry tolerances", () => {
    for (const presetId of ["ellipsoid", "torus", "gyroid"] as const) {
      const grid = buildVolumeGridFromPreset(presetId, { dims: [28, 28, 28] });
      const extracted = marchingCubesVolume(grid, 0);
      expect(extracted, `${presetId} extraction`).not.toBeNull();
      if (!extracted) continue;
      const metrics = analyzeVolumeIsosurface({ ...extracted, normals: new Float32Array(extracted.positions.length) });
      expect(metrics.faceCount, `${presetId} faces`).toBeGreaterThan(100);
      expect(metrics.surfaceArea, `${presetId} area`).toBeGreaterThan(0);
      expect(metrics.connectedComponents, `${presetId} components`).toBeGreaterThanOrEqual(1);
      expect(metrics.nonManifoldEdgeCount, `${presetId} non-manifold`).toBe(0);
      if (presetId !== "gyroid") expect(metrics.watertight, `${presetId} watertight`).toBe(true);
    }

    const dims: [number, number, number] = [28, 28, 28];
    const spacing: [number, number, number] = [2.8 / 27, 2.8 / 27, 2.8 / 27];
    const origin: [number, number, number] = [-1.4, -1.4, -1.4];
    const scalars = new Float32Array(dims[0] * dims[1] * dims[2]);
    let index = 0;
    for (let z = 0; z < dims[2]; z += 1) for (let y = 0; y < dims[1]; y += 1) for (let x = 0; x < dims[0]; x += 1) {
      scalars[index++] = Math.hypot(origin[0] + x * spacing[0], origin[1] + y * spacing[1], origin[2] + z * spacing[2]) - 0.8;
    }
    const sdf = marchingCubesVolume({ dims, spacing, origin, scalars }, 0);
    expect(sdf).not.toBeNull();
    if (!sdf) return;
    const sdfMetrics = analyzeVolumeIsosurface({ ...sdf, normals: new Float32Array(sdf.positions.length) });
    expect(sdfMetrics.watertight).toBe(true);
    expect(sdfMetrics.bounds?.min[0]).toBeCloseTo(-0.8, 1);
    expect(sdfMetrics.bounds?.max[0]).toBeCloseTo(0.8, 1);
    expect(sdfMetrics.surfaceArea).toBeCloseTo(4 * Math.PI * 0.8 ** 2, 0);
  });

  it("keeps baked snapshots independent when the source revision advances", () => {
    const grid = buildVolumeGridFromPreset("ellipsoid", { dims: [12, 12, 12] });
    const tracker: VolumeRevisionTracker = new Map();
    const firstDataset = { kind: "volume" as const, label: "Ellipsoid", grid };
    const source = adaptAnalyticVolume({ id: "ellipsoid", label: "Ellipsoid", presetId: "ellipsoid", expression: "ellipsoid", dataset: firstDataset, grid, tracker });
    const snapshot = { ...createVolumeDerivedResult({ id: "ellipsoid-snapshot", label: "Snapshot", kind: "isosurface", source, parameters: { isoValue: 0 } }), state: "snapshot" as const };
    const changedGrid = { ...grid, scalars: new Float32Array(grid.scalars).fill(1) };
    const changedDataset = { kind: "volume" as const, label: "Ellipsoid", grid: changedGrid };
    const changed = adaptAnalyticVolume({ id: "ellipsoid", label: "Ellipsoid", presetId: "ellipsoid", expression: "ellipsoid", dataset: changedDataset, grid: changedGrid, tracker });
    expect(changed.identity.volumeRevision).toBeGreaterThan(source.identity.volumeRevision);
    expect(reconcileVolumeDerivedResult(snapshot, changed)).toEqual(snapshot);
  });
});
