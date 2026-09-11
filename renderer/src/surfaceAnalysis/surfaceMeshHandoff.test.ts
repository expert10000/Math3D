import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import { compactDerivedSurfaceMesh, createDerivedSurfaceMeshPayload, transitionDerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";
import { createSurfaceMeshForHandoff, derivedSurfaceMeshIsIndependent, derivedSurfaceMeshMatchesRecord } from "./surfaceMeshHandoff";
import { createMeshAnalysisMeshIdentity } from "../mesh/analysisResultStore";

const definition = adaptSurfaceDefinition({ id: "torus", revision: 3, label: "Torus", representation: "parametric", familyId: "torus", expressions: { x: "x", y: "y", z: "z" }, domain: { kind: "parameter", u: { min: 0, max: 6.28 }, v: { min: 0, max: 6.28 } } });
const payload = createDerivedSurfaceMeshPayload({ definition, label: "Torus live", vertexCount: 3, faceCount: 1, method: "parameter-grid", settings: { resolution: 32 }, backend: { id: "threejs-native" }, createdAt: 10, correspondence: { parameterCoordinates: [0, 0, 1, 0, 0, 1], sourceSampleIndices: [0, 1, 2] } });
const liveRecord = compactDerivedSurfaceMesh(payload, "Torus live");
const geometry = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };

describe("Surface to Mesh handoff", () => {
  it("creates a linked live mesh with complete source provenance and UVs", () => {
    const mesh = createSurfaceMeshForHandoff({ record: liveRecord, payload, geometry });
    expect(mesh.source).toMatchObject({ kind: "derivedSurface", role: "live", sourceSurfaceId: "torus", sourceSurfaceRevision: 3, meshRevision: 1, correspondenceId: payload.correspondenceId });
    expect(Array.from(mesh.uvs ?? [])).toEqual([0, 0, 1, 0, 0, 1]);
    expect(derivedSurfaceMeshMatchesRecord(mesh, liveRecord)).toBe(true);
    expect(derivedSurfaceMeshIsIndependent(mesh)).toBe(false);
    expect(createMeshAnalysisMeshIdentity(mesh).sourceLabel).toContain("surface:torus:r3");
  });

  it("materializes a frozen snapshot by cloning geometry arrays", () => {
    const snapshot = transitionDerivedSurfaceMeshRecord(liveRecord, "frozen-snapshot", 20);
    const snapshotPayload = { ...payload, meshId: snapshot.identity.meshId, identity: snapshot.identity, live: false };
    const mesh = createSurfaceMeshForHandoff({ record: snapshot, payload: snapshotPayload, geometry });
    (geometry.positions as number[])[0] = 99;
    expect(mesh.positions[0]).toBe(0);
    expect(mesh.source).toMatchObject({ kind: "derivedSurface", role: "snapshot", state: "frozen-snapshot" });
    expect(derivedSurfaceMeshIsIndependent(mesh)).toBe(true);
  });

  it("keeps the immutable source revision when a later Surface revision exists", () => {
    const snapshot = transitionDerivedSurfaceMeshRecord(liveRecord, "frozen-snapshot", 20);
    const mesh = createSurfaceMeshForHandoff({ record: snapshot, payload: { ...payload, meshId: snapshot.identity.meshId, identity: snapshot.identity, live: false }, geometry });
    expect(mesh.source.kind === "derivedSurface" && mesh.source.sourceSurfaceRevision).toBe(3);
    expect(definition.identity.surfaceRevision + 1).toBe(4);
  });
});
