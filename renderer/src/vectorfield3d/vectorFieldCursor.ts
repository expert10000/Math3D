import { matchesScientificSourceGeneration, scientificPointWithinBounds,
  vectorField3DSliceCoordinates, viewerSourceFromDocument,
  type AdapterFrame, type ValidationResult, type VectorField3DDocument } from "@math3d/core";
import type { CursorProjection, ProjectCursorDraft, ProjectScientificCursor } from "../components/scientificCursor";

/** The first Field cursor mapping has an explicit physical coordinate frame. */
export const VECTOR3D_CURSOR_FRAME: AdapterFrame = {
  kind: "cartesian", frameId: "field-meters", axes: [
    { name: "x", dimension: "length", unit: "m" },
    { name: "y", dimension: "length", unit: "m" },
    { name: "z", dimension: "length", unit: "m" },
  ],
};

const sameFrame = (frame: AdapterFrame): boolean =>
  frame.kind === VECTOR3D_CURSOR_FRAME.kind && frame.frameId === VECTOR3D_CURSOR_FRAME.frameId &&
  frame.axes.length === 3 && frame.axes.every((axis, index) => {
    const expected = VECTOR3D_CURSOR_FRAME.axes[index];
    return axis.name === expected?.name && axis.dimension === expected.dimension && axis.unit === expected.unit;
  });

export const vectorFieldCursorAvailability = (document: VectorField3DDocument,
  position: readonly number[]): string | null => {
  if (!document.source.axes.every((axis, index) => axis.role === VECTOR3D_CURSOR_FRAME.axes[index]?.name && axis.unit === "m"))
    return "Cursor linking requires x, y, z axes in metres.";
  if (position.length !== 3 || !position.every(Number.isFinite) ||
      !scientificPointWithinBounds(position as [number, number, number], document.source.axes))
    return "Cursor point is outside the field domain.";
  if (document.source.field.kind === "scientific-bundle" && position.some((value, axis) =>
    !vectorField3DSliceCoordinates(document, axis as 0 | 1 | 2).some(sample => Math.abs(sample - value) <= 1e-9)))
    return "Cursor point is not an exact verified lattice coordinate.";
  return null;
};

export function vectorFieldCursorDraft(document: VectorField3DDocument, position: readonly number[],
  originViewId: string, mode: ProjectCursorDraft["mode"] = "locked"
): ValidationResult<ProjectCursorDraft> {
  const reason = vectorFieldCursorAvailability(document, position);
  if (reason) return { ok: false, errors: [reason] };
  return { ok: true, value: { source: viewerSourceFromDocument(document), sourceModule: "vector3d",
    frame: VECTOR3D_CURSOR_FRAME, position: [...position], resourceSha256: null,
    mode, originViewId } };
}

/** Exact same-document projection for the Field viewer; no coordinate transform is inferred. */
export function projectVectorFieldCursor(cursor: ProjectScientificCursor, document: VectorField3DDocument
): CursorProjection<readonly [number, number, number]> {
  if (cursor.sourceModule !== "vector3d" ||
      !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(document)) ||
      !sameFrame(cursor.frame))
    return { status: "incompatible-source", reason: "Field source revision or declared frame differs." };
  const reason = vectorFieldCursorAvailability(document, cursor.position);
  if (reason) return { status: "outside", reason };
  return { status: "matched", value: cursor.position as [number, number, number] };
}
