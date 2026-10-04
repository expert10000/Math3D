import { parseProjectPackage } from "../../renderer/src/projects/projectResources";
import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createSurfaceDocument, createMixedWorkspaceDocument, replaceMath3DProjectWorkspace, serializeMath3DProject } from "@math3d/core";
import { SurfaceCommandAdapter } from "@math3d/kernel";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { MobileProjectGraphSessions } from "../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { commitMobileSurfaceSource, sampleMobileSurface, mobileSurfaceUnavailableReason } from "../../apps/mobile/src/models/mobileProjectSurface";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { selectMobileStartupProject } from "../../apps/mobile/src/models/mobileStartupProject";
import { verifyMixedWorkspaceReplay } from "../../renderer/src/kernel/mixedWorkspaceReplay";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";

export const literalSurface = () => createSurfaceDocument({ stableKey: "prj28-literal-saddle", metadata: { title: "Literal saddle" }, source: {
  representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1 }, v: { min: -1, max: 1 } },
  units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
  definition: { familyId: "literal-saddle", expressions: { x: "u", y: "v", z: "u*u-v*v" } } } });
const fixture = () => {
  const original = mobileMixedProjectFixture(), surface = literalSurface();
  const project = replaceMath3DProjectWorkspace(original.project, createMixedWorkspaceDocument({ ...original.project.workspace,
    entries: [...original.project.workspace.entries, { module: "surface", checkpoint: surface, expected: surface.identity, replay: null }] }));
  const stored = { ...importMobileProjectPreview(serializeMath3DProject(project), [], "saddle.json"), projectResources: original.resources.sidecars() };
  return { original, project, stored, surface };
};
describe("PRJ28 mobile Surface history in complete projects", () => {
  it("ignores an outgoing editor from another project while selecting the incoming Graph, Curve or Surface", () => {
    const { stored, surface, original } = fixture(), sessions = new MobileProjectGraphSessions(stored);
    const outgoing = "math3d:curve:outgoing-refreshed-target";
    expect(sessions.snapshotForOpenDocumentIds([undefined, outgoing, undefined])).toBeNull();
    expect(sessions.hasCurve(outgoing)).toBe(false);
    expect(sessions.hasSurface(outgoing)).toBe(false);
    const graph = sessions.snapshotForOpenDocumentIds([undefined, outgoing, original.graphIds[1]]);
    expect(graph?.activeGraphDocumentId).toBe(original.graphIds[1]);
    expect(graph?.activeCurveDocumentId).toBeUndefined();
    expect(sessions.snapshotForOpenDocumentIds([surface.identity.id, outgoing, undefined])?.activeSurfaceDocumentId).toBe(surface.identity.id);
    const curveId = buildMobileProjectExplorer(stored.serializedProject, stored.projectResources).groups.find(group => group.module === "curve")?.documents.find(document => document.editing === "Curve workspace")?.id;
    expect(curveId).toBeTruthy();
    expect(sessions.snapshotForOpenDocumentIds(["math3d:surface:outgoing", curveId || undefined])?.activeCurveDocumentId).toBe(curveId);
  });
  it("retains Surface redo, active selection, Graph history and every unrelated document/resource on desktop return", () => {
    const { project, stored, surface, original } = fixture(), sessions = new MobileProjectGraphSessions(stored);
    const adapter = sessions.surface(surface.identity.id), graph = sessions.adapter(original.graphIds[1]!);
    graph.commitViewport({ ...graph.document().display.viewport, xMin: -3 });
    commitMobileSurfaceSource(adapter, { ...surface.source, definition: { ...surface.source.definition, expressions: { x: "u", y: "v", z: "u*u-v*v+2" } } });
    adapter.undo();
    const saved = sessions.snapshot(surface.identity.id), reopened = new MobileProjectGraphSessions(saved);
    expect(saved.activeSurfaceDocumentId).toBe(surface.identity.id); expect(saved.activeGraphDocumentId).toBeUndefined();
    expect(selectMobileStartupProject([saved], saved.id, false)).toEqual(saved);
    expect(reopened.surface(surface.identity.id).redo().source.definition.expressions!.z).toBe("u*u-v*v+2");
    expect(reopened.adapter(original.graphIds[1]!).history().undoDepth).toBe(1);
    const returned = parseProjectPackage(serializeMobileProjectHandoff(saved));
    expect(verifyMixedWorkspaceReplay(returned.project.workspace).get(surface.identity.id)!.identity).toEqual(adapter.document().identity);
    expect(returned.project.workspace.entries.filter(entry => ![surface.identity.id, original.graphIds[1]].includes(entry.expected.id))).toEqual(project.workspace.entries.filter(entry => ![surface.identity.id, original.graphIds[1]].includes(entry.expected.id)));
    expect(returned.project.workspace.relations).toEqual(project.workspace.relations); expect(returned.project.workspace.results).toEqual(project.workspace.results);
    expect(returned.resources.sidecars()).toEqual(original.resources.sidecars());
    expect(buildMobileProjectExplorer(saved.serializedProject, saved.projectResources).groups.find(group => group.module === "surface")!.documents.find(d => d.id === surface.identity.id)!.editing).toBe("Surface workspace");
  });
  it("rejects invalid expressions, nonfinite/periodic/empty domains and dependencies atomically", () => {
    const document = literalSurface(), adapter = new SurfaceCommandAdapter(document);
    for (const z of ["u+", "unknown(v)", "1/0", "1/(u-v)"]) expect(() => commitMobileSurfaceSource(adapter, { ...document.source, definition: { ...document.source.definition, expressions: { x: "u", y: "v", z } } })).toThrow();
    for (const u of [{ min: 1, max: 1 }, { min: -1, max: 1, periodic: true }, { min: 0, max: Infinity }])
      expect(() => commitMobileSurfaceSource(adapter, { ...document.source, domain: { kind: "parameter", u, v: { min: -1, max: 1 } } })).toThrow();
    expect(() => sampleMobileSurface({ ...document.source, definition: { ...document.source.definition, sourceIds: ["external"] } })).toThrow("independent");
    expect(adapter.document()).toEqual(document); expect(adapter.history().undoDepth).toBe(0);
    expect(sampleMobileSurface(document.source).at(-1)).toEqual([1, 1, 0]);
  });
  it("rejects inverse corruption and blocks literal current sources with unsupported retained history", () => {
    const { stored, surface } = fixture(), sessions = new MobileProjectGraphSessions(stored), adapter = sessions.surface(surface.identity.id);
    commitMobileSurfaceSource(adapter, { ...surface.source, definition: { ...surface.source.definition, expressions: { x: "u", y: "v", z: "u*v" } } });
    const saved = sessions.snapshot(surface.identity.id), project = readMobilePreviewProject(saved);
    const entries = JSON.parse(canonicalJsonStringify(project.workspace.entries));
    entries.find((entry: any) => entry.expected.id === surface.identity.id).replay.payload.transactions[0].inverse.command.payload.definition.expressions.z = "42";
    const corrupt = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries }));
    expect(() => importMobileProjectPreview(serializeMath3DProject(corrupt), [], "bad.json")).toThrow("inverse");
    const dependent = new SurfaceCommandAdapter(createSurfaceDocument({ source: { ...surface.source, representation: "constructed", definition: { familyId: "extrusion", sourceIds: ["external"] } } }));
    dependent.commitSource(surface.source);
    expect(mobileSurfaceUnavailableReason(dependent.document())).toBeNull();
    expect(mobileSurfaceUnavailableReason(dependent.document(), dependent.replayBundle())).toContain("independent");
  });
});
