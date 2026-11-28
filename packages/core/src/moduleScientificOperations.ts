import type { DiscoveryJsonSchema } from "./platformDiscovery";
import type { ScientificMethod, ScientificModule } from "./scientificCapabilityRegistry";

type RecordValue = Record<string, unknown>;
type ModuleOperation = Readonly<{
  id: string; module: ScientificModule; capability: string; title: string;
  description: string; method: ScientificMethod;
  inputSchema: DiscoveryJsonSchema; outputSchema: DiscoveryJsonSchema;
  execute: (input: RecordValue) => RecordValue;
}>;

const num: DiscoveryJsonSchema = { type: "number" };
const integer: DiscoveryJsonSchema = { type: "integer" };
const arr = (items: DiscoveryJsonSchema, minItems: number, maxItems: number): DiscoveryJsonSchema =>
  ({ type: "array", items, minItems, maxItems });
const tuple = (length: number, items: DiscoveryJsonSchema = num): DiscoveryJsonSchema =>
  arr(items, length, length);
const obj = (properties: Record<string, DiscoveryJsonSchema>): DiscoveryJsonSchema =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const withExample = (schema: DiscoveryJsonSchema, example: unknown): DiscoveryJsonSchema =>
  ({ ...schema, example });
const empty: DiscoveryJsonSchema = { type: "object", additionalProperties: false };
const vector3 = tuple(3);
const complex = obj({ re: num, im: num });
const coefficients = obj({ a: num, b: num, c: num });

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} is outside the finite result range.`);
  return value;
};

/** Small, bounded reference operations that establish one complete contract per module. */
export const MODULE_SCIENTIFIC_OPERATIONS: readonly ModuleOperation[] = [
  { id: "graph2d.roots.quadratic", module: "graph2d", capability: "roots",
    title: "Real roots of a quadratic", description: "Solve ax² + bx + c = 0 for distinct real roots.",
    method: "analytic", inputSchema: withExample(coefficients, { a: 1, b: 0, c: -1 }),
    outputSchema: obj({ roots: arr(num, 0, 2), discriminant: num }),
    execute: input => {
      const { a, b, c } = input as { a: number; b: number; c: number };
      if (a === 0 && b === 0) throw new RangeError("At least one of a or b must be nonzero.");
      if (a === 0) return { roots: [finite(-c / b, "Root")], discriminant: b * b };
      const d = finite(b * b - 4 * a * c, "Discriminant");
      if (d < 0) return { roots: [], discriminant: d };
      if (d === 0) return { roots: [finite(-b / (2 * a), "Root")], discriminant: d };
      const q = -(b + Math.sign(b || 1) * Math.sqrt(d)) / 2;
      return { roots: [finite(q / a, "Root"), finite(c / q, "Root")].sort((x, y) => x - y),
        discriminant: d };
    } },
  { id: "graph3d.gradient.quadratic", module: "graph3d", capability: "gradients",
    title: "Gradient of a 3D quadratic", description: "Evaluate the exact gradient of ax² + by² + cz² + dx + ey + fz + g at a point, using coefficients [a,b,c,d,e,f,g].",
    method: "analytic", inputSchema: withExample(obj({ coefficients: tuple(7), point: vector3 }),
      { coefficients: [1, 2, 3, 4, 5, 6, 0], point: [2, 3, 4] }),
    outputSchema: obj({ gradient: vector3 }),
    execute: input => {
      const [a, b, c, d, e, f] = input.coefficients as number[];
      const [x, y, z] = input.point as number[];
      return { gradient: [finite(2 * a * x + d, "Gradient"),
        finite(2 * b * y + e, "Gradient"), finite(2 * c * z + f, "Gradient")] };
    } },
  { id: "curve.arc-length.polyline", module: "curve", capability: "arc-length",
    title: "Polyline arc length", description: "Sum Euclidean lengths of consecutive 3D curve samples.",
    method: "numerical", inputSchema: withExample(obj({ points: arr(vector3, 2, 10000) }),
      { points: [[0, 0, 0], [3, 4, 0]] }),
    outputSchema: obj({ length: { type: "number", minimum: 0 }, segmentCount: { type: "integer", minimum: 1 } }),
    execute: input => {
      const points = input.points as number[][];
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(
        points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1],
        points[i][2] - points[i - 1][2]);
      return { length: finite(length, "Arc length"), segmentCount: points.length - 1 };
    } },
  { id: "geometry.distance.euclidean", module: "geometry", capability: "distances",
    title: "3D Euclidean distance", description: "Compute the distance between two 3D points.",
    method: "analytic", inputSchema: withExample(obj({ first: vector3, second: vector3 }),
      { first: [0, 0, 0], second: [0, 3, 4] }),
    outputSchema: obj({ distance: { type: "number", minimum: 0 } }),
    execute: input => {
      const a = input.first as number[], b = input.second as number[];
      return { distance: finite(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), "Distance") };
    } },
  { id: "volume.interpolate.trilinear", module: "volume", capability: "interpolation",
    title: "Trilinear scalar interpolation", description: "Sample an x-fastest scalar grid at a continuous index coordinate.",
    method: "numerical", inputSchema: withExample(obj({ dimensions: tuple(3, { type: "integer", minimum: 2, maximum: 64 }),
      values: arr(num, 8, 262144), point: vector3 }),
      { dimensions: [2, 2, 2], values: [0, 1, 2, 3, 4, 5, 6, 7], point: [0.5, 0.5, 0.5] }),
    outputSchema: obj({ value: num }),
    execute: input => {
      const [nx, ny, nz] = input.dimensions as number[];
      const values = input.values as number[];
      const [x, y, z] = input.point as number[];
      if (values.length !== nx * ny * nz || [x, y, z].some((v, i) => v < 0 || v > [nx, ny, nz][i] - 1))
        throw new RangeError("Grid size or sample coordinate is invalid.");
      const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
      const [jx, jy, jz] = [Math.min(ix + 1, nx - 1), Math.min(iy + 1, ny - 1), Math.min(iz + 1, nz - 1)];
      const [tx, ty, tz] = [x - ix, y - iy, z - iz];
      const at = (i: number, j: number, k: number) => values[i + nx * (j + ny * k)];
      const blend = (a: number, b: number, t: number) => a + (b - a) * t;
      return { value: finite(blend(
        blend(blend(at(ix, iy, iz), at(jx, iy, iz), tx),
          blend(at(ix, jy, iz), at(jx, jy, iz), tx), ty),
        blend(blend(at(ix, iy, jz), at(jx, iy, jz), tx),
          blend(at(ix, jy, jz), at(jx, jy, jz), tx), ty), tz), "Interpolated value") };
    } },
  { id: "topology.euler.triangle-mesh", module: "topology", capability: "euler-characteristic",
    title: "Triangle mesh Euler characteristic", description: "Compute V−E+F from declared vertices and unique indexed edges and faces of a triangle complex.",
    method: "algorithmic", inputSchema: withExample(obj({ vertexCount: { type: "integer", minimum: 3, maximum: 1000000 },
      faces: arr(tuple(3, { type: "integer", minimum: 0 }), 1, 20000) }),
      { vertexCount: 3, faces: [[0, 1, 2]] }),
    outputSchema: obj({ vertices: integer, edges: integer, faces: integer, eulerCharacteristic: integer }),
    execute: input => {
      const vertexCount = input.vertexCount as number;
      const faces = input.faces as number[][];
      const edges = new Set<string>();
      const uniqueFaces = new Set<string>();
      for (const face of faces) {
        if (new Set(face).size !== 3 || face.some(index => index >= vertexCount))
          throw new RangeError("Face indices must name three distinct vertices.");
        const faceKey = [...face].sort((a, b) => a - b).join(":");
        if (uniqueFaces.has(faceKey)) throw new RangeError("Duplicate triangle faces are not a simplicial complex.");
        uniqueFaces.add(faceKey);
        for (let i = 0; i < 3; i++) {
          const a = Math.min(face[i], face[(i + 1) % 3]);
          const b = Math.max(face[i], face[(i + 1) % 3]);
          edges.add(`${a}:${b}`);
        }
      }
      return { vertices: vertexCount, edges: edges.size, faces: faces.length,
        eulerCharacteristic: vertexCount - edges.size + faces.length };
    } },
  { id: "cas.differentiate.polynomial", module: "cas", capability: "differentiation",
    title: "Polynomial derivative", description: "Differentiate coefficients in ascending power order exactly over integers.",
    method: "exact", inputSchema: withExample(obj({ coefficients: arr({ type: "integer", minimum: -1000000,
      maximum: 1000000 }, 1, 256) }), { coefficients: [1, 2, 3] }),
    outputSchema: obj({ coefficients: arr(integer, 1, 255) }),
    execute: input => {
      const source = input.coefficients as number[];
      return { coefficients: source.length === 1 ? [0] : source.slice(1).map((value, i) => value * (i + 1)) };
    } },
  { id: "number-theory.modular-inverse.compute", module: "number-theory", capability: "modular-arithmetic",
    title: "Modular inverse", description: "Use the extended Euclidean algorithm to invert an integer modulo m when coprime.",
    method: "exact", inputSchema: withExample(obj({ value: { type: "integer", minimum: -1000000000, maximum: 1000000000 },
      modulus: { type: "integer", minimum: 2, maximum: 1000000000 } }),
      { value: 3, modulus: 11 }),
    outputSchema: obj({ gcd: { type: "integer", minimum: 1 }, inverse: { anyOf: [integer, { type: "null" }] } }),
    execute: input => {
      const m = BigInt(input.modulus as number);
      let r = m, nextR = ((BigInt(input.value as number) % m) + m) % m;
      let t = 0n, nextT = 1n;
      while (nextR !== 0n) {
        const q = r / nextR;
        [r, nextR] = [nextR, r - q * nextR];
        [t, nextT] = [nextT, t - q * nextT];
      }
      return { gcd: Number(r), inverse: r === 1n ? Number((t % m + m) % m) : null };
    } },
  { id: "complex.zeros.quadratic", module: "complex", capability: "zeros",
    title: "Zeros of a real quadratic", description: "Compute real or conjugate complex zeros of az² + bz + c.",
    method: "analytic", inputSchema: withExample(coefficients, { a: 1, b: 0, c: 1 }),
    outputSchema: obj({ zeros: arr(complex, 1, 2) }),
    execute: input => {
      const { a, b, c } = input as { a: number; b: number; c: number };
      if (a === 0 && b === 0) throw new RangeError("At least one of a or b must be nonzero.");
      if (a === 0) return { zeros: [{ re: finite(-c / b, "Zero"), im: 0 }] };
      const d = finite(b * b - 4 * a * c, "Discriminant");
      if (d < 0) {
        const re = finite(-b / (2 * a), "Zero");
        const im = finite(Math.sqrt(-d) / (2 * Math.abs(a)), "Zero");
        return { zeros: [{ re, im: -im }, { re, im }] };
      }
      if (d === 0) return { zeros: [{ re: finite(-b / (2 * a), "Zero"), im: 0 }] };
      const q = -(b + Math.sign(b || 1) * Math.sqrt(d)) / 2;
      return { zeros: [finite(q / a, "Zero"), finite(c / q, "Zero")]
        .sort((x, y) => x - y).map(re => ({ re, im: 0 })) };
    } },
  { id: "field.divergence.affine", module: "field", capability: "divergence",
    title: "Affine 3D field divergence", description: "Return the trace of the linear part of F(x) = Ax + b.",
    method: "analytic", inputSchema: withExample(obj({ matrixRowMajor: tuple(9) }),
      { matrixRowMajor: [1, 0, 0, 0, 2, 0, 0, 0, 3] }),
    outputSchema: obj({ divergence: num }),
    execute: input => {
      const a = input.matrixRowMajor as number[];
      return { divergence: finite(a[0] + a[4] + a[8], "Divergence") };
    } },
  { id: "quantum.probability-density.samples", module: "quantum", capability: "probability-density",
    title: "Sampled wavefunction probability density", description: "Normalize |ψ|² samples on an evenly spaced one dimensional grid.",
    method: "numerical", inputSchema: withExample(obj({ amplitudes: arr(tuple(2), 1, 10000),
      spacing: { type: "number", minimum: 0 } }),
      { amplitudes: [[1, 0], [0, 1]], spacing: 1 }),
    outputSchema: obj({ density: arr({ type: "number", minimum: 0 }, 1, 10000),
      normBeforeNormalization: { type: "number", minimum: 0 } }),
    execute: input => {
      const spacing = input.spacing as number;
      if (spacing === 0) throw new RangeError("Grid spacing must be positive.");
      const weights = (input.amplitudes as number[][]).map(([re, im]) =>
        finite(re * re + im * im, "Probability weight"));
      const norm = finite(weights.reduce((sum, weight) => sum + weight, 0) * spacing, "Wavefunction norm");
      if (norm === 0) throw new RangeError("The sampled wavefunction has zero norm.");
      return { density: weights.map(weight => finite(weight / norm, "Probability density")),
        normBeforeNormalization: norm };
    } },
] as const;

export const moduleScientificOperationBindings = Object.freeze(Object.fromEntries(
  MODULE_SCIENTIFIC_OPERATIONS.map(operation => [operation.id, {
    implementationId: `math3d.${operation.id}`,
    execute: (input: unknown) => operation.execute(input as RecordValue),
  }])));

export const moduleScientificOperationParameterSchema = empty;
