import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCrossModuleAdapterRegistry, createPlatformCapabilitySnapshot,
  listProjectScientificSelections, migrateProjectScientificSelections,
  normalizeCrossModuleAdapter, parseMath3DProject, PLATFORM_FACILITIES,
  qualifyCrossModuleAdapter, referenceFromScientificSelection, viewerSourceFromDocument,
  type AdapterFrame,
} from "@math3d/core";

const normalized = normalizeCrossModuleAdapter(JSON.parse(readFileSync(
  new URL("../../packages/core/fixtures/cross-module/current-v1.json", import.meta.url), "utf8")));
if (!normalized.ok) throw new Error(normalized.errors.join(" "));
const adapter = normalized.value;
const project = migrateProjectScientificSelections(parseMath3DProject(readFileSync(
  new URL("../fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8")));
const saved = listProjectScientificSelections(project)
  .find(selection => selection.geometry.kind === "point" && selection.source?.kind === "document");
if (!saved || saved.source?.kind !== "document") throw new Error("Missing fixture source");
const documentId = saved.source.documentId;
const entry = project.workspace.entries.find(item => item.expected.id === documentId);
if (!entry) throw new Error("Missing fixture document");
const source = viewerSourceFromDocument(entry.checkpoint);
const pinned = { ...saved, source: { ...saved.source,
  checkpoint: { revision: source.revision, structuralHash: source.structuralHash } } };
const reference = referenceFromScientificSelection(pinned, source, entry.module, adapter.sourceFrame, "point");
if (!reference.ok) throw new Error(reference.errors.join(" "));
const selection = reference.value;
const registry = createCrossModuleAdapterRegistry([adapter]);
const platform = createPlatformCapabilitySnapshot({
  runtime: "desktop", adapterId: "acceptance-host", adapterVersion: "1",
  facilities: Object.fromEntries(PLATFORM_FACILITIES.map(key => [key, { available: true, reason: null }])) as
    Parameters<typeof createPlatformCapabilitySnapshot>[0]["facilities"],
});
const qualify = (side: "source" | "target", frame: AdapterFrame) => qualifyCrossModuleAdapter(registry, {
  adapterId: adapter.id, selection: side === "source" ? { ...selection, frame } : selection,
  targetModule: "graph2d", currentSource: source,
  targetFrame: side === "target" ? frame : adapter.targetFrame, platform,
  operationAvailable: () => true, mappingAvailable: () => true,
});

describe("AC06 coordinate-frame boundary at the existing adapter owner", () => {
  it("qualifies matching frames without treating a mapping declaration as a verified transform", () => {
    expect(qualify("target", adapter.targetFrame).enabled).toBe(true);
  });

  for (const side of ["source", "target"] as const) {
    for (const change of ["frame-id", "axis-order", "dimension", "unit"] as const) {
      it(`rejects ${side} ${change} even when operation and mapping are declared available`, () => {
        const original = side === "source" ? adapter.sourceFrame : adapter.targetFrame;
        const axes = original.axes.map(axis => ({ ...axis }));
        let frameId = original.frameId;
        if (change === "frame-id") frameId += "-different";
        if (change === "axis-order") axes.reverse();
        if (change === "dimension") axes[0].dimension = "incompatible-dimension";
        if (change === "unit") axes[0].unit = "incompatible-unit";
        const result = qualify(side, { ...original, frameId, axes });
        expect(result.enabled).toBe(false);
        expect(result.disabled.map(item => item.code)).toContain(`${side}-frame-mismatch`);
      });
    }
  }
});
