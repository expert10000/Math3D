import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeVectorField3DLocalManifoldPatch,
  computeVectorField3DExtendedManifold, createMixedWorkspaceDocument,
  parseMath3DProject, promoteProjectExtendedManifold,
  projectExtendedManifoldStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  searchVectorField3DEquilibria, serializeMath3DProject,
  upsertProjectLocalManifoldPatch, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";

const fixture = () => {
  const project0 = parseMath3DProject(readFileSync(new URL(
    "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
    import.meta.url), "utf8"));
  const original = project0.workspace.entries.find(item => item.module ===
    "vector3d")!.checkpoint as VectorField3DDocument;
  const field = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("-x", "m/s"),
      vectorField3DExpression("-2*y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } });
  const search = searchVectorField3DEquilibria(field, undefined,
    { seedResolution: 3, maxEvaluations: 20_000 });
  const equilibrium = search.candidates.find(item =>
    Math.hypot(...item.position) < 1e-6)!;
  const document = reviseVectorField3DWorkspace(field, { ...field.workspace!,
    equilibriumConstructions: [{ id: "gf55-origin",
      position: equilibrium.position, residual: equilibrium.residual,
      classification: equilibrium.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  const project1 = replaceMath3DProjectWorkspace(project0,
    createMixedWorkspaceDocument({ ...project0.workspace,
      entries: project0.workspace.entries.map(entry =>
        entry.expected.id === document.identity.id ? { ...entry,
          checkpoint: document, expected: document.identity } : entry),
      derivedFields: [], results: [] }));
  const base = computeVectorField3DLocalManifoldPatch(document,
    { constructionId: "gf55-origin", branch: "stable", offsetFraction: .01,
      seedCount: 8, rings: 3, timeLimit: .5,
      solver: { method: "rk4-step-doubling", maxSteps: 256,
        absoluteTolerance: 1e-7, relativeTolerance: 1e-7 } });
  expect(base.status).toBe("resolved");
  const project = upsertProjectLocalManifoldPatch(project1, base);
  const domain = document.source.axes.map(axis => [axis.min, axis.max]) as
    unknown as import("@math3d/core").ExtendedManifoldRecipe["domain"];
  return { project, document, base, domain };
};

describe("GF-55 adaptive bounded local manifold", () => {
  it("records convergence, coverage and stop evidence across Project reopen", () => {
    const { project, document, base, domain } = fixture();
    const study = computeVectorField3DExtendedManifold(project, document, base,
      { domain, targetExtraTime: .75, maxAttempts: 5, maxEvaluations: 1_000_000 });
    expect(study.status, study.reason ?? "").toBe("validated");
    expect(study.attempts.length).toBeGreaterThan(1);
    expect(study.attempts.every(item => item.status === "validated")).toBe(true);
    expect(study.publication!.summary).toMatchObject({
      claim: "local-finite-time", globalClaim: "withheld",
      selfIntersectionPairs: 0, stopReason: "target-reached" });
    expect(Number(study.publication!.summary.coordinateCoverage)).toBeGreaterThan(0);
    const saved = promoteProjectExtendedManifold(project, study);
    const reopened = parseMath3DProject(serializeMath3DProject(saved.project));
    const result = reopened.workspace.results.find(item =>
      item.resultId === study.publication!.resultId)!;
    expect(projectExtendedManifoldStatus(reopened, result).status).toBe("current");
    expect(projectExtendedManifoldStatus(reopened, { ...result,
      summary: { ...result.summary, coordinateCoverage: 1 } }).status)
      .toBe("withheld");
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(entry =>
          entry.expected.id === changed.identity.id ? { ...entry,
            checkpoint: changed, expected: changed.identity } : entry) }));
    expect(projectExtendedManifoldStatus(stale, result).status).toBe("withheld");
  });
  it("enforces domain, work and cancellation gates", () => {
    const { project, document, base, domain } = fixture();
    const budget = computeVectorField3DExtendedManifold(project, document, base,
      { domain, targetExtraTime: .5, maxAttempts: 2, maxEvaluations: 1 });
    expect(budget).toMatchObject({ status: "unavailable", stopReason: "work-budget" });
    const narrow = computeVectorField3DExtendedManifold(project, document, base,
      { domain: [[-.01, .01], [-.01, .01], [-.01, .01]],
        targetExtraTime: .5, maxAttempts: 2, maxEvaluations: 1_000_000 });
    expect(narrow).toMatchObject({ status: "unavailable",
      stopReason: "declared-domain-boundary" });
    expect(() => computeVectorField3DExtendedManifold(project, document, base,
      { domain, targetExtraTime: .5, maxAttempts: 2,
        maxEvaluations: 1_000_000 }, () => true)).toThrow(/cancelled/);
  });
});
