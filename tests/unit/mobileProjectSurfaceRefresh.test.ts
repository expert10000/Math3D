import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, canonicalJsonStringify, serializeMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import { mobileSurfaceProjectFixture } from "../fixtures/unified-projects/mobileSurfaces";
import { MobileProjectGraphSessions } from "../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { mobileProjectRefreshOptions, refreshMobileProjectDependency } from "../../apps/mobile/src/models/mobileProjectRefresh";
import { mobileGraphAuthoringAction, mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { commitMobileCurveSource } from "../../apps/mobile/src/models/mobileProjectCurve";
import { refreshProjectDependency } from "../../renderer/src/projects/projectDependencyRefresh";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
const changed = () => {
  const fixture = mobileSurfaceProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "surface.json"), sessions = new MobileProjectGraphSessions(stored);
  const adapter = sessions.adapter(fixture.graphIds[1]!), graph = adapter.document(), objectId = graph.source.objects[0]!.id;
  adapter.commitScene(applyGraph2DAuthoring(graph, mobileGraphAuthoringAction({ objectId, draft: { ...mobileGraphFunctionDraft(graph, objectId), expression: "x*x+4" } })), "edit");
  const curve = sessions.curve(fixture.helixId), source = curve.document().source;
  commitMobileCurveSource(curve, { ...source, definition: { ...source.definition, expressions: { ...source.definition.expressions, z: "t/2" } } });
  return { fixture, stored, record: sessions.snapshot(fixture.helixId) };
};
describe("PRJ29 bounded mobile Surface refreshed copies", () => {
  it.each([0, 1, 2, 3])("matches desktop fork and lineage for adapter %i and preserves all historical records", index => {
    const { fixture, record } = changed(), id = [...fixture.graphSurfaceRelationIds, ...fixture.curveSurfaceRelationIds][index]!;
    const before = readMobilePreviewProject(record);
    expect(mobileProjectRefreshOptions(record).find(option => option.relationId === id)).toMatchObject({ kind: "Surface", canRefresh: true });
    const saved = refreshMobileProjectDependency(record, id), after = readMobilePreviewProject(saved);
    expect(after).toEqual(refreshProjectDependency(before, id));
    expect(after.workspace.entries.slice(0, -1)).toEqual(before.workspace.entries); expect(after.workspace.results).toEqual(before.workspace.results);
    expect(after.workspace.artifacts).toEqual(before.workspace.artifacts); expect(after.workspace.constructions).toEqual(before.workspace.constructions);
    expect(saved.projectResources).toEqual(record.projectResources);
    expect(() => refreshMobileProjectDependency(saved, id)).toThrow("already exists");
    const targetId = after.workspace.entries.at(-1)!.expected.id;
    expect(buildMobileProjectExplorer(saved.serializedProject, saved.projectResources).groups.find(group => group.module === "surface")!.documents.find(document => document.id === targetId)!.editing).toBe("Saved preview");
  });
  it("rejects unchanged, archived and unsupported Curve recipes without altering saved work", () => {
    const { fixture, stored, record } = changed(), id = fixture.curveSurfaceRelationIds[0]!;
    expect(() => refreshMobileProjectDependency(stored, id)).toThrow("not changed");
    const project = readMobilePreviewProject(record);
    const archived = updateMath3DProjectMetadata(project, { ...project.metadata, documents: { ...project.metadata.documents, [fixture.helixId]: { archived: true } } });
    const { activeCurveDocumentId: _active, ...inactive } = record;
    expect(() => refreshMobileProjectDependency({ ...inactive, serializedProject: serializeMath3DProject(archived) }, id)).toThrow("Archived");
    const sessions = new MobileProjectGraphSessions(record), adapter = sessions.curve(fixture.helixId);
    adapter.commitSource({ ...adapter.document().source, representation: "polyline", definition: { familyId: "polyline", points: [[0,0,0], [1,1,1]], pointCount: 2 } });
    const unsupported = sessions.snapshot(fixture.graphIds[1]!);
    expect(() => refreshMobileProjectDependency(unsupported, id)).toThrow("literal parametric");
    const bytes = canonicalJsonStringify(unsupported); expect(() => refreshMobileProjectDependency(unsupported, "missing")).toThrow("qualified");
    expect(canonicalJsonStringify(unsupported)).toBe(bytes);
  });
});
