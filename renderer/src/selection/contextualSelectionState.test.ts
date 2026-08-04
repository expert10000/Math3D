import { describe, expect, it } from "vitest";
import { buildContextualSelectionState } from "./contextualSelectionState";

describe("contextualSelectionState", () => {
  it("builds a ready mesh face selection state", () => {
    expect(
      buildContextualSelectionState({
        workspace: "mesh",
        pickMode: "face",
        entities: {
          face: {
            id: 8,
            valid: true,
            previewResult: "subdivide center fan",
          },
        },
      })
    ).toMatchObject({
      selectionLabel: "Selected face 8",
      activeCardType: "Face",
      cardId: "Face 8",
      emptyState: null,
      actions: ["Subdivide"],
      previewLabel: "Preview: Face 8 -> subdivide center fan",
      canRunPrimaryAction: true,
    });
  });

  it("builds an empty mesh edge selection state", () => {
    expect(
      buildContextualSelectionState({
        workspace: "mesh",
        pickMode: "edge",
        entities: {
          edge: {
            id: "5-6",
            valid: false,
            previewResult: "midpoint vertex",
          },
        },
      })
    ).toMatchObject({
      selectionLabel: "Choose an edge to enable Split / Collapse / Bevel / Loop / Ring / Boundary",
      activeCardType: "Edge",
      cardId: "none",
      emptyState: "Choose an edge to enable Split / Collapse / Bevel / Loop / Ring / Boundary",
      actions: ["Split", "Collapse", "Bevel", "Loop", "Ring", "Boundary"],
      previewLabel: null,
      canRunPrimaryAction: false,
    });
  });

  it("builds a ready mesh object selection state", () => {
    expect(
      buildContextualSelectionState({
        workspace: "mesh",
        pickMode: "object",
        objectLabel: "Box",
        objectReady: true,
      })
    ).toMatchObject({
      selectionLabel: "Selected mesh object: Box",
      activeCardType: "Object",
      cardId: "Box",
      emptyState: null,
      actions: ["Open in Geometry", "Save edited", "Mesh source"],
      previewLabel: "Preview: open selected mesh in Geometry",
      canRunPrimaryAction: true,
    });
  });

  it("keeps Geometry action state available for the next migration", () => {
    expect(
      buildContextualSelectionState({
        workspace: "geometry",
        pickMode: "face",
        entities: {
          face: {
            id: 8,
            valid: true,
            previewResult: "extrude 0.15",
          },
        },
      })
    ).toMatchObject({
      selectionLabel: "Selected face 8",
      actions: ["Extrude", "Inset", "Delete"],
      previewLabel: "Preview: Face 8 -> extrude 0.15",
    });
  });

  it("builds Geometry edge and vertex states", () => {
    expect(
      buildContextualSelectionState({
        workspace: "geometry",
        pickMode: "edge",
        entities: {
          edge: {
            id: "5-6",
            valid: true,
            primaryReady: true,
            previewResult: "midpoint vertex",
          },
        },
      })
    ).toMatchObject({
      selectionLabel: "Selected edge 5-6",
      activeCardType: "Edge",
      cardId: "Edge 5-6",
      actions: ["Split", "Mirror", "Offset"],
      previewLabel: "Preview: Edge 5-6 -> midpoint vertex",
      canRunPrimaryAction: true,
    });

    expect(
      buildContextualSelectionState({
        workspace: "geometry",
        pickMode: "vertex",
        entities: {
          vertex: {
            id: 12,
            valid: true,
            previewResult: "move 0.10",
          },
        },
      })
    ).toMatchObject({
      selectionLabel: "Selected vertex 12",
      activeCardType: "Vertex",
      cardId: "Vertex 12",
      actions: ["Marker", "Move"],
      previewLabel: "Preview: Vertex 12 -> move 0.10",
      canRunPrimaryAction: true,
    });
  });
});
