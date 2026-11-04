import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeVectorField3DLineIntegral, createMixedWorkspaceDocument,
  createOrientedPolylineSelection, createVectorField3DLineIntegralResult,
  parseMath3DProject, projectLineIntegralStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject, upsertProjectLineIntegralResult,
  upsertProjectScientificSelection, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const changeSource = (project: Math3DProject, expressions: [string, string, string]) => {
  const prior = source(project);
  const revised = reviseVectorField3DDocument(prior, { ...prior.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression(expressions[0], "m/s"),
      vectorField3DExpression(expressions[1], "m/s"),
      vectorField3DExpression(expressions[2], "m/s")] } });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: project.workspace.entries.map(item => item.expected.id === prior.identity.id ?
      { ...item, checkpoint: revised, expected: revised.identity } : item) }));
};

describe("GF-10 oriented line integral", () => {
  it("round-trips a saved conservative path and its source-guarded numerical result", () => {
    let project = changeSource(load(), ["2*x", "2*y", "0"]);
    const document = source(project);
    const selection = createOrientedPolylineSelection(document,
      [[0, 0, 0], [1, 0, 0], [1, 1, 0]], false, "forward", "gf10-open-path");
    project = upsertProjectScientificSelection(project, selection);
    const analysis = analyzeVectorField3DLineIntegral(document, selection, "line-integral");
    expect(analysis.state).toBe("complete");
    expect(analysis.value).toBeCloseTo(2, 12);
    expect(analysis.errorEstimate).toBeLessThan(1e-12);
    expect(analysis.coverage).toBe(1);
    expect(analysis.unit).toBe("m/s·m");
    expect(analysis.evaluations).toBeLessThanOrEqual(8192);
    const result = createVectorField3DLineIntegralResult(document, selection, analysis);
    expect(() => createVectorField3DLineIntegralResult(document, selection,
      { ...analysis, value: 3 })).toThrow(/no longer matches/);
    expect(() => upsertProjectLineIntegralResult(project,
      { ...result, summary: { ...result.summary, value: 3 } })).toThrow(/does not match/);
    project = upsertProjectLineIntegralResult(project, result);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.workspace.scientificSelections?.find(item =>
      item.identity.kind === "authored" && item.identity.id === selection.identity.id)).toEqual(selection);
    const saved = reopened.workspace.results.find(item => item.resultId === result.resultId)!;
    expect(saved.provenance.operation.parameters).toMatchObject({
      orientation: "forward", mode: "line-integral" });
    expect(saved.summary).toMatchObject({ state: "complete", coverage: 1,
      method: "composite-simpson-8-richardson", unit: "m/s·m" });
    expect(projectLineIntegralStatus(reopened, saved)).toEqual({ status: "current", reason: null, value: 2 });
    const changed = changeSource(reopened, ["3*x", "2*y", "0"]);
    expect(projectLineIntegralStatus(changed, saved)).toEqual({
      status: "withheld", reason: "source-changed", value: null });
    expect(projectLineIntegralStatus(reopened, saved, source(changed))).toEqual({
      status: "withheld", reason: "source-changed", value: null });
    const reversed = createOrientedPolylineSelection(document,
      [[0, 0, 0], [1, 0, 0], [1, 1, 0]], false, "reverse", "gf10-open-path");
    const changedSelection = upsertProjectScientificSelection(reopened, reversed);
    expect(projectLineIntegralStatus(changedSelection, saved)).toEqual({
      status: "withheld", reason: "selection-changed", value: null });
  });

  it("checks rotational circulation, orientation reversal and incomplete coverage", () => {
    const project = changeSource(load(), ["-y", "x", "0"]), document = source(project);
    const vertices = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] as const;
    const forward = createOrientedPolylineSelection(document, vertices, true, "forward", "square");
    const reverse = createOrientedPolylineSelection(document, vertices, true, "reverse", "square");
    const positive = analyzeVectorField3DLineIntegral(document, forward, "circulation");
    const negative = analyzeVectorField3DLineIntegral(document, reverse, "circulation");
    expect(positive.value).toBeCloseTo(2, 12);
    expect(negative.value).toBeCloseTo(-2, 12);
    expect(positive.errorEstimate).toBeLessThan(1e-12);
    const open = createOrientedPolylineSelection(document, vertices, false, "forward", "open");
    expect(analyzeVectorField3DLineIntegral(document, open, "circulation")).toMatchObject({
      state: "unavailable", reason: "open-path", value: null, coverage: 0 });
    const outside = createOrientedPolylineSelection(document,
      [[0, 0, 0], [1, 0, 0], [6, 0, 0]], false, "forward", "outside");
    const partial = analyzeVectorField3DLineIntegral(document, outside, "line-integral");
    expect(partial).toMatchObject({ state: "partial", reason: "out-of-domain", value: null,
      completedSegments: 1, segmentCount: 2 });
    expect(partial.coverage).toBeGreaterThan(0);
    expect(partial.coverage).toBeLessThan(1);
    const savedProject = upsertProjectLineIntegralResult(
      upsertProjectScientificSelection(project, outside),
      createVectorField3DLineIntegralResult(document, outside, partial));
    const reopened = parseMath3DProject(serializeMath3DProject(savedProject));
    const saved = reopened.workspace.results.find(item =>
      item.provenance.operation.type === "vector3d.line-integral")!;
    expect(projectLineIntegralStatus(reopened, saved)).toEqual({
      status: "withheld", reason: "partial-coverage", value: null });
  });
});
