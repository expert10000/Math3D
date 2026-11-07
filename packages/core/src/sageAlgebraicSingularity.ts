/** Exact local hypersurface analysis over QQ, pinned to an F01 real-locus scene. */
import { canonicalJsonStringify, isStructuralHash, structuralHash, type StructuralHash } from "./documentIdentity";
import { parseIdealGenerator } from "./algebraIdealGenerators";
import { createGeometryDocument, normalizeGeometryDocument, type GeometryDocument } from "./geometryDocument";
import type { Math3DProject } from "./math3dProject";
import { parseSageAlgebraicLocusScene, SAGE_LOCUS_GEOMETRY_EXTENSION,
  SAGE_LOCUS_SCENE_FORMAT, type SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";

export const SAGE_LOCUS_SINGULARITY_EXTENSION = "math3d.sage-algebraic-singularity.v1";
type Q = { n: bigint; d: bigint };
type Poly = Map<string, Q>;
export type ExactLocusTerm = Readonly<{ coefficient: string; powers: readonly number[] }>;
export type SageAlgebraicSingularityScene = Readonly<{
  format: "math3d.sage-algebraic-singularity"; schemaVersion: 1;
  scene: SageAlgebraicLocusScene; point: readonly string[];
  singularLocus: Readonly<{ status: "equations-only"; equations: readonly (readonly ExactLocusTerm[])[] }>;
  local: Readonly<{ onLocus: boolean; jacobian: readonly string[]; jacobianRank: 0 | 1;
    singular: boolean; multiplicity: number | null; tangentCone: readonly ExactLocusTerm[];
    classification: "off-locus" | "smooth" | "ordinary-real-node" | "ordinary-cusp" | "singular-unclassified";
    realTangentDirections: readonly (readonly [number, number])[] }>;
  warnings: readonly string[]; analysisHash: StructuralHash;
}>;

const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b]; return a || 1n; };
const q = (n: bigint, d = 1n): Q => {
  if (d === 0n) throw new TypeError("Zero rational denominator.");
  if (d < 0n) { n = -n; d = -d; }
  const divisor = gcd(n, d); n /= divisor; d /= divisor;
  if (n.toString().length > 512 || d.toString().length > 512)
    throw new TypeError("Exact local coefficient budget exceeded.");
  return { n, d };
};
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = (a: Q) => q(-a.n, a.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const zero = q(0n), one = q(1n);
const isZero = (a: Q) => a.n === 0n;
const renderQ = (a: Q) => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
const decodeQ = (input: string): Q => { const [n, d] = input.split("/"); return q(BigInt(n), d ? BigInt(d) : 1n); };
const parseQ = (input: string): Q => {
  if (!/^-?(?:0|[1-9][0-9]{0,11})(?:\/(?:[1-9][0-9]{0,11}))?$/.test(input))
    throw new TypeError("Use bounded rational coordinates such as 0, -2 or 1/3.");
  return decodeQ(input);
};
const key = (powers: readonly number[]) => powers.join(",");
const powersOf = (entry: string) => entry.split(",").map(Number);
const constant = (value: Q, dimension: number): Poly =>
  isZero(value) ? new Map() : new Map([[key(Array(dimension).fill(0)), value]]);
const variable = (index: number, dimension: number): Poly =>
  new Map([[key(Array.from({ length: dimension }, (_, at) => at === index ? 1 : 0)), one]]);
const append = (target: Poly, powers: readonly number[], value: Q): void => {
  if (isZero(value)) return;
  const id = key(powers), next = add(target.get(id) ?? zero, value);
  if (isZero(next)) target.delete(id); else target.set(id, next);
  if (target.size > 512) throw new TypeError("Exact local polynomial term budget exceeded.");
};
const plus = (a: Poly, b: Poly): Poly => { const out = new Map(a);
  for (const [id, value] of b) append(out, powersOf(id), value); return out; };
const scale = (a: Poly, factor: Q): Poly => { const out: Poly = new Map();
  for (const [id, value] of a) append(out, powersOf(id), mul(value, factor)); return out; };
const times = (a: Poly, b: Poly): Poly => { const out: Poly = new Map();
  for (const [left, l] of a) for (const [right, r] of b) {
    const powers = powersOf(left).map((power, at) => power + powersOf(right)[at]);
    if (powers.reduce((sum, power) => sum + power, 0) > 16) throw new TypeError("Exact local degree budget exceeded.");
    append(out, powers, mul(l, r));
  } return out; };
const power = (base: Poly, exponent: number, dimension: number): Poly => {
  let out = constant(one, dimension);
  for (let i = 0; i < exponent; i++) out = times(out, base);
  return out;
};
const terms = (poly: Poly): ExactLocusTerm[] => [...poly].map(([id, value]) => ({
  coefficient: renderQ(value), powers: powersOf(id),
})).sort((a, b) => a.powers.reduce((sum, value) => sum + value, 0) -
    b.powers.reduce((sum, value) => sum + value, 0) ||
    a.powers.map((value, index) => value - b.powers[index]).find((value) => value !== 0) || 0);
const coefficient = (poly: Poly, powers: readonly number[]): Q => poly.get(key(powers)) ?? zero;
const derivative = (poly: Poly, axis: number): Poly => { const out: Poly = new Map();
  for (const [id, value] of poly) { const powers = powersOf(id);
    if (powers[axis]) { const degree = powers[axis]--; append(out, powers, mul(value, q(BigInt(degree)))); } }
  return out; };

const polynomial = (expression: string, variables: readonly string[]): Poly => {
  const source = parseIdealGenerator(expression, variables), dimension = variables.length;
  const tokens = source.match(/[A-Za-z][A-Za-z0-9_]*|(?:0|[1-9][0-9]{0,17})(?:\/(?:[1-9][0-9]{0,17}))?|[()+*^/-]/g) ?? [];
  let at = 0;
  const atom = (): Poly => {
    const token = tokens[at++];
    if (token === "(") { const result = sum(); if (tokens[at++] !== ")") throw new TypeError("Unclosed polynomial group."); return result; }
    const index = variables.indexOf(token);
    if (index >= 0) return variable(index, dimension);
    if (token && /^(?:0|[1-9][0-9]{0,17})(?:\/[1-9][0-9]{0,17})?$/.test(token)) {
      const [n, d] = token.split("/"); return constant(q(BigInt(n), d ? BigInt(d) : 1n), dimension); }
    throw new TypeError("Invalid exact polynomial atom.");
  };
  const powered = (): Poly => {
    const sign = tokens[at] === "+" || tokens[at] === "-" ? tokens[at++] : "+";
    let result = atom();
    if (tokens[at] === "^") { at++; result = power(result, Number(tokens[at++]), dimension); }
    return sign === "-" ? scale(result, neg(one)) : result;
  };
  const product = (): Poly => { let result = powered();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++];
      if (op === "/") { const denominator = tokens[at++];
        if (!denominator || !/^[1-9][0-9]{0,17}$/.test(denominator)) throw new TypeError("Invalid polynomial denominator.");
        result = scale(result, div(one, q(BigInt(denominator))));
      } else result = times(result, powered());
    } return result; };
  const sum = (): Poly => { let result = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++], next = product(); result = plus(result, op === "-" ? scale(next, neg(one)) : next);
    } return result; };
  const result = sum(); if (at !== tokens.length) throw new TypeError("Incomplete exact polynomial."); return result;
};

const binomial = (n: number, k: number): bigint => { let value = 1n;
  for (let i = 1; i <= k; i++) value = value * BigInt(n - i + 1) / BigInt(i);
  return value; };
const qpower = (base: Q, exponent: number): Q => { let value = one;
  for (let i = 0; i < exponent; i++) value = mul(value, base); return value; };
/** f(u+p) exposes exact constant, Jacobian and lowest nonzero homogeneous jet. */
const translate = (poly: Poly, point: readonly Q[]): Poly => { const out: Poly = new Map();
  for (const [id, value] of poly) {
    let expanded = constant(value, point.length);
    for (const [axis, degree] of powersOf(id).entries()) {
      const factor: Poly = new Map();
      for (let k = 0; k <= degree; k++) {
        const powers = Array(point.length).fill(0); powers[axis] = k;
        append(factor, powers, mul(q(binomial(degree, k)), qpower(point[axis], degree - k)));
      }
      expanded = times(expanded, factor);
    }
    for (const [entry, coefficient] of expanded) append(out, powersOf(entry), coefficient);
  } return out; };
const degree = (powers: readonly number[]) => powers.reduce((sum, value) => sum + value, 0);
const compareQ = (a: Q, b: Q) => { const difference = a.n * b.d - b.n * a.d; return difference < 0n ? -1 : difference > 0n ? 1 : 0; };
const numeric = (value: Q) => Number(value.n) / Number(value.d);
const directions = (local: Poly, classification: SageAlgebraicSingularityScene["local"]["classification"]): [number, number][] => {
  const gx = coefficient(local, [1,0]), gy = coefficient(local, [0,1]);
  if (classification === "smooth") return [[-numeric(gy), numeric(gx)]];
  const a = numeric(coefficient(local, [2,0])), b = numeric(coefficient(local, [1,1])), c = numeric(coefficient(local, [0,2]));
  const discriminant = b * b - 4 * a * c;
  if (classification !== "ordinary-real-node" && classification !== "ordinary-cusp") return [];
  if (c !== 0) { const roots = discriminant === 0 ? [(-b)/(2*c)] :
    [(-b + Math.sqrt(discriminant))/(2*c), (-b - Math.sqrt(discriminant))/(2*c)];
    return roots.filter(Number.isFinite).map((slope) => [1, slope === 0 ? 0 : slope]); }
  if (b !== 0) return [[0,1], [1,-a/b === 0 ? 0 : -a/b]];
  return [[0,1]];
};

/** The singular-locus equations are exact but are not globally solved. */
export const analyzeSageAlgebraicSingularity = (input: SageAlgebraicLocusScene,
  pointInput: readonly string[]): SageAlgebraicSingularityScene => {
  const scene = parseSageAlgebraicLocusScene(input), variables = scene.domain.bounds.map((bound) => bound.variable);
  if (scene.source.equations.length !== 1)
    throw new TypeError("F03 exact Jacobian criterion currently supports one hypersurface equation; multi-equation ideals need a dimension-aware minors workflow.");
  if (!Array.isArray(pointInput) || pointInput.length !== variables.length)
    throw new TypeError("Provide one rational coordinate per locus axis.");
  const point = pointInput.map((coordinate, index) => {
    const value = parseQ(coordinate), bound = scene.domain.bounds[index];
    if (numeric(value) < bound.min || numeric(value) > bound.max)
      throw new TypeError("The inspection point must lie inside the scene bounds.");
    return value;
  });
  const source = polynomial(scene.source.equations[0], variables);
  if (!terms(source).some((term) => degree(term.powers) > 0))
    throw new TypeError("F03 requires a nonconstant hypersurface equation for the Jacobian criterion.");
  const translated = translate(source, point);
  const onLocus = isZero(coefficient(translated, Array(variables.length).fill(0)));
  const jacobian = variables.map((_, axis) => renderQ(coefficient(translated,
    Array.from({ length: variables.length }, (_, at) => at === axis ? 1 : 0))));
  const jacobianRank = jacobian.some((value) => value !== "0") ? 1 : 0;
  const singular = onLocus && jacobianRank === 0;
  const positive = terms(translated).filter((term) => degree(term.powers) > 0);
  const multiplicity = onLocus && positive.length ? degree(positive[0].powers) : null;
  const tangentCone = multiplicity === null ? [] : positive.filter((term) => degree(term.powers) === multiplicity);
  let classification: SageAlgebraicSingularityScene["local"]["classification"] =
    !onLocus ? "off-locus" : !singular ? "smooth" : "singular-unclassified";
  if (singular && variables.length === 2 && multiplicity === 2) {
    const a = coefficient(translated, [2,0]), b = coefficient(translated, [1,1]), c = coefficient(translated, [0,2]);
    const discriminant = add(mul(b,b), neg(mul(q(4n), mul(a,c))));
    if (compareQ(discriminant, zero) > 0) classification = "ordinary-real-node";
    else if (isZero(discriminant)) {
      const direction = !isZero(a) ? [b, neg(mul(q(2n), a))] : [one, zero];
      const cubic = terms(translated).filter((term) => degree(term.powers) === 3).reduce((sum, term) =>
        add(sum, mul(decodeQ(term.coefficient), mul(qpower(direction[0], term.powers[0]),
          qpower(direction[1], term.powers[1])))), zero);
      if (!isZero(cubic)) classification = "ordinary-cusp";
    }
  }
  const local = { onLocus, jacobian, jacobianRank: jacobianRank as 0 | 1, singular,
    multiplicity, tangentCone, classification,
    realTangentDirections: variables.length === 2 ? directions(translated, classification) : [] };
  const base = { format: "math3d.sage-algebraic-singularity" as const, schemaVersion: 1 as const,
    scene, point: point.map(renderQ), singularLocus: { status: "equations-only" as const,
      equations: [terms(source), ...variables.map((_, axis) => terms(derivative(source, axis)))] },
    local, warnings: ["Exact point analysis of a hypersurface; singular-locus equations are not globally solved.",
      "Multiplicity and classification are scheme-sensitive; the real plot is only a bounded numerical sample."] };
  return { ...base, analysisHash: structuralHash(base) };
};

export const parseSageAlgebraicSingularityScene = (input: unknown, project?: Math3DProject): SageAlgebraicSingularityScene => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid singularity scene.");
  const value = input as Record<string, unknown>;
  const scene = parseSageAlgebraicLocusScene(value.scene, project);
  const expected = analyzeSageAlgebraicSingularity(scene, value.point as string[]);
  if (!isStructuralHash(value.analysisHash) || canonicalJsonStringify(value) !== canonicalJsonStringify(expected))
    throw new TypeError("Singularity scene differs from its exact source or Jacobian analysis.");
  return expected;
};

export const algebraicSingularityGeometryDocument = (input: SageAlgebraicSingularityScene): GeometryDocument => {
  const analysis = parseSageAlgebraicSingularityScene(input);
  return createGeometryDocument({ stableKey: { algebraicLocusScene: analysis.scene.id, singularityPoint: analysis.point },
    source: { geometry: null, objects: [], surfaces: [], constructions: [], relationships: [], parameters: {},
      extensions: { [SAGE_LOCUS_GEOMETRY_EXTENSION]: analysis.scene, [SAGE_LOCUS_SINGULARITY_EXTENSION]: analysis } },
    metadata: { title: `Tangent and singular-locus view: ${analysis.scene.source.target.label}` },
    provenance: { sourceFormat: SAGE_LOCUS_SCENE_FORMAT, sourceVersion: 1, sourceSceneId: analysis.scene.id,
      diagnostics: ["Exact hypersurface Jacobian and local tangent cone at a rational point; global singular locus unsolved."] } });
};

export const parseAlgebraicSingularityGeometryDocument = (input: unknown, project?: Math3DProject):
  { document: GeometryDocument; analysis: SageAlgebraicSingularityScene } => {
  const normalized = normalizeGeometryDocument(input);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const document = normalized.value, source = document.source;
  if (source.geometry !== null || source.objects.length || source.surfaces.length || source.constructions.length ||
    source.relationships.length || Object.keys(source.parameters).length || Object.keys(source.extensions).length !== 2 ||
    document.provenance.sourceFormat !== SAGE_LOCUS_SCENE_FORMAT || document.provenance.sourceVersion !== 1)
    throw new TypeError("Invalid singularity Geometry document.");
  const analysis = parseSageAlgebraicSingularityScene(source.extensions[SAGE_LOCUS_SINGULARITY_EXTENSION], project);
  if (canonicalJsonStringify(source.extensions[SAGE_LOCUS_GEOMETRY_EXTENSION]) !== canonicalJsonStringify(analysis.scene) ||
    document.provenance.sourceSceneId !== analysis.scene.id)
    throw new TypeError("Singularity Geometry provenance differs from its exact scene.");
  return { document, analysis };
};
