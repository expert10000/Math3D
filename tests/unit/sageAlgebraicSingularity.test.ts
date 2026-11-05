import { describe, expect, it } from "vitest";
import { algebraicSingularityGeometryDocument, analyzeSageAlgebraicSingularity,
  buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseAlgebraicSingularityGeometryDocument,
  parseMath3DProject, parseSageAlgebraicSingularityScene, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectAlgebraicSingularityScene } from "../../packages/core/src/index";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";

const fixture = (variables: string[], polynomial: string) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-f03-${polynomial}`, title: "Singular locus" });
  const make = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key), revision: 1,
      label: key, definition });
  const qq = make("QQ", { kind: "rational-field" });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = make("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
    variables, monomialOrder: "degrevlex" });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const scene = buildSageAlgebraicLocusScene(project, { objectId: ring.id, revision: 1 }, {
    polynomial, bounds: variables.map(() => ({ min: -2, max: 2 })), tolerance: 0.001, maxSamples: 8000 });
  return { project, scene, ring, make };
};
const coefficient = (terms: readonly { coefficient: string; powers: readonly number[] }[], powers: number[]) =>
  terms.find((term) => JSON.stringify(term.powers) === JSON.stringify(powers))?.coefficient ?? "0";

describe("SAGE-F03 exact hypersurface singularity and tangent views", () => {
  it("distinguishes an ordinary real node from a cusp by the exact tangent cone and cubic jet", () => {
    const node = fixture(["x", "y"], "y^2-x^2*(x+1)");
    const nodeView = analyzeSageAlgebraicSingularity(node.scene, ["0", "0"]);
    expect(nodeView.local).toMatchObject({ onLocus: true, jacobian: ["0", "0"], jacobianRank: 0,
      singular: true, multiplicity: 2, classification: "ordinary-real-node" });
    expect(coefficient(nodeView.local.tangentCone, [2,0])).toBe("-1");
    expect(coefficient(nodeView.local.tangentCone, [0,2])).toBe("1");
    expect(nodeView.local.realTangentDirections).toHaveLength(2);
    expect(nodeView.singularLocus.equations).toHaveLength(3);
    expect(coefficient(nodeView.singularLocus.equations[1], [2,0])).toBe("-3");
    const cusp = fixture(["x", "y"], "y^2-x^3");
    const cuspView = analyzeSageAlgebraicSingularity(cusp.scene, ["0", "0"]);
    expect(cuspView.local).toMatchObject({ singular: true, multiplicity: 2,
      classification: "ordinary-cusp" });
    expect(cuspView.local.tangentCone).toEqual([{ coefficient: "1", powers: [0,2] }]);
    expect(cuspView.local.realTangentDirections).toHaveLength(1);
    expect(cuspView.local.realTangentDirections[0][1]).toBe(0);
  });

  it("shows a smooth sphere tangent plane and rejects an off-locus point", () => {
    const { scene, project } = fixture(["x", "y", "z"], "x^2+y^2+z^2-1");
    const smooth = analyzeSageAlgebraicSingularity(scene, ["1", "0", "0"]);
    expect(smooth.local).toMatchObject({ onLocus: true, jacobian: ["2", "0", "0"],
      jacobianRank: 1, singular: false, multiplicity: 1, classification: "smooth" });
    expect(smooth.local.tangentCone).toEqual([{ coefficient: "2", powers: [1,0,0] }]);
    const savedProject = upsertMath3DProjectAlgebraicSingularityScene(project, smooth);
    const savedDocument = savedProject.workspace.entries[0].checkpoint;
    const surfaceView = resolveProjectCompositionMember(savedProject, { documentId: savedDocument.identity.id,
      expected: savedDocument.identity, visible: true, color: "#3976d7", opacity: 1 }, () => null);
    expect(surfaceView.meshes[0].positions.length).toBe(18);
    const off = analyzeSageAlgebraicSingularity(scene, ["0", "0", "0"]);
    expect(off.local.classification).toBe("off-locus");
    expect(off.local.tangentCone).toEqual([]);
  });

  it("independently reopens exact source and rejects altered Jacobian evidence", () => {
    let { project, scene } = fixture(["x", "y"], "y^2-x^3");
    const analysis = analyzeSageAlgebraicSingularity(scene, ["0/2", "0"]);
    expect(analysis.point).toEqual(["0", "0"]);
    expect(parseSageAlgebraicSingularityScene(JSON.parse(JSON.stringify(analysis)), project)).toEqual(analysis);
    const geometry = algebraicSingularityGeometryDocument(analysis);
    expect(parseAlgebraicSingularityGeometryDocument(JSON.parse(JSON.stringify(geometry)), project).analysis).toEqual(analysis);
    project = upsertMath3DProjectAlgebraicSingularityScene(project, analysis);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(parseAlgebraicSingularityGeometryDocument(reopened.workspace.entries[0].checkpoint, reopened).analysis).toEqual(analysis);
    const checkpoint = reopened.workspace.entries[0].checkpoint;
    const curveView = resolveProjectCompositionMember(reopened, { documentId: checkpoint.identity.id,
      expected: checkpoint.identity, visible: true, color: "#3976d7", opacity: 1 }, () => null);
    expect(curveView.points[0].points).toEqual([{ x: 0, y: 0, z: 0 }]);
    expect(curveView.lines[0].lines).toHaveLength(1);
    expect(() => parseSageAlgebraicSingularityScene({ ...analysis,
      local: { ...analysis.local, classification: "ordinary-real-node" } }, reopened)).toThrow();
    expect(() => analyzeSageAlgebraicSingularity(scene, ["3", "0"])).toThrow(/bounds/);
  });

  it("does not apply the hypersurface gradient test to a multi-equation ideal", () => {
    let { project, scene, ring, make } = fixture(["x", "y", "z"], "x^2+y^2+z^2-1");
    const ideal = make("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
      generators: ["x^2+y^2+z^2-1", "x-y"] });
    project = upsertMath3DProjectAlgebraObject(project, ideal);
    scene = buildSageAlgebraicLocusScene(project, { objectId: ideal.id, revision: 1 }, {
      bounds: scene.domain.bounds, tolerance: 0.001, maxSamples: 8000 });
    expect(() => analyzeSageAlgebraicSingularity(scene, ["0", "0", "0"])).toThrow(/dimension-aware minors/);
    const zero = fixture(["x", "y"], "x-x");
    expect(() => analyzeSageAlgebraicSingularity(zero.scene, ["0", "0"])).toThrow(/nonconstant hypersurface/);
  });
});
