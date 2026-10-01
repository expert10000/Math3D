import { describe, expect, it } from "vitest";
import { analyzeGraph2DDerivative, createDocumentRelation, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  createMixedWorkspaceDocument, duplicateProjectDocument, getGraph2DPresetCatalog, instantiateGraph2DPreset, promoteGraph2DToCurve,
  structuralHash, viewerSourceFromDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { inspectProjectDependencies } from "./projectDependencies";

const fixture = () => {
  const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "dependencies").document;
  const curve = promoteGraph2DToCurve(graph, graph.source.objects[0]!.id);
  const result = analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0]!.id, x: 1, order: 1 }).publication;
  const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph), entries: [...createGraph2DWorkspaceProject(graph).entries,
    { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }], relations: [curve.relation], results: [result] });
  return { graph, curve, result, project: createMath3DProject(workspace, { stableKey: "dependencies" }) };
};
describe("PRJ05 project dependency inspection", () => {
  it("marks edited-source descendants stale while qualifying independent snapshots and leaving unrelated documents current", () => {
    const { graph, curve, project } = fixture(), copied = duplicateProjectDocument(project, curve.document.identity.id, "snapshot", verifyMixedWorkspaceReplay(project.workspace));
    const unrelated = createEmptyGraph2DDocument("unrelated"), adapter = new Graph2DCommandAdapter(graph);
    const edited = adapter.commitScene({ source: { ...graph.source, objects: [] }, display: { ...graph.display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    const workspace = createMixedWorkspaceDocument({ ...copied.workspace, entries: [
      ...copied.workspace.entries.map((entry) => entry.expected.id === edited.identity.id ? { ...entry, checkpoint: edited, expected: edited.identity } : entry),
      { module: "graph2d", checkpoint: unrelated, expected: unrelated.identity, replay: null }] });
    const current = createMath3DProject(workspace, { stableKey: "edited" }), bytes = JSON.stringify(current), inspection = inspectProjectDependencies(current);
    expect(inspection.documents.find((document) => document.id === curve.document.identity.id)!.freshness).toBe("stale");
    expect(inspection.documents.find((document) => document.id === copied.workspace.entries.at(-1)!.expected.id)).toMatchObject({ freshness: "stale", snapshot: true });
    expect(inspection.documents.find((document) => document.id === unrelated.identity.id)!.freshness).toBe("current");
    expect(inspection.results[0]).toMatchObject({ authority: project.workspace.results[0]!.status, freshness: "stale" });
    expect(JSON.stringify(current)).toBe(bytes);
  });
  it("never shows unresolved source, document, result or artifact links as current", () => {
    const { graph, project } = fixture(), missing = createEmptyGraph2DDocument("missing"), source = viewerSourceFromDocument(graph);
    const relations = [
      createDocumentRelation({ kind: "derived-from", sources: [viewerSourceFromDocument(missing)], sourceOrder: "ordered", target: { type: "document", generation: source }, operation: "test.missing-source", parameters: {} }),
      createDocumentRelation({ kind: "derived-from", sources: [source], sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(createEmptyGraph2DDocument("missing-target")) }, operation: "test.missing-target", parameters: {} }),
      createDocumentRelation({ kind: "analysis-of", sources: [source], sourceOrder: "ordered", target: { type: "result", resultId: "missing-result", resultType: "test.result" }, operation: "test.missing-result", parameters: {} }),
      createDocumentRelation({ kind: "generated-by", sources: [source], sourceOrder: "ordered", target: { type: "artifact", artifactId: "missing-artifact", artifactKind: "binary", role: "test" }, operation: "test.missing-artifact", parameters: {} }),
    ];
    const inspection = inspectProjectDependencies(createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, relations }), { stableKey: "missing" }));
    expect(inspection.relations.map((relation) => relation.freshness)).toEqual(["unavailable", "unavailable", "unavailable", "unavailable"]);
  });
  it("keeps mathematical authority separate from checksum-backed artifact availability", () => {
    const { project, result } = fixture(), handle = { artifactId: "external-result", kind: "table" as const, role: "samples" }, checksum = structuralHash("samples");
    const workspace = createMixedWorkspaceDocument({ ...project.workspace, results: [{ ...result, artifacts: [handle] }], artifacts: [{ handle, contentHash: checksum, byteLength: 100 }] });
    const current = createMath3DProject(workspace, { stableKey: "artifacts" });
    expect(inspectProjectDependencies(current).results[0]).toMatchObject({ authority: result.status, freshness: "unavailable", missingArtifactIds: [handle.artifactId] });
    expect(inspectProjectDependencies(current, (id, hash) => id === handle.artifactId && hash === checksum).results[0]!.freshness).toBe("current");
    expect(inspectProjectDependencies(current, () => { throw new Error("Store unavailable"); }).results[0]!.freshness).toBe("unavailable");
    const unverified = createMath3DProject(createMixedWorkspaceDocument({ ...workspace, artifacts: [{ handle, contentHash: null, byteLength: 100 }] }), { stableKey: "no-checksum" });
    expect(inspectProjectDependencies(unverified, () => true).artifacts[0]!.available).toBe(false);
  });
});
