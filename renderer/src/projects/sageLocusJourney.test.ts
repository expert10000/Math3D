import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  parseMath3DProject, sampleSageAlgebraicLocus, serializeMath3DProject,
  upsertMath3DProjectAlgebraicLocusSample, upsertMath3DProjectAlgebraObject,
  type Math3DProject } from "@math3d/core";
import { inspectSavedSageLocusSingularities, saveSageLocusSingularities,
  SAGE_LOCUS_SINGULARITIES_OPERATION } from "./sageLocusJourney";

const fixture = () => {
  let project: Math3DProject = createMath3DProject(createMixedWorkspaceDocument({
    entries: [], activeDocumentIds: [], results: [], relations: [], artifacts: [],
    constructions: [], committedSelection: null }), { stableKey: "sage-locus-journey", title: "Locus" });
  const make = (label: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, label),
      revision: 1, label, definition });
  const qq = make("QQ", { kind: "rational-field" });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = make("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
    variables: ["x", "y"], monomialOrder: "degrevlex" });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const scene = buildSageAlgebraicLocusScene(project, { objectId: ring.id, revision: 1 },
    { polynomial: "y^2-x^3", bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }],
      tolerance: 0.001, maxSamples: 8000 });
  return { project, scene, ring, qq };
};
const response = { engine: "sagemath", engineVersion: "10.6",
  operation: SAGE_LOCUS_SINGULARITIES_OPERATION, success: true,
  latex: "(0,0)", result: { points: [["0", "0"]] }, warnings: [] };

describe("saved Sage locus singularity journey", () => {
  it("pins the exact source, broker result and Geometry relation through serialization", () => {
    const { project, scene } = fixture();
    const reopened = parseMath3DProject(serializeMath3DProject(
      saveSageLocusSingularities(project, scene, { ...response, elapsedMs: undefined }, "docker")));
    const result = reopened.workspace.results.find(item =>
      item.provenance.operation.type === SAGE_LOCUS_SINGULARITIES_OPERATION);
    expect(result?.summary).toMatchObject({ exactResult: response.result,
      sceneHash: scene.sceneHash, backend: "docker" });
    expect(reopened.workspace.entries.some(item => item.module === "geometry" &&
      item.expected.id === result?.provenance.source.documentId)).toBe(true);
    expect(reopened.workspace.relations.some(item => item.target.type === "result" &&
      item.target.resultId === result?.resultId)).toBe(true);
  });

  it("refuses a revised algebra source and failed broker response", () => {
    const { project, scene, ring, qq } = fixture();
    expect(() => saveSageLocusSingularities(project, scene,
      { ...response, success: false }, "docker")).toThrow();
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const changed = upsertMath3DProjectAlgebraObject(project, revised);
    expect(() => saveSageLocusSingularities(changed, scene, response, "docker"))
      .toThrow(/current single-polynomial locus/);
  });

  it("retains exact Sage evidence when the same locus gains a bounded sample", () => {
    const { project, scene, ring, qq } = fixture();
    const exact = saveSageLocusSingularities(project, scene, response, "local");
    const result = exact.workspace.results.find(item =>
      item.provenance.operation.type === SAGE_LOCUS_SINGULARITIES_OPERATION)!;
    const sampled = parseMath3DProject(serializeMath3DProject(
      upsertMath3DProjectAlgebraicLocusSample(exact, sampleSageAlgebraicLocus(scene))));
    expect(inspectSavedSageLocusSingularities(sampled, result.resultId).status).toBe("current");
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    expect(inspectSavedSageLocusSingularities(
      upsertMath3DProjectAlgebraObject(sampled, revised), result.resultId).status).toBe("withheld");
  });
});
