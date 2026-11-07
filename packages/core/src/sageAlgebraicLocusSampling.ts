/** Bounded numerical real-locus sampling. Exact algebra remains in the F01 scene. */
import { canonicalJsonStringify, isStructuralHash, structuralHash, type StructuralHash } from "./documentIdentity";
import { createGeometryDocument, normalizeGeometryDocument, type GeometryDocument } from "./geometryDocument";
import type { Math3DProject } from "./math3dProject";
import { parseSageAlgebraicLocusScene, SAGE_LOCUS_GEOMETRY_EXTENSION,
  SAGE_LOCUS_SCENE_FORMAT, type SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";
import { parseIdealGenerator } from "./algebraIdealGenerators";

export const SAGE_LOCUS_SAMPLE_EXTENSION = "math3d.sage-algebraic-locus-sample.v1";
export type LocusPoint = readonly number[];
export type SageAlgebraicLocusSample = Readonly<{
  format: "math3d.sage-algebraic-locus-sample"; schemaVersion: 1;
  scene: SageAlgebraicLocusScene; kind: "points" | "curve" | "surface";
  algorithm: "grid-roots-v1" | "marching-squares-v1" | "marching-tetrahedra-v1" | "plane-section-v1";
  completeness: "bounded-sample"; sampleCount: number;
  segments: readonly (readonly [LocusPoint, LocusPoint])[];
  triangles: readonly (readonly [LocusPoint, LocusPoint, LocusPoint])[];
  points: readonly LocusPoint[]; warnings: readonly string[]; resultHash: StructuralHash;
}>;

type Node = { kind: "constant"; value: number; degree: 0 } |
  { kind: "variable"; index: number; degree: 1 } |
  { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node; degree: number } |
  { kind: "power"; base: Node; exponent: number; degree: number };
const point = (...coordinates: number[]): LocusPoint => coordinates;
const interpolate = (a: LocusPoint, b: LocusPoint, fa: number, fb: number): LocusPoint => {
  const t = fa === fb ? 0.5 : Math.max(0, Math.min(1, fa / (fa - fb)));
  return a.map((value, index) => value + t * (b[index] - value));
};
const evalNode = (node: Node, p: LocusPoint): number => {
  if (node.kind === "constant") return node.value;
  if (node.kind === "variable") return p[node.index];
  if (node.kind === "power") return evalNode(node.base, p) ** node.exponent;
  const a = evalNode(node.left, p), b = evalNode(node.right, p);
  switch (node.op) { case "+": return a + b; case "-": return a - b;
    case "*": return a * b; case "/": return a / b; }
};

/** Parse only the already validated exact QQ-polynomial grammar; never evaluate source as code. */
const polynomial = (expression: string, variables: readonly string[]): Node => {
  const source = parseIdealGenerator(expression, variables);
  const tokens = source.match(/[A-Za-z][A-Za-z0-9_]*|(?:0|[1-9][0-9]{0,17})|[()+*^/-]/g) ?? [];
  let at = 0;
  const binary = (op: "+" | "-" | "*" | "/", left: Node, right: Node): Node => ({
    kind: "binary", op, left, right, degree: op === "*" ? left.degree + right.degree :
      op === "/" ? left.degree : Math.max(left.degree, right.degree) });
  const sum = (): Node => { let left = product(); while (tokens[at] === "+" || tokens[at] === "-") {
    const op = tokens[at++] as "+" | "-"; left = binary(op, left, product()); } return left; };
  const atom = (): Node => {
    const token = tokens[at++];
    if (token === "(") { const inside = sum(); if (tokens[at++] !== ")") throw new TypeError("Unclosed polynomial group."); return inside; }
    const index = variables.indexOf(token);
    if (index >= 0) return { kind: "variable", index, degree: 1 };
    if (token && /^\d+$/.test(token)) return { kind: "constant", value: Number(token), degree: 0 };
    throw new TypeError("Invalid polynomial atom.");
  };
  const power = (): Node => {
    const sign = tokens[at] === "+" || tokens[at] === "-" ? tokens[at++] : "+";
    let base = atom();
    if (tokens[at] === "^") { at++; const exponent = Number(tokens[at++]);
      base = { kind: "power", base, exponent, degree: base.degree * exponent }; }
    return sign === "-" ? binary("*", { kind: "constant", value: -1, degree: 0 }, base) : base;
  };
  const product = (): Node => { let left = power(); while (tokens[at] === "*" || tokens[at] === "/") {
    const op = tokens[at++] as "*" | "/";
    left = binary(op, left, op === "/" ? atom() : power());
  } return left; };
  const tree = sum();
  if (at !== tokens.length) throw new TypeError("Incomplete polynomial expression.");
  return tree;
};

const contour = (bounds: readonly { min: number; max: number }[], grid: number,
  evaluate: (p: LocusPoint) => number, lift: (u: number, v: number) => LocusPoint,
  append: (a: LocusPoint, b: LocusPoint) => void): number => {
  const [u, v] = bounds;
  const coordinates = (i: number, j: number) => lift(u.min + (u.max - u.min) * i / grid,
    v.min + (v.max - v.min) * j / grid);
  const samples: number[][] = [];
  for (let j = 0; j <= grid; j++) { const row: number[] = []; for (let i = 0; i <= grid; i++) {
    const value = evaluate(coordinates(i, j));
    if (!Number.isFinite(value)) throw new TypeError("Nonfinite polynomial sample."); row.push(value);
  } samples.push(row); }
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    const corners = [coordinates(i, j), coordinates(i + 1, j), coordinates(i + 1, j + 1), coordinates(i, j + 1)];
    const values = [samples[j][i], samples[j][i + 1], samples[j + 1][i + 1], samples[j + 1][i]];
    const hits: LocusPoint[] = [];
    for (let edge = 0; edge < 4; edge++) { const next = (edge + 1) % 4;
      if ((values[edge] < 0) !== (values[next] < 0)) hits.push(interpolate(corners[edge], corners[next], values[edge], values[next])); }
    if (hits.length === 2) append(hits[0], hits[1]);
    else if (hits.length === 4) { append(hits[0], hits[1]); append(hits[2], hits[3]); }
  }
  return (grid + 1) ** 2;
};

const sampleSurface = (scene: SageAlgebraicLocusScene, evaluate: (p: LocusPoint) => number,
  triangles: [LocusPoint, LocusPoint, LocusPoint][]): number => {
  const grid = Math.max(3, Math.min(36, Math.floor(Math.cbrt(scene.precision.maxSamples)) - 1));
  const bounds = scene.domain.bounds;
  const xyz = (i: number, j: number, k: number) => point(...[i, j, k].map((n, axis) =>
    bounds[axis].min + (bounds[axis].max - bounds[axis].min) * n / grid));
  const values: number[][][] = [];
  for (let k = 0; k <= grid; k++) { const plane: number[][] = [];
    for (let j = 0; j <= grid; j++) { const row: number[] = [];
      for (let i = 0; i <= grid; i++) { const value = evaluate(xyz(i, j, k));
        if (!Number.isFinite(value)) throw new TypeError("Nonfinite polynomial sample."); row.push(value); }
      plane.push(row); } values.push(plane); }
  const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  for (let k = 0; k < grid; k++) for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    const indices = [[i,j,k], [i+1,j,k], [i+1,j+1,k], [i,j+1,k],
      [i,j,k+1], [i+1,j,k+1], [i+1,j+1,k+1], [i,j+1,k+1]];
    const corners = indices.map(([a,b,c]) => xyz(a,b,c));
    const scalars = indices.map(([a,b,c]) => values[c][b][a]);
    for (const tet of tetrahedra) {
      const hits: LocusPoint[] = [];
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const ia = tet[a], ib = tet[b];
        if ((scalars[ia] < 0) !== (scalars[ib] < 0))
          hits.push(interpolate(corners[ia], corners[ib], scalars[ia], scalars[ib]));
      }
      if (hits.length === 3) triangles.push([hits[0], hits[1], hits[2]]);
      if (hits.length === 4) { triangles.push([hits[0], hits[1], hits[2]]);
        triangles.push([hits[0], hits[2], hits[3]]); }
      if (triangles.length > 30000) throw new TypeError("Surface triangle budget exceeded; reduce bounds or sample cap.");
    }
  }
  return (grid + 1) ** 3;
};

/** Sample 1D roots, planar curves, 3D hypersurfaces, or a 3D linear-plane section. */
export const sampleSageAlgebraicLocus = (input: SageAlgebraicLocusScene): SageAlgebraicLocusSample => {
  const scene = parseSageAlgebraicLocusScene(input);
  const variables = scene.domain.bounds.map((bound) => bound.variable), equations = scene.source.equations.map((expr) => polynomial(expr, variables));
  const segments: [LocusPoint, LocusPoint][] = [], triangles: [LocusPoint, LocusPoint, LocusPoint][] = [], points: LocusPoint[] = [];
  const warnings = ["Numerical bounded sample; components, tangencies and singularities may be missed."];
  let kind: SageAlgebraicLocusSample["kind"], algorithm: SageAlgebraicLocusSample["algorithm"], sampleCount = 0;
  if (variables.length === 1 && equations.length === 1) {
    kind = "points"; algorithm = "grid-roots-v1";
    const bound = scene.domain.bounds[0], count = Math.min(scene.precision.maxSamples - 1, 10000);
    let last = point(bound.min), previous = evalNode(equations[0], last);
    for (let i = 1; i <= count; i++) { const next = point(bound.min + (bound.max - bound.min) * i / count);
      const value = evalNode(equations[0], next); if ((previous < 0) !== (value < 0)) points.push(interpolate(last, next, previous, value));
      last = next; previous = value; }
    sampleCount = count + 1;
  } else if (variables.length === 2 && equations.length === 1) {
    kind = "curve"; algorithm = "marching-squares-v1";
    const grid = Math.max(2, Math.min(400, Math.floor(Math.sqrt(scene.precision.maxSamples)) - 1));
    sampleCount = contour(scene.domain.bounds, grid, (p) => evalNode(equations[0], p), (u,v) => point(u,v),
      (a,b) => segments.push([a,b]));
  } else if (variables.length === 3 && equations.length === 1) {
    kind = "surface"; algorithm = "marching-tetrahedra-v1";
    sampleCount = sampleSurface(scene, (p) => evalNode(equations[0], p), triangles);
  } else if (variables.length === 3 && equations.length === 2) {
    const planeIndex = equations.findIndex((item) => item.degree === 1);
    if (planeIndex < 0) throw new TypeError("A two-equation 3D locus currently requires a linear plane constraint.");
    kind = "curve"; algorithm = "plane-section-v1";
    const plane = equations[planeIndex], other = equations[1 - planeIndex];
    const origin = point(0,0,0), offset = evalNode(plane, origin);
    const coefficients = [0,1,2].map((axis) => evalNode(plane, point(...[0,1,2].map((at) => at === axis ? 1 : 0))) - offset);
    const solved = coefficients.reduce((best, value, axis) => Math.abs(value) > Math.abs(coefficients[best]) ? axis : best, 0);
    if (Math.abs(coefficients[solved]) < 1e-12) throw new TypeError("Degenerate plane constraint.");
    const free = [0,1,2].filter((axis) => axis !== solved);
    const lift = (u: number, v: number) => { const p = [0,0,0]; p[free[0]] = u; p[free[1]] = v;
      p[solved] = -(offset + coefficients[free[0]] * u + coefficients[free[1]] * v) / coefficients[solved]; return p; };
    const grid = Math.max(2, Math.min(400, Math.floor(Math.sqrt(scene.precision.maxSamples)) - 1));
    sampleCount = contour(free.map((axis) => scene.domain.bounds[axis]), grid,
      (p) => evalNode(other, p), lift, (a,b) => {
        const bound = scene.domain.bounds[solved];
        if (a[solved] >= bound.min && a[solved] <= bound.max && b[solved] >= bound.min && b[solved] <= bound.max)
          segments.push([a,b]);
      });
  } else throw new TypeError("F02 supports one equation in 1–3 variables or a two-equation 3D plane section.");
  const base = { format: "math3d.sage-algebraic-locus-sample" as const, schemaVersion: 1 as const,
    scene, kind, algorithm, completeness: "bounded-sample" as const, sampleCount,
    segments, triangles, points, warnings };
  return { ...base, resultHash: structuralHash(base) };
};

export const parseSageAlgebraicLocusSample = (input: unknown, project?: Math3DProject): SageAlgebraicLocusSample => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid locus sample.");
  const value = input as Record<string, unknown>;
  const scene = parseSageAlgebraicLocusScene(value.scene, project);
  const expected = sampleSageAlgebraicLocus(scene);
  if (!isStructuralHash(value.resultHash) || canonicalJsonStringify(value) !== canonicalJsonStringify(expected))
    throw new TypeError("Locus sample differs from its exact source, bounded algorithm or result hash.");
  return expected;
};

export const sampledAlgebraicLocusGeometryDocument = (input: SageAlgebraicLocusSample): GeometryDocument => {
  const sample = parseSageAlgebraicLocusSample(input);
  return createGeometryDocument({ stableKey: { algebraicLocusScene: sample.scene.id },
    source: { geometry: null, objects: [], surfaces: [], constructions: [], relationships: [], parameters: {},
      extensions: { [SAGE_LOCUS_GEOMETRY_EXTENSION]: sample.scene, [SAGE_LOCUS_SAMPLE_EXTENSION]: sample } },
    metadata: { title: `Real locus sample: ${sample.scene.source.target.label}` },
    provenance: { sourceFormat: SAGE_LOCUS_SCENE_FORMAT, sourceVersion: 1, sourceSceneId: sample.scene.id,
      diagnostics: [`${sample.algorithm}: ${sample.sampleCount} evaluations; bounded sample, potentially incomplete.`] } });
};

export const parseSampledAlgebraicLocusGeometryDocument = (input: unknown, project?: Math3DProject):
  { document: GeometryDocument; sample: SageAlgebraicLocusSample } => {
  const normalized = normalizeGeometryDocument(input);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const document = normalized.value, source = document.source;
  if (source.geometry !== null || source.objects.length || source.surfaces.length || source.constructions.length ||
    source.relationships.length || Object.keys(source.parameters).length ||
    Object.keys(source.extensions).length !== 2 || document.provenance.sourceFormat !== SAGE_LOCUS_SCENE_FORMAT ||
    document.provenance.sourceVersion !== 1)
    throw new TypeError("Invalid sampled locus Geometry document.");
  const sample = parseSageAlgebraicLocusSample(source.extensions[SAGE_LOCUS_SAMPLE_EXTENSION], project);
  if (canonicalJsonStringify(source.extensions[SAGE_LOCUS_GEOMETRY_EXTENSION]) !== canonicalJsonStringify(sample.scene) ||
    document.provenance.sourceSceneId !== sample.scene.id)
    throw new TypeError("Sampled locus Geometry provenance differs from its exact scene.");
  return { document, sample };
};
