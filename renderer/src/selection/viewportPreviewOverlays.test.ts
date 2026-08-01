import { describe, expect, it } from "vitest";
import { CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES } from "./contextualViewportPreview";
import {
  makeViewportPreviewLabelSet,
  makeViewportPreviewMeshGroup,
  makeViewportPreviewPointSet,
  makeViewportPreviewPolylineGroup,
  normalizeViewportPreviewOverlays,
  offsetViewportPreviewLabelPosition,
  viewportPreviewRoleColor,
} from "./viewportPreviewOverlays";

describe("viewportPreviewOverlays", () => {
  it("builds common overlay groups from the shared preview roles", () => {
    expect(
      makeViewportPreviewMeshGroup({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        role: "applied",
      })
    ).toMatchObject({
      color: CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.color,
      doubleSided: true,
    });

    expect(
      makeViewportPreviewPointSet({
        points: [{ x: 0, y: 0, z: 0 }],
        role: "selected",
        tone: "fillColor",
      }).color
    ).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.selected.fillColor);

    expect(
      makeViewportPreviewPolylineGroup({
        lines: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]],
        role: "removed",
      }).color
    ).toBe(CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.removed.color);
  });

  it("builds shared label positions and label sets", () => {
    expect(offsetViewportPreviewLabelPosition({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2.034, z: 3 });
    expect(
      makeViewportPreviewLabelSet({
        labels: [{ text: "Preview split", position: { x: 1, y: 2, z: 3 } }],
        role: "preview",
      }).labels[0]
    ).toMatchObject({
      text: "Preview split",
      color: viewportPreviewRoleColor("preview", "darkColor"),
    });
  });

  it("wraps preview overlays through the shared phase contract", () => {
    const overlays = normalizeViewportPreviewOverlays(
      {
        labelSets: [
          {
            labels: [{ text: "Preview split", position: { x: 0, y: 0, z: 0 } }],
          },
        ],
      },
      { phase: "applied" }
    );

    expect(overlays?.labelSets?.[0]?.labels[0]?.text).toBe("Applied: split");
    expect(overlays?.labelSets?.[0]?.labels[0]?.color).toBe(
      CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.darkColor
    );
  });
});
