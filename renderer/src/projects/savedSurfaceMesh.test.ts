import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createSurfaceDocument } from "@math3d/core";
import { additionalRepresentationFixture } from "../../../tests/fixtures/unified-projects/additionalRepresentations";
import { createSavedSurfaceMesh, savedSurfaceMeshLinks } from "./savedSurfaceMesh";
import { AdditionalProjectSession } from "./additionalProjectSession";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { surfaceEditorSeed, surfaceSourceFromEditor } from "./nativeProjectRestore";

const savedSurfaceFixture = () => {
  const f = additionalRepresentationFixture(), surface = f.docs.find(d => d.format === "math3d.surface-document" && d.source.representation === "weierstrass")!;
  if (surface.format !== "math3d.surface-document") throw Error();
  const entry = f.project.workspace.entries.find(e => e.expected.id === surface.identity.id)!;
  const workspace = createMixedWorkspaceDocument({ ...f.project.workspace, entries: [entry], activeDocumentIds: [surface.identity.id] });
  const context = { documents: new Map([[surface.identity.id, surface]]) };
  return { surface, workspace, context, session: new AdditionalProjectSession(entry, surface, () => context) };
};
describe("saved Surface to Mesh", () => {
  it("retains the exact native custom source, ranges and units when creating and refreshing portable meshes", () => {
    const surface = createSurfaceDocument({ stableKey: "native-custom-mesh", metadata: { title: "Custom saddle" }, source: {
      representation: "parametric", definition: { familyId: "custom", expressions: { x: "u", y: "v", z: "u*v" } },
      domain: { kind: "parameter", u: { min: -2, max: 2, periodic: false }, v: { min: -1, max: 1, periodic: false } },
      parameters: {}, units: { length: "m" }, orientation: { sign: 1 }, branchPolicy: null,
    } });
    const workspaceBefore = createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
    const adapter = new SurfaceDocumentAdapter(surface), seed = surfaceEditorSeed(surface);
    const first = createSavedSurfaceMesh(workspaceBefore, surface, { documents: new Map([[surface.identity.id, surface]]) });
    const originalPositions = Array.from(first.adapter.mesh().positions);
    expect(Math.min(...originalPositions.filter((_, index) => index % 3 === 0))).toBe(-2);
    expect(Math.max(...originalPositions.filter((_, index) => index % 3 === 2))).toBe(2);
    expect(first.adapter.document().source.origin).toMatchObject({ units: { length: "m" } });
    adapter.commitSource(surfaceSourceFromEditor(surface.source, { ...seed, z: "2*u*v" }, seed));
    expect(savedSurfaceMeshLinks(first.workspace, adapter.document(), new Map([[first.adapter.document().identity.id, first.adapter]]))[0].current).toBe(false);
    const current = adapter.document(), workspace = createMixedWorkspaceDocument({ ...first.workspace, entries: first.workspace.entries.map(entry => entry.expected.id === surface.identity.id ? { ...entry, checkpoint: current, expected: current.identity, replay: null } : entry) });
    const next = createSavedSurfaceMesh(workspace, current, { documents: new Map([[surface.identity.id, current]]) });
    expect(Math.max(...Array.from(next.adapter.mesh().positions).filter((_, index) => index % 3 === 2))).toBe(4);
    expect(Array.from(first.adapter.mesh().positions)).toEqual(originalPositions);
    expect(next.workspace.relations.at(-1)?.sources[0]).toMatchObject({ documentId: current.identity.id, revision: current.identity.revision, structuralHash: current.identity.structuralHash });
    expect(savedSurfaceMeshLinks(next.workspace, current, new Map([first.adapter, next.adapter].map(mesh => [mesh.document().identity.id, mesh]))).map(link => link.current)).toEqual([false, true]);
    const exportedProject = createMath3DProject(next.workspace, { stableKey: "native-custom-mesh-transfer" }), resources = captureProjectResources(exportedProject, item => first.adapter.resources.bytes(item.reference as never) ?? next.adapter.resources.bytes(item.reference as never));
    const parsed = parseProjectPackage(exportProjectPackage(exportedProject, resources));
    expect(parsed.resources.meshStore(parsed.project).resolve(next.adapter.document().source.resource)?.positions).toEqual(next.adapter.mesh().positions);
  });
  it("exports verified triangle buffers and exact lineage and keeps older generations on refresh", () => {
    const f = savedSurfaceFixture(), first = createSavedSurfaceMesh(f.workspace, f.surface, f.context), doc = first.adapter.document();
    expect(first.workspace.relations.at(-1)?.sources[0].structuralHash).toBe(f.surface.identity.structuralHash);
    expect(doc.source.resource.vertexCount).toBe(1089);
    const duplicate = createSavedSurfaceMesh(first.workspace, f.surface, f.context); expect(duplicate.existing).toBe(true); expect(duplicate.workspace).toEqual(first.workspace);
    const project = createMath3DProject(first.workspace, { stableKey: "saved-mesh-test" }), resources = captureProjectResources(project, item => first.adapter.resources.bytes(item.reference as never));
    const parsed = parseProjectPackage(exportProjectPackage(project, resources));
    expect(verifyMixedWorkspaceReplay(parsed.project.workspace).get(doc.identity.id)).toEqual(doc);
    expect(parsed.resources.meshStore(parsed.project).resolve(doc.source.resource)?.positions).toEqual(first.adapter.mesh().positions);
    f.session.commit({ ...f.surface.source, definition: { ...f.surface.source.definition, expressions: { g: "z", phi: "1" } } } as never);
    const current = f.session.document(); if (current.format !== "math3d.surface-document") throw Error();
    const workspace = createMixedWorkspaceDocument({ ...first.workspace, entries: first.workspace.entries.map(entry => entry.module === "surface" ? f.session.entry() : entry) });
    const second = createSavedSurfaceMesh(workspace, current, f.context);
    expect(second.adapter.document().identity.id).not.toBe(doc.identity.id); expect(second.workspace.entries).toHaveLength(3);
    const links = savedSurfaceMeshLinks(second.workspace, current, new Map([first.adapter, second.adapter].map(adapter => [adapter.document().identity.id, adapter])));
    expect(links.map(link => link.current)).toEqual([false, true]);
    expect(second.workspace.entries.find(entry => entry.expected.id === doc.identity.id)?.checkpoint).toEqual(doc);
  });
  it("creates a fresh snapshot after mesh edits and reuses that snapshot without overwriting the edit", () => {
    const f = savedSurfaceFixture(), first = createSavedSurfaceMesh(f.workspace, f.surface, f.context);
    first.adapter.replaceMesh({ ...first.adapter.mesh(), positions: first.adapter.mesh().positions.map(value => value * 2) });
    const changed = first.adapter.document(), workspace = createMixedWorkspaceDocument({ ...first.workspace, entries: first.workspace.entries.map(entry => entry.module === "mesh" ? { ...entry, checkpoint: changed, expected: changed.identity } : entry) });
    const refreshed = createSavedSurfaceMesh(workspace, f.surface, f.context);
    expect(refreshed.existing).toBe(false); expect(refreshed.adapter.document().identity.id).not.toBe(changed.identity.id);
    const again = createSavedSurfaceMesh(refreshed.workspace, f.surface, f.context);
    expect(again.existing).toBe(true); expect(again.adapter.document().identity.id).toBe(refreshed.adapter.document().identity.id);
    expect(again.workspace.entries.find(entry => entry.expected.id === changed.identity.id)?.checkpoint).toEqual(changed);
  });
});
