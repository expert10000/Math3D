import { describe, expect, it } from "vitest";
import { algebraicLocusGeometryDocument, buildSageAlgebraicLocusScene, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  parseAlgebraicLocusGeometryDocument, parseMath3DProject, parseSageAlgebraicLocusScene,
  sageAlgebraicLocusSceneStatus, serializeMath3DProject, upsertMath3DProjectAlgebraicLocusScene,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-f01", title: "Algebraic locus contract" });
  const make = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
  const ref = (record: ReturnType<typeof make>) => ({ objectId: record.id, revision: record.revision });
  const qq = make("QQ", { kind: "rational-field" });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = make("R", { kind: "polynomial-ring", coefficientDomain: ref(qq),
    variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const ideal = make("I", { kind: "ideal", ambientRing: ref(ring),
    generators: ["x^2+y^2+z^2-1", "x-y"] });
  project = upsertMath3DProjectAlgebraObject(project, ideal);
  return { project, qq, ring, ideal, ref };
};
const settings = { bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }, { min: -2, max: 2 }],
  tolerance: 0.001, maxSamples: 50000 };

describe("SAGE-F01 algebraic-locus scene contract", () => {
  it("retains an exact ideal source through scene JSON, Geometry and independent Project reopen", () => {
    let { project, ideal, ref } = setup();
    const scene = buildSageAlgebraicLocusScene(project, ref(ideal), settings);
    expect(scene.source.equations).toEqual(["x^2+y^2+z^2-1", "x-y"]);
    expect(scene.source.target.contentHash).toBe(ideal.contentHash);
    expect(scene.domain.bounds.map((item) => item.axis)).toEqual(["x", "y", "z"]);
    expect(scene.rendering).toEqual({ status: "uncomputed", algorithm: null,
      completeness: "unknown", singularityWarnings: [] });
    expect(parseSageAlgebraicLocusScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
    const geometry = algebraicLocusGeometryDocument(scene);
    expect(parseAlgebraicLocusGeometryDocument(JSON.parse(JSON.stringify(geometry)), project).scene).toEqual(scene);
    project = upsertMath3DProjectAlgebraicLocusScene(project, scene);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const checkpoint = reopened.workspace.entries[0].checkpoint;
    expect(parseAlgebraicLocusGeometryDocument(checkpoint, reopened).scene).toEqual(scene);
    expect(sageAlgebraicLocusSceneStatus(scene, reopened)).toBe("current");
  });

  it("pins one polynomial equation to its exact QQ ring without claiming a computed plot", () => {
    const { project, ring, ref } = setup();
    const scene = buildSageAlgebraicLocusScene(project, ref(ring), { ...settings,
      polynomial: "x^2+y^2+z^2-1" });
    expect(scene.source.target.id).toBe(ring.id);
    expect(scene.source.equations).toEqual(["x^2+y^2+z^2-1"]);
    expect(scene.rendering.status).toBe("uncomputed");
  });

  it("rejects tampering, invalid bounds, wrong variables and an advanced parent revision", () => {
    let { project, ring, ideal, qq, ref } = setup();
    const scene = buildSageAlgebraicLocusScene(project, ref(ideal), settings);
    expect(() => parseSageAlgebraicLocusScene({ ...scene, source: { ...scene.source,
      equations: ["x-y", "x^2+y^2+z^2-1"] } })).toThrow();
    expect(() => parseSageAlgebraicLocusScene({ ...scene, domain: { ...scene.domain,
      bounds: scene.domain.bounds.map((item, index) => index === 0 ? { ...item, max: -2 } : item) } })).toThrow();
    expect(() => parseSageAlgebraicLocusScene({ ...scene, rendering: { ...scene.rendering,
      status: "complete" } })).toThrow();
    expect(() => buildSageAlgebraicLocusScene(project, ref(ring), { ...settings,
      polynomial: "w^2-1" })).toThrow(/outside the ambient ring/);
    expect(() => buildSageAlgebraicLocusScene(project, ref(ideal), { ...settings,
      bounds: settings.bounds.slice(0, 2) })).toThrow();
    const revisedRing = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: ref(qq),
        variables: ["x", "y", "z"], monomialOrder: "lex" } });
    project = upsertMath3DProjectAlgebraObject(project, revisedRing);
    expect(sageAlgebraicLocusSceneStatus(scene, project)).toBe("stale");
    expect(parseSageAlgebraicLocusScene(scene, project)).toEqual(scene);
    expect(() => buildSageAlgebraicLocusScene(project, ref(ideal), settings)).toThrow(/fresh/);
  });
});
