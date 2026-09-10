import { describe, expect, it } from "vitest";
import {
  GEOMETRY_CONSTRUCT_FAMILIES,
  GEOMETRY_CONSTRUCT_TOOL_BY_ID,
  GEOMETRY_EXISTING_REFERENCE_TOOL_IDS,
  buildGeometryConstructRecipe,
  geometryConstructSourcesReady,
} from "./constructCatalog";
import { GEOMETRY_OBJECT_REGISTRY, createGeometryObject } from "./proceduralObjects";

describe("Geometry Construct catalog", () => {
  it("uses the professional entity hierarchy", () => {
    expect(GEOMETRY_CONSTRUCT_FAMILIES.map((family) => family.label)).toEqual([
      "Primitives",
      "Reference",
      "Curves",
      "Surfaces",
      "Solids",
      "Derived",
    ]);
  });

  it("maps every existing reference tool into one of the retained groups", () => {
    expect(Object.values(GEOMETRY_EXISTING_REFERENCE_TOOL_IDS).flat()).toHaveLength(39);
    expect(GEOMETRY_CONSTRUCT_FAMILIES.find((family) => family.id === "reference")?.tools.map((tool) => tool.legacyTarget)).toEqual([
      "points",
      "lines",
      "planes",
      "circles",
      "axes",
      "bounding",
    ]);
  });

  it("includes every planned curve, surface, solid, and derived construction", () => {
    for (const id of [
      "curve-polyline", "curve-interpolation", "curve-bezier", "curve-bspline", "curve-nurbs", "curve-helix", "curve-composite",
      "surface-ruled", "surface-extrude", "surface-revolve", "surface-sweep", "surface-loft", "surface-bezier", "surface-bspline", "surface-nurbs", "surface-coons",
      "solid-extrusion", "solid-revolution", "solid-sweep", "solid-loft",
      "derived-offset", "derived-projection", "derived-intersection", "derived-boundary", "derived-iso-curve", "derived-normal-curve",
    ]) {
      expect(GEOMETRY_CONSTRUCT_TOOL_BY_ID.has(id), id).toBe(true);
    }
  });

  it("builds an ordinary serializable object recipe with source metadata", () => {
    const tool = GEOMETRY_CONSTRUCT_TOOL_BY_ID.get("surface-loft")!;
    expect(geometryConstructSourcesReady(tool, ["section-a"])).toBe(false);
    expect(geometryConstructSourcesReady(tool, ["section-a", "section-b"])).toBe(true);
    expect(buildGeometryConstructRecipe(tool, { height: 3 }, ["section-a", "section-b"])).toMatchObject({
      type: "constructed",
      name: "Loft",
      params: {
        constructionKind: "surface-loft",
        constructionFamily: "surfaces",
        authoringSource: "professional-construct",
        sourceObjectIds: "section-a,section-b",
        height: 3,
      },
    });
  });

  it("builds non-empty renderable geometry for every new construction", () => {
    const newTools = GEOMETRY_CONSTRUCT_FAMILIES.flatMap((family) => family.tools)
      .filter((tool) => tool.classification === "new");
    expect(newTools).toHaveLength(26);
    for (const tool of newTools) {
      const sources = Array.from({ length: tool.referenceCount }, (_, index) => `source-${index + 1}`);
      const recipe = buildGeometryConstructRecipe(tool, {}, sources);
      expect(recipe?.type, tool.id).toBe("constructed");
      const object = createGeometryObject("constructed", tool.id);
      object.params = { ...object.params, ...(recipe?.params ?? {}) };
      const geometry = GEOMETRY_OBJECT_REGISTRY.constructed.build(object.params);
      expect(geometry.getAttribute("position")?.count ?? 0, tool.id).toBeGreaterThan(2);
      geometry.dispose();
    }
  });

  it("rebuilds a published Scratch scene as ordinary constructed geometry", () => {
    const object = createGeometryObject("constructed", "scratch-published");
    object.params.constructionKind = "scratch-scene";
    object.params.authoringSource = "scratch";
    object.params.sourceEntityIds = "A,B,AB";
    object.params.sourcePayload = JSON.stringify({
      points: [{ x: 0, y: 0, z: 0, size: 0.05 }],
      segments: [{ a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } }],
    });

    const geometry = GEOMETRY_OBJECT_REGISTRY.constructed.build(object.params);
    expect(geometry.getAttribute("position")?.count ?? 0).toBeGreaterThan(2);
    geometry.dispose();
  });
});
