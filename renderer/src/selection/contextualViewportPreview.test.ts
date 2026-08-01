import { describe, expect, it } from "vitest";
import {
  applyContextualViewportPreviewOverlayContract,
  buildContextualViewportPreview,
  CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES,
  CONTEXTUAL_VIEWPORT_PREVIEW_TIMING,
  countContextualViewportPreviewOverlays,
  formatContextualViewportPreviewBadgeLabel,
  formatContextualViewportPreviewCounts,
  contextualViewportPreviewRoleColor,
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

  it("shares preview badge wording and applied timing", () => {
    expect(
      formatContextualViewportPreviewBadgeLabel({
        phase: "preview",
        label: "Edge 5-6 -> midpoint vertex",
      })
    ).toBe("Viewport preview: Edge 5-6 -> midpoint vertex");
    expect(
      formatContextualViewportPreviewBadgeLabel({
        phase: "applied",
        label: "Edge 5-6 split",
      })
    ).toBe("Applied: Edge 5-6 split");
    expect(CONTEXTUAL_VIEWPORT_PREVIEW_TIMING.appliedDurationMs).toBe(1800);
  });

  it("exposes one shared color role model for preview overlays", () => {
    expect(contextualViewportPreviewRoleColor("selected")).toBe(
      CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.selected.color
    );
    expect(contextualViewportPreviewRoleColor("preview", "fillColor")).toBe(
      CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.preview.fillColor
    );
  });

  it("normalizes applied overlays to the shared applied role", () => {
    const overlays = applyContextualViewportPreviewOverlayContract(
      {
        meshGroups: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], color: 0x14b8a6, opacity: 0.2 }],
        pointSets: [{ points: [{ x: 0, y: 0, z: 0 }], color: 0xf97316, opacity: 0.3 }],
        polylineGroups: [{ lines: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]], color: 0xf97316, opacity: 0.4 }],
        labelSets: [{ labels: [{ text: "Preview split", position: { x: 0, y: 0, z: 0 }, color: 0x0f766e }] }],
      },
      { phase: "applied" }
    );

    expect(overlays?.meshGroups?.[0]?.color).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.color);
    expect(overlays?.pointSets?.[0]?.color).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.color);
    expect(overlays?.polylineGroups?.[0]?.color).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.color);
    expect(overlays?.labelSets?.[0]?.labels[0]?.text).toBe("Applied: split");
    expect(overlays?.labelSets?.[0]?.labels[0]?.color).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.darkColor);
  });
});
