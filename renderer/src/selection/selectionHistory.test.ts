import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  getUnifiedSelectionKey,
  unifiedSelectionFromGeometryObject,
  unifiedSelectionFromMeshTopology,
} from "./unifiedSelection";
import {
  addSelectionHistoryEntry,
  bookmarkSelectionEntry,
  findRestorableSelectionEntry,
  getRedoSelectionEntry,
  removeSelectionBookmark,
} from "./selectionHistory";

const squareMesh: SurfaceMeshData = {
  label: "Square",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
};

describe("selectionHistory", () => {
  it("records recent selections with stable keys and dedupes to the front", () => {
    const edge = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
      topologyVersion: 4,
    });
    const face = unifiedSelectionFromMeshTopology({
      mode: "face",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      faceIndex: 1,
      valid: true,
      topologyVersion: 4,
    });
    expect(edge && face).toBeTruthy();

    let history = addSelectionHistoryEntry([], edge, { breadcrumb: "Mesh > Object: Square mesh > Edge 0-2", now: 10 });
    history = addSelectionHistoryEntry(history, face, { breadcrumb: "Mesh > Object: Square mesh > Face 1", now: 20 });
    history = addSelectionHistoryEntry(history, edge, { breadcrumb: "Mesh > Object: Square mesh > Edge 0-2", now: 30 });

    expect(history.map((entry) => entry.key)).toEqual([getUnifiedSelectionKey(edge!), getUnifiedSelectionKey(face!)]);
    expect(history[0]).toMatchObject({
      label: "Square mesh edge [0-2]",
      breadcrumb: "Mesh > Object: Square mesh > Edge 0-2",
      capturedAt: 30,
    });
  });

  it("bookmarks selections and restores candidates by key", () => {
    const objectSelection = unifiedSelectionFromGeometryObject({
      objectId: "box-1",
      objectLabel: "Box",
      objectType: "box",
      topologyVersion: 2,
    });
    expect(objectSelection).toBeTruthy();

    const history = addSelectionHistoryEntry([], objectSelection, {
      breadcrumb: "Geometry > Object: Box",
      now: 100,
    });
    const bookmarks = bookmarkSelectionEntry([], history[0], { now: 120 });
    const restored = findRestorableSelectionEntry(bookmarks, getUnifiedSelectionKey(objectSelection!));

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].bookmarkedAt).toBe(120);
    expect(restored?.selection).toMatchObject({
      workspace: "geometry",
      selectionType: "object",
      objectId: "box-1",
      objectLabel: "Box",
      source: "geometry-object",
    });
    expect(removeSelectionBookmark(bookmarks, bookmarks[0].key)).toEqual([]);
  });

  it("returns the latest different entry for redo selection", () => {
    const edgeA = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const edgeB = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
    });
    let history = addSelectionHistoryEntry([], edgeA, { now: 1 });
    history = addSelectionHistoryEntry(history, edgeB, { now: 2 });

    expect(getRedoSelectionEntry(history, getUnifiedSelectionKey(edgeB!))?.key).toBe(getUnifiedSelectionKey(edgeA!));
    expect(getRedoSelectionEntry(history, null)?.key).toBe(getUnifiedSelectionKey(edgeB!));
  });
});
