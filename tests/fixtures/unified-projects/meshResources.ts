import { canonicalJsonStringify, createAnalysisResultEnvelope, createMath3DProject, createMixedWorkspaceDocument, createGraph2DWorkspaceProject, getGraph2DPresetCatalog, Graph2DPointTableStore, instantiateGraph2DPreset, viewerSourceFromDocument } from "../../../packages/core/src/index";
import { MeshDocumentAdapter } from "../../../renderer/src/mesh/meshDocumentAdapter";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "../../../renderer/src/projects/projectResources";
import { meshReplayState } from "../../../renderer/src/mesh/meshReplay";

export const meshResourceFixture = () => {
  const mesh = (x: number) => ({ label: x === 0 ? "First saved triangle" : "Second saved triangle", source: { kind: "geometryObject" as const, objectId: `fixture-${x}`, transform: { position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, annotation: "retain origin" }, positions: new Float32Array([x,0,0, x+1,0,0, x,1,0]), indices: new Uint32Array([0,1,2]), normals: new Float32Array([0,0,1,0,0,1,0,0,1]), uvs: new Float32Array([0,0,1,0,0,1]) });
  const first = MeshDocumentAdapter.fromMesh(mesh(0)), second = MeshDocumentAdapter.fromMesh(mesh(10));
  first.replaceMesh({ ...first.mesh(), positions: new Float32Array([2,0,0, 3,0,0, 2,1,0]) }, "object-edit", { translation: [2,0,0] });
  first.commitSelection(["mesh-face:0"]);
  const adapters = [first, second], docs = adapters.map((adapter) => adapter.document());
  const result = createAnalysisResultEnvelope({ resultId: "prj15-historical", status: "numerical", provenance: { source: viewerSourceFromDocument(docs[0]!), operation: { type: "mesh.area", algorithm: "fixture", algorithmVersion: "1", parameters: {} }, numericContext: { tolerance: { absolute: 0.001 } }, engine: { name: "historical-offline-engine", version: "1" }, elapsedMs: 1 }, summary: { area: 0.5 }, warnings: [], diagnostics: [], artifacts: [] });
  const project = createMath3DProject(createMixedWorkspaceDocument({ entries: adapters.map((adapter) => { const replay = adapter.replayBundle(); return { module: "mesh", checkpoint: replay.checkpoint.document, expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }; }), activeDocumentIds: docs.map((document) => document.identity.id), constructions: [], results: [result], relations: [], artifacts: [], committedSelection: null }), { title: "Verified Mesh transfer", stableKey: "prj15-transfer" });
  const resources = captureProjectResources(project, (item) => { for (const adapter of adapters) { const bytes = adapter.resources.bytes(item.reference as never); if (bytes) return bytes; } return null; });
  return { project, docs, result, raw: exportProjectPackage(project, resources) };
};
export const inspectMeshPackage = (raw: string) => {
  const { project, resources } = parseProjectPackage(raw), store = resources.meshStore(project);
  return project.workspace.entries.map((entry) => {
    const state = entry.replay ? meshReplayState(entry.replay.payload as never) : null;
    const document = state?.document ?? entry.checkpoint;
    if (document.format !== "math3d.mesh-document") throw new Error("Expected Mesh fixture.");
    const buffers = store.resolve(document.source.resource)!;
    return { document, selection: state?.committedSelection.entityIds ?? [], positions: [...buffers.positions], normals: [...buffers.normals ?? []], uvs: [...buffers.uvs ?? []], resourceCount: projectResourceInventory(project).length };
  });
};

export const pointResourceFixture = () => {
  const preset = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "prj15-browser-data"), store = new Graph2DPointTableStore();
  for (const sidecar of preset.sidecars) store.publish(sidecar.rows);
  const project = createMath3DProject(createGraph2DWorkspaceProject(preset.document), { stableKey: "prj15-browser-data" });
  const resources = captureProjectResources(project, (item) => new TextEncoder().encode(canonicalJsonStringify(store.resolve(item.reference as never)!)));
  return { project, raw: exportProjectPackage(project, resources) };
};
