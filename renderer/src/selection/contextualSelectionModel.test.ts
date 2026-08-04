import { describe, expect, it } from "vitest";
import {
  formatContextEntityId,
  formatContextEntityLabel,
  formatContextEntityPreview,
  getContextEntityActions,
} from "./contextualSelectionModel";

describe("contextualSelectionModel", () => {
  it("formats shared entity labels and previews", () => {
    expect(formatContextEntityLabel("face", 8)).toBe("Selected face 8");
    expect(formatContextEntityId("edge", "5-6")).toBe("Edge 5-6");
    expect(formatContextEntityPreview("edge", "5-6", "midpoint vertex")).toBe(
      "Preview: Edge 5-6 -> midpoint vertex"
    );
  });

  it("keeps Mesh and Geometry action lists in the shared model", () => {
    expect(getContextEntityActions("mesh", "face")).toEqual(["Subdivide"]);
    expect(getContextEntityActions("mesh", "edge")).toEqual([
      "Split",
      "Collapse",
      "Bevel",
      "Loop",
      "Ring",
      "Boundary",
      "Sharp",
      "Feature",
    ]);
    expect(getContextEntityActions("geometry", "face")).toEqual(["Extrude", "Inset", "Delete"]);
    expect(getContextEntityActions("geometry", "edge")).toEqual(["Split", "Mirror", "Offset"]);
  });
});
