import { describe, expect, it } from "vitest";
import {
  GEOMETRY_SCENE_GALLERY,
  GEOMETRY_SCENE_GALLERY_BY_ID,
  GEOMETRY_SCENE_GALLERY_CATEGORY_ORDER,
} from "./sceneGalleryCatalog";

describe("sceneGalleryCatalog", () => {
  it("covers all requested categories and scenario titles", () => {
    const expected = new Map<string, string[]>([
      ["Debug Scenes", [
        "Debug: primitive lineup",
        "Debug: polyhedron lab",
        "Debug: stacked towers",
        "Debug: transform grid",
        "Debug: section comparison",
      ]],
      ["Release Smoke", [
        "Release smoke: basic primitives",
        "Release smoke: dependency tree",
        "Release smoke: construction history",
        "Release smoke: extension subset",
        "Release smoke: deletion and recompute",
      ]],
      ["Construction Basics", [
        "Cube transform workflow",
        "Face extrusion",
        "Direct edit playground",
        "Torus line-plane construction",
        "Construct operations playground",
        "Section plane",
      ]],
      ["Measurement", ["Equal-volume objects", "Surface-area comparison", "Bounding dimensions"]],
      ["Mathematical Demonstrations", ["Cavalieri principle", "Sphere section", "Scaling laws", "Euler polyhedron relation"]],
      ["Geometry to Mesh", ["Validity warning example", "Promotion example", "Analysis result"]],
      ["Workbook Examples", ["Guided construction", "Validated student task"]],
    ]);
    for (const [category, titles] of expected) {
      const actualTitles = GEOMETRY_SCENE_GALLERY.filter((entry) => entry.category === category).map((entry) => entry.title);
      expect(actualTitles).toEqual(titles);
    }
  });

  it("has stable id map and unique ids", () => {
    expect(GEOMETRY_SCENE_GALLERY_BY_ID.size).toBe(GEOMETRY_SCENE_GALLERY.length);
    const uniqueIds = new Set(GEOMETRY_SCENE_GALLERY.map((entry) => entry.id));
    expect(uniqueIds.size).toBe(GEOMETRY_SCENE_GALLERY.length);
    for (const entry of GEOMETRY_SCENE_GALLERY) {
      expect(GEOMETRY_SCENE_GALLERY_BY_ID.get(entry.id)).toBe(entry);
    }
  });

  it("keeps entries structurally valid for scene open/replay flows", () => {
    expect(GEOMETRY_SCENE_GALLERY_CATEGORY_ORDER).toEqual([
      "Debug Scenes",
      "Release Smoke",
      "Construction Basics",
      "Measurement",
      "Mathematical Demonstrations",
      "Geometry to Mesh",
      "Workbook Examples",
    ]);
    for (const entry of GEOMETRY_SCENE_GALLERY) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.initialScene.id.length).toBeGreaterThan(0);
      expect(entry.initialScene.title.length).toBeGreaterThan(0);
      expect(entry.initialScene.objects.length).toBeGreaterThan(0);
      if (entry.timeline) {
        expect(entry.timeline.steps.length).toBeGreaterThan(0);
        const stepIds = new Set(entry.timeline.steps.map((step) => step.id));
        expect(stepIds.size).toBe(entry.timeline.steps.length);
      }
    }
  });

  it("keeps debug scenes useful for repeatable manual testing", () => {
    const debugScenes = GEOMETRY_SCENE_GALLERY.filter((entry) => entry.category === "Debug Scenes");
    expect(debugScenes).toHaveLength(5);
    for (const entry of debugScenes) {
      expect(entry.initialScene.metadata?.debugScene).toBe(true);
      expect(entry.initialScene.objects.length).toBeGreaterThanOrEqual(5);
      expect(entry.initialScene.objects.length).toBeLessThanOrEqual(20);
      expect(new Set(entry.initialScene.objects.map((object) => object.id)).size).toBe(entry.initialScene.objects.length);
    }
  });

  it("keeps all 1.4.5 release smoke scenes available and marked", () => {
    const releaseSmokeScenes = GEOMETRY_SCENE_GALLERY.filter((entry) => entry.category === "Release Smoke");
    expect(releaseSmokeScenes).toHaveLength(5);
    for (const entry of releaseSmokeScenes) {
      expect(entry.initialScene.metadata?.releaseSmoke).toBe(true);
      expect(entry.initialScene.metadata?.scenario).toBeTruthy();
    }
  });

  it("keeps the construct operations playground useful as a visual test preset", () => {
    const playground = GEOMETRY_SCENE_GALLERY_BY_ID.get("scene:construct-operations-playground");
    expect(playground?.category).toBe("Construction Basics");
    expect(playground?.initialScene.metadata?.playground).toBe(true);
    const constructions = playground?.initialScene.extensions?.["math3d.geometry.derivedConstructions.v1"];
    expect(Array.isArray(constructions)).toBe(true);
    expect(constructions).toHaveLength(23);
  });

  it("keeps the direct edit playground ready for face, edge, and vertex workflows", () => {
    const playground = GEOMETRY_SCENE_GALLERY_BY_ID.get("scene:direct-edit-playground");
    expect(playground?.category).toBe("Construction Basics");
    expect(playground?.initialScene.metadata?.directEdit).toBe(true);
    expect(playground?.recommendedPanels?.[0]).toBe("analysis");
    expect(playground?.initialScene.objects.map((object) => object.name)).toEqual([
      "Editable box",
      "Editable prism",
      "Editable grid plane",
    ]);
  });
});
