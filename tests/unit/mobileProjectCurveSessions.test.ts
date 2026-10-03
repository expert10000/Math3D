import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createCurveDocument, createMixedWorkspaceDocument, exportProjectPackage, replaceMath3DProjectWorkspace,
  serializeMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import { CurveCommandAdapter } from "@math3d/kernel";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { MobileProjectGraphSessions } from "../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { commitMobileCurveSource, mobileCurveUnavailableReason, sampleMobileCurve } from "../../apps/mobile/src/models/mobileProjectCurve";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { preserveMobilePersonalGraphWork } from "../../apps/mobile/src/models/mobileGraphPersonalProjects";
import { selectMobileStartupProject } from "../../apps/mobile/src/models/mobileStartupProject";
import { verifyMixedWorkspaceReplay } from "../../renderer/src/kernel/mixedWorkspaceReplay";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { parseProjectPackage } from "../../renderer/src/projects/projectResources";

describe("PRJ25 complete mixed-project Curve sessions", () => {
  it("retains separate Curve/Graph histories, other modules and resources through startup and desktop replay", () => {
    const fixture = mobileMixedProjectFixture();
    const originalCurve = fixture.project.workspace.entries.find(entry => entry.module === "curve" && entry.checkpoint.source.representation === "explicit")!.checkpoint;
    if (originalCurve.format !== "math3d.curve-document") throw new Error("Missing Curve");
    const extraCurve = createCurveDocument({ source: originalCurve.source, stableKey: "prj25-second-independent-curve" });
    fixture.project = replaceMath3DProjectWorkspace(fixture.project, createMixedWorkspaceDocument({ ...fixture.project.workspace,
      entries: [...fixture.project.workspace.entries, { module: "curve", checkpoint: extraCurve, expected: extraCurve.identity, replay: null }] }));
    const stored = importMobileProjectPreview(exportProjectPackage(fixture.project, fixture.resources), [], "package.json");
    const sessions = new MobileProjectGraphSessions(stored), project = readMobilePreviewProject(stored);
    const ids = buildMobileProjectExplorer(stored.serializedProject, stored.projectResources).groups.find(group => group.module === "curve")!.documents
      .filter(document => document.editing === "Curve workspace").map(document => document.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const a = sessions.curve(ids[0]!), b = sessions.curve(ids[1]!), beforeA = a.document(), beforeB = b.document();
    commitMobileCurveSource(a, { ...beforeA.source, domain: { ...beforeA.source.domain, min: beforeA.source.domain.min + 0.1 } });
    commitMobileCurveSource(b, { ...beforeB.source, definition: { ...beforeB.source.definition, expressions: { ...beforeB.source.definition.expressions, y: "x*x+3" } } });
    b.undo();
    const record = sessions.snapshot(ids[1]!), reopened = new MobileProjectGraphSessions(record);
    expect(record.activeGraphDocumentId).toBeUndefined(); expect(record.activeCurveDocumentId).toBe(ids[1]);
    expect(selectMobileStartupProject([record], record.id, false)).toEqual(record);
    expect(reopened.curve(ids[1]!).history().redoDepth).toBe(1);
    expect(reopened.curve(ids[0]!).undo().source).toEqual(beforeA.source);
    expect(reopened.curve(ids[1]!).redo().source.definition.expressions!.y).toBe("x*x+3");
    expect(reopened.adapter(fixture.graphIds[1]!).history().undoDepth).toBe(0);
    const returned = parseProjectPackage(serializeMobileProjectHandoff(record)), resolved = verifyMixedWorkspaceReplay(returned.project.workspace);
    expect(resolved.get(ids[0]!)!.identity).toEqual(a.document().identity);
    expect(returned.project.workspace.entries.filter(entry => entry.module !== "curve")).toEqual(project.workspace.entries.filter(entry => entry.module !== "curve"));
    expect(returned.project.workspace.relations).toEqual(project.workspace.relations); expect(returned.project.workspace.results).toEqual(project.workspace.results);
    expect(returned.resources.sidecars()).toEqual(fixture.resources.sidecars());
    expect(preserveMobilePersonalGraphWork([stored], { project: record })).toEqual([record]);
    expect(() => canonicalJsonStringify(record)).not.toThrow();
  });
  it("rejects invalid formulas/domains atomically and qualifies literal 3D sampling", () => {
    const fixture = mobileMixedProjectFixture(), document = fixture.project.workspace.entries.find(entry => entry.module === "curve" && entry.checkpoint.source.representation === "explicit")!.checkpoint;
    if (document.format !== "math3d.curve-document") throw new Error("Missing Curve");
    const adapter = new CurveCommandAdapter(document), before = adapter.document();
    for (const y of ["x+", "unknown(x)", "1/0"]) expect(() => commitMobileCurveSource(adapter, { ...document.source, definition: { ...document.source.definition, expressions: { x: "x", y } } })).toThrow();
    expect(() => commitMobileCurveSource(adapter, { ...document.source, domain: { ...document.source.domain, max: document.source.domain.min } })).toThrow();
    expect(adapter.document()).toEqual(before); expect(adapter.history().undoDepth).toBe(0);
    const source = { ...document.source, representation: "parametric" as const, dimension: 3 as const, domain: { ...document.source.domain, parameter: "t", min: 0, max: 1 }, definition: { familyId: "literal", expressions: { x: "t", y: "t*t", z: "2*t" } } };
    expect(sampleMobileCurve(source).at(-1)).toEqual([1, 1, 2]);
    expect(() => sampleMobileCurve({ ...source, dependencies: [{ sourceId: "external" }] })).toThrow("independent");
  });
  it("blocks archived Curves and corrupt replay while retaining the original package", () => {
    const fixture = mobileMixedProjectFixture(), curve = fixture.project.workspace.entries.find(entry => entry.module === "curve")!;
    const archived = updateMath3DProjectMetadata(fixture.project, { ...fixture.project.metadata, documents: { ...fixture.project.metadata.documents, [curve.expected.id]: { archived: true } } });
    expect(() => new MobileProjectGraphSessions(importMobileProjectPreview(serializeMath3DProject(archived), [], "archive.json")).curve(curve.expected.id)).toThrow("archived");
    const stored = importMobileProjectPreview(fixture.raw, [], "package.json"), sessions = new MobileProjectGraphSessions(stored);
    const editable = buildMobileProjectExplorer(stored.serializedProject, stored.projectResources).groups.find(group => group.module === "curve")!.documents.find(document => document.editing === "Curve workspace")!;
    const adapter = sessions.curve(editable.id), source = adapter.document().source;
    commitMobileCurveSource(adapter, { ...source, domain: { ...source.domain, min: source.domain.min + 0.1 } });
    const project = readMobilePreviewProject(sessions.snapshot(editable.id));
    const entries = JSON.parse(JSON.stringify(project.workspace.entries));
    const incorrectInverse = JSON.parse(JSON.stringify(entries));
    incorrectInverse.find((entry: any) => entry.expected.id === editable.id).replay.payload.transactions[0].inverse.command.payload.domain.max += 1;
    const inverseProject = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries: incorrectInverse }));
    expect(() => importMobileProjectPreview(serializeMath3DProject(inverseProject), [], "wrong-inverse.json")).toThrow("inverse");
    entries.find((entry: any) => entry.expected.id === editable.id).replay.payload.transactions[0].forward.command.payload.domain.max = 99;
    const corrupt = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries }));
    expect(() => importMobileProjectPreview(serializeMath3DProject(corrupt), [], "corrupt.json")).toThrow();
    expect(readMobilePreviewProject(stored)).toEqual(fixture.project);
  });
  it("blocks a current literal Curve whose retained undo recipe is unsupported on mobile", () => {
    const fixture = mobileMixedProjectFixture(), entry = fixture.project.workspace.entries.find(entry => entry.module === "curve" && entry.checkpoint.source.representation === "explicit")!;
    if (entry.checkpoint.format !== "math3d.curve-document") throw new Error("Missing Curve");
    const source = entry.checkpoint.source;
    const checkpoint = createCurveDocument({ source: { ...source, representation: "polyline", definition: { familyId: "polyline", points: [[0, 0], [1, 1]], pointCount: 2 } } });
    const adapter = new CurveCommandAdapter(checkpoint); adapter.commitSource(source);
    expect(mobileCurveUnavailableReason(adapter.document())).toBeNull();
    expect(mobileCurveUnavailableReason(adapter.document(), adapter.replayBundle())).toContain("independent");
  });
});
