import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset, type GeometryAnalyticSurfaceDefinition } from "./exactSurfaceAnalysis";
import { analyzeGeometryValidity, buildGeometryNativeTopology, evaluateSurfaceBoundaryContinuity } from "./geometryValidity";

describe("Geometry semantic validity", () => {
  it("builds bodies through vertices independently of render triangles", () => {
    const topology = buildGeometryNativeTopology(getGeometryExactSurfacePreset("plane"));
    expect(topology.renderTriangleIndependent).toBe(true);
    expect(new Set(topology.entities.map((entity) => entity.kind))).toEqual(new Set(["body", "shell", "face", "loop", "edge", "vertex"]));
  });
  it("separates exact validity from display mesh health", () => {
    const result = analyzeGeometryValidity({ definition: getGeometryExactSurfacePreset("sphere"), meshHealthNotes: ["triangles healthy"] });
    expect(result.exactGeometry.issues.some((issue) => issue.kind === "pole")).toBe(true);
    expect(result.displayMeshHealth).toMatchObject({ exactBrepValidity: false, notes: ["triangles healthy"] });
    expect(result.exactGeometry.issues.every((issue) => issue.actions.includes("Attempt repair"))).toBe(true);
  });
  it("reports C2/G2 for identical analytic patches", () => {
    const plane = getGeometryExactSurfacePreset("plane");
    expect(evaluateSurfaceBoundaryContinuity({ a: plane, b: plane, boundaryA: "u-min", boundaryB: "u-min" })).toMatchObject({ classification: "C2/G2", positionGap: 0, curvatureMismatch: 0 });
  });
  it("detects invalid and duplicate trim boundaries", () => {
    const plane = getGeometryExactSurfacePreset("plane");
    const invalid: GeometryAnalyticSurfaceDefinition = { ...plane, trims: [{ id: "cut", description: "collapsed trim" }, { id: "cut", description: "self-intersecting trim" }] };
    const kinds = analyzeGeometryValidity({ definition: invalid }).exactGeometry.issues.map((issue) => issue.kind);
    expect(kinds).toEqual(expect.arrayContaining(["collapsed-trim", "duplicate-boundary", "self-intersection", "trim-domain-pathology"]));
  });
  it("detects semantic edge, join, orientation, and shell evidence", () => {
    const issues = analyzeGeometryValidity({ definition: getGeometryExactSurfacePreset("torus"), semanticEvidence: { shellClosed: false, edges: [{ id: "edge:a", length: 0, boundarySignature: "same" }, { id: "edge:b", length: 1, boundarySignature: "same" }], joins: [{ id: "edge:c", incidentFaces: 3, orientationConsistent: false }] } }).exactGeometry.issues.map((issue) => issue.kind);
    expect(issues).toEqual(expect.arrayContaining(["zero-length-edge", "duplicate-boundary", "non-manifold-join", "orientation", "open-shell"]));
  });
});
