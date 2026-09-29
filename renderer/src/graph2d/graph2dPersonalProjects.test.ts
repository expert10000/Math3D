import { expect, it } from "vitest";
import { forkGraph2DWorkspaceProject, createGraph2DWorkspaceProject, createMixedWorkspaceDocument, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, promoteGraph2DToCurve, revolveGraph2DProfile, analyzeGraph2DDerivative, parseGraph2DProjectFavorites,
  emptyGraph2DProjectFavorites, toggleGraph2DProjectFavorite, serializeMixedWorkspaceDocument, parseMixedWorkspaceDocument, type Graph2DDocument } from "@math3d/core";
import { copyPersonalGraphProject, listPersonalGraphProjects, resumeGraphGalleryCheckpoint } from "./graph2dGallerySession";
it("forks all companion identities, keeps original result provenance and source independence", () => {
  const doc = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "copy").document;
  const curve = promoteGraph2DToCurve(doc, doc.source.objects[0]!.id), surface = revolveGraph2DProfile(doc, doc.source.objects[0]!.id, { axis: "x", orientation: "positive" });
  const result = analyzeGraph2DDerivative({ document: doc, objectId: doc.source.objects[0]!.id, x: 1, order: 1 }).publication;
  const original = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(doc), entries: [
    ...createGraph2DWorkspaceProject(doc).entries, ...[curve, surface].map(p => ({ module: p.document.format === "math3d.curve-document" ? "curve" as const : "surface" as const,
      checkpoint: p.document, expected: p.document.identity, replay: null }))], results: [result], relations: [curve.relation, surface.relation] });
  const bytes = serializeMixedWorkspaceDocument(original), copy = forkGraph2DWorkspaceProject(original, "fresh", "My reusable graph");
  expect(copy.entries).toHaveLength(3); for (let i = 0; i < 3; i++) expect(copy.entries[i]!.expected.id).not.toBe(original.entries[i]!.expected.id);
  const copiedGraph = copy.entries[0]!.checkpoint as Graph2DDocument;
  expect(copiedGraph.source).toEqual(doc.source); expect(copiedGraph.display).toEqual(doc.display);
  expect(copy.entries[2]!.checkpoint.source).toMatchObject({ definition: { sourceIds: [copiedGraph.identity.id, doc.source.objects[0]!.id] } });
  expect(copy.results[0]!.summary).toEqual(result.summary); expect(copy.results[0]!.provenance.operation.parameters.copiedObservationOf).toEqual({ resultId: result.resultId, source: result.provenance.source });
  expect(copy.results[0]!.warnings).toContain("Copied observation; not recomputed. Original result/source generation retained in copiedObservationOf.");
  expect(copy.relations.find(r => r.operation === "graph2d.personal-copy")!.sources[0]!.documentId).toBe(doc.identity.id);
  expect(parseMixedWorkspaceDocument(serializeMixedWorkspaceDocument(copy))).toEqual(copy); expect(serializeMixedWorkspaceDocument(original)).toBe(bytes);
});
it("uses existing checkpoints and rolls back failed reusable saves before switching projects", () => {
  const doc = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "stored").document, workspace = createGraph2DWorkspaceProject(doc);
  const values = new Map<string,string>(); let fail = false;
  const storage = { getItem: (k:string) => values.get(k) ?? null, removeItem: (k:string) => { values.delete(k); },
    setItem: (k:string,v:string) => { if (fail && k === "math3d.mixed-workspace.v1") { fail = false; throw new Error("quota"); } values.set(k,v); } };
  const first = copyPersonalGraphProject(() => workspace, doc.identity.id, "copy1", "First copy", storage);
  const id = first.entries[0]!.expected.id;
  expect(listPersonalGraphProjects(storage,id,"First copy").map(p=>p.id)).toContain(doc.identity.id);
  expect(resumeGraphGalleryCheckpoint(() => first,doc.identity.id,storage).entries).toEqual(workspace.entries);
  const before = [...values]; fail=true;
  expect(()=>copyPersonalGraphProject(()=>workspace,doc.identity.id,"copy2","Failed copy",storage)).toThrow("quota"); expect([...values].sort()).toEqual(before.sort());
});
it("favorites contain only bounded validated project references", () => {
  const d=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!,"favorite").document;
  const favorites=toggleGraph2DProjectFavorite(emptyGraph2DProjectFavorites(),d.identity.id);
  expect(parseGraph2DProjectFavorites(JSON.stringify(favorites))).toEqual(favorites); expect(toggleGraph2DProjectFavorite(favorites,d.identity.id).ids).toEqual([]);
  expect(()=>parseGraph2DProjectFavorites(JSON.stringify({...favorites,ids:[d.identity.id,d.identity.id]}))).toThrow();
  expect(()=>toggleGraph2DProjectFavorite(favorites,"preset-id")).toThrow();
});
