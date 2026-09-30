import { describe, expect, it } from "vitest";
import { getGraph2DPresetCatalog } from "@math3d/core";
import { mobileGraphGalleryItems, mobileGraphGalleryLayout } from "../../apps/mobile/src/models/mobileGraphGallery";
import { mobileCrossModuleCatalog, searchMobileCrossModuleCatalog, relatedSurfaceScenesForGraph,
  relatedGraphScenesForSurface } from "../../apps/mobile/src/models/mobileCrossModuleCatalog";

describe("shared native Graph gallery discovery", () => {
  it("uses the exact desktop catalog/default source and deterministic Featured/category/search filters", () => {
    const all = mobileGraphGalleryItems("", "All", false);
    expect(all).toEqual(getGraph2DPresetCatalog().entries); expect(all).toHaveLength(20);
    expect(mobileGraphGalleryItems("", "All", true).map(preset => preset.featuredOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mobileGraphGalleryItems("signed radius", "Polar", false).map(preset => preset.id)).toEqual(["polar-rose"]);
    expect(mobileGraphGalleryItems("missing data", "Piecewise and data", false).map(preset => preset.id)).toEqual(["piecewise-data-gaps"]);
    expect(mobileGraphGalleryItems("nothing matches", "All", false)).toEqual([]);
  });
  it("keeps preview cards within phone, short landscape, tablet and native large-text widths", () => {
    for (const [width, height, fontScale, columns] of [[320, 568, 1, 1], [780, 340, 1, 2], [820, 1100, 1, 2], [1200, 800, 1, 3], [820, 1100, 2, 1]]) {
      const layout = mobileGraphGalleryLayout(width!, height!, fontScale!);
      expect(layout.columns).toBe(columns); expect(layout.compact).toBe(height! < 500);
      expect(layout.cardWidth * layout.columns + 12 * (layout.columns - 1) + 40).toBeCloseTo(width!);
      expect(layout.cardWidth).toBeGreaterThanOrEqual(280);
    }
  });
});

describe("GGL17 cross-module catalog adapters", () => {
  it("uses existing Graph and Surface identities without converting their documents", () => {
    const cards=mobileCrossModuleCatalog();
    expect(cards.filter(card=>card.module==="graph2d")).toHaveLength(20);
    expect(cards.some(card=>card.key==="surface:paraboloid")).toBe(true);
    expect(new Set(cards.map(card=>card.key)).size).toBe(cards.length);
    expect(searchMobileCrossModuleCatalog("quadratic","graph2d").some(card=>card.sourceId==="translated-quadratic")).toBe(true);
  });
  it("makes curated links bidirectional and capability-checked", () => {
    const link=relatedSurfaceScenesForGraph("polar-rose",()=>true)[0]!;
    expect(link.card.key).toBe("surface:wave-torus"); expect(link.available).toBe(true);
    expect(relatedSurfaceScenesForGraph("polar-rose",()=>false)[0]!.available).toBe(false);
    expect(relatedGraphScenesForSurface("wave-torus")[0]!.card.key).toBe("graph2d:polar-rose");
    expect(relatedSurfaceScenesForGraph("nonexistent",()=>true)).toEqual([]);
  });
});
