import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeVectorField3DExtendedManifold,
  computeVectorField3DLocalManifoldPatch, computeVectorField3DManifoldAtlas,
  createMixedWorkspaceDocument, parseMath3DProject,
  promoteProjectExtendedManifold, promoteProjectManifoldAtlas,
  projectManifoldAtlasMeshStatus, projectManifoldAtlasStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, searchVectorField3DEquilibria,
  serializeMath3DProject, upsertProjectLocalManifoldPatch,
  vectorField3DExpression, type VectorField3DDocument } from "@math3d/core";

const fixture = () => {
  const base = parseMath3DProject(readFileSync(new URL(
    "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
    import.meta.url), "utf8"));
  const original = base.workspace.entries.find(item => item.module ===
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
    equilibriumConstructions: [{ id: "gf58-origin", position: equilibrium.position,
      residual: equilibrium.residual, classification: equilibrium.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  let project = replaceMath3DProjectWorkspace(base,
    createMixedWorkspaceDocument({ ...base.workspace,
      entries: base.workspace.entries.map(entry =>
        entry.expected.id === document.identity.id ? { ...entry,
          checkpoint: document, expected: document.identity } : entry),
      derivedFields: [], results: [] }));
  const patches = [8, 10].map(seedCount => computeVectorField3DLocalManifoldPatch(document,
    { constructionId: "gf58-origin", branch: "stable", offsetFraction: .01,
      seedCount, rings: 3, timeLimit: .5,
      solver: { method: "rk4-step-doubling", maxSteps: 256,
        absoluteTolerance: 1e-7, relativeTolerance: 1e-7 } }));
  for (const patch of patches) {
    expect(patch.status).toBe("resolved");
    project = upsertProjectLocalManifoldPatch(project, patch);
  }
  const domain = document.source.axes.map(axis => [axis.min, axis.max]) as
    unknown as import("@math3d/core").ManifoldAtlasRecipe["domain"];
  const studies = patches.map(patch => computeVectorField3DExtendedManifold(
    project, document, patch, { domain, targetExtraTime: .5,
      maxAttempts: 4, maxEvaluations: 1_000_000 }));
  for (const study of studies) {
    expect(study.status, study.reason ?? "").toBe("validated");
    project = promoteProjectExtendedManifold(project, study).project;
  }
  return { project, document, studies, domain };
};

describe("GF-58 bounded local manifold atlas", () => {
  it("measures overlap and uncovered bounds, then saves a guarded combined Mesh", () => {
    const { project, document, studies, domain } = fixture();
    const atlas = computeVectorField3DManifoldAtlas(project, document, studies,
      { domain, overlapTolerance: .1, maxEvaluations: 1_000_000 });
    expect(atlas.status, atlas.reason ?? "").toBe("validated");
    expect(atlas.publication!.summary).toMatchObject({
      transverseIntersectionPairs: 0, claim: "local-finite-time",
      globalClaim: "withheld" });
    expect(Number(atlas.publication!.summary.uncoveredCells)).toBeGreaterThan(0);
    const promoted = promoteProjectManifoldAtlas(project, atlas);
    const reopened = parseMath3DProject(serializeMath3DProject(promoted.project));
    const result = reopened.workspace.results.find(item =>
      item.resultId === atlas.publication!.resultId)!;
    expect(projectManifoldAtlasStatus(reopened, result).status).toBe("current");
    expect(projectManifoldAtlasMeshStatus(reopened, promoted.mesh, promoted.bytes).status)
      .toBe("current");
    expect(projectManifoldAtlasMeshStatus(reopened, promoted.mesh).status)
      .toBe("withheld");
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(entry =>
          entry.expected.id === changed.identity.id ? { ...entry,
            checkpoint: changed, expected: changed.identity } : entry) }));
    expect(projectManifoldAtlasStatus(stale, result).status).toBe("withheld");
  });
  it("refuses an undersized overlap or work budget and supports cancellation", () => {
    const { project, document, studies, domain } = fixture();
    expect(computeVectorField3DManifoldAtlas(project, document, studies,
      { domain, overlapTolerance: 1e-5, maxEvaluations: 1_000_000 }).status)
      .toBe("unavailable");
    expect(computeVectorField3DManifoldAtlas(project, document, studies,
      { domain, overlapTolerance: .1, maxEvaluations: 1 }).reason)
      .toBe("atlas-work-budget");
    expect(() => computeVectorField3DManifoldAtlas(project, document, studies,
      { domain, overlapTolerance: .1, maxEvaluations: 1_000_000 },
      () => true)).toThrow(/cancelled/);
  });
});
