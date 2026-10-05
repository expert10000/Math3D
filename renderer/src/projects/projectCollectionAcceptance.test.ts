import { it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeGraph2DDerivative, applyGraph2DAuthoring, createMixedWorkspaceDocument, replaceMath3DProjectWorkspace, serializeMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import raw from "./examples/samsung-projects.json?raw";
import { prepareProjectExampleCollection } from "./projectExampleCollection";
import { projectAnalysisAvailability } from "./projectAnalysisAvailability";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { inspectProjectCompatibility } from "./projectTransfer";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { capturedCurveSources } from "./capturedCurveSources";
import { AdditionalProjectSession } from "./additionalProjectSession";
import { nativeDocumentEditable, surfaceEditorSeed, surfaceSourceFromEditor } from "./nativeProjectRestore";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { loadLibraryProject, saveLibraryProject } from "./projectLibrary";

it("PRJ38 all 25 Samsung projects retain qualified analysis, custom edits, storage and portable resources", () => {
  const examples = prepareProjectExampleCollection(raw), audit: Record<string, unknown>[] = [];
  for (const example of examples) {
    const original = serializeMath3DProject(example.project), resolved = verifyMixedWorkspaceReplay(example.project.workspace);
    const availability = projectAnalysisAvailability(example.project, { resources: example.resources });
    expect(availability).toHaveLength(example.project.workspace.entries.length);
    let workspace = example.project.workspace;
    const newMeshes: MeshDocumentAdapter[] = [], exercised: string[] = [];
    if (!example.previewOnly) {
      // Each existing representation stays intact; a custom function is added through normal Graph authoring.
      const graphEntry = workspace.entries.find(entry => entry.module === "graph2d" && !example.project.metadata.documents?.[entry.expected.id]?.archived);
      const graph = graphEntry && resolved.get(graphEntry.expected.id);
      if (graph?.format === "math3d.graph2d-document" && graphEntry) {
        const adapter = graphEntry.replay ? Graph2DCommandAdapter.restore(graphEntry.replay.payload as never) : new Graph2DCommandAdapter(graph);
        const scene = applyGraph2DAuthoring(adapter.document(), { type: "create", draft: { label: "PRJ38 custom acceptance", expression: "x*x+1", domain: { min: -2, max: 2, includeMin: true, includeMax: true }, style: { color: "#2563eb", visible: true, lineStyle: "solid", lineWidth: 2 } } });
        adapter.commitScene(scene, "create"); const authored = adapter.document();
        expect(authored.source.objects.slice(0, graph.source.objects.length)).toEqual(graph.source.objects);
        adapter.undo(); expect(adapter.document().source).toEqual(graph.source); adapter.redo();
        const current = adapter.document(), replay = adapter.exportReplay();
        const result = analyzeGraph2DDerivative({ document: current, objectId: current.source.objects.at(-1)!.id, x: 1, order: 1 });
        expect(result.value).toBeCloseTo(2, 6);
        expect(result.publication.provenance.source).toMatchObject({ documentId: current.identity.id, revision: current.identity.revision, structuralHash: current.identity.structuralHash });
        workspace = createMixedWorkspaceDocument({ ...workspace, entries: workspace.entries.map(entry => entry.expected.id === current.identity.id ? { ...entry, checkpoint: replay.checkpoint.document, expected: current.identity, replay: { format: "math3d.graph2d-replay.v1", payload: replay as never } } : entry), results: [...workspace.results, result.publication] });
        exercised.push("custom Graph create/undo/redo and derivative");
      }
      // Qualify every advertised saved Surface/Mesh entry, including the broad mixed fixtures.
      for (const item of availability.filter(item => ["surface", "surface-mesh", "mesh"].includes(item.route ?? ""))) {
        const document = resolved.get(item.id)!;
        let adapter: MeshDocumentAdapter;
        if (document.format === "math3d.surface-document") {
          const context = { documents: resolved, resources: example.resources, capturedCurves: capturedCurveSources(workspace) };
          const mesh = createSavedSurfaceMesh(workspace, document, context); workspace = mesh.workspace; adapter = mesh.adapter; newMeshes.push(adapter);
        } else if (document.format === "math3d.mesh-document") {
          adapter = MeshDocumentAdapter.restore({ document, resourceBytes: example.resources.bytes({ kind: "mesh-buffers", id: document.source.resource.id })! });
        } else throw Error("Unsupported advertised saved Mesh route");
        for (const kind of ["quality", "curvature"] as const) workspace = appendSavedMeshAnalysis(workspace, analyzeSavedMesh(adapter, kind));
        exercised.push(`${item.module}:${item.id}:quality/curvature`);
      }
      // Projects containing only a Surface also exercise a custom mathematical source edit and retained replay.
      if (!graphEntry) {
        const entry = workspace.entries.find(entry => entry.module === "surface")!, document = resolved.get(entry.expected.id)!;
        if (document.format !== "math3d.surface-document") throw Error("Surface-only project expected");
        let editedEntry;
        if (nativeDocumentEditable(document)) {
          const adapter = entry.replay ? SurfaceDocumentAdapter.fromReplayBundle(entry.replay.payload as never) : new SurfaceDocumentAdapter(document), seed = surfaceEditorSeed(document);
          adapter.commitSource(surfaceSourceFromEditor(document.source, { ...seed, z: `(${seed.z})+0.01` }, seed));
          adapter.undo(); expect(adapter.document().source).toEqual(document.source); adapter.redo();
          const replay = adapter.replayBundle(); editedEntry = { ...entry, checkpoint: replay.checkpoint, expected: adapter.document().identity, replay: { format: "math3d.surface-replay.v1", payload: replay as never } };
        } else {
          const session = new AdditionalProjectSession(entry, document, () => ({ documents: resolved, resources: example.resources })), source = structuredClone(document.source);
          const field = source.representation === "weierstrass" ? "phi" : "formula";
          source.definition.expressions = { ...source.definition.expressions, [field]: `(${source.definition.expressions![field]})+0.01` };
          session.commit(source as never); session.undo(); expect(session.document().source).toEqual(document.source); session.redo(); editedEntry = session.entry();
        }
        workspace = createMixedWorkspaceDocument({ ...workspace, entries: workspace.entries.map(item => item.expected.id === entry.expected.id ? editedEntry : item) });
        exercised.push("custom Surface edit/undo/redo; retained historical analysis");
      }
    }
    const changed = updateMath3DProjectMetadata(replaceMath3DProjectWorkspace(example.project, workspace), { title: `${example.project.metadata.title} · acceptance` });
    const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    saveLibraryProject(storage, changed, 1);
    expect(loadLibraryProject(storage, changed.identity.id)).toEqual(changed);
    const resources = captureProjectResources(changed, item => (item.kind === "mesh-buffers" ? newMeshes.map(mesh => mesh.resources.bytes(item.reference as never)).find(bytes => !!bytes) : null) ?? example.resources.bytes(item), example.previewOnly);
    const transferred = parseProjectPackage(exportProjectPackage(changed, resources));
    expect(transferred.project).toEqual(changed);
    for (const originalResource of example.resources.sidecars()) expect(transferred.resources.bytes(originalResource)).toEqual(example.resources.bytes(originalResource));
    expect(transferred.project.workspace.results.slice(0, example.project.workspace.results.length)).toEqual(example.project.workspace.results);
    expect(serializeMath3DProject(example.project)).toBe(original);
    expect(inspectProjectCompatibility(transferred.project, { resources: transferred.resources }).canOpenWorkspace, example.project.metadata.title).toBe(!example.previewOnly);
    audit.push({ id: changed.identity.id, title: example.project.metadata.title, openable: !example.previewOnly, documents: availability.length, analysisRoutes: availability.filter(item => item.route).length, unavailable: availability.filter(item => !item.route).map(item => ({ id: item.id, reason: item.reason })), exercised, sourceResources: example.resources.sidecars().length, portableResources: resources.sidecars().length, originalPreserved: true, storeAndPackageRoundTrip: true });
  }
  expect(audit).toHaveLength(25);
  expect(audit.filter(item => item.openable)).toHaveLength(24);
  const directory = resolve("../output/projects-integration"); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "prj38-collection-audit.json"), JSON.stringify({ scope: "Desktop model acceptance; UI acceptance is separate", projects: audit }, null, 2));
}, 120_000);
