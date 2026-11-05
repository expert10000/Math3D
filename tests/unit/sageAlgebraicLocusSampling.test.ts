import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseMath3DProject,
  parseSageAlgebraicLocusSample, parseSampledAlgebraicLocusGeometryDocument,
  sampleSageAlgebraicLocus, sampledAlgebraicLocusGeometryDocument, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectAlgebraicLocusSample } from "../../packages/core/src/index";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";

const setup = (variables: string[]) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-f02-${variables.length}`, title: "Numerical real locus" });
  const make = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
  const ref = (record: ReturnType<typeof make>) => ({ objectId: record.id, revision: record.revision });
  const qq = make("QQ", { kind: "rational-field" });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = make("R", { kind: "polynomial-ring", coefficientDomain: ref(qq),
    variables, monomialOrder: "degrevlex" });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  return { project, ring, make, ref };
};
const settings = (dimension: number) => ({ bounds: Array.from({ length: dimension }, () => ({ min: -1.5, max: 1.5 })),
  tolerance: 0.001, maxSamples: 8000 });

describe("SAGE-F02 bounded real-locus sampling", () => {
  it("renders a bounded planar circle with exact source and numerical status", () => {
    const { project, ring, ref } = setup(["x", "y"]);
    const scene = buildSageAlgebraicLocusScene(project, ref(ring), { ...settings(2), polynomial: "x^2+y^2-1" });
    const sample = sampleSageAlgebraicLocus(scene);
    expect(sample.kind).toBe("curve");
    expect(sample.algorithm).toBe("marching-squares-v1");
    expect(sample.completeness).toBe("bounded-sample");
    expect(sample.segments.length).toBeGreaterThan(100);
    for (const [a, b] of sample.segments) for (const p of [a, b])
      expect(Math.abs(p[0] ** 2 + p[1] ** 2 - 1)).toBeLessThan(0.002);
    expect(parseSageAlgebraicLocusSample(JSON.parse(JSON.stringify(sample)), project)).toEqual(sample);
    expect(parseSampledAlgebraicLocusGeometryDocument(sampledAlgebraicLocusGeometryDocument(sample), project).sample).toEqual(sample);
  });

  it("renders the implicit sphere surface and its exact plane-section curve", () => {
    let { project, ring, make, ref } = setup(["x", "y", "z"]);
    const sphere = sampleSageAlgebraicLocus(buildSageAlgebraicLocusScene(project, ref(ring), {
      ...settings(3), polynomial: "x^2+y^2+z^2-1" }));
    expect(sphere.kind).toBe("surface");
    expect(sphere.triangles.length).toBeGreaterThan(500);
    expect(sphere.sampleCount).toBeLessThanOrEqual(8000);
    for (const triangle of sphere.triangles) for (const p of triangle)
      expect(Math.abs(p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - 1)).toBeLessThan(0.08);
    const sphereProject = upsertMath3DProjectAlgebraicLocusSample(project, sphere);
    const sphereCheckpoint = sphereProject.workspace.entries[0].checkpoint;
    const surfaceView = resolveProjectCompositionMember(sphereProject, { documentId: sphereCheckpoint.identity.id,
      expected: sphereCheckpoint.identity, visible: true, color: "#3976d7", opacity: 1 }, () => null);
    expect(surfaceView.meshes[0].positions.length).toBe(sphere.triangles.length * 9);
    const ideal = make("I", { kind: "ideal", ambientRing: ref(ring),
      generators: ["x^2+y^2+z^2-1", "x-y"] });
    project = upsertMath3DProjectAlgebraObject(project, ideal);
    const section = sampleSageAlgebraicLocus(buildSageAlgebraicLocusScene(project, ref(ideal), settings(3)));
    expect(section.kind).toBe("curve");
    expect(section.algorithm).toBe("plane-section-v1");
    expect(section.segments.length).toBeGreaterThan(100);
    for (const [a, b] of section.segments) for (const p of [a, b]) {
      expect(Math.abs(p[0] - p[1])).toBeLessThan(1e-10);
      expect(Math.abs(p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - 1)).toBeLessThan(0.003);
    }
    project = upsertMath3DProjectAlgebraicLocusSample(project, section);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const saved = parseSampledAlgebraicLocusGeometryDocument(reopened.workspace.entries[0].checkpoint, reopened).sample;
    expect(saved.scene.source.target.contentHash).toBe(ideal.contentHash);
    expect(saved.scene.source.equations).toEqual(ideal.definition.kind === "ideal" ? ideal.definition.generators : []);
    expect(saved).toEqual(section);
    const checkpoint = reopened.workspace.entries[0].checkpoint;
    const displayed = resolveProjectCompositionMember(reopened, { documentId: checkpoint.identity.id,
      expected: checkpoint.identity, visible: true, color: "#3976d7", opacity: 1 }, () => null);
    expect(displayed.lines[0].lines.length).toBe(section.segments.length);
    const tampered = { ...section, segments: [[[0, 0, 0], [1, 0, 0]]] };
    expect(() => parseSageAlgebraicLocusSample(tampered, reopened)).toThrow();
  });

  it("rejects unsupported higher-codimension systems instead of showing a false locus", () => {
    let { project, ring, make, ref } = setup(["x", "y", "z"]);
    const ideal = make("J", { kind: "ideal", ambientRing: ref(ring), generators: ["x^2+y^2-1", "z^2-1"] });
    project = upsertMath3DProjectAlgebraObject(project, ideal);
    const scene = buildSageAlgebraicLocusScene(project, ref(ideal), settings(3));
    expect(() => sampleSageAlgebraicLocus(scene)).toThrow(/linear plane/);
  });
});
