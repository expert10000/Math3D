import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  analyzeRevisionedMeshTopologyHandoff,
  createRevisionedMeshTopologyHandoff,
  evaluateMeshTopologyHandoffFreshness,
  locateCanonicalMeshSnapshotCell,
} from "./meshSnapshotHandoff";

const tetrahedron = (): SurfaceMeshData => ({
  label: "Revisioned tetrahedron",
  positions: new Float32Array([
    1, 1, 1,
    -1, -1, 1,
    -1, 1, -1,
    1, -1, -1,
  ]),
  indices: new Uint32Array([
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ]),
  source: { kind: "polyhedronPreset", id: "tetra", label: "Tetrahedron" },
});

describe("revisioned Mesh to Topology handoff", () => {
  it("captures a read-only snapshot with revision-qualified stable locate references", () => {
    const mesh = tetrahedron();
    const handoff = createRevisionedMeshTopologyHandoff({
      mesh,
      sourceObjectId: "mesh-7",
      sourceObjectRevision: "revision-3",
    }, { capturedAt: 123 });

    expect(handoff.capturedAt).toBe(123);
    expect(handoff.source).toEqual({
      meshId: "mesh-7",
      meshRevision: "revision-3",
      meshLabel: "Revisioned tetrahedron",
    });
    expect(handoff.snapshot.vertexIds).toEqual(["v0", "v1", "v2", "v3"]);
    expect(handoff.snapshot.faces.map((face) => face.id)).toEqual(["f0", "f1", "f2", "f3"]);
    expect(handoff.locateBack.vertices.v2).toMatchObject({
      dimension: 0,
      sourceElementId: "v2",
      qualifiedId: "mesh-7@revision-3/v2",
      sourceIndex: 2,
    });
    expect(handoff.locateBack.triangles.f1).toMatchObject({
      dimension: 2,
      sourceElementId: "f1",
      qualifiedId: "mesh-7@revision-3/f1",
      sourceIndex: 1,
      sourceVertexIndices: [0, 1, 3],
    });
  });

  it("analyzes the captured incidence after the live Mesh buffers mutate", () => {
    const mesh = tetrahedron();
    const handoff = createRevisionedMeshTopologyHandoff({
      mesh,
      sourceObjectId: "mesh-immutable",
      sourceObjectRevision: "r1",
    });
    mesh.indices?.fill(0);
    mesh.positions.fill(99);

    const result = analyzeRevisionedMeshTopologyHandoff(handoff);
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.readOnly).toBe(true);
    expect(result.topologyObject.provenance.source.revision).toBe("r1");
    expect(result.topologyObject.canonical.faces).toHaveLength(4);
    expect(result.analysis?.homology.value?.integer.groups.map((group) => group.notation)).toEqual(["Z", "0", "Z"]);
  });

  it("marks results stale on revision change without rewriting the captured source", () => {
    const handoff = createRevisionedMeshTopologyHandoff({
      mesh: tetrahedron(),
      sourceObjectId: "mesh-lifecycle",
      sourceObjectRevision: "r4",
    });
    expect(evaluateMeshTopologyHandoffFreshness(handoff, {
      sourceObjectId: "mesh-lifecycle",
      sourceObjectRevision: "r4",
    }).state).toBe("current");

    const stale = evaluateMeshTopologyHandoffFreshness(handoff, {
      sourceObjectId: "mesh-lifecycle",
      sourceObjectRevision: "r5",
    });
    expect(stale.state).toBe("stale");
    expect(stale.resultState).toBe("stale");
    expect(stale.reason).toContain("Re-analyze to create a new snapshot");
    expect(handoff.snapshot.sourceObjectRevision).toBe("r4");
  });

  it("locates canonical vertices, edges, and faces in the originating Mesh snapshot", () => {
    const handoff = createRevisionedMeshTopologyHandoff({
      mesh: tetrahedron(),
      sourceObjectId: "mesh-locate",
      sourceObjectRevision: "r9",
    });
    const result = analyzeRevisionedMeshTopologyHandoff(handoff);
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;

    const vertex = locateCanonicalMeshSnapshotCell(handoff, result, 0, "v3");
    const edge = locateCanonicalMeshSnapshotCell(handoff, result, 1, "e0:3");
    const face = locateCanonicalMeshSnapshotCell(handoff, result, 2, "f2");
    expect(vertex?.qualifiedId).toBe("mesh-locate@r9/v3");
    expect(edge?.sourceVertexIndices).toEqual([0, 3]);
    expect(face).toMatchObject({ sourceElementId: "f2", sourceIndex: 2, sourceVertexIndices: [0, 3, 2] });
  });
});
