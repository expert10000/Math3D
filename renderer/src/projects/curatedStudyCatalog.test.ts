import { describe, expect, it } from "vitest";
import { MATH3D_PROJECT_TEMPLATES } from "@math3d/core";
import { NOTEBOOK_STARTERS } from "./notebookStarters";
import { CURATED_STUDIES, curatedStudy, validateCuratedStudyCatalog } from "./curatedStudyCatalog";

describe("curated Study Gallery contract", () => {
  it("maps every actionable Project card to an existing starter with complete guidance", () => {
    expect(validateCuratedStudyCatalog()).toBeUndefined();
    const ids = new Set([...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS].map(item => item.id));
    expect(CURATED_STUDIES).toHaveLength(16);
    for (const item of CURATED_STUDIES) {
      expect(curatedStudy(item.id)).toBe(item);
      expect([item.question, item.objects, item.operations, item.insight, item.prerequisites,
        item.approximateAssets, item.offline, item.firstOpen, item.reset, item.limitation]
        .every(text => text.length > 20)).toBe(true);
      if (item.route.kind === "project") expect(ids.has(item.route.starterId)).toBe(true);
    }
    expect(curatedStudy("not-present")).toBeNull();
  });

  it("does not advertise bundled QWZ, SSH or hydrogen evidence or browser import", () => {
    for (const model of ["qwz", "ssh", "hydrogen"] as const) {
      const item = curatedStudy(`quantum-${model}`)!;
      expect(item.route).toEqual({ kind: "verified-quantum-import", model });
      expect(item.platforms).toEqual(["desktop"]);
      expect(item.prerequisites).toContain(".qscene");
      expect(item.firstOpen).toContain("no scene is bundled");
      expect(item.offline).toContain("local saved bundle");
    }
  });
  it("links the existing structural CAS examples without promising a Sage result", () => {
    const item = curatedStudy("cas-structures")!;
    expect(item.route).toEqual({ kind: "cas-gallery" });
    expect(item.objects).toContain("GF(5)");
    expect(item.prerequisites).toContain("named Project");
    expect(item.limitation).toContain("do not constitute a Galois correspondence Study");
  });
  it("offers the bounded Field return as a desktop live route without a bundled result", () => {
    const item = curatedStudy("field-graph-return")!;
    expect(item.route).toEqual({ kind: "field-explorer" });
    expect(item.platforms).toEqual(["desktop"]);
    expect(item.limitation).toContain("does not reconstruct an arbitrary Field");
  });
});
