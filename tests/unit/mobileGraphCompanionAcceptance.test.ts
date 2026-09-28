import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Graph2DPointTableStore, parseGraph2DDocument, sampleGraph2DScene } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph, importMobileGraph, readMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { MOBILE_GRAPH_KINDS, mobileGraphKindAction, mobileGraphKindEditor } from "../../apps/mobile/src/models/mobileGraphAdvancedAuthoring";
import { mobileGraphBudget } from "../../apps/mobile/src/models/mobileGraphPerformance";
import { mobileGraphAdvancedGeometry } from "../../apps/mobile/src/viewer/mobileGraphAdvancedProjection";
import { projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";

describe("MOB-G13 shared companion fixture acceptance (not native hardware signoff)", () => {
  it("opens the committed desktop canonical fixture and returns an identical portable checkpoint", () => {
    const raw = readFileSync("packages/core/fixtures/graph2d/canonical-v1.json", "utf8"), desktop = parseGraph2DDocument(raw);
    const project = importMobileGraph(raw, [], "canonical-v1.json", 1, "desktop"), mobile = readMobileGraph(project);
    expect(mobile).toEqual(desktop);
    expect(readMobileGraph(importMobileGraph(serializeMobileProjectHandoff(project), [], "handoff.json"))).toEqual(desktop);
    const adapter = new Graph2DCommandAdapter(mobile), changed = adapter.commitViewport({ ...mobile.display.viewport, xMin: -3, xMax: 3 });
    expect(readMobileGraph(importMobileGraph(serializeMobileProjectHandoff(storeMobileGraph(changed)), [], "handoff.json"))).toEqual(changed);
    expect(adapter.undo()).toEqual(mobile);
  });
  it("fails closed on committed future/corrupt/unsupported desktop fixtures", () => {
    for (const name of ["future", "corrupt", "unsupported-capability"])
      expect(() => importMobileGraph(readFileSync(`packages/core/fixtures/graph2d/${name}.json`, "utf8"), [], `${name}.json`)).toThrow();
  });
  it("round-trips a seven-kind companion and bounds its aggregate native geometry without rewriting source", () => {
    const disk = new Map<string, string>(), backing = { read: (id: string) => disk.get(id) ?? null,
      write: (id: string, data: string) => { disk.set(id, data); } };
    const tables = new Graph2DPointTableStore(backing), adapter = new Graph2DCommandAdapter(createMobileGraph("All kinds", true, "g13-all-kinds"));
    for (const kind of MOBILE_GRAPH_KINDS.filter((kind) => kind !== "explicit-cartesian")) {
      const action = mobileGraphKindAction(mobileGraphKindEditor(adapter.document(), kind), tables);
      adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), action), action.type);
    }
    const document = adapter.document(), restored = readMobileGraph(importMobileGraph(serializeMobileProjectHandoff(storeMobileGraph(document)), [], "all-kinds.json"));
    expect(restored).toEqual(document); expect(new Set(restored.source.objects.map((object) => object.kind)).size).toBe(7);
    const restartedTables = new Graph2DPointTableStore(backing, 4 * 1024 * 1024);
    const pointTables = Object.fromEntries(restored.source.objects.flatMap((object) => object.kind === "point-series" ? [[object.table.id, restartedTables.resolve(object.table)]] : []));
    const sourceBefore = JSON.stringify(restored.source);
    for (const tier of ["low", "mid", "high"] as const) for (const size of [{ width: 320, height: 640 }, { width: 1100, height: 700 }]) {
      const budget = mobileGraphBudget(restored, tier, "refine");
      const series = sampleGraph2DScene({ document: { ...restored, display: { ...restored.display, sampling: budget.sampling } }, viewport: restored.display.viewport,
        ...size, interaction: false, pointTables, timeBudgetMs: budget.cpuMs });
      expect(series.reduce((count, item) => count + item.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(budget.sampling.maxSamples);
      const geometry = mobileGraphAdvancedGeometry(series, restored.display.viewport, size, budget);
      expect(geometry.fills.length).toBeLessThanOrEqual(budget.fills); expect(geometry.points.length).toBeLessThanOrEqual(budget.markers);
      expect(projectMobileGraphLines(geometry.boundaries, restored.display.viewport, size, null, budget.lines).length).toBeLessThanOrEqual(budget.lines);
    }
    expect(JSON.stringify(restored.source)).toBe(sourceBefore);
  });
});
