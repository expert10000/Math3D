import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseMath3DProject,
  projectSavedAlgebraOpenInActions, resolveProjectSavedAlgebraOpenIn,
  sampleSageAlgebraicLocus, serializeMath3DProject, upsertMath3DProjectAlgebraObject,
  upsertMath3DProjectAlgebraicLocusSample, upsertMath3DProjectAlgebraicLocusScene } from "@math3d/core";

const fixture = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "saved-algebra-open-in", title: "Saved algebra" });
  const qq = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "QQ"),
    revision: 1, label: "QQ", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    revision: 1, label: "R", definition: { kind: "polynomial-ring",
      coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"],
      monomialOrder: "degrevlex" } });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const target = { objectId: ring.id, revision: 1 };
  const scene = buildSageAlgebraicLocusScene(project, target, { polynomial: "x^2+y^2-1",
    bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }], tolerance: 0.001, maxSamples: 8000 });
  return { project, qq, ring, target, scene };
};

describe("saved Project algebra locus Open in", () => {
  it("discovers only saved checkpoints and requalifies a changed checkpoint", () => {
    const { project, target, scene } = fixture();
    expect(projectSavedAlgebraOpenInActions(project, target)).toMatchObject([
      { enabled: false, documentId: null, disabledReason: expect.stringContaining("No saved locus") }]);
    const exactProject = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    const exact = projectSavedAlgebraOpenInActions(exactProject, target)[0]!;
    expect(exact).toMatchObject({ id: "algebra.locus-geometry", enabled: true });
    expect(resolveProjectSavedAlgebraOpenIn(exactProject, target, exact)).toBe(exact.documentId);
    const sample = sampleSageAlgebraicLocus(scene);
    const sampledProject = parseMath3DProject(serializeMath3DProject(
      upsertMath3DProjectAlgebraicLocusSample(exactProject, sample)));
    const sampled = projectSavedAlgebraOpenInActions(sampledProject, target)[0]!;
    expect(sampled).toMatchObject({ id: "algebra.sampled-geometry", enabled: true,
      documentId: exact.documentId, sampleHash: sample.resultHash });
    expect(resolveProjectSavedAlgebraOpenIn(sampledProject, target, sampled)).toBe(sampled.documentId);
    expect(() => resolveProjectSavedAlgebraOpenIn(sampledProject, target, exact))
      .toThrow(/destination changed/);
    expect(() => resolveProjectSavedAlgebraOpenIn(sampledProject, target,
      { ...sampled, documentHash: `sha256:${"0".repeat(64)}` }))
      .toThrow(/destination changed/);
  });

  it("disables historical algebra sources and never substitutes another object's locus", () => {
    const { project, qq, ring, target, scene } = fixture();
    const saved = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    expect(projectSavedAlgebraOpenInActions(saved, { objectId: qq.id, revision: 1 })[0]?.enabled)
      .toBe(false);
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const changed = upsertMath3DProjectAlgebraObject(saved, revised);
    const historical = projectSavedAlgebraOpenInActions(changed, target)[0]!;
    expect(historical.enabled).toBe(false);
    expect(historical.disabledReason).toContain("current unarchived algebra object revision");
    expect(() => resolveProjectSavedAlgebraOpenIn(changed, target,
      projectSavedAlgebraOpenInActions(saved, target)[0]!)).toThrow(/destination changed/);
  });
});
