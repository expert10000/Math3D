import * as THREE from "three";
import { geometryObjectShape, inspectProjectNoteAnchor, viewerSourceFromDocument,
  type GeometryDocument, type GeometryObject, type Math3DProject } from "@math3d/core";

export type ProjectNoteViewerMode = "off" | "pins" | "labels" | "all";
export type ProjectNotePin = Readonly<{
  noteId: string;
  title: string;
  position: { x: number; y: number; z: number };
}>;

/** Only exact, current Geometry object-local anchors are eligible for viewport placement. */
export function resolveGeometryProjectNotePins(
  project: Math3DProject | null,
  document: GeometryDocument,
  objects: readonly GeometryObject[],
): ProjectNotePin[] {
  if (!project?.notes?.length) return [];
  const source = viewerSourceFromDocument(document);
  const byId = new Map(objects.filter((object) => object.visible).map((object) => [object.id, object]));
  const pins: ProjectNotePin[] = [];
  for (const note of project.notes) {
    const anchor = note.anchor;
    if (anchor?.kind !== "object-local" || anchor.source.documentId !== document.identity.id) continue;
    const object = byId.get(anchor.objectId);
    if (!object) continue;
    const inspection = inspectProjectNoteAnchor(note, {
      projectId: project.identity.id,
      source: (id) => id === document.identity.id ? source : null,
      objectShape: (id, objectId) => id === document.identity.id ? geometryObjectShape(document, objectId) : null,
    });
    if (inspection.status !== "current") continue;
    const transform = object.transform;
    const point = new THREE.Vector3(...anchor.localPosition)
      .multiply(new THREE.Vector3(
        Math.max(1e-6, transform.scale.x), Math.max(1e-6, transform.scale.y), Math.max(1e-6, transform.scale.z),
      ))
      .applyEuler(new THREE.Euler(
        transform.rotation.x * Math.PI / 180,
        transform.rotation.y * Math.PI / 180,
        transform.rotation.z * Math.PI / 180,
        "XYZ",
      ))
      .add(new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z));
    pins.push({ noteId: note.identity.id, title: note.title,
      position: { x: point.x, y: point.y, z: point.z } });
  }
  return pins;
}
