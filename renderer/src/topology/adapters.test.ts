import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  analyzeGeometryTopologySnapshot,
  analyzeMeshTopologySnapshot,
  createGeometryTopologySnapshot,
} from "./adapters";
import { canonicalizeGeometryTopologySnapshot } from "./core";

const tetrahedron = (): SurfaceMeshData => ({
  label: "Tetrahedron",
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

describe("Topology read-only module adapters", () => {
  it("analyzes an oriented indexed Mesh snapshot and preserves locatable IDs", () => {
    const result = analyzeMeshTopologySnapshot({
      mesh: tetrahedron(),
      sourceObjectId: "mesh-1",
      sourceObjectRevision: "revision-7",
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.readOnly).toBe(true);
    expect(result.analysis?.topologyObject.source.kind).toBe("mesh-snapshot");
    expect(result.analysis?.topologyObject.canonical.faces).toHaveLength(4);
    expect(result.mapping.faces.f0).toBe("f0");
    expect(result.analysis?.homology.value?.integer.groups.map((group) => group.notation)).toEqual([
      "Z",
      "0",
      "Z",
    ]);
  });

  it("rejects a Mesh without complete indices instead of guessing triangles", () => {
    const mesh = tetrahedron();
    mesh.indices = null;
    const result = analyzeMeshTopologySnapshot({ mesh, sourceObjectId: "mesh-2", sourceObjectRevision: "r1" });
    expect(result.status).toBe("failed");
    expect(result.diagnostics.some((entry) => entry.code === "adapter/incomplete-indices")).toBe(true);
  });

  it("labels Geometry tessellation fidelity and analyzes its finite incidence complex", () => {
    const result = analyzeGeometryTopologySnapshot({
      mesh: tetrahedron(),
      sourceObjectId: "geometry-1",
      sourceObjectRevision: "3",
      conversionMethod: "display tessellator",
      fidelity: "tessellated-approximation",
      correspondence: "complete",
    });
    expect(result.status).toBe("accepted");
    expect(result.fidelity).toBe("tessellated-approximation");
    expect(result.method).toBe("display tessellator");
  });

  it("rejects unresolved Geometry trims and representations outside the pilot", () => {
    const snapshot = createGeometryTopologySnapshot({
      mesh: tetrahedron(),
      sourceObjectId: "geometry-2",
      sourceObjectRevision: "4",
      conversionMethod: "trimmed analytic export",
      fidelity: "tessellated-approximation",
      correspondence: "partial",
      unresolvedTrims: true,
    });
    const result = canonicalizeGeometryTopologySnapshot({ ...snapshot, representation: "solid-boundary" });
    expect(result.status).toBe("unsupported");
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "adapter/unsupported-geometry-representation",
      "adapter/unresolved-trims",
    ]));
  });
});
