import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeVectorField3DRegion, analyzeVectorField3DTheorem,
  createMixedWorkspaceDocument, createOrientedRegionSelection,
  createVectorField3DRegionIntegralResult, parseMath3DProject, projectRegionResultStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectRegionResult,
  upsertProjectScientificSelection, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const changeSource = (project: Math3DProject, expressions: [string, string, string]) => {
  const prior = source(project);
  const revised = reviseVectorField3DDocument(prior, { ...prior.source,
    field: { kind: "expressions", components: expressions.map(expression =>
      vectorField3DExpression(expression, "m/s")) as unknown as
        VectorField3DDocument["source"]["field"] & { kind: "expressions" }["components"] } });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: project.workspace.entries.map(item => item.expected.id === prior.identity.id ?
      { ...item, checkpoint: revised, expected: revised.identity } : item) }));
};

describe("GF-11 and GF-12 oriented region integrals", () => {
  it("saves plane flux and box volume with physical units and source guards", () => {
    let project = changeSource(load(), ["x", "y", "z"]);
    const document = source(project);
    const plane = createOrientedRegionSelection(document, { kind: "oriented-plane-region",
      normalAxis: 2, coordinate: 1, bounds: [[0, 1], [0, 1]],
      normalSign: 1, boundary: "right-hand" }, "plane");
    const box = createOrientedRegionSelection(document, { kind: "oriented-box-region",
      bounds: [[0, 1], [0, 1], [0, 1]], normal: "outward" }, "box");
    const planeAnalysis = analyzeVectorField3DRegion(document, plane, "surface-flux", 8);
    const boxAnalysis = analyzeVectorField3DRegion(document, box, "volume-divergence", 8);
    expect(planeAnalysis).toMatchObject({ state: "complete", value: 1, coverage: 1,
      unit: "m/s·m²", completedSamples: 64 });
    expect(boxAnalysis.value).toBeCloseTo(3, 10);
    expect(boxAnalysis.evaluations).toBeLessThanOrEqual(32768);
    project = upsertProjectScientificSelection(upsertProjectScientificSelection(project, plane), box);
    const result = createVectorField3DRegionIntegralResult(document, box, boxAnalysis);
    project = upsertProjectRegionResult(project, result);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const saved = reopened.workspace.results.find(item => item.resultId === result.resultId)!;
    expect(saved.summary).toEqual(boxAnalysis);
    expect(reopened.workspace.scientificSelections?.find(item =>
      item.identity.kind === "authored" && item.identity.id === box.identity.id)).toEqual(box);
    expect(projectRegionResultStatus(reopened, saved).status).toBe("current");
    expect(projectRegionResultStatus(changeSource(reopened, ["2*x", "y", "z"]), saved))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
    const capped = analyzeVectorField3DRegion(document, box, "volume-divergence", 8, 20);
    expect(capped).toMatchObject({ state: "partial", reason: "evaluation-cap",
      maxEvaluations: 20, value: null });
    const partialProject = upsertProjectRegionResult(project,
      createVectorField3DRegionIntegralResult(document, box, capped));
    const partialSaved = partialProject.workspace.results.find(item =>
      item.provenance.operation.parameters.maxEvaluations === 20)!;
    expect(projectRegionResultStatus(partialProject, partialSaved).status).toBe("withheld");
  });

  it("checks divergence and Stokes, reverses orientation, and reports incomplete coverage", () => {
    const project = changeSource(load(), ["-y", "x", "z"]);
    const document = source(project);
    const box = createOrientedRegionSelection(document, { kind: "oriented-box-region",
      bounds: [[0, 1], [0, 1], [0, 1]], normal: "outward" }, "box");
    const plane = createOrientedRegionSelection(document, { kind: "oriented-plane-region",
      normalAxis: 2, coordinate: 0, bounds: [[0, 1], [0, 1]],
      normalSign: 1, boundary: "right-hand" }, "plane");
    const divergence = analyzeVectorField3DTheorem(document, box, "divergence", 8);
    const stokes = analyzeVectorField3DTheorem(document, plane, "stokes", 8);
    expect(divergence.state).toBe("consistent");
    expect(divergence.boundaryValue).toBeCloseTo(1, 10);
    expect(divergence.interiorValue).toBeCloseTo(1, 10);
    expect(divergence.absoluteResidual).toBeLessThan(1e-10);
    expect(stokes.state).toBe("consistent");
    expect(stokes.boundaryValue).toBeCloseTo(2, 10);
    expect(stokes.interiorValue).toBeCloseTo(2, 10);
    const reverse = createOrientedRegionSelection(document, { ...plane.geometry,
      normalSign: -1 } as typeof plane.geometry & { normalSign: -1 }, "reverse");
    const negative = analyzeVectorField3DTheorem(document, reverse, "stokes", 8);
    expect(negative.boundaryValue).toBeCloseTo(-2, 10);
    expect(negative.interiorValue).toBeCloseTo(-2, 10);
    const savedProject = upsertProjectRegionResult(
      upsertProjectScientificSelection(project, plane),
      createVectorField3DRegionIntegralResult(document, plane, stokes));
    const reopened = parseMath3DProject(serializeMath3DProject(savedProject));
    const saved = reopened.workspace.results.find(item =>
      item.provenance.operation.type === "vector3d.theorem-check")!;
    expect(saved.summary).toMatchObject({ state: "consistent", theorem: "stokes",
      orientation: "+z; right-hand boundary", resolution: 8 });
    expect(projectRegionResultStatus(reopened, saved).status).toBe("current");
    expect(projectRegionResultStatus(changeSource(reopened, ["x", "y", "z"]), saved))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
    const capped = analyzeVectorField3DRegion(document, box, "surface-flux", 8, 20);
    expect(capped.state).toBe("partial");
    expect(capped.coverage).toBeLessThan(1);
    const outside = createOrientedRegionSelection(document, { kind: "oriented-box-region",
      bounds: [[0, 5], [0, 1], [0, 1]], normal: "outward" }, "outside");
    expect(analyzeVectorField3DTheorem(document, outside, "divergence", 6).state)
      .toBe("inconclusive");
  });
});
