import { canonicalJsonStringify, sampleVectorField3DAnalyticLine,
  type Graph2DAnalyticFieldOrigin, type Graph2DPointRow, type Graph2DProbe,
  type ValidationResult, type VectorField3DDocument } from "@math3d/core";
import type { CursorProjection, ProjectCursorDraft, ProjectScientificCursor } from "../components/scientificCursor";
import { VECTOR3D_CURSOR_FRAME, vectorFieldCursorDraft } from "../vectorfield3d/vectorFieldCursor";

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

/** Re-sample the current Field source before returning an exact selected Graph row. */
export function graphAnalyticRowCursorDraft(probe: Graph2DProbe, objectId: string,
  origin: Graph2DAnalyticFieldOrigin, rows: readonly Graph2DPointRow[] | null,
  currentField: VectorField3DDocument): ValidationResult<ProjectCursorDraft> {
  if (!probe.rowId || probe.objectId !== objectId || !rows)
    return { ok: false, errors: ["Select a saved Graph row on the analytic Field line."] };
  const row = rows.find(item => item.id === probe.rowId);
  if (!row || row.y === null || !near(probe.x, row.x) || !near(probe.y, row.y))
    return { ok: false, errors: ["Selected Graph point is not an exact finite saved row."] };
  if (origin.documentId !== currentField.identity.id || origin.revision !== currentField.identity.revision ||
      origin.structuralHash !== currentField.identity.structuralHash)
    return { ok: false, errors: ["Analytic Field source has changed since this Graph line was saved."] };
  if (origin.fixedCoordinates.length !== 3 || origin.fixedCoordinates[origin.varyingAxis] !== null ||
      origin.fixedCoordinates.some((value, axis) => axis !== origin.varyingAxis &&
        (value === null || !Number.isFinite(value))))
    return { ok: false, errors: ["Graph line has invalid fixed coordinates."] };
  const point = origin.fixedCoordinates.map((value, axis) => axis === origin.varyingAxis ? row.x : value) as
    [number, number, number];
  try {
    const fresh = sampleVectorField3DAnalyticLine(currentField, origin.component, origin.varyingAxis, point);
    if (canonicalJsonStringify(fresh.origin) !== canonicalJsonStringify(origin) ||
        canonicalJsonStringify(fresh.rows) !== canonicalJsonStringify(rows))
      return { ok: false, errors: ["Saved Graph line differs from the current Field calculation."] };
  } catch (cause) { return { ok: false, errors: [cause instanceof Error ? cause.message : String(cause)] }; }
  return vectorFieldCursorDraft(currentField, point, "graphs-analytic-line");
}
