import { describe, expect, it } from "vitest";
import { getContextualActionDescriptors } from "./contextualActions";

describe("contextualActions", () => {
  it("builds Mesh edge action descriptors", () => {
    const descriptors = getContextualActionDescriptors("mesh", "edge");

    expect(descriptors.map((descriptor) => descriptor.label)).toEqual(["Split", "Collapse", "Bevel"]);
    expect(descriptors.map((descriptor) => descriptor.operationKey)).toEqual([
      "split-edge",
      "collapse-edge",
      "bevel-edge",
    ]);
    expect(descriptors.map((descriptor) => descriptor.testIdSuffix)).toEqual([
      "split-edge",
      "collapse-edge",
      "bevel-edge",
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
    expect(getContextualActionDescriptors("mesh", "edge")[0].disabledReason).toBe("Click an edge to enable Split.");
    expect(getContextualActionDescriptors("geometry", "face")[0].disabledReason).toBe(
      "Click a face to enable Extrude."
    );
  });
});
