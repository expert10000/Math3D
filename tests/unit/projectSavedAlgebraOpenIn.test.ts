import { describe, expect, it } from "vitest";
import { algebraicLocusGeometryDocument, algebraicSingularityGeometryDocument,
  analyzeSageAlgebraicSingularity, buildSageAlgebraicLocusScene,
  createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseMath3DProject,
  projectAlgebraLocusReturn, projectSavedAlgebraOpenInActions,
  resolveProjectAlgebraLocusReturn, resolveProjectSavedAlgebraOpenIn,
  sampleSageAlgebraicLocus, SAGE_LOCUS_GEOMETRY_EXTENSION, serializeMath3DProject, setMath3DProjectAlgebraObjectArchived,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectAlgebraicSingularityScene,
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
  it("returns from saved exact tangent evidence to its pinned algebra source", () => {
    const { project, target, scene } = fixture();
    const analysis = analyzeSageAlgebraicSingularity(scene, ["1", "0"]);
    const saved = upsertMath3DProjectAlgebraicSingularityScene(project, analysis);
    const documentId = algebraicSingularityGeometryDocument(analysis).identity.id;
    const action = projectAlgebraLocusReturn(saved, documentId)!;
    expect(action).toMatchObject({ enabled: true, sceneHash: scene.sceneHash,
      sampleHash: null, analysisHash: analysis.analysisHash, inspectionPoint: ["1", "0"] });
    expect(resolveProjectAlgebraLocusReturn(saved, action).target).toEqual(target);
    expect(() => resolveProjectAlgebraLocusReturn(saved,
      { ...action, analysisHash: `sha256:${"0".repeat(64)}` })).toThrow(/changed/);
  });

  it("returns from exact and sampled Geometry to the pinned algebra revision", () => {
    const { project, qq, ring, target, scene } = fixture();
    const exactProject = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    const documentId = algebraicLocusGeometryDocument(scene).identity.id;
    const exact = projectAlgebraLocusReturn(exactProject, documentId)!;
    expect(exact).toMatchObject({ enabled: true, sourceStatus: "current", sampleHash: null });
    expect(resolveProjectAlgebraLocusReturn(exactProject, exact).target).toEqual(target);
    const sample = sampleSageAlgebraicLocus(scene);
    const sampledProject = upsertMath3DProjectAlgebraicLocusSample(exactProject, sample);
    const sampled = projectAlgebraLocusReturn(sampledProject, documentId)!;
    expect(sampled).toMatchObject({ enabled: true, sampleHash: sample.resultHash,
      documentId, sourceStatus: "current" });
    expect(() => resolveProjectAlgebraLocusReturn(sampledProject, exact)).toThrow(/changed/);
    expect(resolveProjectAlgebraLocusReturn(sampledProject, sampled)).toMatchObject({
      projectId: project.identity.id, target, contentHash: ring.contentHash });
    expect(projectAlgebraLocusReturn(sampledProject, qq.id)).toBeNull();

    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const changed = upsertMath3DProjectAlgebraObject(sampledProject, revised);
    const historical = projectAlgebraLocusReturn(changed, documentId)!;
    expect(historical).toMatchObject({ enabled: true, sourceStatus: "historical",
      reason: expect.stringContaining("exact revision") });
    expect(resolveProjectAlgebraLocusReturn(changed, historical).target).toEqual(target);
    expect(() => resolveProjectAlgebraLocusReturn(changed, sampled)).toThrow(/changed/);
    const archived = setMath3DProjectAlgebraObjectArchived(changed, ring.id, true);
    expect(projectAlgebraLocusReturn(archived, documentId)).toMatchObject({ enabled: true,
      sourceStatus: "archived" });
  });
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

  it("ignores an invalid saved locus checkpoint instead of breaking Project navigation", () => {
    const { project, target, scene } = fixture();
    const saved = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    const invalid = structuredClone(saved);
    const checkpoint = invalid.workspace.entries[0]!.checkpoint;
    if (checkpoint.format !== "math3d.geometry-document") throw new Error("Expected Geometry fixture");
    (checkpoint.source.extensions as Record<string, unknown>)[SAGE_LOCUS_GEOMETRY_EXTENSION] = {};
    expect(projectAlgebraLocusReturn(invalid, checkpoint.identity.id)).toBeNull();
    expect(projectSavedAlgebraOpenInActions(invalid, target)).toMatchObject([
      { enabled: false, documentId: null }]);
  });

  it("opens historical saved evidence without substituting another object's locus", () => {
    const { project, qq, ring, target, scene } = fixture();
    const saved = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    expect(projectSavedAlgebraOpenInActions(saved, { objectId: qq.id, revision: 1 })[0]?.enabled)
      .toBe(false);
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const changed = upsertMath3DProjectAlgebraObject(saved, revised);
    const historical = projectSavedAlgebraOpenInActions(changed, target)[0]!;
    expect(historical).toMatchObject({ enabled: true, sourceStatus: "historical",
      preview: expect.stringContaining("without recomputation") });
    expect(resolveProjectSavedAlgebraOpenIn(changed, target, historical)).toBe(historical.documentId);
    expect(() => resolveProjectSavedAlgebraOpenIn(changed, target,
      projectSavedAlgebraOpenInActions(saved, target)[0]!)).toThrow(/destination changed/);
  });

  it("keeps distinct saved bounds separate and permits archived evidence inspection", () => {
    const { project, target, scene } = fixture();
    const other = buildSageAlgebraicLocusScene(project, target, { polynomial: "x^2+y^2-1",
      bounds: [{ min: -1, max: 1 }, { min: -1, max: 1 }], tolerance: 0.001,
      maxSamples: 8000 });
    const saved = upsertMath3DProjectAlgebraicLocusScene(
      upsertMath3DProjectAlgebraicLocusScene(project, scene), other);
    const choices = projectSavedAlgebraOpenInActions(saved, target);
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map(action => action.documentId)).size).toBe(2);
    expect(choices.every(action => action.enabled)).toBe(true);
    expect(resolveProjectSavedAlgebraOpenIn(saved, target, choices[0]!)).toBe(choices[0]?.documentId);
    expect(resolveProjectSavedAlgebraOpenIn(saved, target, choices[1]!)).toBe(choices[1]?.documentId);
    const archived = setMath3DProjectAlgebraObjectArchived(saved, target.objectId, true);
    expect(projectSavedAlgebraOpenInActions(archived, target).every(action =>
      action.enabled && action.sourceStatus === "archived")).toBe(true);
    const archivedChoice = projectSavedAlgebraOpenInActions(archived, target)[0]!;
    expect(resolveProjectSavedAlgebraOpenIn(archived, target, archivedChoice)).toBe(archivedChoice.documentId);
    expect(() => resolveProjectSavedAlgebraOpenIn(archived, target, choices[0]!))
      .toThrow(/destination changed/);
  });
});
