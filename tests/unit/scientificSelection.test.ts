import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createMath3DProject, createMixedWorkspaceDocument, Graph2DPointTableStore,
  normalizeScientificSelection, normalizeVectorField3DDocument,
  parseMath3DProject, parseScientificSelection,
  readScientificSelectionsFromProject, reviseVectorField3DDocument,
  serializeMath3DProject, serializeScientificSelection,
  vectorField3DExpression } from "@math3d/core";
import { createGf01LegacyProject } from "../fixtures/scientific-selection/gf01LegacyProject";

const fixture = new URL("../fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url);

describe("GF-01 scientific selection contract and legacy Project projection", () => {
  it("reopens the committed Project fixture and preserves legacy slot identities and saved geometry", () => {
    const raw = readFileSync(fixture, "utf8").replace(/\r\n/g, "\n");
    expect(raw).toBe(`${serializeMath3DProject(createGf01LegacyProject())}\n`);
    const project = parseMath3DProject(raw);
    const before = readScientificSelectionsFromProject(project);
    const reopened = readScientificSelectionsFromProject(parseMath3DProject(serializeMath3DProject(project)));
    expect(reopened).toEqual(before);
    expect(before).toHaveLength(10);
    expect(before.every(item => item.identity.kind === "legacy-slot")).toBe(true);
    expect(new Set(before.map(item => serializeScientificSelection(item))).size).toBe(10);
    expect(before.map(item => parseScientificSelection(serializeScientificSelection(item)))).toEqual(before);
    const probe = before.find(item => item.identity.kind === "legacy-slot" &&
      item.identity.path === "workspace.probe")!;
    expect(probe.geometry).toEqual({ kind: "point", position: [1, 2, 3] });
    expect(probe.source).toMatchObject({ kind: "document", checkpoint: null });
    const linkedProbe = before.find(item => item.identity.kind === "legacy-slot" &&
      item.identity.path === "workspace.linkedProbe")!;
    expect(linkedProbe.source).toBeNull();
    expect(linkedProbe.frame.axes.map(axis => axis.unit)).toEqual(["m", "m", "m"]);
    expect(before.filter(item => item.geometry.kind === "orthogonal-plane")
      .map(item => item.geometry)).toMatchObject([
      { normalAxis: 0, coordinate: 1 }, { normalAxis: 1, coordinate: 2 },
      { normalAxis: 2, coordinate: 3 }]);
    expect(before.find(item => item.identity.kind === "legacy-slot" &&
      item.identity.path === "workspace.overlayRegion")!.geometry)
      .toEqual({ kind: "plane-region", normalAxis: 2, coordinate: 3,
        bounds: [[-2, 2], [-1, 1]] });
    const graph = before.filter(item => item.identity.kind === "legacy-slot" &&
      item.identity.path.startsWith("source.objects"));
    expect(graph.map(item => item.geometry.kind)).toEqual(["axis-line", "axis-line", "plane-region"]);
    expect(graph.every(item => item.source?.kind === "document" &&
      item.source.checkpoint?.revision === 1)).toBe(true);
    expect(graph[0]!.frame.axes.map(axis => axis.unit)).toEqual(["m", null, null]);
    expect(graph[2]!.geometry).toEqual({ kind: "plane-region", normalAxis: 2,
      coordinate: 3, bounds: [[-2, 2], [-1, 1]], sampleAxis: 0 });
  });

  it("does not rebase a saved Graph profile checkpoint when the live field source changes", () => {
    const original = createGf01LegacyProject();
    const fieldEntry = original.workspace.entries.find(entry => entry.module === "vector3d")!;
    if (fieldEntry.module !== "vector3d") throw new Error("Missing vector fixture.");
    const source = fieldEntry.checkpoint.source;
    if (source.field.kind !== "expressions") throw new Error("Expected authored field.");
    const revised = reviseVectorField3DDocument(fieldEntry.checkpoint, { ...source,
      field: { ...source.field, components: [vectorField3DExpression("2*x", "m/s"),
        source.field.components[1], source.field.components[2]] } });
    const workspace = createMixedWorkspaceDocument({ ...original.workspace,
      entries: original.workspace.entries.map(entry => entry.module === "vector3d" ?
        { module: "vector3d", checkpoint: revised, expected: revised.identity, replay: null } : entry) });
    const changed = createMath3DProject(workspace, { stableKey: "gf01-changed" });
    const selections = readScientificSelectionsFromProject(parseMath3DProject(serializeMath3DProject(changed)));
    const fieldProbe = selections.find(item => item.identity.kind === "legacy-slot" &&
      item.identity.path === "workspace.probe")!;
    expect(fieldProbe.source).toMatchObject({ kind: "document", checkpoint: null });
    const graphOrigins = selections.filter(item => item.identity.kind === "legacy-slot" &&
      item.identity.path.startsWith("source.objects"));
    expect(graphOrigins.every(item => item.source?.kind === "document" &&
      item.source.checkpoint?.structuralHash === fieldEntry.checkpoint.identity.structuralHash)).toBe(true);
    expect(revised.identity.structuralHash).not.toBe(fieldEntry.checkpoint.identity.structuralHash);
  });

  it("reads older field workspaces without creating absent probes or source pins", () => {
    const original = createGf01LegacyProject();
    const entry = original.workspace.entries.find(item => item.module === "vector3d")!;
    if (entry.module !== "vector3d") throw new Error("Missing vector fixture.");
    const { workspace: _workspace, ...olderDocument } = entry.checkpoint;
    const normalized = normalizeVectorField3DDocument(olderDocument);
    if (!normalized.ok) throw new Error(normalized.errors.join(" "));
    const workspace = createMixedWorkspaceDocument({ ...original.workspace,
      entries: original.workspace.entries.map(item => item.module === "vector3d" ?
        { module: "vector3d", checkpoint: normalized.value,
          expected: normalized.value.identity, replay: null } : item) });
    const project = createMath3DProject(workspace, { stableKey: "gf01-older-workspace" });
    const selections = readScientificSelectionsFromProject(parseMath3DProject(serializeMath3DProject(project)));
    expect(selections.filter(item => item.identity.kind === "legacy-slot" &&
      item.identity.ownerDocumentId === entry.expected.id).map(item => item.geometry.kind))
      .toEqual(["orthogonal-plane", "orthogonal-plane", "orthogonal-plane"]);
    expect(selections.filter(item => item.identity.kind === "legacy-slot" &&
      item.identity.ownerDocumentId === entry.expected.id).every(item =>
        item.source?.kind === "document" && item.source.checkpoint === null)).toBe(true);
  });

  it("requires replay before projecting an older Graph or field checkpoint", () => {
    const original = createGf01LegacyProject();
    const workspace = createMixedWorkspaceDocument({ ...original.workspace,
      entries: original.workspace.entries.map(entry => entry.module === "graph2d" ?
        { ...entry, replay: { format: "gf01.test-replay", payload: {} } } : entry) });
    const project = createMath3DProject(workspace, { stableKey: "gf01-replay" });
    expect(() => readScientificSelectionsFromProject(project)).toThrow(/Replay graph2d/);
  });

  it("retains a 2D imported profile's dataset identity and physical fixed coordinate", () => {
    const empty = createEmptyGraph2DDocument("gf01-imported-profile");
    const table = new Graph2DPointTableStore().publish([
      { id: "row_1", x: 0, y: 1 }, { id: "row_2", x: 1, y: 2 },
      { id: "row_3", x: 2, y: 3 }]);
    const scene = applyGraph2DAuthoring(empty, { type: "create-point-series", draft: {
      label: "Imported line", table, mode: "line",
      domain: { min: 0, max: 2, includeMin: true, includeMax: true },
      origin: { schema: "scientific-scene/v1", sceneId: "Gf01Scene", datasetId: "Scalar",
        sceneFingerprint: "a".repeat(64), resourceSha256: "b".repeat(64),
        sourceProducer: "Fixture", sourceId: "Imported", sourceSchema: "scalar-grid/v1",
        sourceSha256: "c".repeat(64), xName: "x", xUnit: "m", yName: "value", yUnit: "K",
        slice: { varyingAxis: 0, fixedIndex: 2, fixedCoordinate: 1,
          fixedName: "y", fixedUnit: "m" } },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const graph = createGraph2DDocument({ ...scene, stableKey: "gf01-imported-profile" });
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [{ module: "graph2d", checkpoint: graph, expected: graph.identity, replay: null }],
      activeDocumentIds: [graph.identity.id], results: [], artifacts: [], relations: [],
      committedSelection: null, constructions: [] }), { stableKey: "gf01-imported-project" });
    const selections = readScientificSelectionsFromProject(parseMath3DProject(serializeMath3DProject(project)));
    expect(selections).toHaveLength(1);
    expect(selections[0]!.source).toEqual({ kind: "dataset", sceneId: "Gf01Scene",
      datasetId: "Scalar", sceneFingerprint: "a".repeat(64), resourceSha256: "b".repeat(64) });
    expect(selections[0]!.frame.axes).toEqual([{ name: "x", unit: "m" },
      { name: "y", unit: "m" }]);
    expect(selections[0]!.geometry).toEqual({ kind: "axis-line", varyingAxis: 0,
      fixedCoordinates: [null, 1], extent: [0, 2] });
  });

  it("rejects malformed selection geometry and source checkpoints", () => {
    const selection = readScientificSelectionsFromProject(createGf01LegacyProject())[0]!;
    expect(normalizeScientificSelection({ ...selection, geometry: { kind: "axis-line",
      varyingAxis: 0, fixedCoordinates: [0, 2, 3], extent: [-4, 4] } }).ok).toBe(false);
    expect(normalizeScientificSelection({ ...selection, source: { ...selection.source,
      checkpoint: { revision: 1, structuralHash: "unknown" } } }).ok).toBe(false);
  });
});
