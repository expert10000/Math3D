import { describe, expect, it } from "vitest";
import {
  buildContextualViewportPreview,
  countContextualViewportPreviewOverlays,
  formatContextualViewportPreviewCounts,
} from "./contextualViewportPreview";

describe("contextualViewportPreview", () => {
  it("counts mesh, point, polyline, and label overlay payloads", () => {
    expect(
      countContextualViewportPreviewOverlays({
        meshGroups: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], color: 0x14b8a6 }],
        pointSets: [{ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }],
        polylineGroups: [{ lines: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]], color: 0xf97316 }],
        labelSets: [{ labels: [{ text: "Preview", position: { x: 0, y: 0, z: 0 } }] }],
      })
    ).toBe(5);
  });

  it("builds a preview only when label and selected entity are available", () => {
    expect(
      buildContextualViewportPreview({
        workspace: "Mesh",
        operation: "Split",
        selectedEntity: "Edge 5-6",
        label: "Edge 5-6 -> midpoint vertex",
        actionPulseId: "mesh:edge-split",
        details: [{ label: "Counts", value: "V 8 -> 9, F 12 -> 14" }],
        overlays: { pointSets: [{ points: [{ x: 0, y: 0, z: 0 }] }] },
      })
    ).toMatchObject({
      workspace: "Mesh",
      operation: "Split",
      selectedEntity: "Edge 5-6",
      actionPulseId: "mesh:edge-split",
      details: [{ label: "Counts", value: "V 8 -> 9, F 12 -> 14" }],
      overlayCount: 1,
      hasOverlay: true,
    });

    expect(
      buildContextualViewportPreview({
        workspace: "Geometry",
        operation: "Extrude",
        selectedEntity: null,
        label: "Face 8 -> extrude 0.15",
        overlays: {},
      })
    ).toBeNull();
  });

  it("formats before and after topology counts for preview details", () => {
    expect(
      formatContextualViewportPreviewCounts(
        { vertexCount: 8, faceCount: 12 },
        { vertexCount: 9, faceCount: 14 }
      )
    ).toBe("V 8 -> 9, F 12 -> 14");
  });
});
