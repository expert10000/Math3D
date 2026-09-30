import { expect, it } from "vitest";
import { getGraph2DPresetCatalog, instantiateGraph2DPreset } from "@math3d/core";
import { storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { selectMobileStartupProject } from "../../apps/mobile/src/models/mobileStartupProject";

const graph = storeMobileGraph(instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "startup").document);

it("restores an unsaved Surface snapshot after leaving a saved Graph, even with that Graph first in the library", () => {
  expect(selectMobileStartupProject([graph], null, true)).toBeNull();
  expect(selectMobileStartupProject([graph], "removed-project", true)).toBeNull();
});

it("continues to reopen an explicitly selected Graph and uses the library only without a valid viewer snapshot", () => {
  expect(selectMobileStartupProject([graph], graph.id, true)).toBe(graph);
  expect(selectMobileStartupProject([graph], null, false)).toBe(graph);
  expect(selectMobileStartupProject([graph], "removed-project", false)).toBe(graph);
  expect(selectMobileStartupProject([], null, false)).toBeNull();
});
