import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  applyGeometryTopologyEditDefinition,
  createGeometryTopologyRetargetTarget,
  createGeometryTopologyEditDefinition,
  createGeometryTopologyEdgeTarget,
  createGeometryTopologyFaceTarget,
  createGeometryTopologySourceVersion,
  createGeometryTopologyVertexTarget,
  describeGeometryTopologyEditDefinition,
  resolveGeometryTopologyEditDefinitionTarget,
  retargetGeometryTopologyEditDefinition,
  updateGeometryTopologyEditDefinitionParameters,
} from "./topologyEditDefinition";

const makeMesh = (): SurfaceMeshData => ({
  label: "Geometry Box",
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

describe("geometry topology edit definitions", () => {
  it("creates stable definition keys with object revision and normalized edge order", () => {
    const sourceObjectVersion = createGeometryTopologySourceVersion({
      objectId: "box-1",
      label: "Box",
      revision: 3,
      vertexCount: 8,
      faceCount: 12,
    });
    const a = createGeometryTopologyEditDefinition({
      operation: "Split Edge",
      sourceObjectVersion,
      target: createGeometryTopologyEdgeTarget(6, 5),
      parameters: { ratio: 0.5 },
    });
    const b = createGeometryTopologyEditDefinition({
      operation: "Split Edge",
      sourceObjectVersion,
      target: createGeometryTopologyEdgeTarget(5, 6),
      parameters: { ratio: 0.75 },
    });

    expect(a.selectionKey).toBe("geometry:box-1:r3:v8:f12|Split Edge|edge:5-6");
    expect(b.selectionKey).toBe(a.selectionKey);
    expect(a.replayLabel).toBe("op=Split Edge; source=geometry:box-1:r3:v8:f12; selection=edge:5-6; params=ratio=0.5");
  });

  it("replays a definition against a restored source mesh", () => {
    const definition = createGeometryTopologyEditDefinition({
      operation: "Extrude Face",
      sourceObjectVersion: createGeometryTopologySourceVersion({
        objectId: "box-1",
        label: "Box",
        revision: 0,
        vertexCount: 4,
        faceCount: 2,
      }),
      target: createGeometryTopologyFaceTarget(0),
      parameters: { distance: 0.2 },
    });

    const replayed = applyGeometryTopologyEditDefinition(makeMesh(), definition);

    expect(Math.floor(replayed.positions.length / 3)).toBe(7);
    expect(Math.floor((replayed.indices?.length ?? 0) / 3)).toBe(9);
    expect(definition.paramsLabel).toBe("distance=0.2");
  });

  it("describes replayable definitions with source revision labels", () => {
    const definition = createGeometryTopologyEditDefinition({
      operation: "Inset Face",
      sourceObjectVersion: createGeometryTopologySourceVersion({
        objectId: "box-1",
        label: "Box",
        revision: 7,
        vertexCount: 4,
        faceCount: 2,
      }),
      target: createGeometryTopologyFaceTarget(1),
      parameters: { ratio: 0.25 },
    });

    expect(describeGeometryTopologyEditDefinition(definition)).toEqual({
      badge: "Replayable definition",
      sourceRevisionLabel: "Source revision 7 (4V / 2F)",
      replayStatusLabel: "Replayable from geometry:box-1:r7:v4:f2",
    });
    expect(describeGeometryTopologyEditDefinition(definition, false).replayStatusLabel).toBe(
      "Source snapshot missing for geometry:box-1:r7:v4:f2"
    );
  });

  it("updates edited params directly on the definition", () => {
    const definition = createGeometryTopologyEditDefinition({
      operation: "Bevel Edge",
      sourceObjectVersion: createGeometryTopologySourceVersion({
        objectId: "box-1",
        label: "Box",
        revision: 1,
        vertexCount: 4,
        faceCount: 2,
      }),
      target: createGeometryTopologyEdgeTarget(1, 2),
      parameters: { amount: 0.04 },
    });

    const updated = updateGeometryTopologyEditDefinitionParameters(definition, { amount: 0.125 });

    expect(updated.paramsLabel).toBe("amount=0.125");
    expect(updated.replayLabel).toContain("params=amount=0.125");
  });

  it("retargets while preserving the source revision and params", () => {
    const definition = createGeometryTopologyEditDefinition({
      operation: "Move Vertex",
      sourceObjectVersion: createGeometryTopologySourceVersion({
        objectId: "box-1",
        label: "Box",
        revision: 2,
        vertexCount: 4,
        faceCount: 2,
      }),
      target: createGeometryTopologyVertexTarget(1),
      parameters: { amount: 0.25, direction: { x: 1, y: 0, z: 0 } },
    });

    const retargeted = retargetGeometryTopologyEditDefinition(definition, createGeometryTopologyVertexTarget(2));

    expect(retargeted.selectionKey).toBe("geometry:box-1:r2:v4:f2|Move Vertex|vertex:2");
    expect(retargeted.paramsLabel).toBe("amount=0.25, dirX=1, dirY=0, dirZ=0");
  });

  it("chooses the correct active slot target for retargeting", () => {
    const sourceObjectVersion = createGeometryTopologySourceVersion({
      objectId: "box-1",
      label: "Box",
      revision: 2,
      vertexCount: 4,
      faceCount: 2,
    });
    const edgeDefinition = createGeometryTopologyEditDefinition({
      operation: "Bevel Edge",
      sourceObjectVersion,
      target: createGeometryTopologyEdgeTarget(1, 2),
      parameters: { amount: 0.08 },
    });
    const faceDefinition = createGeometryTopologyEditDefinition({
      operation: "Extrude Face",
      sourceObjectVersion,
      target: createGeometryTopologyFaceTarget(0),
      parameters: { distance: 0.1 },
    });

    expect(
      createGeometryTopologyRetargetTarget(edgeDefinition, {
        kind: "edge",
        edgeVertices: [3, 1],
        objectId: "box-1",
      })
    ).toEqual({
      ok: true,
      target: createGeometryTopologyEdgeTarget(1, 3),
      objectId: "box-1",
    });
    expect(createGeometryTopologyRetargetTarget(faceDefinition, { kind: "edge", edgeVertices: [0, 1] })).toEqual({
      ok: false,
      reason: "choose a face slot first.",
    });
  });

  it("reports missing targets before replay", () => {
    const definition = createGeometryTopologyEditDefinition({
      operation: "Split Edge",
      sourceObjectVersion: createGeometryTopologySourceVersion({
        objectId: "box-1",
        label: "Box",
        revision: 4,
        vertexCount: 4,
        faceCount: 2,
      }),
      target: createGeometryTopologyEdgeTarget(0, 3),
      parameters: { ratio: 0.5 },
    });

    expect(resolveGeometryTopologyEditDefinitionTarget(makeMesh(), definition)).toEqual({
      ok: false,
      reason: "Edge 0-3 is missing in source object revision geometry:box-1:r4:v4:f2.",
    });
    expect(() => applyGeometryTopologyEditDefinition(makeMesh(), definition)).toThrow(
      "Edge 0-3 is missing in source object revision geometry:box-1:r4:v4:f2."
    );
  });
});
