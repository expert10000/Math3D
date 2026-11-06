import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeVectorField3DLocalManifoldPatch,
  computeVectorField3DManifoldContinuation, countManifoldSelfIntersections,
  promoteProjectManifoldContinuation, projectManifoldContinuationStatus,
  upsertProjectLocalManifoldPatch, searchVectorField3DEquilibria,
  reviseVectorField3DWorkspace, createMixedWorkspaceDocument,
  parseMath3DProject, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  vectorField3DExpression, type VectorField3DDocument } from "@math3d/core";

const sourceProject = parseMath3DProject(readFileSync(new URL(
  "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
  import.meta.url), "utf8"));
const fixture = () => {
  const original = sourceProject.workspace.entries.find(item => item.module ===
    "vector3d")!.checkpoint as VectorField3DDocument;
  const field = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("-x", "m/s"),
      vectorField3DExpression("-2*y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } });
  const search = searchVectorField3DEquilibria(field, undefined,
    { seedResolution: 3, maxEvaluations: 20_000 });
  const candidate = search.candidates.find(item => Math.hypot(...item.position) < 1e-6)!;
  const document = reviseVectorField3DWorkspace(field, { ...field.workspace!,
    equilibriumConstructions: [{ id: "gf51-origin", position: candidate.position,
      residual: candidate.residual, classification: candidate.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  const project = replaceMath3DProjectWorkspace(sourceProject,
    createMixedWorkspaceDocument({ ...sourceProject.workspace,
      entries: sourceProject.workspace.entries.map(entry =>
        entry.expected.id === document.identity.id ? { ...entry,
          checkpoint: document, expected: document.identity } : entry),
      derivedFields: [], results: [] }));
  const base = computeVectorField3DLocalManifoldPatch(document,
    { constructionId: "gf51-origin", branch: "stable", offsetFraction: .01,
      seedCount: 8, rings: 3, timeLimit: .5,
      solver: { method: "rk4-step-doubling", maxSteps: 256,
        absoluteTolerance: 1e-7, relativeTolerance: 1e-7 } });
  expect(base.status).toBe("resolved");
  return { document, base, project: upsertProjectLocalManifoldPatch(project, base) };
};

describe("GF-51 bounded manifold continuation validation", () => {
  it("checks nested-ring convergence and promotes additional local geometry", () => {
    const { project, document, base } = fixture();
    const study = computeVectorField3DManifoldContinuation(project, document,
      base, .5);
    expect(study.prefixError).toBeLessThan(3e-3);
    expect(study.status, study.reason ?? "").toBe("validated");
    expect(study.selfIntersectionPairs).toBe(0);
    expect(study.candidate!.vertices.length).toBeGreaterThan(base.vertices.length);
    const promoted = promoteProjectManifoldContinuation(project, study);
    const reopened = parseMath3DProject(serializeMath3DProject(promoted.project));
    const result = reopened.workspace.results.find(item => item.resultId ===
      study.publication!.resultId)!;
    expect(result.summary.claim).toBe("local-finite-time");
    expect(projectManifoldContinuationStatus(reopened, result).status).toBe("current");
    expect(promoted.mesh.source.origin.kind).toBe("vector3d.local-manifold-patch");
    expect(computeVectorField3DManifoldContinuation(project, document,
      base, .25).status).toBe("validated");
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(entry =>
          entry.expected.id === changed.identity.id ? { ...entry,
            checkpoint: changed, expected: changed.identity } : entry) }));
    expect(projectManifoldContinuationStatus(stale, result).status).toBe("withheld");
  });

  it("reports self-intersections, invalid continuation budgets and cancellation", () => {
    const crossing = countManifoldSelfIntersections([
      [-1, 0, 0], [1, 0, 0], [0, 1, 0],
      [0, -.5, -1], [0, -.5, 1], [0, .5, 0]
    ], [[0, 1, 2], [3, 4, 5]]);
    expect(crossing).toBe(1);
    expect(countManifoldSelfIntersections([
      [0, 0, 0], [2, 0, 0], [0, 2, 0],
      [.3, .3, 0], [1.3, .3, 0], [.3, 1.3, 0]
    ], [[0, 1, 2], [3, 4, 5]])).toBe(1);
    const { project, document, base } = fixture();
    expect(() => computeVectorField3DManifoldContinuation(project, document,
      base, 3)).toThrow(/budget/);
    expect(() => computeVectorField3DManifoldContinuation(project, document,
      base, .25, () => true)).toThrow(/cancelled/);
    const tampered = { ...base, vertices: base.vertices.map((point, index) =>
      index ? point : [99, 99, 99] as const) };
    expect(computeVectorField3DManifoldContinuation(project, document,
      tampered, .25).reason).toBe("base-geometry-changed");
  });
});
