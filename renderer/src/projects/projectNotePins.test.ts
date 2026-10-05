import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createProjectNote, geometryDocumentFromSceneDocument,
  replaceGeometryDocumentSource, upsertMath3DProjectNote, type GeometryObject } from "@math3d/core";
import { createProjectNoteSelectionAnchor } from "./projectNoteTargets";
import { resolveGeometryProjectNotePins } from "./projectNotePins";

const object: GeometryObject = {
  id: "box", name: "Box", type: "box", params: { width: 2, height: 2, depth: 2 }, visible: true, material: {},
  transform: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 90 }, scale: { x: 2, y: 1, z: 1 } },
};
const document = geometryDocumentFromSceneDocument({ id: "notes-pins", title: "Pinned box", createdAt: 0, updatedAt: 0, objects: [object] });
const workspace = createMixedWorkspaceDocument({ entries: [{ module: "geometry" as const, checkpoint: document,
  expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [],
  results: [], relations: [], artifacts: [], committedSelection: null });
const initial = createMath3DProject(workspace, { stableKey: "notes-pin-project", title: "Pinned study" });
const anchor = createProjectNoteSelectionAnchor(workspace, { module: "geometry", documentId: document.identity.id,
  objectId: "box", localPosition: [1, 0, 0] });
const note = createProjectNote({ projectId: initial.identity.id, stableKey: "box-note", kind: "pinned",
  title: "Box observation", body: "Observe the box.", anchor, createdAt: 1 });
const project = upsertMath3DProjectNote(initial, note);

describe("NTS05 Project Note viewer pins", () => {
  it("places a current local anchor using the visible object's scale, rotation and translation", () => {
    const pins = resolveGeometryProjectNotePins(project, document, [object]);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.position.x).toBeCloseTo(1);
    expect(pins[0]!.position.y).toBeCloseTo(4);
    expect(pins[0]!.position.z).toBeCloseTo(3);
    expect(resolveGeometryProjectNotePins(project, document, [{ ...object, visible: false }])).toEqual([]);
  });

  it("follows transforms but omits stale, missing and unsupported anchors", () => {
    const moved = replaceGeometryDocumentSource(document, { ...document.source, objects: [{ ...document.source.objects[0]!,
      transform: { ...document.source.objects[0]!.transform, position: { x: 5, y: 2, z: 3 } } }] });
    expect(resolveGeometryProjectNotePins(project, moved, [{ ...object,
      transform: { ...object.transform, position: { x: 5, y: 2, z: 3 } } }])[0]!.position.x).toBeCloseTo(5);
    const resized = replaceGeometryDocumentSource(moved, { ...moved.source, objects: [{ ...moved.source.objects[0]!,
      params: { width: 3, height: 2, depth: 2 } }] });
    expect(resolveGeometryProjectNotePins(project, resized, [object])).toEqual([]);
    expect(resolveGeometryProjectNotePins(project, moved, [])).toEqual([]);
  });
});
