import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import type { Graph2DAnalyticFieldOrigin, Graph2DDomain } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { scientificPointWithinBounds } from "./scientificDatasetCoordinates";

export type VectorField3DAnalyticLine = Readonly<{
  label: string; rows: readonly Graph2DPointRow[]; domain: Graph2DDomain;
  origin: Graph2DAnalyticFieldOrigin; finiteCount: number;
}>;

/** Samples an authored expression field on a bounded 1D lattice through a physical point. */
export function sampleVectorField3DAnalyticLine(document: VectorField3DDocument,
  component: "p" | "q" | "r" | "speed", varyingAxis: 0 | 1 | 2,
  fixedCoordinates: readonly [number, number, number]): VectorField3DAnalyticLine {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const source = checked.value.source, field = source.field;
  if (field.kind !== "expressions") throw new TypeError("Choose an authored expression field.");
  if (component === "speed" && new Set(field.components.map(item => item.unit)).size !== 1)
    throw new TypeError("Magnitude line requires matching vector-component units.");
  if (![0, 1, 2].includes(varyingAxis) || !scientificPointWithinBounds(fixedCoordinates, source.axes))
    throw new RangeError("Line coordinates must be within the authored domain.");
  const axis = source.axes[varyingAxis], count = 129;
  const rows: Graph2DPointRow[] = Array.from({ length: count }, (_, index) => {
    const x = axis.min + (axis.max - axis.min) * index / (count - 1);
    const point = [...fixedCoordinates] as [number, number, number];
    point[varyingAxis] = x;
    const variables = { x: point[0], y: point[1], z: point[2] };
    const values = field.components.map(expression =>
      evaluateGraph2DExpression(expression.ast, variables, { maxEvaluations: 256 }));
    const vector = values.map(value => value.ok ? value.value : NaN);
    const y = component === "speed" ? Math.hypot(...vector) :
      vector[{ p: 0, q: 1, r: 2 }[component]]!;
    return { id: `row_${index + 1}`, x, y: Number.isFinite(y) ? y : null };
  });
  const finiteCount = rows.filter(row => row.y !== null).length;
  if (finiteCount < 2) throw new RangeError("This line has fewer than two finite samples.");
  const fixed = source.axes.map((item, index) => index === varyingAxis ? null :
    `${item.label}=${fixedCoordinates[index]} ${item.unit}`).filter(Boolean).join(", ");
  const unit = component === "speed" ? field.components[0].unit :
    field.components[{ p: 0, q: 1, r: 2 }[component]].unit;
  return {
    label: `${component.toUpperCase()} vs ${axis.label} (${fixed})`, rows, finiteCount,
    domain: { min: axis.min, max: axis.max, includeMin: true, includeMax: true },
    origin: { kind: "vector-field3d-expression-line", documentId: checked.value.identity.id,
      revision: checked.value.identity.revision, structuralHash: checked.value.identity.structuralHash,
      component, varyingAxis,
      fixedCoordinates: fixedCoordinates.map((value, index) => index === varyingAxis ? null : value),
      expressions: field.components.map(item => item.source) as [string, string, string],
      xName: axis.label, xUnit: axis.unit, yUnit: unit },
  };
}
