import { describe, expect, it } from "vitest";
import corpus from "../../../tests/fixtures/post-1.6.0/mathematical-regressions.json";
import { analyzeCanonicalTopologyObject, createTopologyObjectFromCWComplex } from "./core";

describe("post-1.6.0 independent topology oracles", () => {
  it.each(corpus.topology)("checks $id over integers and F2", (fixture) => {
    const source = {
      id: fixture.id, name: fixture.id,
      vertices: fixture.vertices.map((id) => ({ id })),
      edges: fixture.loops.map((id) => ({ id, endpoints: ["v", "v"] as [string, string] })),
      faces: fixture.degree === null ? [] : [{ id: "f", attachment: Array.from({ length: fixture.degree }, () => ({ edgeId: "a", direction: 1 as const })) }],
    };
    const result = analyzeCanonicalTopologyObject(createTopologyObjectFromCWComplex(source));
    const repeated = analyzeCanonicalTopologyObject(createTopologyObjectFromCWComplex(source));
    expect(result.topologyObject.provenance.canonicalization.hash).toBe(repeated.topologyObject.provenance.canonicalization.hash);
    expect(result.cellularBoundaryOperators.value?.chainCondition.holds).toBe(true);
    expect(result.homology.status).toBe(fixture.status);
    expect(result.homology.value?.integer.groups.map((group) => group.notation)).toEqual(fixture.integerGroups);
    expect(result.homology.value?.mod2.groups.map((group) => group.dimension)).toEqual(fixture.mod2Dimensions);
    expect(result.algebraicConsistency.value?.holds).toBe(true);
    expect(result.surfaceClassification.value?.eligible).toBe(false);
  });
});
