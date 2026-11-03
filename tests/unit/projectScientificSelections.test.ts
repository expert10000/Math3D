import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProjectExplorer, createMixedWorkspaceDocument, createWorkspaceProjectHandoff, deleteProjectDocument,
  graph2DCompanionCheckpoint, listProjectScientificSelections,
  migrateProjectScientificSelections, normalizeMixedWorkspaceDocument,
  parseMath3DProject, parseWorkspaceProjectHandoff, projectScientificSelectionsForDocument,
  PROJECT_SCIENTIFIC_SELECTIONS_CAPABILITY,
  readScientificSelectionsFromProject, replaceMath3DProjectWorkspace, reviseVectorField3DWorkspace,
  serializeMath3DProject,
} from "@math3d/core";

const fixture = new URL("../fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const originKey = (selection: ReturnType<typeof readScientificSelectionsFromProject>[number]) =>
  JSON.stringify(selection.identity);

describe("GF-02 Project scientific selections", () => {
  it("migrates the GF-01 fixture through save/reopen with exact geometry and provenance", () => {
    const legacy = load(), before = readScientificSelectionsFromProject(legacy);
    const migrated = migrateProjectScientificSelections(legacy);
    const reopened = parseMath3DProject(serializeMath3DProject(migrated));
    const selections = listProjectScientificSelections(reopened);
    expect(selections).toHaveLength(10);
    expect(new Set(selections.map(item => item.identity.kind === "authored" ? item.identity.id : "")).size).toBe(10);
    expect(selections.map(item => item.geometry.kind).sort()).toEqual([
      "axis-line", "axis-line", "orthogonal-plane", "orthogonal-plane", "orthogonal-plane",
      "plane-region", "plane-region", "point", "point", "axis-line",
    ].sort());
    for (const old of before) {
      const selection = selections.find(item => item.identity.kind === "authored" &&
        JSON.stringify(item.identity.migratedFrom) === originKey(old));
      expect(selection).toBeDefined();
      expect(selection!.geometry).toEqual(old.geometry);
      expect(selection!.frame).toEqual(old.frame);
      expect(selection!.source).toEqual(old.source);
      expect(selection!.role).toBe(old.role);
    }
    expect(serializeMath3DProject(migrateProjectScientificSelections(reopened)))
      .toBe(serializeMath3DProject(reopened));
    expect(legacy.workspace.scientificSelections).toBeUndefined();
  });

  it("keeps IDs through layout changes and exposes one collection to Explorer and Graphs", () => {
    const project = migrateProjectScientificSelections(load());
    const fieldId = project.workspace.entries.find(entry => entry.module === "vector3d")!.expected.id;
    const graphId = project.workspace.entries.find(entry => entry.module === "graph2d")!.expected.id;
    const layout = createMixedWorkspaceDocument({ ...project.workspace,
      activeDocumentIds: [...project.workspace.activeDocumentIds].reverse() });
    const reopened = parseMath3DProject(serializeMath3DProject(
      replaceMath3DProjectWorkspace(project, layout)));
    expect(listProjectScientificSelections(reopened).map(item => item.identity)).toEqual(
      listProjectScientificSelections(project).map(item => item.identity));
    const explorer = projectScientificSelectionsForDocument(reopened, fieldId);
    const graphs = projectScientificSelectionsForDocument(reopened, graphId);
    expect(buildProjectExplorer(reopened).selections).toEqual(listProjectScientificSelections(reopened));
    expect(explorer.some(item => item.geometry.kind === "point")).toBe(true);
    expect(explorer.some(item => item.geometry.kind === "plane-region")).toBe(true);
    expect(graphs.some(item => item.identity.kind === "authored" &&
      item.identity.migratedFrom?.ownerDocumentId === graphId)).toBe(true);
    expect(graphs.every(item => listProjectScientificSelections(reopened).some(shared =>
      shared.identity.kind === "authored" && item.identity.kind === "authored" &&
      shared.identity.id === item.identity.id))).toBe(true);
  });

  it("retains Graph-owned selections in a portable Graph handoff", () => {
    const project = migrateProjectScientificSelections(load());
    const graphId = project.workspace.entries.find(entry => entry.module === "graph2d")!.expected.id;
    const companion = graph2DCompanionCheckpoint(project.workspace);
    const handoff = createWorkspaceProjectHandoff(companion, {
      producer: { platform: "desktop", name: "Math3D", version: "1" } });
    const reopened = parseWorkspaceProjectHandoff(JSON.stringify(handoff));
    expect(reopened.requiredCapabilities).toContain(PROJECT_SCIENTIFIC_SELECTIONS_CAPABILITY);
    expect(reopened.project.scientificSelections).toEqual(
      projectScientificSelectionsForDocument(project, graphId).filter(item =>
        item.identity.kind === "authored" && item.identity.migratedFrom?.ownerDocumentId === graphId));
  });

  it("updates a saved point coordinate under its existing Project ID", () => {
    const project = migrateProjectScientificSelections(load());
    const original = project.workspace.scientificSelections!.find(item => item.identity.kind === "authored" &&
      item.identity.migratedFrom?.path === "workspace.probe")!;
    const workspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(entry => {
        if (entry.module !== "vector3d") return entry;
        if (entry.checkpoint.format !== "math3d.vector-field3d-document")
          throw new TypeError("Wrong fixture entry format.");
        return { ...entry, checkpoint: reviseVectorField3DWorkspace(entry.checkpoint, {
          ...entry.checkpoint.workspace!, probe: [1.25, 2, 3] }) };
      }) });
    const updated = migrateProjectScientificSelections(replaceMath3DProjectWorkspace(project, workspace));
    const point = updated.workspace.scientificSelections!.find(item => item.identity.kind === "authored" &&
      item.identity.migratedFrom?.path === "workspace.probe")!;
    expect(point.identity).toEqual(original.identity);
    expect(point.geometry).toEqual({ kind: "point", position: [1.25, 2, 3] });
    expect(point.source).toEqual(original.source);
  });

  it("rejects duplicate IDs and migration origins and cascades owned selections on document deletion", () => {
    const project = migrateProjectScientificSelections(load()), selections = project.workspace.scientificSelections!;
    const duplicate = { ...project.workspace, scientificSelections: [...selections, selections[0]!] };
    expect(normalizeMixedWorkspaceDocument(duplicate).ok).toBe(false);
    const sameOrigin = { ...selections[1]!, identity: {
      ...selections[1]!.identity,
      migratedFrom: selections[0]!.identity.kind === "authored" ?
        selections[0]!.identity.migratedFrom : undefined } };
    expect(normalizeMixedWorkspaceDocument({ ...project.workspace,
      scientificSelections: [selections[0]!, sameOrigin, ...selections.slice(2)] }).ok).toBe(false);
    const graphId = project.workspace.entries.find(entry => entry.module === "graph2d")!.expected.id;
    const deleted = deleteProjectDocument(project, graphId);
    expect(deleted.workspace.scientificSelections?.some(item => item.identity.kind === "authored" &&
      item.identity.migratedFrom?.ownerDocumentId === graphId)).toBe(false);
  });
});
