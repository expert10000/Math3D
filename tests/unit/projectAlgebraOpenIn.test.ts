import { describe, expect, it } from "vitest";
import { buildSageAlgebraicLocusScene, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseMath3DProject,
  projectAlgebraOpenInActions, resolveProjectAlgebraOpenIn, sampleSageAlgebraicLocus,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject,
  upsertMath3DProjectAlgebraicLocusSample, upsertMath3DProjectAlgebraicLocusScene } from "@math3d/core";

const fixture = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "open-in-algebra", title: "Algebra locus" });
  const make = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
  const qq = make("QQ", { kind: "rational-field" });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = make("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
    variables: ["x", "y"], monomialOrder: "degrevlex" });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  const target = { objectId: ring.id, revision: 1 };
  const scene = buildSageAlgebraicLocusScene(project, target, { polynomial: "x^2+y^2-1",
    bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }], tolerance: 0.001, maxSamples: 8000 });
  return { project, target, scene };
};

describe("Project Algebra Open in Geometry", () => {
  it("separates exact contract and bounded sample actions through save and reopen", () => {
    const { project, target, scene } = fixture();
    expect(projectAlgebraOpenInActions(project, target, null, null)).toMatchObject([
      { enabled: false, disabledReason: expect.stringContaining("Validate") },
      { enabled: false, disabledReason: expect.stringContaining("Validate") }]);
    const exact = projectAlgebraOpenInActions(project, target, scene, null);
    expect(exact.map(action => action.enabled)).toEqual([true, false]);
    expect(exact[1]?.disabledReason).toContain("Render");
    const checkedScene = resolveProjectAlgebraOpenIn(project, target, scene, null, exact[0]!);
    if (checkedScene.format !== "math3d.sage-algebraic-locus-scene") throw new Error("Expected exact scene.");
    const withContract = upsertMath3DProjectAlgebraicLocusScene(project, checkedScene);
    expect(parseMath3DProject(serializeMath3DProject(withContract)).workspace.entries)
      .toContainEqual(expect.objectContaining({ module: "geometry" }));
    const sample = sampleSageAlgebraicLocus(scene);
    const actions = projectAlgebraOpenInActions(project, target, scene, sample);
    expect(actions.map(action => action.enabled)).toEqual([true, true]);
    const checkedSample = resolveProjectAlgebraOpenIn(project, target, scene, sample, actions[1]!);
    if (checkedSample.format !== "math3d.sage-algebraic-locus-sample") throw new Error("Expected bounded sample.");
    const withSample = upsertMath3DProjectAlgebraicLocusSample(withContract, checkedSample);
    const reopened = parseMath3DProject(serializeMath3DProject(withSample));
    expect(reopened.workspace.entries.find(item => item.module === "geometry")?.checkpoint.source)
      .toBeTruthy();
  });

  it("refuses forged source and mismatched prepared sample without Project mutation", () => {
    const { project, target, scene } = fixture();
    const sample = sampleSageAlgebraicLocus(scene);
    const before = serializeMath3DProject(project);
    const action = projectAlgebraOpenInActions(project, target, scene, sample)[1]!;
    expect(() => resolveProjectAlgebraOpenIn(project, target, scene, sample,
      { ...action, source: { ...action.source, contentHash: "sha256:" + "0".repeat(64) } }))
      .toThrow(/no longer qualified/);
    expect(() => resolveProjectAlgebraOpenIn(project, target, scene, null, action))
      .toThrow(/no longer qualified/);
    expect(serializeMath3DProject(project)).toBe(before);
  });

  it("disables an older algebra revision and a sample from another bounded scene", () => {
    const { project, target, scene } = fixture();
    const otherScene = buildSageAlgebraicLocusScene(project, target, {
      polynomial: "x^2+y^2-1", bounds: [{ min: -1, max: 1 }, { min: -1, max: 1 }],
      tolerance: 0.001, maxSamples: 8000 });
    const otherSample = sampleSageAlgebraicLocus(otherScene);
    const actions = projectAlgebraOpenInActions(project, target, scene, otherSample);
    expect(actions[0]?.enabled).toBe(true);
    expect(actions[1]).toMatchObject({ enabled: false,
      disabledReason: "The sample does not match the prepared exact locus." });
    expect(() => resolveProjectAlgebraOpenIn(project, target, scene, otherSample, actions[1]!))
      .toThrow(/no longer qualified/);

    const revised = createAlgebraObjectRecord({ id: target.objectId, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: {
        objectId: project.algebraObjects![0]!.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "lex" } });
    const changed = upsertMath3DProjectAlgebraObject(project, revised);
    const stale = projectAlgebraOpenInActions(changed, target, scene, null);
    expect(stale.map(action => action.enabled)).toEqual([false, false]);
    expect(stale[0]?.disabledReason).toContain("current unarchived algebra object revision");
    expect(() => resolveProjectAlgebraOpenIn(changed, target, scene, null,
      projectAlgebraOpenInActions(project, target, scene, null)[0]!))
      .toThrow(/no longer qualified/);
  });
});
