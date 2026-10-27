import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, defaultVectorField3DWorkspace,
  analyzeVectorField3DIsosurfaceTopology, extractVectorField3DSpeedIsosurface,
  parseVectorField3DDocument,
  planVectorField3DIsosurface, reviseVectorField3DWorkspace,
  serializeVectorField3DDocument, vectorField3DExpression,
  type VectorField3DSource } from "@math3d/core";
import { exportVectorField3DIsosurfaceGltf } from "./exportVectorField3DIsosurface";

const axes = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -2, max: 2 })) as VectorField3DSource["axes"];
const document = createVectorField3DDocument({
  axes, timeUnit: "s", field: { kind: "expressions",
    components: ["x", "y", "z"].map(source => vectorField3DExpression(source, "m/s")) as
      Extract<VectorField3DSource["field"], { kind: "expressions" }>["components"] },
  seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7, maxSteps: 1000, maxTime: 2 },
}, { stableKey: "sci09-analytic-sphere" });
const sample = (plan: ReturnType<typeof planVectorField3DIsosurface>) =>
  Float64Array.from(plan.coordinates[0].flatMap(x => plan.coordinates[1].flatMap(y =>
    plan.coordinates[2].map(z => Math.hypot(x, y, z)))));

describe("SCI-09 bounded speed isosurface", () => {
  it("extracts an outward sphere with physical radius, normals, bounds and glTF provenance", () => {
    const plan = planVectorField3DIsosurface(document, defaultVectorField3DWorkspace(document.source).clipBounds);
    const surface = extractVectorField3DSpeedIsosurface(document, plan, sample(plan), 1);
    expect(surface.complete).toBe(true);
    expect(surface.clipped).toBe(false);
    expect(surface.triangleCount).toBeGreaterThan(1000);
    expect(surface.triangleCount).toBeLessThan(40_000);
    expect(surface.vertexCount).toBeLessThan(surface.triangleCount * 3);
    expect(surface.indices).toHaveLength(surface.triangleCount * 3);
    expect(surface.topology).toEqual({ connectedComponents: 1, boundaryEdgeCount: 0,
      clipBoundaryEdgeCount: 0, nonManifoldEdgeCount: 0, watertight: true });
    expect(surface.bounds?.every(bounds => Math.abs(bounds[0] + 1) < 0.04 &&
      Math.abs(bounds[1] - 1) < 0.04)).toBe(true);
    for (let i = 0; i < surface.positions.length; i += 63) {
      const point = surface.positions.slice(i, i + 3);
      const normal = surface.normals.slice(i, i + 3);
      expect(Math.abs(Math.hypot(...point) - 1)).toBeLessThan(0.035);
      expect((point[0]! * normal[0]! + point[1]! * normal[1]! +
        point[2]! * normal[2]!) / Math.hypot(...point)).toBeGreaterThan(0.8);
    }
    const gltf = JSON.parse(exportVectorField3DIsosurfaceGltf(surface));
    expect(gltf.meshes[0].extras).toMatchObject({ level: 1, unit: "m/s",
      source: { documentId: document.identity.id }, complete: true,
      coordinateAxes: axes });
    expect(gltf.meshes[0].primitives[0].indices).toBe(2);
    expect(gltf.meshes[0].extras.topology).toEqual(surface.topology);
    expect(gltf.accessors[0].count).toBe(surface.vertexCount);
    expect(gltf.accessors[2].count).toBe(surface.triangleCount * 3);
    expect(gltf.accessors[0].min[0]).toBe(Math.min(...surface.positions.filter((_, index) =>
      index % 3 === 0)));
    expect(atob(gltf.buffers[0].uri.split(",")[1]).length)
      .toBe(surface.positions.byteLength + surface.normals.byteLength + surface.indices.byteLength);
  });

  it("labels clipping and budget exhaustion, and persists the regeneration recipe", () => {
    const clip = [[-0.5, 0.5], [-2, 2], [-2, 2]] as const;
    const plan = planVectorField3DIsosurface(document, clip);
    const clipped = extractVectorField3DSpeedIsosurface(document, plan, sample(plan), 1);
    expect(clipped.clipped).toBe(true);
    expect(clipped.topology.boundaryEdgeCount).toBeGreaterThan(0);
    expect(clipped.topology.clipBoundaryEdgeCount).toBeGreaterThan(0);
    expect(clipped.topology.nonManifoldEdgeCount).toBe(0);
    expect(clipped.topology.watertight).toBe(false);
    const partial = extractVectorField3DSpeedIsosurface(document, plan, sample(plan), 1, 12);
    expect(partial.complete).toBe(false);
    expect(partial.triangleCount).toBe(12);
    expect(partial.topology.watertight).toBe(false);
    const saved = reviseVectorField3DWorkspace(document, { ...document.workspace!, clipBounds: clip,
      isosurfaceLevel: 1, isosurfaceTriangleBudget: 12 });
    const reopened = parseVectorField3DDocument(serializeVectorField3DDocument(saved));
    expect(reopened.workspace?.clipBounds).toEqual(clip);
    expect(reopened.workspace?.isosurfaceLevel).toBe(1);
    expect(reopened.workspace?.isosurfaceTriangleBudget).toBe(12);
    const legacy = JSON.parse(serializeVectorField3DDocument(document));
    delete legacy.workspace.isosurfaceLevel;
    delete legacy.workspace.isosurfaceTriangleBudget;
    const migrated = parseVectorField3DDocument(JSON.stringify(legacy));
    expect(migrated.workspace?.isosurfaceLevel).toBeNull();
    expect(migrated.workspace?.isosurfaceTriangleBudget).toBe(40_000);
  });

  it("counts disconnected components and a nonmanifold shared edge", () => {
    const clip = defaultVectorField3DWorkspace(document.source).clipBounds;
    const topology = analyzeVectorField3DIsosurfaceTopology(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1,
        1.5, 1.5, 1.5, 1.6, 1.5, 1.5, 1.5, 1.6, 1.5]),
      new Uint32Array([0, 1, 2, 1, 0, 3, 0, 1, 4, 5, 6, 7]), clip, true);
    expect(topology.connectedComponents).toBe(2);
    expect(topology.nonManifoldEdgeCount).toBe(1);
    expect(topology.boundaryEdgeCount).toBeGreaterThan(0);
    expect(topology.watertight).toBe(false);
  });
});
