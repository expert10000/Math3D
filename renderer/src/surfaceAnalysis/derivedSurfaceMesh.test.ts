import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import { compactDerivedSurfaceMesh, createDerivedSurfaceMeshPayload, mapDerivedMeshSelectionToSource, mapSourceSelectionToDerivedMesh, markDerivedSurfaceMeshRecordStale, regenerateDerivedSurfaceMeshRecord, transitionDerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";

const definition = adaptSurfaceDefinition({ id: "torus", revision: 2, label: "Torus", representation: "parametric", familyId: "torus", expressions: { x: "x", y: "y", z: "z" }, domain: { kind: "parameter", u: { min: 0, max: 6.28, periodic: true }, v: { min: 0, max: 6.28, periodic: true } } });
const payload = createDerivedSurfaceMeshPayload({ definition, label: "Torus live", vertexCount: 3, faceCount: 1, method: "native-grid", settings: { resolution: 32 }, backend: { id: "threejs-native" }, createdAt: 10, correspondence: { parameterCoordinates: [0, 0, 1, 0, 0, 1], sourceSampleIndices: [0, 1, 2], confidence: [1, 1, 1] } });

describe("provenance-linked derived SurfaceMesh", () => {
  it("creates stable source/revision/settings identity and parameter correspondence", () => {
    expect(payload.identity).toMatchObject({ meshRevision: 1, source: { surfaceId: "torus", surfaceRevision: 2 }, tessellation: { method: "native-grid", settings: { resolution: 32 } }, backend: { id: "threejs-native" }, state: "live-current" });
    expect(payload.correspondence).toMatchObject({ kind: "parameter", state: "complete", mappedVertexCount: 3 });
  });

  it("does not invent UV coordinates for implicit tessellations", () => {
    const implicit = adaptSurfaceDefinition({ id: "sphere", revision: 1, label: "Sphere", representation: "implicit", formula: "x*x+y*y+z*z-1", domain: { kind: "spatial-bounds", min: [-1, -1, -1], max: [1, 1, 1] } });
    const result = createDerivedSurfaceMeshPayload({ definition: implicit, label: "Sphere", vertexCount: 5, faceCount: 2, method: "marching-cubes", settings: {}, backend: { id: "threejs-native" } });
    expect(result.correspondence).toMatchObject({ kind: "nearest-surface", state: "unavailable" });
    expect(result.correspondence.parameterCoordinates).toBeUndefined();
  });

  it("maps source and mesh selections in both directions", () => {
    expect(Array.from(mapSourceSelectionToDerivedMesh(payload.correspondence, [1, 2]).meshVertexIndices)).toEqual([1, 2]);
    expect(Array.from(mapDerivedMeshSelectionToSource(payload.correspondence, [2, 0]).sourceIndices)).toEqual([2, 0]);
  });

  it("preserves snapshots and marks only live records stale", () => {
    const record = compactDerivedSurfaceMesh(payload, "Torus");
    const nextDefinition = { ...definition, identity: { ...definition.identity, key: `${definition.identity.surfaceId}@3`, revision: 3, surfaceRevision: 3 } };
    expect(markDerivedSurfaceMeshRecordStale(record, nextDefinition, { resolution: 32 }).identity).toMatchObject({ state: "stale", staleReason: expect.stringContaining("revision") });
    expect(markDerivedSurfaceMeshRecordStale(transitionDerivedSurfaceMeshRecord(record, "frozen-snapshot", 20), nextDefinition, { resolution: 64 }).identity.state).toBe("frozen-snapshot");
  });

  it("increments revisions on regeneration and records lifecycle history", () => {
    const record = compactDerivedSurfaceMesh(payload, "Torus");
    const regenerated = regenerateDerivedSurfaceMeshRecord(record, payload, 30);
    expect(regenerated.identity).toMatchObject({ meshId: record.identity.meshId, meshRevision: 2, state: "live-current" });
    expect(regenerated.history.map((entry) => entry.action)).toEqual(["created", "regenerated"]);
  });
});
