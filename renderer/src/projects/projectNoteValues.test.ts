import { expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createProjectNote, geometryDocumentFromSceneDocument, replaceGeometryDocumentSource,
  normalizeProjectNoteValueBindings, normalizeProjectNoteValueSnapshot, serializeProjectNote, parseProjectNote, updateProjectNote, viewerSourceFromDocument, structuralHash,
  createEmptyGraph2DDocument, createGraph2DDocument, advanceDocumentIdentity } from "@math3d/core";
import { projectNoteValueChoices, projectNoteRenderedBody, resolveProjectNoteValues } from "./projectNoteValues";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "./savedMeshAnalysis";

const geometry = () => geometryDocumentFromSceneDocument({ id: "live-notes-geometry", title: "Box", createdAt: 0, updatedAt: 0,
  objects: [{ id: "box", type: "box", name: "Box", params: { width: 2, height: 3, depth: 4 }, visible: true,
    material: { color: 0x3366ff, opacity: 1 }, transform: { position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }] });
const workspace = (doc = geometry()) => createMixedWorkspaceDocument({ entries: [{ module: "geometry", expected: doc.identity, checkpoint: doc, replay: null }], activeDocumentIds: [doc.identity.id], results: [], relations: [], artifacts: [], constructions: [], committedSelection: null });
const plain = () => createProjectNote({ projectId: createMath3DProject(workspace(), { stableKey: "live-notes" }).identity.id, stableKey: "values", kind: "text", title: "Coordinates", body: "x={{value:x}}; {{value:unknown}}", createdAt: 1 });

it("resolves exact coordinate IDs, reports edits and missing targets, and preserves frozen values across reopen", () => {
  const doc = geometry(), original = plain(), bytes = serializeProjectNote(original), binding = { id: "x", kind: "selection" as const, source: viewerSourceFromDocument(doc), objectId: "box", field: "position.x" as const };
  expect(original).not.toHaveProperty("valueBindings"); expect(serializeProjectNote(parseProjectNote(bytes))).toBe(bytes);
  const note = updateProjectNote(original, { valueBindings: [binding] }, 2);
  expect(projectNoteValueChoices(workspace(doc)).some(choice => choice.binding.kind === 'selection' && choice.binding.objectId === 'box')).toBe(true);
  expect(resolveProjectNoteValues(note, workspace(doc))[0]).toMatchObject({ value: 2, units: "unknown", status: "current" });
  const moved = replaceGeometryDocumentSource(doc, { ...doc.source, objects: [{ ...doc.source.objects[0]!, transform: { ...doc.source.objects[0]!.transform, position: { x: 7, y: 0, z: 0 } } }] });
  expect(projectNoteRenderedBody(note, workspace(moved))).toBe("x=7 unknown (stale); {{value:unknown}}");
  const frozen = updateProjectNote(note, { valueSnapshot: { capturedAt: 3, values: resolveProjectNoteValues(note, workspace(moved)) } }, 3);
  const removed = replaceGeometryDocumentSource(moved, { ...moved.source, objects: [] });
  expect(resolveProjectNoteValues(note, workspace(removed))[0].status).toBe('unavailable');
  expect(projectNoteRenderedBody(parseProjectNote(serializeProjectNote(frozen)), workspace(removed))).toBe("x=7 unknown (stale); {{value:unknown}}");
  expect(resolveProjectNoteValues(updateProjectNote(frozen, { valueSnapshot: null }, 4), workspace(removed))[0].status).toBe('unavailable');
});

it("resolves controlled parameters and exact saved-result hashes without evaluating text or following substitutions", () => {
  const empty = createEmptyGraph2DDocument('note-parameter');
  const graph = createGraph2DDocument({ stableKey: 'note-parameter', source: { ...empty.source, variables: [{ name: 'a', value: 2, control: { min: 0, max: 5, step: 0.1, unit: 'ratio' } }] } });
  const gw = (d = graph) => createMixedWorkspaceDocument({ ...workspace(), entries: [{ module: 'graph2d', expected: d.identity, checkpoint: d, replay: null }], activeDocumentIds: [d.identity.id] });
  const parameter = projectNoteValueChoices(gw())[0].binding;
  const note = updateProjectNote(plain(), { valueBindings: [{ ...parameter, id: 'x' }] }, 2);
  expect(resolveProjectNoteValues(note, gw())[0]).toMatchObject({ value: 2, units: 'ratio', status: 'current' });
  const nextSource = { ...graph.source, variables: [{ ...graph.source.variables[0], value: 3 }] };
  const changed = createGraph2DDocument({ ...graph, source: nextSource, identity: advanceDocumentIdentity(graph.identity, nextSource) });
  expect(resolveProjectNoteValues(note, gw(changed))[0]).toMatchObject({ value: 3, units: 'ratio', status: 'stale' });
  const mesh = MeshDocumentAdapter.fromMesh({ label: 'Square', positions: Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]), indices: Uint32Array.from([0,1,2,1,3,2]), source: { kind: 'bakedFromParam' } });
  const result = analyzeSavedMesh(mesh, 'edge-path', { start: 0, end: 3 }), d = mesh.document();
  const rw = createMixedWorkspaceDocument({ ...workspace(), entries: [{ module: 'mesh', checkpoint: d, expected: d.identity, replay: null }], activeDocumentIds: [d.identity.id], results: [result] });
  const retained = updateProjectNote(plain(), { valueBindings: [{ id: 'x', kind: 'result', source: result.provenance.source, resultId: result.resultId, resultHash: structuralHash(result), field: 'length' }] }, 2);
  expect(resolveProjectNoteValues(retained, rw)[0]).toMatchObject({ value: 2, status: 'current' });
  expect(resolveProjectNoteValues(retained, { ...rw, results: [{ ...result, summary: { ...result.summary, length: 99 } }] })[0].status).toBe('unavailable');
  expect(resolveProjectNoteValues(retained, null)[0].status).toBe('unavailable');
  expect(() => normalizeProjectNoteValueBindings([{ ...retained.valueBindings![0], field: '__proto__.x' }])).toThrow();
  expect(() => normalizeProjectNoteValueBindings(Array.from({ length: 17 }, (_, index) => ({ ...retained.valueBindings![0], id: `v${index}` })))).toThrow(/16/);
  expect(() => normalizeProjectNoteValueSnapshot({ capturedAt: 5, values: [{ id: 'x', value: Infinity, units: 'm', status: 'current', source: result.provenance.source }] }, retained.valueBindings!)).toThrow();
});
