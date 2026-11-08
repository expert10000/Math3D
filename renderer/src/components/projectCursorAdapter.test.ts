import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listProjectScientificSelections, migrateProjectScientificSelections,
  parseMath3DProject, upsertProjectScientificSelection, viewerSourceFromDocument } from "@math3d/core";
import { projectCursorFromSavedPoint } from "./projectCursorAdapter";
import { ScientificCursorBus } from "./scientificCursor";

const raw = readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const project = migrateProjectScientificSelections(parseMath3DProject(raw));
const saved = listProjectScientificSelections(project).find(item =>
  item.identity.kind === "authored" && item.geometry.kind === "point" && item.source?.kind === "document");
if (!saved || saved.identity.kind !== "authored") throw new Error("Missing saved point fixture.");
if (saved.source?.kind !== "document") throw new Error("Missing saved point source.");
const entry = project.workspace.entries.find(item => item.expected.id === saved.source.documentId);
if (!entry) throw new Error("Missing point source document.");
const source = viewerSourceFromDocument(entry.checkpoint);
const pinned = { ...saved, source: { ...saved.source, checkpoint: {
  revision: source.revision, structuralHash: source.structuralHash } } } as typeof saved;
const pinnedProject = upsertProjectScientificSelection(project, pinned);
const frame = { kind: "cartesian" as const, frameId: "fixture-world", axes:
  saved.frame.axes.map(axis => ({ name: axis.name, dimension: "length", unit: axis.unit })) };

describe("M3D20-03 Project saved-point cursor adapter", () => {
  it("binds a saved point to its exact replayed document and publishes on the shared bus", () => {
    const result = projectCursorFromSavedPoint(pinnedProject, saved.identity.id, frame, "project-inspector");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bus = new ScientificCursorBus();
    const cursor = bus.publishProject(result.value, result.value.source);
    expect(cursor.kind).toBe("project");
    expect(cursor.position).toEqual(saved.geometry.kind === "point" ? saved.geometry.position : []);
    expect(cursor.source.documentId).toBe(saved.source?.kind === "document" ? saved.source.documentId : "");
  });
  it("withholds an unpinned or stale saved selection without changing the Project", () => {
    expect(projectCursorFromSavedPoint(project, "missing", frame, "project-inspector").ok).toBe(false);
    if (saved.source?.kind !== "document") return;
    const unpinned = upsertProjectScientificSelection(pinnedProject, { ...saved,
      source: { ...saved.source, checkpoint: null } });
    expect(projectCursorFromSavedPoint(unpinned, saved.identity.id, frame, "project-inspector").ok).toBe(false);
    const stale = upsertProjectScientificSelection(pinnedProject, { ...pinned,
      source: { ...pinned.source, checkpoint: { revision: source.revision + 1,
        structuralHash: source.structuralHash } } });
    const result = projectCursorFromSavedPoint(stale, saved.identity.id, frame, "project-inspector");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/stale/);
    expect(listProjectScientificSelections(project).find(item => item.identity.kind === "authored" &&
      item.identity.id === saved.identity.id)).toEqual(saved);
  });
  it("refuses a guessed coordinate frame", () => {
    expect(projectCursorFromSavedPoint(pinnedProject, saved.identity.id,
      { ...frame, axes: frame.axes.map(axis => ({ ...axis, unit: "cm" })) }, "project-inspector").ok).toBe(false);
  });
});
