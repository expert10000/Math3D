import { describe, expect, it } from "vitest";
import { getContextualActionDescriptors } from "./contextualActions";

describe("contextualActions", () => {
  it("builds Mesh edge action descriptors", () => {
    const descriptors = getContextualActionDescriptors("mesh", "edge");

    expect(descriptors.map((descriptor) => descriptor.label)).toEqual([
      "Split",
      "Collapse",
      "Bevel",
      "Loop",
      "Ring",
      "Boundary",
      "Sharp",
      "Feature",
    ]);
    expect(descriptors.map((descriptor) => descriptor.operationKey)).toEqual([
      "split-edge",
      "collapse-edge",
      "bevel-edge",
      "select-edge-loop",
      "select-edge-ring",
      "select-boundary",
      "select-sharp-edges",
      "select-feature-edges",
    ]);
    expect(descriptors.map((descriptor) => descriptor.testIdSuffix)).toEqual([
      "split-edge",
      "collapse-edge",
      "bevel-edge",
      "select-edge-loop",
      "select-edge-ring",
      "select-boundary",
      "select-sharp-edges",
      "select-feature-edges",
    ]);
  });

  it("builds Mesh face and vertex topology action descriptors", () => {
    expect(getContextualActionDescriptors("mesh", "face").map((descriptor) => descriptor.operationKey)).toEqual([
      "subdivide-face",
      "extrude-face",
      "inset-face",
    ]);
    expect(getContextualActionDescriptors("mesh", "vertex").map((descriptor) => descriptor.operationKey)).toEqual([
      "vertex-marker",
      "move-vertex",
    ]);
  });

  it("builds Geometry face action descriptors", () => {
    const descriptors = getContextualActionDescriptors("geometry", "face");

    expect(descriptors.map((descriptor) => descriptor.label)).toEqual(["Extrude", "Inset", "Delete"]);
    expect(descriptors.map((descriptor) => descriptor.operationKey)).toEqual([
      "extrude-face",
      "inset-face",
      "delete-face",
    ]);
  });

  it("keeps disabled reasons aligned with shared wording", () => {
    expect(getContextualActionDescriptors("mesh", "edge")[0].disabledReason).toBe("Choose an edge to enable Split.");
    expect(getContextualActionDescriptors("geometry", "face")[0].disabledReason).toBe(
      "Choose a face to enable Extrude."
    );
  });
});
