import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { parseMath3DProject, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { reviewProjectDerivedField } from "./projectDerivedFields";
import type { DerivedFieldDocument, DerivedFieldInput } from "./derivedFieldDocument";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
type Matrix3 = readonly [Vec3, Vec3, Vec3];
export type DerivedFieldValue = number | Vec3 | Matrix3;
export const DERIVED_FIELD_MAX_EVALUATIONS = 262_144;
export type DerivedFieldEvaluator = Readonly<{ source: DerivedFieldDocument;
  unit: string; sample: (point: Vec3) => DerivedFieldValue | null;
  evaluations: () => number; maxEvaluations: number }>;

const vector = (value: DerivedFieldValue): Vec3 => {
  if (!Array.isArray(value) || value.length !== 3 || value.some(item => typeof item !== "number"))
    throw new TypeError("Expected a vector field value.");
  return value as Vec3;
};
const scalar = (value: DerivedFieldValue): number => {
  if (typeof value !== "number") throw new TypeError("Expected a scalar field value.");
  return value;
};
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]];

/** Evaluates a current analytic DAG with bounded source calls; verified bundles use their own sampler. */
export function compileProjectDerivedFieldEvaluator(project: Math3DProject, id: string,
  maxEvaluations = DERIVED_FIELD_MAX_EVALUATIONS): DerivedFieldEvaluator {
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 ||
      maxEvaluations > DERIVED_FIELD_MAX_EVALUATIONS)
    throw new RangeError("Derived field evaluation cap is out of range.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const review = reviewProjectDerivedField(current, id,
    source => source.source.field.kind === "expressions");
  if (review.status !== "current") throw new TypeError(`Derived source ${review.status}.`);
  const byId = new Map<string, DerivedFieldDocument>((current.workspace.derivedFields ?? []).map(item =>
    [item.identity.id, item]));
  const sourceById = new Map<string, VectorField3DDocument>();
  for (const entry of current.workspace.entries) if (entry.module === "vector3d" &&
      entry.checkpoint.format === "math3d.vector-field3d-document")
    sourceById.set(entry.expected.id, entry.checkpoint);
  const root = byId.get(id)!;
  let evaluations = 0;
  const sourceValue = (document: VectorField3DDocument, point: Vec3): Vec3 | null => {
    if (point.some((value, axis) => value < document.source.axes[axis]!.min ||
        value > document.source.axes[axis]!.max)) return null;
    if (evaluations >= maxEvaluations) throw new RangeError("Derived evaluation cap reached.");
    evaluations++;
    const field = document.source.field;
    if (field.kind !== "expressions") return null;
    const values = field.components.map(component => evaluateGraph2DExpression(
      component.ast, { x: point[0], y: point[1], z: point[2] },
      { maxEvaluations: 256 }));
    return values.every(item => item.ok && Number.isFinite(item.value)) ?
      values.map(item => item.ok ? item.value : NaN) as unknown as Vec3 : null;
  };
  const evaluateInput = (input: DerivedFieldInput, point: Vec3): DerivedFieldValue | null =>
    input.kind === "vector3d" ? sourceValue(sourceById.get(input.documentId)!, point) :
      evaluate(byId.get(input.documentId)!, point);
  const derivative = (input: DerivedFieldInput, point: Vec3, axis: number,
    component?: number): number | null => {
    const domain = input.shape.axes.find(entry => entry.index === axis)!;
    const h = (domain.max - domain.min) / 1000;
    const shifted = (offset: number) => {
      const next = [...point] as number[]; next[axis] += offset;
      const value = evaluateInput(input, next as unknown as Vec3);
      return value === null ? null : component === undefined ? scalar(value) : vector(value)[component]!;
    };
    const center = point[axis];
    if (center - h >= domain.min && center + h <= domain.max) {
      const a = shifted(-h), b = shifted(h);
      return a === null || b === null ? null : (b - a) / (2 * h);
    }
    if (center + h <= domain.max) {
      const a = shifted(0), b = shifted(h);
      return a === null || b === null ? null : (b - a) / h;
    }
    const a = shifted(-h), b = shifted(0);
    return a === null || b === null ? null : (b - a) / h;
  };
  const jacobian = (input: DerivedFieldInput, point: Vec3): Matrix3 | null => {
    const values = [0, 1, 2].map(component => [0, 1, 2].map(axis =>
      derivative(input, point, axis, component)));
    return values.some(row => row.some(value => value === null)) ? null :
      values as unknown as Matrix3;
  };
  const curl = (matrix: Matrix3): Vec3 => [matrix[2][1] - matrix[1][2],
    matrix[0][2] - matrix[2][0], matrix[1][0] - matrix[0][1]];
  const evaluate = (document: DerivedFieldDocument, point: Vec3): DerivedFieldValue | null => {
    const op = document.operation;
    if (op.kind === "plane-slice") {
      const p = [...point] as number[]; p[op.normalAxis] = op.coordinate;
      return evaluateInput(document.input, p as unknown as Vec3);
    }
    if (op.kind === "line-profile") {
      const fixed = document.input.shape.axes.find(axis => axis.index !== op.varyingAxis)!;
      const p = [...point] as number[]; p[fixed.index] = op.fixedCoordinate;
      if (p[op.varyingAxis] < op.extent[0] || p[op.varyingAxis] > op.extent[1]) return null;
      return evaluateInput(document.input, p as unknown as Vec3);
    }
    if (op.kind === "scalar-gradient" || op.kind === "directional-derivative" ||
        op.kind === "scalar-hessian") {
      const gradient = [0, 1, 2].map(axis => derivative(document.input, point, axis));
      if (gradient.some(value => value === null)) return null;
      if (op.kind === "scalar-gradient") return gradient as unknown as Vec3;
      if (op.kind === "directional-derivative") {
        const length = Math.hypot(...op.direction);
        return dot(gradient as unknown as Vec3,
          op.direction.map(value => value / length) as unknown as Vec3);
      }
      // Differentiate the scalar gradient with a central or one-sided physical stencil.
      const axes = document.input.shape.axes;
      const rows: number[][] = [];
      for (let component = 0; component < 3; component++) {
        const row: number[] = [];
        for (let axis = 0; axis < 3; axis++) {
          const domain = axes[axis]!, h = (domain.max - domain.min) / 1000;
          const f = (offset: number) => {
            const p = [...point] as number[]; p[axis] += offset;
            return derivative(document.input, p as unknown as Vec3, component);
          };
          const lower = point[axis] - h >= domain.min;
          const upper = point[axis] + h <= domain.max;
          const a = f(lower ? -h : 0), b = f(upper ? h : 0);
          if (a === null || b === null) return null;
          row.push((b - a) / ((lower && upper ? 2 : 1) * h));
        }
        rows.push(row);
      }
      return rows as unknown as Matrix3;
    }
    if (["vector-jacobian", "jacobian-symmetric", "jacobian-antisymmetric",
      "vorticity", "helicity", "enstrophy"].includes(op.kind)) {
      const matrix = jacobian(document.input, point);
      if (!matrix) return null;
      if (op.kind === "vector-jacobian") return matrix;
      if (op.kind === "jacobian-symmetric" || op.kind === "jacobian-antisymmetric") {
        const sign = op.kind === "jacobian-symmetric" ? 1 : -1;
        return matrix.map((row, i) => row.map((value, j) =>
          (value + sign * matrix[j][i]) / 2)) as unknown as Matrix3;
      }
      const spin = curl(matrix);
      if (op.kind === "vorticity") return spin;
      if (op.kind === "enstrophy") return dot(spin, spin) / 2;
      const base = evaluateInput(document.input, point);
      return base === null ? null : dot(vector(base), spin);
    }
    const value = evaluateInput(document.input, point);
    if (value === null) return null;
    if (op.kind === "vector-magnitude") return Math.hypot(...vector(value));
    if (op.kind === "vector-dot" || op.kind === "vector-cross" ||
        op.kind === "vector-difference") {
      const other = evaluateInput(document.secondaryInput!, point);
      if (other === null) return null;
      const a = vector(value), b = vector(other);
      return op.kind === "vector-dot" ? dot(a, b) :
        op.kind === "vector-cross" ? cross(a, b) :
          a.map((v, i) => v - b[i]!) as unknown as Vec3;
    }
    throw new TypeError("Unsupported derived operation.");
  };
  return { source: root, unit: root.output.unit, maxEvaluations,
    sample: point => {
      if (point.some(value => !Number.isFinite(value))) return null;
      const value = evaluate(root, point);
      if (value === null) return null;
      const numbers = typeof value === "number" ? [value] :
        Array.isArray(value[0]) ? value.flat() : value;
      return numbers.every(Number.isFinite) ? value : null;
    },
    evaluations: () => evaluations };
}
