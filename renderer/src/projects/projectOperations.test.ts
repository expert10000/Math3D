import { describe, expect, it } from "vitest";
import { analyzeGraph2DDerivative, buildProjectExplorer, createGraph2DWorkspaceProject, createMath3DProject, createMixedWorkspaceDocument,
  deleteProjectDocument, duplicateProjectDocument, getGraph2DPresetCatalog, instantiateGraph2DPreset, inspectProjectDocumentDelete,
  normalizeMath3DProject, parseMath3DProject, promoteGraph2DToCurve, serializeMath3DProject, setProjectDocumentMetadata } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { ProjectCommandAdapter } from "./projectCommandAdapter";
import { CurveDocumentAdapter } from "../curveAnalysis/curveDocumentAdapter";

const fixture = () => {
  const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "project-ops").document;
  const curve = promoteGraph2DToCurve(graph, graph.source.objects[0]!.id), result = analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0]!.id, x: 1, order: 1 }).publication;
  const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph), entries: [
    ...createGraph2DWorkspaceProject(graph).entries, { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }],
    results: [result], relations: [curve.relation] });
  return { graph, curve, result, project: createMath3DProject(workspace, { stableKey: "operations" }) };
};
describe("PRJ04 saved project operations through the shared kernel", () => {
  it("renames and archives across modules without changing mathematical identities", () => {
    const { project, curve } = fixture();
    const next = setProjectDocumentMetadata(setProjectDocumentMetadata(project, curve.document.identity.id, { title: "Named profile" }), curve.document.identity.id, { archived: true });
    expect(next.identity).toEqual(project.identity); expect(next.workspace).toEqual(project.workspace);
    expect(buildProjectExplorer(parseMath3DProject(serializeMath3DProject(next))).groups.find((group) => group.module === "curve")!.documents[0]).toMatchObject({ title: "Named profile", archived: true });
    expect(normalizeMath3DProject({ ...project, metadata: { ...project.metadata, documents: { unknown: { title: "Invalid" } } } }).ok).toBe(false);
  });
  it("forks verified sources, preserving parent lineage and leaving results on the original source", () => {
    const { project, graph, curve } = fixture(), before = serializeMath3DProject(project);
    const copied = duplicateProjectDocument(project, curve.document.identity.id, "copy", verifyMixedWorkspaceReplay(project.workspace));
    const next = copied.workspace.entries.at(-1)!;
    expect(next.expected.id).not.toBe(curve.document.identity.id); expect(next.expected.structuralHash).toBe(curve.document.identity.structuralHash);
    expect(next.replay).toBeNull(); expect(copied.workspace.results).toEqual(project.workspace.results);
    expect(copied.workspace.relations.filter((relation) => relation.target.type === "document" && relation.target.generation.documentId === next.expected.id).map((relation) => relation.sources[0]!.documentId).sort())
      .toEqual([graph.identity.id, curve.document.identity.id].sort());
    expect(() => duplicateProjectDocument(copied, curve.document.identity.id, "copy", verifyMixedWorkspaceReplay(copied.workspace))).toThrow("already exists");
    expect(serializeMath3DProject(project)).toBe(before);
  });
  it("duplicates the resolved current replay source rather than an old checkpoint", () => {
    const { project, curve } = fixture(), adapter = new CurveDocumentAdapter(curve.document);
    adapter.commitSource({ ...curve.document.source, definition: { ...curve.document.source.definition, familyId: "Edited profile" } });
    const replay = adapter.replayBundle(), workspace = createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map((entry) => entry.module === "curve" ?
      { ...entry, checkpoint: replay.checkpoint, expected: adapter.document().identity, replay: { format: "math3d.curve-replay.v1", payload: replay as never } } : entry) });
    const current = createMath3DProject(workspace, { stableKey: "replay-copy" }), duplicate = duplicateProjectDocument(current, curve.document.identity.id, "replay", verifyMixedWorkspaceReplay(workspace));
    expect(duplicate.workspace.entries.at(-1)!.checkpoint).toMatchObject({ source: adapter.document().source });
    expect(duplicate.workspace.entries.at(-1)!.expected.structuralHash).toBe(adapter.document().identity.structuralHash);
  });
  it("previews transitive dependencies, blocks their deletion, and restores exact snapshots with undo/redo", () => {
    const { project, graph, curve } = fixture(), adapter = new ProjectCommandAdapter(project);
    const impact = inspectProjectDocumentDelete(project, graph.identity.id);
    expect(impact).toMatchObject({ canDelete: false, dependentDocumentIds: [curve.document.identity.id], ownedResultIds: [project.workspace.results[0]!.resultId] });
    expect(() => deleteProjectDocument(project, graph.identity.id)).toThrow("blocked");
    const deleted = adapter.commit(deleteProjectDocument(project, curve.document.identity.id));
    expect(deleted.workspace.entries).toHaveLength(1); expect(deleted.workspace.relations).toHaveLength(0);
    expect(parseMath3DProject(serializeMath3DProject(adapter.undo()))).toEqual(project);
    expect(parseMath3DProject(serializeMath3DProject(adapter.redo()))).toEqual(deleted);
    adapter.undo(); adapter.commit(setProjectDocumentMetadata(adapter.project(), graph.identity.id, { archived: true }));
    expect(adapter.history().redoDepth).toBe(0);
  });
  it("removes owned result records and committed selection only when no dependents remain", () => {
    const { project, graph, curve } = fixture(), isolated = deleteProjectDocument(project, curve.document.identity.id), deleted = deleteProjectDocument(isolated, graph.identity.id);
    expect(deleted.workspace.entries).toEqual([]); expect(deleted.workspace.results).toEqual([]); expect(deleted.workspace.activeDocumentIds).toEqual([]);
    expect(deleted.workspace.committedSelection).toBeNull(); expect(deleted.workspace.artifacts).toEqual(project.workspace.artifacts);
    expect(normalizeMath3DProject(deleted).ok).toBe(true);
  });
});
