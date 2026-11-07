import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";
import { computeVectorField3DPoincareSection,
  computeVectorField3DPoincareReturnMap, upsertProjectPoincareReturnMap,
  projectPoincareReturnStatus, computeVectorField3DLyapunov,
  createPoincareReturnGraphOrigin, poincareReturnGraphRows,
  projectPoincareGraphStatus,
  upsertProjectLyapunov, projectLyapunovStatus,
  computeVectorField3DLocalManifoldPatch,
  projectLocalManifoldPatchStatus, promoteProjectLocalManifoldPatch,
  projectLocalManifoldMeshStatus, decodeMeshBuffers,
  captureProjectResources, exportProjectPackage, parseProjectPackage,
  searchVectorField3DEquilibria,
  reviseVectorField3DWorkspace, upsertProjectVectorField3DTopologyStudy,
  createMixedWorkspaceDocument, parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = parseMath3DProject(readFileSync(new URL(
  "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
  import.meta.url), "utf8"));
function analytic(parts: readonly [string, string, string]):
  { project: Math3DProject; document: VectorField3DDocument } {
  const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const document = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression(parts[0], "m/s"),
      vectorField3DExpression(parts[1], "m/s"),
      vectorField3DExpression(parts[2], "m/s") ] } });
  const project = replaceMath3DProjectWorkspace(fixture,
    createMixedWorkspaceDocument({ ...fixture.workspace,
      entries: fixture.workspace.entries.map(item => item.expected.id ===
        document.identity.id ? { ...item, checkpoint: document,
        expected: document.identity } : item), derivedFields: [], results: [] }));
  return { project, document };
}
const solver = { method: "rk4-step-doubling" as const, maxSteps: 256,
  maxTime: 20, absoluteTolerance: 1e-5, relativeTolerance: 1e-5 };
const changed = (project: Math3DProject, source: VectorField3DDocument) => {
  const next = reviseVectorField3DDocument(source, { ...source.source,
    display: { ...source.source.display, magnitudeScale: 2 } });
  return replaceMath3DProjectWorkspace(project,
    createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(item => item.expected.id ===
        source.identity.id ? { ...item, checkpoint: next,
        expected: next.identity } : item) }));
};

describe("GF-44 directed Poincaré return map", () => {
  it("pairs saved crossings in order, checks refinement, and withholds stale rows", () => {
    const { project, document } = analytic(["-y", "x", "0"]);
    const recipe = { seed: [1, 0, 0] as const,
      section: { start: [0, 0, 0] as const, end: [0, 2, 0] as const,
        normal: [1, 0] as const, direction: "negative" as const },
      solver, maxCrossings: 8, tangencyTolerance: 1e-4 };
    const section = computeVectorField3DPoincareSection(document, recipe);
    const saved = upsertProjectVectorField3DTopologyStudy(project,
      section.publication);
    const returns = computeVectorField3DPoincareReturnMap(saved,
      section.publication.resultId);
    expect(returns.status).toBe("ready");
    expect(returns.rows.length).toBe(section.crossings.length - 1);
    expect(returns.rows[0]!.x).toBeCloseTo(section.crossings[0]!.sectionDistance, 6);
    expect(returns.rows[0]!.y).toBeCloseTo(section.crossings[1]!.sectionDistance, 6);
    expect(returns.maxRefinementDifference).toBeLessThan(.02);
    const roundTrip = parseMath3DProject(serializeMath3DProject(
      upsertProjectPoincareReturnMap(saved, returns)));
    expect(projectPoincareReturnStatus(roundTrip, returns.publication!).status)
      .toBe("current");
    const origin = createPoincareReturnGraphOrigin(roundTrip, returns);
    const rows = poincareReturnGraphRows(returns);
    expect(projectPoincareGraphStatus(roundTrip, origin, rows).status)
      .toBe("current");
    expect(projectPoincareGraphStatus(roundTrip, origin, rows.slice(1)).reason)
      .toBe("crossings-missing-or-changed");
    expect(projectPoincareReturnStatus(changed(roundTrip, document),
      returns.publication!)).toMatchObject({ status: "withheld",
        reason: "source-changed" });
    expect(projectPoincareGraphStatus(changed(roundTrip, document), origin,
      rows).reason).toBe("source-changed");
    expect(computeVectorField3DPoincareReturnMap(project,
      section.publication.resultId).reason).toBe("saved-section-missing");
    const capped = computeVectorField3DPoincareSection(document,
      { ...recipe, maxCrossings: 3 });
    const cappedProject = upsertProjectVectorField3DTopologyStudy(project,
      capped.publication);
    expect(computeVectorField3DPoincareReturnMap(cappedProject,
      capped.publication.resultId).reason).toBe("crossing-cap-reached");
  });
});

describe("GF-45 finite-time Lyapunov estimate", () => {
  it("matches linear growth and rotation within a bounded uncertainty", () => {
    const { project, document } = analytic(["x", "-y", "0"]);
    const recipe = { seed: [.1, .1, 0] as const,
      direction: [1, 0, 0] as const, perturbation: .001, interval: 2,
      solver: { ...solver, maxTime: 2 } };
    const study = computeVectorField3DLyapunov(document, recipe);
    expect(study.status).toBe("resolved");
    expect(study.estimate).toBeCloseTo(1, 2);
    expect(study.uncertainty).toBeLessThan(.05);
    expect(study.evaluations).toBeLessThanOrEqual(500_000);
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectLyapunov(project, study)));
    expect(projectLyapunovStatus(reopened, study.publication!).status)
      .toBe("current");
    expect(projectLyapunovStatus(changed(reopened, document),
      study.publication!).reason).toBe("source-changed");
    const orbit = analytic(["-y", "x", "0"]);
    const neutral = computeVectorField3DLyapunov(orbit.document,
      { ...recipe, seed: [1, 0, 0] });
    expect(neutral.estimate).toBeCloseTo(0, 2);
    expect(computeVectorField3DLyapunov(document,
      { ...recipe, seed: [3, 0, 0] }).reason).toBe("incomplete-time-coverage");
    expect(() => computeVectorField3DLyapunov(document, recipe, () => true))
      .toThrow(/cancelled/);
  });
});

describe("GF-46 local stable manifold patch", () => {
  it("saves a bounded source-linked surface patch and stop reasons", () => {
    const base = analytic(["-x", "-2*y", "z"]);
    const search = searchVectorField3DEquilibria(base.document, undefined,
      { seedResolution: 3, maxEvaluations: 20_000 });
    const candidate = search.candidates.find(item =>
      Math.hypot(...item.position) < 1e-6)!;
    expect(candidate).toBeDefined();
    const construction = { id: "eq_origin", position: candidate.position,
      residual: candidate.residual, classification: candidate.classification,
      sourceRevision: base.document.identity.revision,
      sourceStructuralHash: base.document.identity.structuralHash,
      sourceHash: search.sourceHash };
    const document = reviseVectorField3DWorkspace(base.document,
      { ...base.document.workspace!, equilibriumConstructions: [construction] });
    const project = replaceMath3DProjectWorkspace(base.project,
      createMixedWorkspaceDocument({ ...base.project.workspace,
        entries: base.project.workspace.entries.map(item => item.expected.id ===
          document.identity.id ? { ...item, checkpoint: document,
          expected: document.identity } : item) }));
    const recipe = { constructionId: construction.id,
      branch: "stable" as const, offsetFraction: .01,
      seedCount: 8, rings: 5, timeLimit: 1,
      solver: { method: "rk4-step-doubling" as const, maxSteps: 256,
        absoluteTolerance: 1e-5, relativeTolerance: 1e-5 } };
    const patch = computeVectorField3DLocalManifoldPatch(document, recipe);
    expect(patch.status).toBe("resolved");
    expect(patch.vertices).toHaveLength(40);
    expect(patch.triangles).toHaveLength(64);
    expect(patch.stopReasons.every(item => item === "time-limit")).toBe(true);
    expect(patch.publication?.summary.coordinateUnit).toBe("m");
    const promoted = promoteProjectLocalManifoldPatch(project, patch);
    const resources = captureProjectResources(promoted.project,
      item => item.id === promoted.mesh.source.resource.id ? promoted.bytes : null,
      true);
    const packaged = parseProjectPackage(exportProjectPackage(promoted.project,
      resources));
    const reopened = packaged.project;
    expect(projectLocalManifoldPatchStatus(reopened, patch.publication!).status)
      .toBe("current");
    expect(projectLocalManifoldMeshStatus(reopened, promoted.mesh,
      packaged.resources.bytes({ kind: "mesh-buffers",
        id: promoted.mesh.source.resource.id })).status).toBe("current");
    expect(projectLocalManifoldMeshStatus(reopened, promoted.mesh).reason)
      .toBe("mesh-bytes-unverified");
    const mobile = buildMobileProjectExplorer(serializeMath3DProject(reopened),
      resources.sidecars());
    expect(mobile.scientificContracts.find(item => item.kind ===
      "Local manifold Mesh")?.status).toBe("bytes verified");
    expect(decodeMeshBuffers(promoted.bytes).indices).toHaveLength(192);
    expect(projectLocalManifoldPatchStatus(changed(reopened, document),
      patch.publication!).reason).toBe("source-changed");
    expect(projectLocalManifoldMeshStatus(changed(reopened, document),
      promoted.mesh, promoted.bytes).reason).toBe("source-changed");
    expect(computeVectorField3DLocalManifoldPatch(document,
      { ...recipe, branch: "unstable" }).reason)
      .toBe("a-two-dimensional-real-eigenspace-is-required");
  });
});
