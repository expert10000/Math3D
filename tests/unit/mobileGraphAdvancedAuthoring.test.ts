import { describe, expect, it } from "vitest";
import { Graph2DPointTableStore, serializeGraph2DDocument, parseGraph2DDocument, sampleGraph2DScene } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { MOBILE_GRAPH_KINDS, mobileGraphKindAction, mobileGraphKindEditor } from "../../apps/mobile/src/models/mobileGraphAdvancedAuthoring";
import { applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { mobileGraphSamplingPolicy } from "../../apps/mobile/src/models/mobileGraphDisplay";
import { mobileGraphAdvancedGeometry } from "../../apps/mobile/src/viewer/mobileGraphAdvancedProjection";
import { projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";

describe("MOB-G09 native kind flows", () => {
  it("authors a planar phase portrait with bounded arrows, saved seeds, and one undoable edit", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Phase", false, "mobile-phase"));
    const tables = new Graph2DPointTableStore();
    const editor = mobileGraphKindEditor(adapter.document(), "phase-portrait");
    editor.draft.seedsText = "1,0\n2,0";
    const create = mobileGraphKindAction(editor, tables);
    adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), create), create.type);
    const created = adapter.document();
    const object = created.source.objects[0];
    expect(object?.kind).toBe("phase-portrait");
    const edit = mobileGraphKindEditor(created, "phase-portrait", object!.id);
    expect(edit.draft.seedsText).toBe("1,0\n2,0");
    edit.draft.second = "x";
    const change = mobileGraphKindAction(edit, tables);
    adapter.commitScene(applyMobileGraphAuthoring(created, change), change.type);
    expect(adapter.undo()?.source).toEqual(created.source);
    adapter.redo();
    const document = parseGraph2DDocument(serializeGraph2DDocument(adapter.document()));
    const size = { width: 320, height: 320 };
    const series = sampleGraph2DScene({ document, viewport: document.display.viewport, ...size, interaction: false });
    const geometry = mobileGraphAdvancedGeometry(series, document.display.viewport, size);
    expect(geometry.points).toHaveLength(3); // Two seeds and the equilibrium at the origin.
    expect(geometry.points.some(point => point.color === "#111827")).toBe(true);
    expect(geometry.boundaries).toHaveLength(4); // Orbits, directions, and two nullclines.
    expect(projectMobileGraphLines(geometry.boundaries, document.display.viewport, size).length).toBeGreaterThan(20);
    edit.draft.seedsText = "1,not-a-number";
    expect(() => applyMobileGraphAuthoring(created, mobileGraphKindAction(edit, tables))).toThrow();
    edit.draft.seedsText = "";
    const empty = mobileGraphKindAction(edit, tables);
    const cleared = applyMobileGraphAuthoring(created, empty);
    expect(cleared.source.objects[0]?.kind === "phase-portrait" && cleared.source.objects[0].seeds).toEqual([]);
  });
  it("authors and edits a linked initial-value trajectory with one undo step per commit", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("ODE", false, "mobile-trajectory"));
    const tables = new Graph2DPointTableStore();
    const fieldEditor = mobileGraphKindEditor(adapter.document(), "slope-field");
    fieldEditor.draft.expression = "x";
    const fieldAction = mobileGraphKindAction(fieldEditor, tables);
    adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), fieldAction), fieldAction.type);
    const trajectoryEditor = mobileGraphKindEditor(adapter.document(), "trajectory", null, "slope_field_1");
    trajectoryEditor.draft.initialX = "0"; trajectoryEditor.draft.initialY = "1";
    const createAction = mobileGraphKindAction(trajectoryEditor, tables);
    adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), createAction), createAction.type);
    const created = adapter.document();
    expect(created.source.objects[1]?.kind).toBe("trajectory");
    const edit = mobileGraphKindEditor(created, "trajectory", "trajectory_1");
    edit.draft.initialY = "2";
    const editAction = mobileGraphKindAction(edit, tables);
    adapter.commitScene(applyMobileGraphAuthoring(created, editAction), editAction.type);
    expect(adapter.undo()?.source).toEqual(created.source);
    adapter.redo();
    const restored = parseGraph2DDocument(serializeGraph2DDocument(adapter.document()));
    const size = { width: 320, height: 320 };
    const series = sampleGraph2DScene({ document: restored, viewport: restored.display.viewport, ...size,
      interaction: false });
    expect(series[1]!.artifact.segments[0]!.points.length).toBeGreaterThan(2);
    const geometry = mobileGraphAdvancedGeometry(series, restored.display.viewport, size);
    expect(geometry.points.length).toBeGreaterThan(0); // Initial-value seed marker.
    expect(projectMobileGraphLines(geometry.boundaries, restored.display.viewport, size).length).toBeGreaterThan(0);
  });
  for (const kind of MOBILE_GRAPH_KINDS.filter((k) => k !== "explicit-cartesian")) it(`authors, edits, undoes, samples and round-trips ${kind}`, () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph(kind, false, kind));
    const tables = new Graph2DPointTableStore();
    const apply = (editor: ReturnType<typeof mobileGraphKindEditor>) => {
      const action = mobileGraphKindAction(editor, tables);
      adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), action), action.type);
    };
    apply(mobileGraphKindEditor(adapter.document(), kind));
    const created = adapter.document(), object = created.source.objects[0]!;
    expect(object.kind).toBe(kind);
    const draft = mobileGraphKindEditor(created, kind, object.id); draft.draft.label = "Edited";
    apply(draft); expect(adapter.document().source.objects[0]?.label).toBe("Edited");
    expect(adapter.undo()?.source).toEqual(created.source); adapter.redo();
    const document = parseGraph2DDocument(serializeGraph2DDocument(adapter.document()));
    const pointTables = Object.fromEntries(document.source.objects.flatMap((o) => o.kind === "point-series" ? [[o.table.id, tables.resolve(o.table)]] : []));
    const size = { width: 320, height: 320 };
    const series = sampleGraph2DScene({ document: { ...document, display: { ...document.display, sampling: mobileGraphSamplingPolicy(document, false) } }, viewport: document.display.viewport, ...size, interaction: false, pointTables });
    expect(series).toHaveLength(1); expect(series[0]!.artifact.samplesEvaluated).toBeLessThanOrEqual(2048);
    const geometry = mobileGraphAdvancedGeometry(series, document.display.viewport, size);
    const lines = projectMobileGraphLines(geometry.boundaries, document.display.viewport, size);
    expect(lines.length + geometry.points.length + geometry.fills.length).toBeGreaterThan(0);
    expect(geometry.fills.length).toBeLessThanOrEqual(256); expect(geometry.points.length).toBeLessThanOrEqual(128);
    expect(lines.every((l) => [l.a.x, l.a.y, l.b.x, l.b.y].every(Number.isFinite))).toBe(true);
  });
  it("does not commit invalid drafts and retains every inequality/piece condition on edit", () => {
    const original = createMobileGraph("Invalid", false, "invalid-kinds"), tables = new Graph2DPointTableStore();
    for (const kind of ["parametric", "polar", "implicit"] as const) {
      const editor = mobileGraphKindEditor(original, kind); editor.draft.expression = "sin(";
      expect(() => applyMobileGraphAuthoring(original, mobileGraphKindAction(editor, tables))).toThrow();
      expect(original.source.objects).toHaveLength(0); expect(editor.draft.expression).toBe("sin(");
    }
    const bad = mobileGraphKindEditor(original, "point-series"); bad.draft.data = "x,y\n1,no";
    expect(() => mobileGraphKindAction(bad, tables)).toThrow(/finite/);
    const pieces = mobileGraphKindEditor(original, "piecewise"); pieces.draft.pieces[1]!.includeMin = false;
    const adapter = new Graph2DCommandAdapter(original);
    adapter.commitScene(applyMobileGraphAuthoring(original, mobileGraphKindAction(pieces, tables)), "create-piecewise");
    expect(mobileGraphKindEditor(adapter.document(), "piecewise", "piecewise_1").draft.pieces).toEqual(pieces.draft.pieces);
  });
  it("checks persistent table references, preserves missing-row gaps, and reports missing sidecars", () => {
    const backing = new Map<string, string>();
    const storage = { read: (id: string) => backing.get(id) ?? null, write: (id: string, content: string) => { backing.set(id, content); } };
    const tables = new Graph2DPointTableStore(storage), original = createMobileGraph("Data", false, "data-g09");
    const editor = mobileGraphKindEditor(original, "point-series"); editor.draft.data = "x,y\n0,0\n1,1\n2,NA\n3,9\n4,16"; editor.draft.mode = "line";
    const action = mobileGraphKindAction(editor, tables), adapter = new Graph2DCommandAdapter(original);
    adapter.commitScene(applyMobileGraphAuthoring(original, action), action.type);
    const document = adapter.document(), object = document.source.objects[0]!; if (object.kind !== "point-series") throw new Error("kind");
    const restored = new Graph2DPointTableStore(storage).resolve(object.table)!;
    expect(restored[2]?.y).toBeNull(); expect(serializeGraph2DDocument(document)).not.toContain("row_1");
    const request = { document, viewport: document.display.viewport, width: 320, height: 320, interaction: false };
    expect(sampleGraph2DScene({ ...request, pointTables: { [object.table.id]: restored } })[0]?.artifact.segments).toHaveLength(2);
    expect(sampleGraph2DScene(request)[0]?.artifact.diagnostics[0]?.code).toBe("missing-table");
    backing.set(object.table.id, "[]"); expect(new Graph2DPointTableStore(storage).resolve(object.table)).toBeNull();
  });
  it("renders strict boundaries dashed and inclusive boundaries solid within shared line limits", () => {
    const original = createMobileGraph("Region", false, "region-g09"), adapter = new Graph2DCommandAdapter(original);
    const editor = mobileGraphKindEditor(original, "inequality"); editor.draft.clauses = [{ expression: "x", comparator: "<" }, { expression: "y", comparator: ">=" }];
    adapter.commitScene(applyMobileGraphAuthoring(original, mobileGraphKindAction(editor, new Graph2DPointTableStore())), "create-inequality");
    const document = adapter.document(), size = { width: 320, height: 320 };
    const geometry = mobileGraphAdvancedGeometry(sampleGraph2DScene({ document, viewport: document.display.viewport, ...size, interaction: false }), document.display.viewport, size);
    expect(geometry.boundaries.map((b) => b.style.lineStyle)).toEqual(["dashed", "solid"]);
    const dashed = projectMobileGraphLines(geometry.boundaries.slice(0, 1), document.display.viewport, size);
    expect(dashed.length).toBeGreaterThan(0); expect(dashed.every((l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) <= 8 + 1e-6)).toBe(true);
  });
});
