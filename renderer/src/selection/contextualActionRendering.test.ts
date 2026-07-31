import { describe, expect, it } from "vitest";
import { getContextualActionDescriptors } from "./contextualActions";
import {
  buildContextualRenderedAction,
  buildContextualRenderedActions,
  buildContextualRenderedActionsForPrefix,
} from "./contextualActionRendering";

describe("contextualActionRendering", () => {
  it("builds shared props for card and strip actions", () => {
    const split = getContextualActionDescriptors("mesh", "edge")[0]!;
    const onClick = () => undefined;

    expect(
      buildContextualRenderedAction({
        descriptor: split,
        testIdPrefix: "mesh-context",
        onClick,
        disabled: false,
        activePulseId: "mesh:edge-split",
      })
    ).toMatchObject({
      label: "Split",
      testId: "mesh-context-split-edge",
      onClick,
      disabled: false,
      disabledReason: "Click an edge to enable Split.",
      pulse: true,
    });
  });

  it("maps descriptor lists without losing local disabled state", () => {
    const geometryFace = getContextualActionDescriptors("geometry", "face");

    expect(
      buildContextualRenderedActions(
        geometryFace.map((descriptor) => ({
          descriptor,
          testIdPrefix: "geometry-active-selection-action",
          disabled: descriptor.operationKey !== "extrude-face",
        }))
      )
    ).toEqual([
      expect.objectContaining({ label: "Extrude", testId: "geometry-active-selection-action-extrude-face", disabled: false }),
      expect.objectContaining({ label: "Inset", testId: "geometry-active-selection-action-inset-face", disabled: true }),
      expect.objectContaining({ label: "Delete", testId: "geometry-active-selection-action-delete-face", disabled: true }),
    ]);
  });

  it("renders one binding list for different UI prefixes", () => {
    const geometryFace = getContextualActionDescriptors("geometry", "face");
    const onClick = () => undefined;
    const bindings = geometryFace.map((descriptor) => ({
      descriptor,
      onClick,
      disabled: descriptor.operationKey !== "extrude-face",
    }));

    expect(buildContextualRenderedActionsForPrefix(bindings, "geometry-context")).toEqual([
      expect.objectContaining({ label: "Extrude", testId: "geometry-context-extrude-face", onClick, disabled: false }),
      expect.objectContaining({ label: "Inset", testId: "geometry-context-inset-face", onClick, disabled: true }),
      expect.objectContaining({ label: "Delete", testId: "geometry-context-delete-face", onClick, disabled: true }),
    ]);
  });
});
