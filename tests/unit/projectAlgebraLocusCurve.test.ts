import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, orderedLocusCurvePoints,
  parseMath3DProject, projectAlgebraLocusReturn, promoteSavedAlgebraLocusCurve,
  sampleSageAlgebraicLocus, serializeMath3DProject, upsertMath3DProjectAlgebraObject,
  upsertMath3DProjectAlgebraicLocusSample, upsertProjectAlgebraLocusCurve } from "@math3d/core";

const fixture = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [],
    activeDocumentIds: [], results: [], artifacts: [], relations: [],
    committedSelection: null, constructions: [] }),
  { stableKey: "locus-curve-promotion", title: "Locus Curve" });
  const qq = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "QQ"),
    revision: 1, label: "QQ", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    revision: 1, label: "R", definition: { kind: "polynomial-ring",
      coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"],
      monomialOrder: "degrevlex" } });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const scene = (polynomial: string) => buildSageAlgebraicLocusScene(project,
    { objectId: ring.id, revision: 1 }, { polynomial,
      bounds: [{ min: -3, max: 3 }, { min: -3, max: 3 }],
      tolerance: 0.001, maxSamples: 8000 });
  return { project, qq, ring, scene };
};

describe("saved algebra locus to Curve", () => {
  it("promotes one complete saved contour with pinned Geometry lineage", () => {
    const { project, scene } = fixture();
    const sample = sampleSageAlgebraicLocus(scene("x^2+y^2-1"));
    const saved = upsertMath3DProjectAlgebraicLocusSample(project, sample);
    const choice = projectAlgebraLocusReturn(saved, saved.workspace.entries[0]!.expected.id)!;
    const ordered = orderedLocusCurvePoints(sample);
    expect(ordered.closed).toBe(true);
    expect(ordered.points.length).toBe(sample.segments.length + 1);
    const curve = promoteSavedAlgebraLocusCurve(saved, choice);
    expect(curve.source).toMatchObject({ representation: "polyline", dimension: 2,
      domain: { closed: true }, definition: { familyId: "algebra.bounded-locus-contour",
        pointCount: ordered.points.length, settings: { sampleHash: sample.resultHash,
          sceneHash: sample.scene.sceneHash, completeness: "bounded-sample" } } });
    const result = upsertProjectAlgebraLocusCurve(saved, choice);
    expect(result.curve).toEqual(curve);
    const reopened = parseMath3DProject(serializeMath3DProject(result.project));
    expect(reopened.workspace.entries.find(item => item.expected.id === curve.identity.id)
      ?.checkpoint).toEqual(curve);
    expect(reopened.workspace.relations).toHaveLength(1);
    expect(reopened.workspace.relations[0]?.operation).toBe("algebra.locus-sample-curve");
  });

  it("refuses multiple contours and stale or forged saved choices", () => {
    const { project, qq, ring, scene } = fixture();
    const disjoint = sampleSageAlgebraicLocus(scene("(x^2+y^2-1)*(x^2+y^2-4)"));
    expect(() => orderedLocusCurvePoints(disjoint)).toThrow(/disconnected/);
    const sample = sampleSageAlgebraicLocus(scene("x^2+y^2-1"));
    const saved = upsertMath3DProjectAlgebraicLocusSample(project, sample);
    const choice = projectAlgebraLocusReturn(saved, saved.workspace.entries[0]!.expected.id)!;
    expect(() => promoteSavedAlgebraLocusCurve(saved,
      { ...choice, sampleHash: `sha256:${"0".repeat(64)}` })).toThrow(/changed/);
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const historical = upsertMath3DProjectAlgebraObject(saved, revised);
    expect(() => promoteSavedAlgebraLocusCurve(historical, choice)).toThrow(/changed/);
    const historicalChoice = projectAlgebraLocusReturn(historical, choice.documentId)!;
    expect(() => promoteSavedAlgebraLocusCurve(historical, historicalChoice))
      .toThrow(/current saved bounded contour/);
  });
});
