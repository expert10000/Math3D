import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createGraph2DWorkspaceProject, createMixedWorkspaceDocument,
  createWorkspaceProjectHandoff, parseWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff,
  assertWorkspaceHandoffCanReplace, structuralHash, analyzeGraph2DDerivative, viewerSourceFromDocument,
  matchesScientificSourceGeneration, promoteGraph2DToCurve, type Graph2DDocument } from "@math3d/core";
import { graph2DCompanionCheckpoint, mergeGraph2DHandoffCheckpoint, createCurveDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph, importMobileGraph, readMobileGraph, readMobileGraphWorkspace, updateStoredMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { mobileGraphAuthoringAction, mobileGraphFunctionDraft, applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { editMobileGraphProbes } from "../../apps/mobile/src/models/mobileGraphProbes";

const producer = { platform: "desktop", name: "Math3D Desktop", version: "1.5.0" } as const;
const desktop = () => {
  const commands = new Graph2DCommandAdapter(createMobileGraph("Round trip", false, "g2d33-roundtrip"));
  for (const [label, expression] of [["f", "x^2"], ["g", "2*x+1"]]) commands.commitScene(applyGraph2DAuthoring(commands.document(), {
    type: "create", draft: { label, expression, domain: { min: -5, max: 5, includeMin: true, includeMax: false },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } },
  }), "create");
  const document = commands.document(), target = promoteGraph2DToCurve(document, "function_1");
  const result = analyzeGraph2DDerivative({ document, objectId: "function_1", x: 2, order: 1, tolerance: 1e-5 }).publication;
  const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(document), results: [result],
    entries: [...createGraph2DWorkspaceProject(document).entries, { module: "curve", checkpoint: target.document, expected: target.document.identity, replay: null }],
    relations: [target.relation] });
  return { document, workspace, target, result };
};
describe("G2D33 desktop → mobile → desktop checkpoint and ancestry", () => {
  it("preserves f/g, pins a probe, adds h, saves and reopens through real host models", () => {
    const initial = desktop(), outbound = createWorkspaceProjectHandoff(initial.workspace, { producer });
    let stored = importMobileGraph(serializeWorkspaceProjectHandoff(outbound), [], "desktop.handoff.json", 1, "desktop");
    const commands = new Graph2DCommandAdapter(readMobileGraph(stored));
    expect(stored.source?.handoffRevision).toBe(outbound.projectRevision);
    commands.commitViewport({ ...initial.document.display.viewport, xMin: -3, xMax: 7 });
    commands.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 2, y: 4 } });
    let doc = commands.document();
    commands.commitScene({ source: doc.source, selection: doc.selection, display: { ...doc.display,
      pinnedProbes: editMobileGraphProbes(doc, { type: "pin", label: "Mobile A" }) } }, "pinned-probes");
    doc = commands.document();
    commands.commitScene(applyMobileGraphAuthoring(doc, mobileGraphAuthoringAction({ objectId: null,
      draft: { ...mobileGraphFunctionDraft(doc, null), label: "h", expression: "sin(x)" } })), "create");
    const created = commands.document(); expect(commands.undo()?.source.objects).toHaveLength(2);
    expect(commands.redo()?.source).toEqual(created.source); const edited = commands.document();
    stored = updateStoredMobileGraph(stored, edited, 2);
    const incoming = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(stored));
    expect(() => assertWorkspaceHandoffCanReplace(incoming, initial.workspace)).not.toThrow();
    const reopened = incoming.project.entries.find((entry) => entry.module === "graph2d")!.checkpoint as Graph2DDocument;
    expect(reopened).toEqual(edited); expect(reopened.identity.id).toBe(initial.document.identity.id);
    expect(reopened.source.objects.map((object) => [object.id, object.label])).toEqual([["function_1", "f"], ["function_2", "g"], ["function_3", "h"]]);
    expect(reopened.source.objects.slice(0, 2).map(structuralHash)).toEqual(initial.document.source.objects.map(structuralHash));
    expect(reopened.identity.structuralHash).toBe(structuralHash(reopened.source));
    expect(incoming.project.results).toEqual([initial.result]); expect(incoming.project.relations).toEqual([initial.target.relation]);
    expect(incoming.project.entries[1]).toEqual(initial.workspace.entries[1]);
    expect(matchesScientificSourceGeneration(initial.result.provenance.source, viewerSourceFromDocument(reopened))).toBe(false);
    expect(readMobileGraphWorkspace(stored)).toEqual(incoming.project);
    const desktopCommands = new Graph2DCommandAdapter(reopened);
    expect(desktopCommands.history().undoDepth).toBe(0); // checkpoint transfer does not promise undo-log persistence
    desktopCommands.commitViewport({ ...reopened.display.viewport, xMin: -4 });
    expect(desktopCommands.undo()).toEqual(reopened); expect(desktopCommands.redo()?.display.viewport.xMin).toBe(-4);
  });
  it("rejects source, viewport, style and result divergence against live data without mutation", () => {
    const initial = desktop(), stored = importMobileGraph(serializeWorkspaceProjectHandoff(createWorkspaceProjectHandoff(initial.workspace, { producer })), [], "desktop");
    const returned = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(stored));
    const commands = new Graph2DCommandAdapter(initial.document);
    commands.commitViewport({ ...initial.document.display.viewport, xMin: -4 });
    const viewportEdit = commands.document();
    commands.commitScene({ source: viewportEdit.source, selection: viewportEdit.selection,
      display: { ...viewportEdit.display, objects: viewportEdit.display.objects.map((style) => ({ ...style, color: "#ff0000" })) } }, "style");
    const styleEdit = commands.document();
    commands.commitScene(applyGraph2DAuthoring(styleEdit, { type: "duplicate", objectId: "function_1" }), "duplicate");
    for (const project of [createMixedWorkspaceDocument({ ...initial.workspace, results: [] }),
      ...[viewportEdit, styleEdit, commands.document()].map((edited) => createMixedWorkspaceDocument({ ...initial.workspace,
        entries: initial.workspace.entries.map((entry) => entry.module === "graph2d" ? { ...entry, checkpoint: edited, expected: edited.identity } : entry) }))]) {
      const before = JSON.stringify(project); expect(() => assertWorkspaceHandoffCanReplace(returned, project)).toThrow(/conflict/);
      expect(JSON.stringify(project)).toBe(before);
    }
    expect(() => assertWorkspaceHandoffCanReplace({ ...returned, baseRevision: null }, initial.workspace)).toThrow(/conflict/);
  });
  it("fails closed for tampering, future versions, mismatched capabilities and invalid ancestry", () => {
    const { workspace } = desktop(), manifest = createWorkspaceProjectHandoff(workspace, { producer });
    for (const mutation of [{ version: 3 }, { projectId: "wrong" }, { baseRevision: "bad" }, { requiredCapabilities: [] },
      { projectRevision: `sha256:${"0".repeat(64)}` }, { extra: true }])
      expect(() => importMobileGraph(JSON.stringify({ ...manifest, ...mutation }), [], "invalid")).toThrow();
    expect(() => importMobileGraph(serializeWorkspaceProjectHandoff(manifest), [importMobileGraph(serializeWorkspaceProjectHandoff(manifest), [], "first")], "collision")).toThrow(/companions/);
    const graphOnly = createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(desktop().document), { producer });
    const first = importMobileGraph(serializeWorkspaceProjectHandoff(graphOnly), [], "first");
    const copy = importMobileGraph(serializeWorkspaceProjectHandoff(graphOnly), [first], "copy");
    expect(copy.id).not.toBe(first.id); expect(copy.source?.handoffRevision).toBeUndefined();
  });
  it("scopes desktop export to Graph companions and retains imported results during live edits", () => {
    const initial = desktop(), unrelated = createCurveDocument({ stableKey: "unrelated-g33", source: initial.target.document.source });
    const full = createMixedWorkspaceDocument({ ...initial.workspace, entries: [...initial.workspace.entries,
      { module: "curve", checkpoint: unrelated, expected: unrelated.identity, replay: null }] });
    expect(graph2DCompanionCheckpoint(full)).toEqual(initial.workspace);
    const commands = new Graph2DCommandAdapter(initial.document);
    commands.commitViewport({ ...initial.document.display.viewport, yMin: -4 });
    const merged = mergeGraph2DHandoffCheckpoint(full, createGraph2DWorkspaceProject(commands.document()));
    expect(merged.entries[0]!.checkpoint).toEqual(commands.document());
    expect(merged.entries.slice(1)).toEqual(full.entries.slice(1)); expect(merged.results).toEqual(full.results);
    expect(merged.relations).toEqual(full.relations);
  });
});
