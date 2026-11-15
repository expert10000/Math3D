import { describe, expect, it } from "vitest";
import { createMeshTopologyEditDefinition, createMeshTopologyFaceTarget, createMeshTopologySourceVersionFromMesh } from "./topologyEditDefinition";
import { meshConnectivityKey, replayLinkedMeshModifiers, reorderLinkedMeshModifier } from "./linkedModifierStack";
import type { SurfaceMeshData } from "./surfaceMesh";

const base: SurfaceMeshData = { label: "Triangle", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), source: { kind: "detachedMesh" } };
const definition = (faceIndex: number) => createMeshTopologyEditDefinition({ operation: "Face Subdivide", sourceMeshVersion: createMeshTopologySourceVersionFromMesh(base), target: createMeshTopologyFaceTarget(faceIndex), parameters: { mode: "center-fan" } });

describe("linked mesh modifiers", () => {
  it("replays compatible modifiers and reports a missing source face", () => {
    const applied = replayLinkedMeshModifiers(base, [{ id: "a", definition: definition(0), enabled: true }]);
    expect(applied.ok).toBe(true);
    expect(applied.mesh.indices?.length).toBeGreaterThan(base.indices!.length);
    const failed = replayLinkedMeshModifiers(base, [{ id: "bad", definition: definition(99), enabled: true }, { id: "next", definition: definition(0), enabled: true }]);
    expect(failed.results.map((item) => item.status)).toEqual(["failed", "blocked"]);
  });
  it("permits reordering and disabling", () => {
    const stack = [{ id: "a", definition: definition(0), enabled: true }, { id: "b", definition: definition(99), enabled: false }];
    expect(reorderLinkedMeshModifier(stack, "b", -1).map((item) => item.id)).toEqual(["b", "a"]);
    expect(replayLinkedMeshModifiers(base, stack).results[1].status).toBe("disabled");
  });
  it("refuses to replay onto different connectivity even when face indices remain valid", () => {
    const changed = { ...base, indices: new Uint32Array([0, 2, 1]) };
    const result = replayLinkedMeshModifiers(changed, [{ id: "a", definition: definition(0), enabled: true, sourceConnectivity: meshConnectivityKey(base) }]);
    expect(result.results[0].status).toBe("failed");
    expect(result.mesh).toBe(changed);
  });
});
