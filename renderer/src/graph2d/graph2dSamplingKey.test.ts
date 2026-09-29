import { expect, it } from "vitest";
import { instantiateGraph2DPreset, getGraph2DPresetCatalog, graph2DGridFields, graph2DAxesFromGridFields } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { graph2DSceneSamplingKey } from "./graph2dSamplingKey";
const scene = () => instantiateGraph2DPreset(getGraph2DPresetCatalog().get("translated-quadratic")!, "grid-key").document;
it("grid/selection/metadata edits do not restart curve sampling", () => {
  const original = scene(), request = { document: original, viewport: original.display.viewport, width: 800, height: 600, interaction: false };
  const axes = graph2DAxesFromGridFields(original, { ...graph2DGridFields(original), density: "dense", contrast: "strong", xStep: ".5" });
  const next = new Graph2DCommandAdapter(original).commitScene({ source: original.source, selection: original.selection, display: { ...original.display, axes } }, "style");
  expect(graph2DSceneSamplingKey({ ...request, document: next })).toBe(graph2DSceneSamplingKey(request));
  expect(graph2DSceneSamplingKey({ ...request, document: { ...original, selection: { objectId: original.source.objects[0].id, probe: null }, metadata: { ...original.metadata, title: "Renamed" } } })).toBe(graph2DSceneSamplingKey(request));
});
it("viewport, style, source ownership, quality and bounded execution changes still invalidate sampling", () => {
  const document = scene(), request = { document, viewport: document.display.viewport, width: 800, height: 600, interaction: false };
  const key = graph2DSceneSamplingKey(request);
  for (const next of [{ ...request, viewport: { ...request.viewport, xMin: request.viewport.xMin - 1 } },
    { ...request, interaction: true }, { ...request, width: 900 }, { ...request, deterministic: true }, { ...request, timeBudgetMs: 100 },
    { ...request, document: { ...document, identity: { ...document.identity, revision: document.identity.revision + 1 } } },
    { ...request, document: { ...document, display: { ...document.display, sampling: { ...document.display.sampling, maxSamples: 512 } } } },
    { ...request, document: { ...document, display: { ...document.display, objects: document.display.objects.map(s => ({ ...s, visible: false })) } } }])
    expect(graph2DSceneSamplingKey(next)).not.toBe(key);
});
