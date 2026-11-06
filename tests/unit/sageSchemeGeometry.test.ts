import { describe, expect, it } from "vitest";
import { affineSchemeRealLocusTarget, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  parseMath3DProject, schemeChartFacts, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-g08", title: "Exact scheme presentations" });
  const add = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) => {
    const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
    project = upsertMath3DProjectAlgebraObject(project, record);
    return record;
  };
  const q = add("Q", { kind: "rational-field" });
  const affineRing = add("A", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
    variables: ["x"], monomialOrder: "degrevlex" });
  const affineIdeal = add("N", { kind: "ideal", ambientRing: { objectId: affineRing.id, revision: 1 },
    generators: ["x^2"] });
  const affine = add("SpecA", { kind: "affine-scheme", ambientRing: { objectId: affineRing.id, revision: 1 },
    ideal: { objectId: affineIdeal.id, revision: 1 } });
  const homogeneousRing = add("S", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
    variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
  const homogeneousIdeal = add("J", { kind: "ideal", ambientRing: { objectId: homogeneousRing.id, revision: 1 },
    generators: ["x^2+y^2-z^2"] });
  const projective = add("Conic", { kind: "projective-scheme",
    ambientRing: { objectId: homogeneousRing.id, revision: 1 },
    ideal: { objectId: homogeneousIdeal.id, revision: 1 } });
  const chart = add("Uz", { kind: "scheme-chart", projectiveScheme: { objectId: projective.id, revision: 1 },
    nonzeroCoordinate: "z" });
  const map = add("j", { kind: "scheme-map", mapKind: "chart-inclusion",
    sourceChart: { objectId: chart.id, revision: 1 },
    targetProjective: { objectId: projective.id, revision: 1 } });
  return { project, q, affineRing, affineIdeal, affine, homogeneousRing, homogeneousIdeal, projective, chart, map };
};

describe("SAGE-G08 typed schemes, charts and maps", () => {
  it("retains a nonreduced affine scheme and canonical conic chart after independent Project import", () => {
    const { project, affine, affineIdeal, projective, chart, map } = setup();
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.algebraObjects).toHaveLength(9);
    expect(reopened.algebraObjects).toEqual(project.algebraObjects);
    expect(reopened.algebraObjects?.find((entry) => entry.id === affine.id)?.revisions[0]).toEqual(affine);
    expect(reopened.algebraObjects?.find((entry) => entry.id === map.id)?.revisions[0]).toEqual(map);
    expect(affineSchemeRealLocusTarget(reopened, { objectId: affine.id, revision: 1 }))
      .toEqual({ objectId: affineIdeal.id, revision: 1 });
    expect(schemeChartFacts(reopened.algebraObjects!, { objectId: chart.id, revision: 1 })).toEqual({
      projective: { objectId: projective.id, revision: 1 }, nonzeroCoordinate: "z",
      affineCoordinates: ["x", "y"], equations: ["x^2+y^2-1"],
      homogeneousImages: ["x", "y", "1"], inclusion: "canonical-open-immersion" });
    expect(affineIdeal.definition).toMatchObject({ generators: ["x^2"] });
  });

  it("rejects nonhomogeneous projective ideals, false chart coordinates and mismatched maps", () => {
    const { project, homogeneousRing, affineRing, homogeneousIdeal, projective, chart, affine } = setup();
    const add = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
      upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
        id: createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition }));
    const badIdeal = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "badI"),
      revision: 1, label: "badI", definition: { kind: "ideal",
        ambientRing: { objectId: homogeneousRing.id, revision: 1 }, generators: ["x+1"] } });
    const withBadIdeal = upsertMath3DProjectAlgebraObject(project, badIdeal);
    expect(() => upsertMath3DProjectAlgebraObject(withBadIdeal, createAlgebraObjectRecord({
      id: createProjectAlgebraObjectId(project.identity.id, "badP"), revision: 1, label: "badP",
      definition: { kind: "projective-scheme", ambientRing: { objectId: homogeneousRing.id, revision: 1 },
        ideal: { objectId: badIdeal.id, revision: 1 } } }))).toThrow(/homogeneous/);
    expect(() => add("badChart", { kind: "scheme-chart",
      projectiveScheme: { objectId: projective.id, revision: 1 }, nonzeroCoordinate: "w" }))
      .toThrow(/Chart coordinate/);
    expect(() => add("badAmbient", { kind: "affine-scheme",
      ambientRing: { objectId: affineRing.id, revision: 1 },
      ideal: { objectId: homogeneousIdeal.id, revision: 1 } })).toThrow(/pinned ideal/);
    expect(() => add("badMap", { kind: "scheme-map", mapKind: "chart-inclusion",
      sourceChart: { objectId: chart.id, revision: 1 },
      targetProjective: { objectId: affine.id, revision: 1 } })).toThrow(/Chart inclusion/);
  });

  it("marks scheme, chart and map stale when a pinned ring definition advances", () => {
    let { project, q, homogeneousRing, projective, chart, map } = setup();
    project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: homogeneousRing.id, revision: 2, label: homogeneousRing.label,
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
        variables: ["x", "y", "z", "w"], monomialOrder: "degrevlex" } }));
    const statuses = inspectProjectAlgebraFreshness(project);
    for (const item of [projective, chart, map])
      expect(statuses.find((status) => status.objectId === item.id)?.status).toBe("stale");
  });
});
