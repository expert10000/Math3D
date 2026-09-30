import { describe, expect, it } from "vitest";
import { createGraph2DPublication, getGraph2DPresetCatalog, instantiateGraph2DPreset, Graph2DPointTableStore, renderGraph2DPublicationArtifact,
  renderGraph2DCaptureRecipeArtifact } from "@math3d/core";
import { mobileGraphPublicationRequest } from "../../apps/mobile/src/models/mobileGraphPublication";
import { mobileGraphAnalysisDraft, runMobileGraphAnalysis } from "../../apps/mobile/src/models/mobileGraphAnalysis";

describe("native publication projection", () => {
  it("creates a bounded local JSON capture companion with honest theme/window metadata", () => {
    const { document }=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!,"mobile-capture");
    const publication=createGraph2DPublication({document,size:{width:320,height:240}});
    const artifact=renderGraph2DCaptureRecipeArtifact(document,publication,"light","Math3D",{width:393,height:852});
    expect(artifact.fileName).toMatch(/\.json$/); expect(artifact.mimeType).toBe("application/json");
    const recipe=JSON.parse(new TextDecoder().decode(artifact.bytes));
    expect(recipe.snapshotId).toBe(publication.snapshotId);
    expect(recipe.view.hostWindow).toEqual({width:393,height:852});
    expect(recipe.document.identity).toEqual(document.identity);
  });
  it("reuses the exact desktop recipe and byte encoders without mobile display decimation", () => {
    for (const id of ["line-comparison", "strict-disk", "piecewise-data-gaps", "polar-rose"]) {
      const { document, sidecars } = instantiateGraph2DPreset(getGraph2DPresetCatalog().get(id)!, "mobile-publication");
      const tables = new Graph2DPointTableStore(); sidecars.forEach(s => tables.publish(s.rows));
      const native = createGraph2DPublication(mobileGraphPublicationRequest(document, tables, null, mobileGraphAnalysisDraft(document), { width: 320, height: 240 }, { x: "s", y: "m" }));
      const desktop = createGraph2DPublication({ document, size: { width: 320, height: 240 }, units: { x: "s", y: "m" }, pointTables: Object.fromEntries(sidecars.map(s => [s.id, s.rows])) });
      expect(native.snapshotId).toBe(desktop.snapshotId);
      for (const format of ["svg", "png", "csv", "html"] as const) expect(renderGraph2DPublicationArtifact(native, format).bytes).toEqual(renderGraph2DPublicationArtifact(desktop, format).bytes);
    }
  }, 20_000); // Eight PNG encodes plus SVG/CSV/report parity on shared CI runners.
  it("exports original analysis values and excludes results after draft/source changes", () => {
    const { document } = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "native-analysis");
    const draft = { ...mobileGraphAnalysisDraft(document), kind: "integral" as const, objectId: document.source.objects[0].id, min: "-1", max: "2" };
    const analysis = runMobileGraphAnalysis(document, draft), store = new Graph2DPointTableStore();
    expect(analysis.publicationTables?.[0].rows).toContainEqual(["value", 1.5]);
    const make = (input = draft) => mobileGraphPublicationRequest(document, store, analysis, input, { width: 320, height: 240 }, { x: "", y: "" });
    expect(make().analyses).toHaveLength(1); expect(make({ ...draft, tolerance: "0.001" }).analyses).toEqual([]);
    expect(createGraph2DPublication(make()).metadata.analyses[0]).toEqual(analysis.publications[0]);
  });
});
