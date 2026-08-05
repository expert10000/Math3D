import { describe, expect, it } from "vitest";
import type { SurfaceTopologyGizmoDragInfo } from "../components/SurfaceViewer";
import {
  buildGeometryTopologyGizmoTarget,
  geometryTopologyGizmoReleaseAction,
  mapGeometryTopologyGizmoDragToParams,
} from "./geometryTopologyGizmo";

const dragInfo = (mode: SurfaceTopologyGizmoDragInfo["mode"], distance: number): SurfaceTopologyGizmoDragInfo => ({
  mode,
  origin: { x: 0, y: 0, z: 0 },
  axis: { x: 0, y: 1, z: 0 },
  point: { x: 0, y: distance, z: 0 },
  delta: { x: 0, y: distance, z: 0 },
  distance,
});

describe("geometryTopologyGizmo", () => {
  it("chooses a face normal handle at the selected face centroid", () => {
    const target = buildGeometryTopologyGizmoTarget({
      geometryMode: "procedural",
      selectionMode: "face",
      faceTarget: {
        objectId: "shape",
        faceIndex: 2,
        point: { x: 9, y: 9, z: 9 },
        normal: { x: 0, y: 2, z: 0 },
        faceVertices: [
          { x: 0, y: 0, z: 0 },
          { x: 3, y: 0, z: 0 },
          { x: 0, y: 0, z: 3 },
        ],
      },
      referenceLength: 2,
    });

    expect(target).toMatchObject({
      enabled: true,
      mode: "face",
      axis: { x: 0, y: 1, z: 0 },
      length: 2,
      label: "Geometry face handle",
    });
    expect(target?.origin.x).toBeCloseTo(1);
    expect(target?.origin.y).toBeCloseTo(0.05);
    expect(target?.origin.z).toBeCloseTo(1);
  });

  it("chooses an edge rail handle along the selected edge", () => {
    const target = buildGeometryTopologyGizmoTarget({
      geometryMode: "procedural",
      selectionMode: "edge",
      edgeTarget: {
        objectId: "shape",
        edgeVertexPair: [4, 7],
        point: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        edgePoints: [
          { x: 1, y: 2, z: 3 },
          { x: 4, y: 2, z: 3 },
        ],
        edgeLength: 3,
      },
      referenceLength: 3,
    });

    expect(target).toMatchObject({
      enabled: true,
      mode: "edge",
      origin: { x: 2.5, y: 2, z: 3 },
      axis: { x: 1, y: 0, z: 0 },
      length: 3,
      label: "Geometry edge handle",
    });
  });

  it("chooses a vertex point handle at the selected vertex", () => {
    const target = buildGeometryTopologyGizmoTarget({
      geometryMode: "procedural",
      selectionMode: "vertex",
      vertexTarget: {
        objectId: "shape",
        vertexIndex: 11,
        point: { x: -1, y: 2, z: 0.5 },
        normal: { x: 0, y: 0, z: -5 },
      },
      referenceLength: 0.5,
    });

    expect(target).toMatchObject({
      enabled: true,
      mode: "vertex",
      origin: { x: -1, y: 2, z: 0.5 },
      axis: { x: 0, y: 0, z: -1 },
      length: 0.5,
      label: "Geometry vertex handle",
    });
  });

  it("maps face drags to extrude and inset parameters", () => {
    const extrude = mapGeometryTopologyGizmoDragToParams(dragInfo("face", 0.25), {
      edgeMode: "split",
      faceInsetRatio: 0.2,
      faceExtrudeDistance: 0.1,
      edgeSplitRatio: 0.5,
      edgeBevelAmount: 0.03,
      vertexMoveAmount: 0.06,
      referenceLength: 1,
    });
    const inset = mapGeometryTopologyGizmoDragToParams(dragInfo("face", -0.1), {
      edgeMode: "split",
      faceInsetRatio: 0.2,
      faceExtrudeDistance: 0.1,
      edgeSplitRatio: 0.5,
      edgeBevelAmount: 0.03,
      vertexMoveAmount: 0.06,
      referenceLength: 2,
    });

    expect(extrude).toMatchObject({ operation: "Extrude Face", distance: 0.35, label: "distance=0.35" });
    expect(inset).toMatchObject({ operation: "Inset Face", ratio: 0.25, label: "ratio=0.25" });
  });

  it("maps edge drags to split ratio or bevel amount from edge mode", () => {
    const split = mapGeometryTopologyGizmoDragToParams(dragInfo("edge", 0.25), {
      edgeMode: "split",
      faceInsetRatio: 0.2,
      faceExtrudeDistance: 0.1,
      edgeSplitRatio: 0.5,
      edgeBevelAmount: 0.03,
      vertexMoveAmount: 0.06,
      referenceLength: 2,
    });
    const bevel = mapGeometryTopologyGizmoDragToParams(dragInfo("edge", 0.08), {
      edgeMode: "bevel",
      faceInsetRatio: 0.2,
      faceExtrudeDistance: 0.1,
      edgeSplitRatio: 0.5,
      edgeBevelAmount: 0.03,
      vertexMoveAmount: 0.06,
      referenceLength: 2,
    });

    expect(split).toMatchObject({ operation: "Split Edge", ratio: 0.625, label: "ratio=0.625" });
    expect(bevel).toMatchObject({ operation: "Bevel Edge", amount: 0.11, label: "amount=0.11" });
  });

  it("maps vertex drags to move parameters", () => {
    expect(
      mapGeometryTopologyGizmoDragToParams(dragInfo("vertex", -0.04), {
        edgeMode: "split",
        faceInsetRatio: 0.2,
        faceExtrudeDistance: 0.1,
        edgeSplitRatio: 0.5,
        edgeBevelAmount: 0.03,
        vertexMoveAmount: 0.06,
        referenceLength: 1,
      })
    ).toMatchObject({ operation: "Move Vertex", amount: 0.04, directionSign: -1, label: "amount=0.04" });
  });

  it("maps drag release parameters to the operation the handler should apply", () => {
    expect(geometryTopologyGizmoReleaseAction({ operation: "Extrude Face", distance: 0.2, label: "distance=0.2" })).toBe(
      "extrude-face"
    );
    expect(geometryTopologyGizmoReleaseAction({ operation: "Inset Face", ratio: 0.3, label: "ratio=0.3" })).toBe(
      "inset-face"
    );
    expect(geometryTopologyGizmoReleaseAction({ operation: "Split Edge", ratio: 0.7, label: "ratio=0.7" })).toBe(
      "split-edge"
    );
    expect(geometryTopologyGizmoReleaseAction({ operation: "Bevel Edge", amount: 0.04, label: "amount=0.04" })).toBe(
      "bevel-edge"
    );
    expect(
      geometryTopologyGizmoReleaseAction({
        operation: "Move Vertex",
        amount: 0.05,
        directionSign: 1,
        label: "amount=0.05",
      })
    ).toBe("move-vertex");
    expect(geometryTopologyGizmoReleaseAction(null)).toBeNull();
  });
});
