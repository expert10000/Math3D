import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, buildSageFiniteGroupScene,
  canonicalJsonStringify, createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, FINITE_GROUP_PRESETS,
  parseMath3DProject, parseSageFiniteGroupScene, sageFiniteGroupSceneToSvg,
  sageGroupSceneAvailability, serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";
import result from "../fixtures/sage-group-d4-sage95.json";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-e03", title: "Group diagrams" });
  const group = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "D4"),
    revision: 1, label: "D4", definition: FINITE_GROUP_PRESETS.find((item) => item.id === "D4")!.definition });
  project = upsertMath3DProjectAlgebraObject(project, group);
  const request = buildAlgebraOperationRequest(project, { objectId: group.id, revision: 1 }, "sage.group.dossier", "docker", {});
  const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
    { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-e03-d4",
      elapsedMs: 1, warnings: [] });
  return { project: addMath3DProjectAlgebraEvidence(project, evidence), group, evidence };
};

describe("SAGE-E03 finite-group scenes", () => {
  it("lays out exact D4 Cayley arrows and complete subgroup cover edges", () => {
    const { project, evidence } = setup();
    const cayley = buildSageFiniteGroupScene(project, evidence, "cayley");
    expect(cayley.nodes).toHaveLength(8);
    expect(cayley.edges).toHaveLength(16);
    expect(cayley.edges.filter((edge) => edge.from === "g0")).toEqual([
      { from: "g0", to: "g3", generatorIndex: 0 }, { from: "g0", to: "g1", generatorIndex: 1 }]);
    expect(new Set(cayley.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(8);
    const subgroup = buildSageFiniteGroupScene(project, evidence, "subgroup");
    expect(subgroup.nodes).toHaveLength(10);
    expect(subgroup.nodes.find((node) => node.id === "H0")?.order).toBe(1);
    expect(subgroup.nodes.find((node) => node.id === "H9")?.order).toBe(8);
    expect(subgroup.edges).toHaveLength(15);
    expect(subgroup.edges.every((edge) => {
      const lower = subgroup.nodes.find((node) => node.id === edge.from)!;
      const upper = subgroup.nodes.find((node) => node.id === edge.to)!;
      return lower.order < upper.order && lower.members.every((member) => upper.members.includes(member));
    })).toBe(true);
  });

  it("exports self-contained JSON and SVG with pinned diagram provenance after Project reopen", () => {
    const { project, group, evidence } = setup();
    const saved = parseMath3DProject(serializeMath3DProject(project));
    const reopenedEvidence = saved.algebraEvidence![0];
    const scene = buildSageFiniteGroupScene(saved, reopenedEvidence, "subgroup");
    const independent = parseSageFiniteGroupScene(JSON.parse(canonicalJsonStringify(scene)));
    expect(independent).toEqual(scene);
    expect(scene.source.targetHash).toBe(group.contentHash);
    expect(scene.source.resultHash).toBe(evidence.resultHash);
    const svg = sageFiniteGroupSceneToSvg(scene);
    expect(svg).toContain("Subgroup inclusion graph");
    expect(svg).toContain(group.contentHash);
    expect(svg).toContain(evidence.id);
    expect(svg).toContain("Sage 9.5 / GAP 4.11.1");
    expect(svg).toContain("math3d-scene");
  });

  it("rejects changed nodes, topology and provenance and caps dense subgroup scenes", () => {
    const { project, evidence } = setup();
    const scene = buildSageFiniteGroupScene(project, evidence, "subgroup");
    expect(() => parseSageFiniteGroupScene({ ...scene, nodes: [{ ...scene.nodes[0], x: 999 }, ...scene.nodes.slice(1)] }))
      .toThrow(/layout or topology/);
    expect(() => parseSageFiniteGroupScene({ ...scene, edges: scene.edges.slice(1) }))
      .toThrow(/layout or topology/);
    expect(() => parseSageFiniteGroupScene({ ...scene, source: { ...scene.source, targetHash: "sha256:bad" } }))
      .toThrow(/provenance/);
    const dense = { ...result, subgroups: Array.from({ length: 67 }, () => result.subgroups[0]) };
    expect(sageGroupSceneAvailability(dense, "subgroup")).toContain("67");
    expect(sageGroupSceneAvailability(dense, "cayley")).toBeNull();
  });
});
