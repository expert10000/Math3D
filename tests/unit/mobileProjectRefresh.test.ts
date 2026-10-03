import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, canonicalJsonStringify, serializeMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { MobileProjectGraphSessions } from "../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { mobileProjectRefreshOptions, refreshMobileProjectCurve } from "../../apps/mobile/src/models/mobileProjectRefresh";
import { mobileGraphAuthoringAction, mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { projectDependencyRefreshOptions, refreshProjectDependency } from "../../renderer/src/projects/projectDependencyRefresh";

const changedProject = () => {
  const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json");
  const sessions = new MobileProjectGraphSessions(stored), id = fixture.graphIds[1]!, adapter = sessions.adapter(id), graph = adapter.document();
  const objectId = graph.source.objects[0]!.id;
  const action = mobileGraphAuthoringAction({ objectId, draft: { ...mobileGraphFunctionDraft(graph, objectId), expression: "x*x+4" } });
  adapter.commitScene(applyGraph2DAuthoring(graph, action), "edit");
  return { fixture, stored, sessions, changed: sessions.snapshot(id) };
};
describe("PRJ26 explicit mobile Graph-to-Curve refreshed copies", () => {
  it("uses the desktop generation/fork semantics, retains historical records and rejects duplicate copies", () => {
    const { fixture, changed } = changedProject(), before = readMobilePreviewProject(changed);
    const option = mobileProjectRefreshOptions(changed).find(item => item.canRefresh)!;
    expect(option).toBeDefined();
    const result = refreshMobileProjectCurve(changed, option.relationId, 40), after = readMobilePreviewProject(result);
    expect(after.workspace.entries.slice(0, -1)).toEqual(before.workspace.entries);
    expect(after.workspace.results).toEqual(before.workspace.results); expect(after.workspace.artifacts).toEqual(before.workspace.artifacts);
    expect(after.workspace.constructions).toEqual(before.workspace.constructions); expect(result.projectResources).toEqual(changed.projectResources);
    expect(after.workspace.relations.slice(0, -1)).toEqual(before.workspace.relations);
    const next = after.workspace.entries.at(-1)!;
    expect(next.checkpoint.format).toBe("math3d.curve-document");
    if (next.checkpoint.format === "math3d.curve-document") expect(next.checkpoint.source.definition.expressions!.y).toBe("x*x+4");
    expect(projectDependencyRefreshOptions(before).find(item => item.relationId === option.relationId)?.canRefresh).toBe(true);
    expect(after).toEqual(refreshProjectDependency(before, option.relationId));
    expect(() => refreshMobileProjectCurve(result, option.relationId)).toThrow("already exists");
    expect(mobileProjectRefreshOptions(result).find(item => item.relationId === option.relationId)?.canRefresh).toBe(false);
    expect(new MobileProjectGraphSessions(result).curve(next.expected.id).document().identity).toEqual(next.expected);
    expect(after.workspace.results).toEqual(fixture.project.workspace.results);
  });
  it("blocks unchanged, archived and missing-resource sources without mutating stored work", () => {
    const { stored, changed } = changedProject(), project = readMobilePreviewProject(changed);
    const option = mobileProjectRefreshOptions(changed).find(item => item.canRefresh)!;
    expect(() => refreshMobileProjectCurve(stored, option.relationId)).toThrow("not changed");
    const relation = project.workspace.relations.find(item => item.relationId === option.relationId)!;
    const archived = updateMath3DProjectMetadata(project, { ...project.metadata, documents: { ...project.metadata.documents, [relation.sources[0]!.documentId]: { archived: true } } });
    const { activeGraphDocumentId: _active, ...record } = changed;
    expect(() => refreshMobileProjectCurve({ ...record, serializedProject: serializeMath3DProject(archived) }, option.relationId)).toThrow("Archived");
    expect(() => refreshMobileProjectCurve(changed, "missing-relation")).toThrow("qualified");
    const before = canonicalJsonStringify(changed);
    expect(() => refreshMobileProjectCurve(changed, "missing")).toThrow(); expect(canonicalJsonStringify(changed)).toBe(before);
  });
});
