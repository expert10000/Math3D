import { expect, it } from "vitest";
import { createSurfaceDocument, createMixedWorkspaceDocument, createMath3DProject, type CanonicalJsonValue } from "@math3d/core";
import { createSurfaceStudySweep, parseSweepValues } from "./surfaceStudySweep";
import { savedSurfaceMeshLinks, savedMeshSurfaceSource } from "./savedSurfaceMesh";
import { surfaceStudySource } from "./surfaceStudyPresets";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay, MIXED_REPLAY_FORMATS } from "../kernel/mixedWorkspaceReplay";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { savedStudyComparisonReport, compareSavedMeshStudies, savedStudyComparisonCsv } from "./savedStudyComparison";
import { savedMeshCurvatureReport } from "./savedMeshExploration";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";

const fixture = () => {
  const surface = createSurfaceDocument({ stableKey: "named-study-sweep", metadata: { title: "Custom original" }, source: {
    representation: "parametric", definition: { familyId: "custom", expressions: { x: "u", y: "v", z: "u*v" } }, domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
    units: { length: "m" }, parameters: {}, orientation: { sign: 1 }, branchPolicy: null } });
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", expected: surface.identity, checkpoint: surface, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
  return { surface, workspace, context: { documents: new Map([[surface.identity.id, surface]]) } };
};

it("retains independent Helicoid and Catenoid variants, precise lineage and bounded interior measurements without editing the source", async () => {
  for (const preset of ["helicoid", "catenoid"] as const) {
    const f = fixture(), before = JSON.stringify(f.workspace);
    const next = await createSurfaceStudySweep(f.workspace, f.surface, f.context, preset, [1.5, .5, 1], 17);
    expect(JSON.stringify(f.workspace)).toBe(before); expect(next.workspace.entries).toHaveLength(7); expect(next.workspace.results).toHaveLength(3);
    const adapters = new Map(next.meshes.map(adapter => [adapter.document().identity.id, adapter]));
    const links = savedSurfaceMeshLinks(next.workspace, f.surface, adapters);
    expect(links.map(link => link.studyRun!.value)).toEqual([.5, 1, 1.5]);
    for (let i = 0; i < links.length; i++) {
      expect(links[i].studyRun!.interior.count).toBe(15 ** 2); expect(links[i].studyRun!.interior.excluded).toBe(64);
      expect(links[i].studyRun!.interior.averageK).toBeLessThan(0); expect(links[i].studyRun!.interior.averageAbsH).toBeLessThan(.2);
      expect(next.surfaces[i].source).toEqual(surfaceStudySource(f.surface.source, preset, links[i].studyRun!.value));
      const parent = savedMeshSurfaceSource(next.workspace, links[i].id)!;
      expect(parent.document!.identity).toEqual(next.surfaces[i].identity); expect(parent.current).toBe(true);
      expect(parent.generation).toEqual(links[i].surfaceGeneration); expect(links[i].current).toBe(true);
    }
    const repeated = await createSurfaceStudySweep(next.workspace, f.surface, { documents: verifyMixedWorkspaceReplay(next.workspace) }, preset, [.5, 1, 1.5], 17);
    expect(repeated.workspace).toEqual(next.workspace); expect(repeated.meshes.map(mesh => mesh.document().identity)).toEqual(next.meshes.map(mesh => mesh.document().identity));
    const source = new SurfaceDocumentAdapter(f.surface); source.commitSource(surfaceStudySource(f.surface.source, preset, 2));
    const changed = createMixedWorkspaceDocument({ ...next.workspace, entries: next.workspace.entries.map(entry => entry.expected.id === f.surface.identity.id ? { ...entry, expected: source.document().identity, checkpoint: source.document(), replay: null } : entry) });
    expect(savedSurfaceMeshLinks(changed, source.document(), adapters).every(link => !link.current)).toBe(true);
  }
});

it("named Mesh runs preserve generations/results through undo, replay, project resources and report exports", async () => {
  const f = fixture(), next = await createSurfaceStudySweep(f.workspace, f.surface, f.context, "helicoid", [.5, 1], 17);
  const adapter = next.meshes[0], generation = adapter.sourceGeneration(), name = "=Helicoid pitch 0.5 · coarse";
  adapter.rename(name); expect(adapter.sourceGeneration()).toEqual(generation); expect(adapter.document().metadata.label).toBe(name);
  adapter.undo(); expect(adapter.document().metadata.label).not.toBe(name); adapter.redo();
  const replay = adapter.replayBundle(), workspace = createMixedWorkspaceDocument({ ...next.workspace, entries: next.workspace.entries.map(entry => entry.expected.id === generation.documentId ? { ...entry, checkpoint: replay.checkpoint.document, replay: { format: MIXED_REPLAY_FORMATS.mesh, payload: replay as unknown as CanonicalJsonValue } } : entry) });
  const project = createMath3DProject(workspace, { stableKey: "named-runs-transfer" }), resources = captureProjectResources(project, item => next.meshes.map(mesh => mesh.resources.bytes(item.reference as never)).find(bytes => bytes !== null) ?? null);
  const parsed = parseProjectPackage(exportProjectPackage(project, resources)), documents = verifyMixedWorkspaceReplay(parsed.project.workspace);
  const meshes = new Map(next.meshes.map(mesh => { const doc = documents.get(mesh.document().identity.id)!; if (doc.format !== "math3d.mesh-document") throw Error(); return [doc.identity.id, new MeshDocumentAdapter(doc, parsed.resources.meshStore(parsed.project))]; }));
  expect(meshes.get(generation.documentId)!.document().metadata.label).toBe(name);
  const snapshots = savedSurfaceMeshLinks(parsed.project.workspace, f.surface, meshes).map(choice => { const mesh = meshes.get(choice.id)!.mesh(); return { choice, mesh, report: savedMeshCurvatureReport(mesh) }; });
  const comparison = compareSavedMeshStudies(snapshots[0], snapshots[1], "H"), report = savedStudyComparisonReport(comparison);
  expect(report.studies[0].title).toBe(name); expect(report.studies[0].studyRun!.value).toBe(.5);
  expect(report.studies[0].meshSource).toEqual(generation); expect(report.studies[0].savedResults).toEqual([next.workspace.results[0]]);
  expect(savedStudyComparisonCsv(comparison)).toContain("'=Helicoid pitch 0.5");
  const restored = MeshDocumentAdapter.restoreReplay(adapter.exportReplay()); expect(restored.document().metadata.label).toBe(name); restored.undo(); expect(restored.document().metadata.label).not.toBe(name);
});

it("rejects empty, duplicate, unsupported and unbounded sweep inputs before producing any variants", async () => {
  const f = fixture(), before = JSON.stringify(f.workspace);
  for (const raw of ["", "1", "1,1", "1,", "0,1", "NaN,1", "1,101", "1,2,3,4,5,6"]) expect(() => parseSweepValues(raw)).toThrow();
  expect(parseSweepValues("1.5, .5, 1")).toEqual([.5, 1, 1.5]);
  await expect(createSurfaceStudySweep(f.workspace, f.surface, f.context, "helicoid", [1, 1], 17)).rejects.toThrow("distinct");
  await expect(createSurfaceStudySweep(f.workspace, f.surface, f.context, "helicoid", [1, 2], 18 as never)).rejects.toThrow("17, 33 or 65");
  expect(JSON.stringify(f.workspace)).toBe(before); expect(savedMeshSurfaceSource(f.workspace, "unknown-mesh")).toBeNull();
});

it("failed numerical variants leave the original workspace unchanged, and an edited run gets a separate replacement", async () => {
  const f = fixture(), before = JSON.stringify(f.workspace);
  await expect(createSurfaceStudySweep(f.workspace, f.surface, f.context, "catenoid", [1e-320, 1], 17)).rejects.toThrow();
  expect(JSON.stringify(f.workspace)).toBe(before);
  const first = await createSurfaceStudySweep(f.workspace, f.surface, f.context, "helicoid", [.5, 1], 17);
  const mesh = first.meshes[0]; mesh.replaceMesh({ ...mesh.mesh(), positions: mesh.mesh().positions.map(value => value * 2) });
  const changed = createMixedWorkspaceDocument({ ...first.workspace, entries: first.workspace.entries.map(entry => entry.expected.id === mesh.document().identity.id ? { ...entry, expected: mesh.document().identity, checkpoint: mesh.document(), replay: null } : entry) });
  const renewed = await createSurfaceStudySweep(changed, f.surface, { documents: verifyMixedWorkspaceReplay(changed) }, "helicoid", [.5, 1], 17);
  expect(renewed.meshes[0].document().identity.id).not.toBe(mesh.document().identity.id);
  expect(renewed.workspace.entries.find(entry => entry.expected.id === mesh.document().identity.id)!.checkpoint).toEqual(mesh.document());
  expect(renewed.workspace.entries).toHaveLength(6); expect(renewed.workspace.results).toHaveLength(3);
});
