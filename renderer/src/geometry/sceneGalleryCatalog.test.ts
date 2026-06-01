import { describe, expect, it } from "vitest";
import {
  GEOMETRY_SCENE_GALLERY,
  GEOMETRY_SCENE_GALLERY_BY_ID,
  GEOMETRY_SCENE_GALLERY_CATEGORY_ORDER,
} from "./sceneGalleryCatalog";

describe("sceneGalleryCatalog", () => {
  it("covers all requested categories and scenario titles", () => {
    const expected = new Map<string, string[]>([
      ["Construction Basics", ["Cube transform workflow", "Face extrusion", "Section plane"]],
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
});
