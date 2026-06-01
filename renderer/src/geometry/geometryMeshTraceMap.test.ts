import { describe, expect, it } from "vitest";
import {
  ExplainMeshOrigin,
  GetGeometryFromMesh,
  GetMeshFromGeometry,
  GeometryMeshTraceMap,
  buildTraceMapForPromotion,
  getGlobalGeometryMeshTraceMap,
  inferPromotionElementMappings,
  mergeIntoGlobalGeometryMeshTraceMap,
  propagateTraceMapThroughMeshMutation,
  resetGlobalGeometryMeshTraceMap,
} from "./geometryMeshTraceMap";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

const triangleMesh = (label: string): SurfaceMeshData => ({
  label,
  positions: new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]),
  indices: new Uint32Array([0, 1, 2]),
  source: { kind: "detachedMesh", fromLabel: label },
});

describe("geometryMeshTraceMap", () => {
  it("supports bidirectional queries and origin explanation", () => {
    const map = new GeometryMeshTraceMap();
    map.link({
      geometry: { geometryId: "geo-1", kind: "object" },
      mesh: { meshId: "mesh-1", kind: "object" },
      provenance: { operation: "promotion", timestamp: 10, id: "p1", version: 1 },
    });
    map.registerElementMapping({
      geometryId: "geo-1",
      meshId: "mesh-1",
      elementKind: "vertex",
      meshElementIndex: 0,
      geometryElementIndices: [0, 2],
      provenance: { operation: "vertex-map", timestamp: 11, id: "p2", version: 1 },
    });

    const meshRefs = GetMeshFromGeometry(map, { geometryId: "geo-1", kind: "object" });
    expect(meshRefs).toEqual([{ meshId: "mesh-1", kind: "object" }]);

    const geometryRefs = GetGeometryFromMesh(map, { meshId: "mesh-1", kind: "vertex", index: 0 });
    expect(geometryRefs).toEqual([
      { geometryId: "geo-1", kind: "vertex", index: 0 },
      { geometryId: "geo-1", kind: "vertex", index: 2 },
    ]);

    const origin = ExplainMeshOrigin(map, { meshId: "mesh-1", kind: "vertex", index: 0 });
    expect(origin.geometrySources.length).toBe(2);
    expect(origin.provenance[0]?.operation).toBe("vertex-map");
  });

  it("infers per-element mappings for aligned meshes", () => {
    const source = triangleMesh("source");
    const promoted = triangleMesh("promoted");
    const mappings = inferPromotionElementMappings({ sourceMesh: source, promotedMesh: promoted });

    expect(mappings.vertexMap).toEqual([[0], [1], [2]]);
    expect(mappings.faceMap).toEqual([[0]]);
    expect(mappings.edgeMap.length).toBe(3);

    const traceMap = buildTraceMapForPromotion({
      sourceGeometryId: "geo-2",
      meshId: "mesh-2",
      sourceMesh: source,
      promotedMesh: promoted,
      sourceOperationHistory: ["create"],
      promotionMode: "raw_mesh",
      createdAt: 200,
    });

    expect(GetMeshFromGeometry(traceMap, { geometryId: "geo-2", kind: "object" })).toEqual([
      { meshId: "mesh-2", kind: "object" },
    ]);
    expect(GetGeometryFromMesh(traceMap, { meshId: "mesh-2", kind: "face", index: 0 })).toEqual([
      { geometryId: "geo-2", kind: "face", index: 0 },
    ]);
  });

  it("merges traces into a global map", () => {
    resetGlobalGeometryMeshTraceMap();
    const a = buildTraceMapForPromotion({
      sourceGeometryId: "geo-a",
      meshId: "mesh-a",
      sourceMesh: triangleMesh("a-src"),
      promotedMesh: triangleMesh("a-prom"),
      createdAt: 1,
    });
    const b = buildTraceMapForPromotion({
      sourceGeometryId: "geo-b",
      meshId: "mesh-b",
      sourceMesh: triangleMesh("b-src"),
      promotedMesh: triangleMesh("b-prom"),
      createdAt: 2,
    });

    mergeIntoGlobalGeometryMeshTraceMap(a);
    mergeIntoGlobalGeometryMeshTraceMap(b);

    const globalMap = getGlobalGeometryMeshTraceMap();
    expect(GetMeshFromGeometry(globalMap, { geometryId: "geo-a", kind: "object" })).toEqual([
      { meshId: "mesh-a", kind: "object" },
    ]);
    expect(GetMeshFromGeometry(globalMap, { geometryId: "geo-b", kind: "object" })).toEqual([
      { meshId: "mesh-b", kind: "object" },
    ]);
  });

  it("propagates lineage across topology-changing mutation with conservative fallback", () => {
    const source = triangleMesh("source");
    const promoted = triangleMesh("promoted");
    const initial = buildTraceMapForPromotion({
      sourceGeometryId: "geo-x",
      meshId: "mesh-0",
      sourceMesh: source,
      promotedMesh: promoted,
      createdAt: 10,
    });
    const mutated: SurfaceMeshData = {
      label: "mutated",
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      source: { kind: "detachedMesh", fromLabel: "mutated" },
    };
    const propagated = propagateTraceMapThroughMeshMutation({
      previousTraceMap: initial,
      previousMeshId: "mesh-0",
      nextMeshId: "mesh-1",
      previousMesh: promoted,
      nextMesh: mutated,
      operation: "vtk-decimate",
      fallbackGeometryIds: ["geo-x"],
    });

    const linked = GetMeshFromGeometry(propagated, { geometryId: "geo-x", kind: "object" });
    expect(linked).toContainEqual({ meshId: "mesh-1", kind: "object" });
    const origin = ExplainMeshOrigin(propagated, { meshId: "mesh-1", kind: "face", index: 1 });
    expect(origin.geometrySources.length).toBeGreaterThan(0);
    expect(origin.provenance[0]?.params).toMatchObject({
      strategy: "topology-signature-heuristic",
      conservativeFallback: true,
    });
  });
});
