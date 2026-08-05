import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  createGeometryTopologyEditDefinition,
  createGeometryTopologyEdgeTarget,
  createGeometryTopologyFaceTarget,
  createGeometryTopologySourceVersion,
  createGeometryTopologyVertexTarget,
} from "./topologyEditDefinition";
import {
  buildGeometryTopologyOperationTree,
  replayGeometryTopologyOperationTreeFromNode,
  reorderGeometryTopologyOperationTreeNodeIds,
  type GeometryTopologyOperationTreeInputNode,
} from "./topologyOperationTree";

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

const sourceVersion = createGeometryTopologySourceVersion({
  objectId: "box-1",
  label: "Box",
  revision: 1,
  vertexCount: 4,
  faceCount: 2,
});

describe("geometry topology operation tree", () => {
  it("builds a chronological read-only chain with target, params, source revision, and enabled state", () => {
    const mesh = makeMesh();
    const nodes: GeometryTopologyOperationTreeInputNode[] = [
      {
        id: "bevel",
        label: "Bevel edge",
        at: 20,
        sourceMesh: mesh,
        enabled: false,
        definition: createGeometryTopologyEditDefinition({
          operation: "Bevel Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(1, 2),
          parameters: { amount: 0.08 },
        }),
      },
      {
        id: "split",
        label: "Split edge",
        at: 10,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Split Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(1, 2),
          parameters: { ratio: 0.5 },
        }),
      },
    ];

    const tree = buildGeometryTopologyOperationTree(nodes, "Edited box");

    expect(tree.sourceLabel).toBe("Box");
    expect(tree.resultLabel).toBe("Edited box");
    expect(tree.nodes.map((node) => node.id)).toEqual(["split", "bevel"]);
    expect(tree.nodes[0]).toMatchObject({
      operationLabel: "Split Edge",
      targetLabel: "Edge 1-2",
      paramsLabel: "ratio=0.5",
      sourceRevisionLabel: "Source revision 1 (4V / 2F)",
      enabled: true,
    });
    expect(tree.nodes[1].enabled).toBe(false);
  });

  it("orders nodes by explicit operation-tree order before falling back to time", () => {
    const mesh = makeMesh();
    const tree = buildGeometryTopologyOperationTree([
      {
        id: "first-by-time",
        label: "First by time",
        at: 10,
        order: 2,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Split Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(1, 2),
          parameters: { ratio: 0.5 },
        }),
      },
      {
        id: "first-by-order",
        label: "First by order",
        at: 20,
        order: 0,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Move Vertex",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyVertexTarget(1),
          parameters: { amount: 0.1, direction: { x: 1, y: 0, z: 0 } },
        }),
      },
    ]);

    expect(tree.nodes.map((node) => node.id)).toEqual(["first-by-order", "first-by-time"]);
  });

  it("reorders node ids up and down without losing ids", () => {
    expect(reorderGeometryTopologyOperationTreeNodeIds(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(reorderGeometryTopologyOperationTreeNodeIds(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(reorderGeometryTopologyOperationTreeNodeIds(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
  });

  it("replays from the chosen node onward and skips disabled later nodes", () => {
    const mesh = makeMesh();
    const tree = buildGeometryTopologyOperationTree([
      {
        id: "extrude",
        label: "Extrude face",
        at: 10,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Extrude Face",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyFaceTarget(0),
          parameters: { distance: 0.2 },
        }),
      },
      {
        id: "move",
        label: "Move vertex",
        at: 20,
        sourceMesh: mesh,
        enabled: false,
        definition: createGeometryTopologyEditDefinition({
          operation: "Move Vertex",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyVertexTarget(1),
          parameters: { amount: 0.25, direction: { x: 1, y: 0, z: 0 } },
        }),
      },
    ]);

    const replayed = replayGeometryTopologyOperationTreeFromNode(tree, "extrude");

    expect(replayed).toMatchObject({
      ok: true,
      appliedNodeIds: ["extrude"],
      skippedNodeIds: ["move"],
      startNodeId: "extrude",
    });
    expect(replayed.ok ? Math.floor(replayed.mesh.positions.length / 3) : 0).toBe(7);
  });

  it("uses the selected node source mesh when replaying from the middle", () => {
    const mesh = makeMesh();
    const tree = buildGeometryTopologyOperationTree([
      {
        id: "split",
        label: "Split edge",
        at: 10,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Split Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(1, 2),
          parameters: { ratio: 0.5 },
        }),
      },
      {
        id: "move",
        label: "Move vertex",
        at: 20,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Move Vertex",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyVertexTarget(1),
          parameters: { amount: 0.25, direction: { x: 1, y: 0, z: 0 } },
        }),
      },
    ]);

    const replayed = replayGeometryTopologyOperationTreeFromNode(tree, "move");

    expect(replayed.ok ? replayed.appliedNodeIds : []).toEqual(["move"]);
    expect(replayed.ok ? replayed.mesh.positions[3] : 0).toBeCloseTo(1.25);
  });

  it("reports the node that blocks replay when a target is missing", () => {
    const mesh = makeMesh();
    const tree = buildGeometryTopologyOperationTree([
      {
        id: "missing",
        label: "Split missing edge",
        at: 10,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Split Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(0, 3),
          parameters: { ratio: 0.5 },
        }),
      },
    ]);

    expect(replayGeometryTopologyOperationTreeFromNode(tree, "missing")).toEqual({
      ok: false,
      reason: "Replay blocked at Split missing edge: Edge 0-3 is missing in source object revision geometry:box-1:r1:v4:f2.",
      nodeId: "missing",
    });
  });

  it("reports the reordered later node that blocks replay", () => {
    const mesh = makeMesh();
    const tree = buildGeometryTopologyOperationTree([
      {
        id: "move",
        label: "Move after reorder",
        at: 20,
        order: 0,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Move Vertex",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyVertexTarget(1),
          parameters: { amount: 0.2, direction: { x: 1, y: 0, z: 0 } },
        }),
      },
      {
        id: "missing",
        label: "Missing after reorder",
        at: 10,
        order: 1,
        sourceMesh: mesh,
        definition: createGeometryTopologyEditDefinition({
          operation: "Split Edge",
          sourceObjectVersion: sourceVersion,
          target: createGeometryTopologyEdgeTarget(0, 3),
          parameters: { ratio: 0.5 },
        }),
      },
    ]);

    expect(replayGeometryTopologyOperationTreeFromNode(tree, "move")).toEqual({
      ok: false,
      reason: "Replay blocked at Missing after reorder: Edge 0-3 is missing in source object revision geometry:box-1:r1:v4:f2.",
      nodeId: "missing",
    });
  });
});
