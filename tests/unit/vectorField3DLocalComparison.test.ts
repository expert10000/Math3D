import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeVectorField3DLocalTopology, compareVectorField3D,
  createMixedWorkspaceDocument, createVectorField3DComparisonResult,
  createVectorField3DDocument, parseMath3DProject, projectLocalSeparatrixStatus,
  projectVectorField3DComparisonStatus, promoteVectorField3DLocalSeparatrix,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, searchVectorField3DEquilibria,
  serializeMath3DProject, upsertProjectLocalSeparatrix,
  upsertProjectVectorField3DComparison, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const expressions = (document: VectorField3DDocument, parts: [string, string, string]) =>
  ({ ...document.source, field: { kind: "expressions" as const,
    components: parts.map(part => vectorField3DExpression(part, "m/s")) as unknown as
      Extract<VectorField3DDocument["source"]["field"], { kind: "expressions" }>["components"] } });
const replace = (project: Math3DProject, document: VectorField3DDocument) =>
  replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: project.workspace.entries.map(item => item.expected.id === document.identity.id ?
      { ...item, checkpoint: document, expected: document.identity } : item) }));

describe("GF-17 local topology and saved separatrices", () => {
  it("saves stable and unstable branches with local labels, offsets and stale-source guards", () => {
    let project = load();
    const revised = reviseVectorField3DDocument(source(project),
      expressions(source(project), ["x", "-2*y", "-3*z"]));
    project = replace(project, revised);
    const search = searchVectorField3DEquilibria(revised);
    const index = search.candidates.findIndex(item => Math.hypot(...item.position) < 1e-8);
    const local = analyzeVectorField3DLocalTopology(search, index);
    expect(local.status).toBe("resolved");
    expect(local.label).toBe("Local saddle");
    expect(local.directions.map(item => item.branch).sort()).toEqual(["stable", "stable", "unstable"]);
    const candidate = search.candidates[index]!;
    const construction = { id: "equilibrium-local-test", position: candidate.position,
      residual: candidate.residual, classification: candidate.classification,
      sourceRevision: revised.identity.revision,
      sourceStructuralHash: revised.identity.structuralHash, sourceHash: search.sourceHash };
    const savedSource = reviseVectorField3DWorkspace(revised, {
      ...revised.workspace!, equilibriumConstructions: [construction] });
    const unstable = local.directions.find(item => item.branch === "unstable")!;
    const stable = local.directions.find(item => item.branch === "stable")!;
    const branches = [
      promoteVectorField3DLocalSeparatrix(savedSource, search, construction.id, unstable.index, 1),
      promoteVectorField3DLocalSeparatrix(savedSource, search, construction.id, stable.index, -1),
    ];
    expect(branches.map(item => item.curve.source.orientation)).toEqual([
      { branch: "unstable", side: 1, travel: "forward" },
      { branch: "stable", side: -1, travel: "backward" },
    ]);
    for (const branch of branches) project = upsertProjectLocalSeparatrix(project, branch);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    for (const branch of branches) {
      const curve = reopened.workspace.entries.find(item => item.expected.id ===
        branch.curve.identity.id)!.checkpoint as typeof branch.curve;
      expect(curve).toEqual(branch.curve);
      expect(projectLocalSeparatrixStatus(reopened, curve)).toEqual({ status: "current", reason: null });
      expect(curve.source.definition.settings).toMatchObject({
        localClassification: "Local saddle", offsetFraction: .01,
        constructionId: construction.id });
    }
    const changed = reviseVectorField3DDocument(savedSource,
      expressions(savedSource, ["2*x", "-2*y", "-3*z"]));
    const stale = replace(reopened, changed);
    expect(projectLocalSeparatrixStatus(stale, branches[0]!.curve).reason).toBe("source-changed");
    const withoutEquilibrium = replace(reopened, reviseVectorField3DWorkspace(savedSource,
      { ...savedSource.workspace!, equilibriumConstructions: [] }));
    expect(projectLocalSeparatrixStatus(withoutEquilibrium, branches[0]!.curve).reason)
      .toBe("equilibrium-missing");
  });

  it("withholds unresolved directions near repeated eigenvalues", () => {
    const document = reviseVectorField3DDocument(source(load()),
      expressions(source(load()), ["x", "x+y", "-z"]));
    const search = searchVectorField3DEquilibria(document);
    const index = search.candidates.findIndex(item => Math.hypot(...item.position) < 1e-8);
    expect(analyzeVectorField3DLocalTopology(search, index).status).toBe("unavailable");
  });
});

describe("GF-18 explicit field comparison", () => {
  it("compares and reopens two pinned sources, then withholds on change", () => {
    let project = load();
    const first = reviseVectorField3DDocument(source(project),
      expressions(source(project), ["x", "y", "z"]));
    project = replace(project, first);
    const second = createVectorField3DDocument(expressions(first, ["2*x", "y", "z"]),
      { stableKey: "gf18-second-source", title: "Comparison B" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const policy = { frame: "cartesian-identical" as const, grid: [5, 5, 5] as const,
      units: "identical" as const, interpolation: "analytic-direct" as const,
      coverage: "complete-or-withhold" as const };
    const comparison = compareVectorField3D(first, second, policy);
    expect(comparison).toMatchObject({ sampled: 125, valid: 125, gaps: 0, status: "complete" });
    expect(comparison.vectorDifference.mean).toBeGreaterThan(0);
    expect(comparison.angularError.meanRadians).toBeGreaterThan(0);
    const result = createVectorField3DComparisonResult(comparison);
    project = upsertProjectVectorField3DComparison(project, result);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.workspace.results.find(item => item.resultId === result.resultId)).toEqual(result);
    expect(projectVectorField3DComparisonStatus(reopened, result)).toEqual({ status: "current", reason: null });
    expect(reopened.workspace.relations.some(item => item.target.type === "result" &&
      item.target.resultId === result.resultId && item.sources.length === 2)).toBe(true);
    const changed = reviseVectorField3DDocument(second,
      expressions(second, ["3*x", "y", "z"]));
    const stale = replace(reopened, changed);
    expect(projectVectorField3DComparisonStatus(stale, result).reason).toBe("source-2-changed");
  });

  it("rejects silent frame, unit, interpolation and coverage changes", () => {
    const first = source(load());
    const second = createVectorField3DDocument(expressions(first, ["x", "y", "z"]),
      { stableKey: "gf18-policy-test" });
    const policy = { frame: "cartesian-identical" as const, grid: [5, 5, 5] as const,
      units: "identical" as const, interpolation: "analytic-direct" as const,
      coverage: "complete-or-withhold" as const };
    expect(() => compareVectorField3D(first, second,
      { ...policy, interpolation: "linear" as never })).toThrow(/explicit/);
    const shifted = createVectorField3DDocument({ ...second.source,
      axes: second.source.axes.map((axis, index) => index === 0 ?
        { ...axis, min: axis.min + 1 } : axis) as unknown as typeof second.source.axes },
    { stableKey: "gf18-shifted" });
    expect(() => compareVectorField3D(first, shifted, policy)).toThrow(/identical Cartesian/);
    const singular = createVectorField3DDocument(expressions(first, ["1/x", "y", "z"]),
      { stableKey: "gf18-singular" });
    const incomplete = compareVectorField3D(first, singular, policy);
    expect(incomplete.status).toBe("incomplete");
    expect(incomplete.gaps).toBeGreaterThan(0);
    expect(createVectorField3DComparisonResult(incomplete).status).toBe("unsupported");
  });
});
