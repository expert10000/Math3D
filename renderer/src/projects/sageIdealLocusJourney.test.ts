import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseMath3DProject,
  sampleSageAlgebraicLocus, serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { inspectSavedSageLocusSingularities, saveSageLocusSingularities } from "./sageLocusJourney";

describe("revision-pinned ideal locus Sage publication", () => {
  it("retains sampled Geometry and exact Jacobian output through reimport and withholds revised ideal", () => {
    let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], relations: [], artifacts: [], constructions: [], committedSelection: null }),
    { stableKey: "sage-ideal-unit", title: "Ideal" });
    const record = (name: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
      createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, name),
        revision: 1, label: name, definition });
    const qq = record("QQ", { kind: "rational-field" });
    project = upsertMath3DProjectAlgebraObject(project, qq);
    const ring = record("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
      variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
    project = upsertMath3DProjectAlgebraObject(project, ring);
    const ideal = record("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
      generators: ["y^2-x^3", "z"] });
    project = upsertMath3DProjectAlgebraObject(project, ideal);
    const scene = buildSageAlgebraicLocusScene(project, { objectId: ideal.id, revision: 1 }, {
      bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }, { min: -2, max: 2 }],
      tolerance: 0.001, maxSamples: 8000 });
    const sample = sampleSageAlgebraicLocus(scene);
    const response = { operation: "sage.symbolic.singularities", engine: "sagemath", success: true,
      engineVersion: "10.6", latex: "(0,0,0)", warnings: [], result: {
        points: [{ x: "0", y: "0", z: "0" }], dimension: 1, codimension: 2,
        jacobianMinors: ["2*y", "-3*x^2"],
        field: "QQ rational points, real-locus completeness checked over AA",
        criterion: "all generators vanish and Jacobian rank is below codimension" } };
    const saved = saveSageLocusSingularities(project, scene, response, "docker", sample);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    const result = reopened.workspace.results[0]!;
    expect(inspectSavedSageLocusSingularities(reopened, result.resultId).status).toBe("current");
    expect(reopened.workspace.entries.some(entry => entry.module === "geometry" &&
      entry.checkpoint.format === "math3d.geometry-document" &&
      Object.keys(entry.checkpoint.source.extensions).some(key => key.includes("locus-sample")))).toBe(true);
    expect(inspectSavedSageLocusSingularities({ ...reopened, workspace: { ...reopened.workspace,
      entries: [] } }, result.resultId).status).toBe("withheld");
    const revised = createAlgebraObjectRecord({ id: ideal.id, revision: 2, label: "I revised",
      definition: { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
        generators: ["y^2-x^3-1", "z"] } });
    const changed = upsertMath3DProjectAlgebraObject(reopened, revised);
    expect(inspectSavedSageLocusSingularities(changed, result.resultId).status).toBe("withheld");
  });
});
