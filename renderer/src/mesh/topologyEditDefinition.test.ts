import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "./surfaceMesh";
import {
  applyMeshTopologyEditDefinition,
  createMeshTopologyEditDefinition,
  createMeshTopologyEdgeTarget,
  createMeshTopologyFaceTarget,
  createMeshTopologySourceVersion,
  createMeshTopologyVertexTarget,
  resolveMeshTopologyEditDefinitionTarget,
  retargetMeshTopologyEditDefinition,
  updateMeshTopologyEditDefinitionParameters,
} from "./topologyEditDefinition";

const makeMesh = (): SurfaceMeshData => ({
  label: "Box",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]),
  indices: Uint32Array.from([
    0, 1, 2,
    1, 3, 2,
  ]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

describe("topologyEditDefinition", () => {
  it("creates stable definition keys with normalized edge order and source mesh version", () => {
    const sourceMeshVersion = createMeshTopologySourceVersion({ label: "Box", vertexCount: 8, faceCount: 12 });
    const a = createMeshTopologyEditDefinition({
      operation: "Split Edge",
      sourceMeshVersion,
      target: createMeshTopologyEdgeTarget(6, 5),
      parameters: { ratio: 0.5 },
    });
    const b = createMeshTopologyEditDefinition({
      operation: "Split Edge",
      sourceMeshVersion,
      target: createMeshTopologyEdgeTarget(5, 6),
      parameters: { ratio: 0.75 },
    });

    expect(a.selectionKey).toBe("mesh:Box:v8:f12|Split Edge|edge:5-6");
    expect(b.selectionKey).toBe(a.selectionKey);
    expect(a.replayLabel).toBe("op=Split Edge; source=mesh:Box:v8:f12; selection=edge:5-6; params=ratio=0.5");
  });

  it("resolves a saved definition target against its source mesh before replay", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Face Subdivide",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyFaceTarget(1),
      parameters: { mode: "center-fan" },
    });

    expect(resolveMeshTopologyEditDefinitionTarget(makeMesh(), definition)).toMatchObject({ ok: true });
  });

  it("replays a definition against a restored source mesh", () => {
    const restoredSource = makeMesh();
    const definition = createMeshTopologyEditDefinition({
      operation: "Split Edge",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyEdgeTarget(1, 2),
      parameters: { ratio: 0.5 },
    });

    const replayed = applyMeshTopologyEditDefinition(restoredSource, definition);

    expect(Math.floor(replayed.positions.length / 3)).toBe(5);
    expect(Math.floor((replayed.indices?.length ?? 0) / 3)).toBe(4);
  });

  it("replays face extrude definitions with editable distance params", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Extrude Face",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyFaceTarget(0),
      parameters: { distance: 0.2 },
    });

    const replayed = applyMeshTopologyEditDefinition(makeMesh(), definition);

    expect(definition.paramsLabel).toBe("distance=0.2");
    expect(Math.floor(replayed.positions.length / 3)).toBe(7);
    expect(Math.floor((replayed.indices?.length ?? 0) / 3)).toBe(9);
  });

  it("replays one atomic multi-face definition against original face IDs", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Face Subdivide",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyFaceTarget(0),
      selectedFaceIndices: [1, 0, 1],
      parameters: { mode: "center-fan" },
    });

    const replayed = applyMeshTopologyEditDefinition(makeMesh(), definition);

    expect(definition.selectedFaceIndices).toEqual([0, 1]);
    expect(definition.selectionKey).toBe("mesh:Box:v4:f2|Face Subdivide|faces:0,1");
    expect(Math.floor(replayed.positions.length / 3)).toBe(6);
    expect(Math.floor((replayed.indices?.length ?? 0) / 3)).toBe(6);
  });

  it("creates stable vertex definition keys and replays move vertex definitions", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Move Vertex",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyVertexTarget(1),
      parameters: { amount: 0.25, direction: { x: 1, y: 0, z: 0 } },
    });

    const replayed = applyMeshTopologyEditDefinition(makeMesh(), definition);

    expect(definition.selectionKey).toBe("mesh:Box:v4:f2|Move Vertex|vertex:1");
    expect(definition.paramsLabel).toBe("amount=0.25, dirX=1, dirY=0, dirZ=0");
    expect(replayed.positions[3]).toBeCloseTo(1.25);
  });

  it("updates edited parameters directly on the definition", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Bevel Edge",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyEdgeTarget(1, 2),
      parameters: { amount: 0.06 },
    });

    const updated = updateMeshTopologyEditDefinitionParameters(definition, { amount: 0.125 });

    expect(updated.paramsLabel).toBe("amount=0.125");
    expect(updated.replayLabel).toContain("params=amount=0.125");
  });

  it("retargets an operation while preserving source version and parameters", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Collapse Edge",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyEdgeTarget(1, 2),
      parameters: { mode: "midpoint" },
    });

    const retargeted = retargetMeshTopologyEditDefinition(definition, createMeshTopologyEdgeTarget(1, 3));

    expect(retargeted.selectionKey).toBe("mesh:Box:v4:f2|Collapse Edge|edge:1-3");
    expect(retargeted.paramsLabel).toBe("mode=midpoint");
  });

  it("reports missing targets before replay", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Split Edge",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyEdgeTarget(0, 3),
      parameters: { ratio: 0.5 },
    });

    expect(resolveMeshTopologyEditDefinitionTarget(makeMesh(), definition)).toEqual({
      ok: false,
      reason: "Edge 0-3 is missing in source mesh version mesh:Box:v4:f2.",
    });
    expect(() => applyMeshTopologyEditDefinition(makeMesh(), definition)).toThrow(
      "Edge 0-3 is missing in source mesh version mesh:Box:v4:f2."
    );
  });

  it("reports missing vertex targets before replay", () => {
    const definition = createMeshTopologyEditDefinition({
      operation: "Move Vertex",
      sourceMeshVersion: createMeshTopologySourceVersion({ label: "Box", vertexCount: 4, faceCount: 2 }),
      target: createMeshTopologyVertexTarget(8),
      parameters: { amount: 0.2, direction: { x: 0, y: 1, z: 0 } },
    });

    expect(resolveMeshTopologyEditDefinitionTarget(makeMesh(), definition)).toEqual({
      ok: false,
      reason: "Vertex 8 is outside source mesh version mesh:Box:v4:f2.",
    });
  });
});
