import { describe, expect, it } from "vitest";
import { analyzeGraph2DDerivative, createGraph2DWorkspaceProject, createMath3DProject, createMixedWorkspaceDocument, createVolumeDocument, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, parseMath3DProject, promoteGraph2DToCurve, serializeMath3DProject, serializeMixedWorkspaceDocument, structuralHash } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { VolumeDocumentAdapter } from "../volume/volumeDocumentAdapter";
import { exportProjectFile, inspectProjectCompatibility, MAX_PROJECT_IMPORT_BYTES, mergeProjectLiveWorkspace, previewProjectImport } from "./projectTransfer";
import { importLibraryProject, PROJECT_STORAGE_KEY, saveLibraryProject } from "./projectLibrary";

const fixture = () => {
  const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "transfer").document;
  const curve = promoteGraph2DToCurve(graph, graph.source.objects[0]!.id), result = analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0]!.id, x: 1, order: 1 }).publication;
  const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph), entries: [...createGraph2DWorkspaceProject(graph).entries,
    { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }], results: [result], relations: [curve.relation] });
  return { graph, curve, result, project: createMath3DProject(workspace, { stableKey: "transfer", title: "Transfer study" }) };
};
const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
describe("PRJ06 project transfer and compatibility", () => {
  it("exports and previews exact IDs, source hashes, results and lineage without mutation", () => {
    const { project } = fixture(), bytes = serializeMath3DProject(project), exported = exportProjectFile(project), preview = previewProjectImport(exported);
    expect(preview.project).toEqual(project); expect(preview.canOpenWorkspace).toBe(true);
    expect(preview.requiredCapabilities).toEqual(project.workspace.entries[0]!.checkpoint.format === "math3d.graph2d-document" ? [...project.workspace.entries[0]!.checkpoint.requiredCapabilities].sort() : []);
    expect(preview.engines).toEqual([project.workspace.results[0]!.provenance.engine]);
    expect(exported).toBe(bytes); expect(serializeMath3DProject(project)).toBe(bytes);
    expect(parseMath3DProject(exported).workspace.relations).toEqual(project.workspace.relations);
  });
  it("replays unsupported editor modules accurately and keeps them preview-only", () => {
    const volume = createVolumeDocument({ stableKey: "transfer-volume", source: { representation: "analytic-scalar-field", recipe: { kind: "analytic-preset", presetId: "sphere" },
      spatial: { dimensions: [8, 8, 8], origin: [0, 0, 0], spacing: [1, 1, 1], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], centering: "point", coordinateSystem: "world", positionUnits: "m", valueUnits: "unitless" }, dependencies: [], payload: null } });
    const adapter = new VolumeDocumentAdapter(volume); adapter.commitSource({ ...volume.source, recipe: { kind: "analytic-preset", presetId: "torus" } });
    const replay = adapter.replayBundle(), workspace = createMixedWorkspaceDocument({ entries: [{ module: "volume", checkpoint: replay.checkpoint, expected: adapter.document().identity,
      replay: { format: "math3d.volume-replay.v1", payload: replay as never } }], activeDocumentIds: [volume.identity.id], results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const project = createMath3DProject(workspace, { stableKey: "volume" }), preview = previewProjectImport(exportProjectFile(project));
    expect(preview.canOpenWorkspace).toBe(false); expect(preview.documents[0]).toMatchObject({ module: "volume", replayVerified: true, editable: false });
    expect(preview.checkpoint.entries[0]!.checkpoint).toEqual(adapter.document());
    expect(preview.project.workspace.entries[0]!.replay).toEqual(project.workspace.entries[0]!.replay);
  });
  it("separates optional analysis artifacts from required source sidecars", () => {
    const { project, result } = fixture(), handle = { artifactId: "optional-results", kind: "table" as const, role: "samples" };
    const withArtifact = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [{ ...result, artifacts: [handle] }],
      artifacts: [{ handle, contentHash: structuralHash("missing"), byteLength: 10 }] }), { stableKey: "optional" });
    expect(inspectProjectCompatibility(withArtifact)).toMatchObject({ canOpenWorkspace: true, sidecars: [{ available: false, requiredForSource: false }] });
    const dataGraph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "data-transfer").document;
    const dataProject = createMath3DProject(createGraph2DWorkspaceProject(dataGraph), { stableKey: "data" });
    expect(inspectProjectCompatibility(dataProject)).toMatchObject({ canOpenWorkspace: false });
    expect(inspectProjectCompatibility(dataProject).sidecars.some((sidecar) => sidecar.requiredForSource && !sidecar.available)).toBe(true);
    expect(inspectProjectCompatibility(dataProject, { tableAvailable: () => true }).canOpenWorkspace).toBe(true);
  });
  it("rejects future, tampered, oversized and unsupported-replay files before storage mutation and adopts legacy workspaces explicitly", () => {
    const { project } = fixture(), bytes = serializeMath3DProject(project), storage = store(); saveLibraryProject(storage, project, 100);
    const before = [...storage.values];
    for (const raw of [JSON.stringify({ ...project, schemaVersion: 99 }), JSON.stringify({ ...project, workspace: { ...project.workspace, activeDocumentIds: [] } }),
      " ".repeat(MAX_PROJECT_IMPORT_BYTES + 1), JSON.stringify({ ...project, format: "future.project" })]) expect(() => previewProjectImport(raw)).toThrow();
    const unsupported = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map((entry) => ({ ...entry, replay: { format: "future.replay", payload: {} } })) }), { stableKey: "future-replay" });
    expect(() => previewProjectImport(serializeMath3DProject(unsupported))).toThrow("replay");
    expect([...storage.values]).toEqual(before); expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(bytes);
    const legacy = previewProjectImport(serializeMixedWorkspaceDocument(project.workspace));
    expect(legacy.inputKind).toContain("explicit adoption"); expect(legacy.project.workspace).toEqual(project.workspace);
  });
  it("retains imported analysis and relations when live sources change without rewriting current module replay", () => {
    const { project, graph } = fixture(), adapter = new Graph2DCommandAdapter(graph);
    const edited = adapter.commitScene({ source: { ...graph.source, objects: [] }, display: { ...graph.display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    const live = createGraph2DWorkspaceProject(edited), merged = mergeProjectLiveWorkspace(project.workspace, live);
    expect(merged.results).toEqual(project.workspace.results); expect(merged.relations).toEqual(project.workspace.relations);
    expect(merged.entries.find((entry) => entry.module === "graph2d")!.expected).toEqual(edited.identity);
    expect(merged.entries.find((entry) => entry.module === "curve")).toEqual(project.workspace.entries[1]);
  });
  it("imports only after explicit acceptance, rejects ID conflicts, and rolls back failed host activation", () => {
    const { project } = fixture(), storage = store(), active = createMath3DProject(project.workspace, { stableKey: "active", title: "Active work" });
    saveLibraryProject(storage, active, 100); const activeBytes = storage.getItem(PROJECT_STORAGE_KEY)!;
    importLibraryProject(storage, project, 200); expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(activeBytes);
    const before = [...storage.values], conflict = { ...project, metadata: { ...project.metadata, title: "Conflicting version" } };
    expect(() => importLibraryProject(storage, conflict, 300)).toThrow("different saved version"); expect([...storage.values]).toEqual(before);
    expect(() => importLibraryProject(storage, project, 300, { activate: true, backup: activeBytes, afterWrite: () => { throw new Error("Host restore failed"); } })).toThrow("Host restore failed");
    expect([...storage.values]).toEqual(before);
    let opened = false; importLibraryProject(storage, project, 400, { activate: true, backup: activeBytes, afterWrite: () => { opened = true; } });
    expect(opened).toBe(true); expect(storage.getItem(`${PROJECT_STORAGE_KEY}.before-open`)).toBe(activeBytes); expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(serializeMath3DProject(project));
  });
});
