import { createSceneProjectDocument, type SceneDocument } from "@math3d/core";

/** Small, redistributable cross-runtime fixtures. Mesh-only data loses editable formula semantics. */
export const goldenDesktopScene: SceneDocument = {
  id: "golden-project", title: "Golden study", createdAt: 100, updatedAt: 200,
  surfaces: [
    { id: "explicit", kind: "explicit", expression: "sin(x)+y", domain: { xSpan: 4, ySpan: 6 }, resolution: 24 },
    { id: "parametric", kind: "parametric", xExpr: "cos(u)", yExpr: "sin(u)", zExpr: "v", domain: { uMin: 0, uMax: 6.28, vMin: -1, vMax: 1 }, resolution: 32 },
    { id: "implicit", kind: "implicit", expression: "x*x+y*y+z*z-1", domain: { xSpan: 2, ySpan: 2, zSpan: 2 }, resolution: 18 },
  ],
  metadata: { author: "Math3D golden fixture" },
};

export const goldenDesktopProject = createSceneProjectDocument(goldenDesktopScene);

export const goldenMeshOnlyScene: SceneDocument = {
  id: "golden-mesh", title: "Mesh-only exchange", createdAt: 100, updatedAt: 200,
  surfaces: [{ id: "mesh", kind: "mesh", source: "fixture.stl" }],
};
