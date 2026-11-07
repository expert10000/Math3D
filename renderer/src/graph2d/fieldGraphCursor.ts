import type { Graph2DAnalyticFieldOrigin, Graph2DPointRow, Graph2DProbe } from "@math3d/core";
import type { CursorProjection, ProjectScientificCursor } from "../components/scientificCursor";
import { VECTOR3D_CURSOR_FRAME } from "../vectorfield3d/vectorFieldCursor";

const sameFrame = (cursor: ProjectScientificCursor): boolean =>
  cursor.frame.kind === VECTOR3D_CURSOR_FRAME.kind &&
  cursor.frame.frameId === VECTOR3D_CURSOR_FRAME.frameId &&
  cursor.frame.axes.length === 3 && cursor.frame.axes.every((axis, index) => {
    const expected = VECTOR3D_CURSOR_FRAME.axes[index];
    return axis.name === expected?.name && axis.dimension === expected.dimension && axis.unit === expected.unit;
  });
const near = (left: number, right: number): boolean =>
  Number.isFinite(left) && Number.isFinite(right) &&
  Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));

/** Only a recorded analytic Field line with one exact saved row can receive the cursor. */
export function projectFieldCursorToAnalyticLine(cursor: ProjectScientificCursor,
  origin: Graph2DAnalyticFieldOrigin, objectId: string,
  rows: readonly Graph2DPointRow[] | null): CursorProjection<Graph2DProbe> {
  if (cursor.sourceModule !== "vector3d" || !sameFrame(cursor) ||
      cursor.source.documentId !== origin.documentId || cursor.source.revision !== origin.revision ||
      cursor.source.generation !== origin.revision || cursor.source.structuralHash !== origin.structuralHash ||
      origin.xName !== VECTOR3D_CURSOR_FRAME.axes[origin.varyingAxis]?.name || origin.xUnit !== "m")
    return { status: "incompatible-source", reason: "Field source, revision, or physical frame differs from this Graph line." };
  if (cursor.position.length !== 3 || origin.fixedCoordinates.length !== 3 ||
      origin.fixedCoordinates.some((fixed, axis) => axis === origin.varyingAxis ? fixed !== null :
        fixed === null || !near(cursor.position[axis]!, fixed)))
    return { status: "outside", reason: "Field point is not on this Graph line's recorded plane." };
  if (!rows) return { status: "mismatched-grid", reason: "Saved Graph rows are unavailable." };
  const coordinate = cursor.position[origin.varyingAxis]!;
  const matches = rows.filter(row => near(row.x, coordinate));
  if (matches.length > 1) return { status: "ambiguous", reason: "More than one saved Graph row matches this coordinate." };
  const row = matches[0];
  if (!row || row.y === null || !Number.isFinite(row.y))
    return { status: "mismatched-grid", reason: "No finite exact saved Graph row exists at this coordinate." };
  return { status: "matched", value: { objectId, x: row.x, y: row.y, rowId: row.id } };
}
