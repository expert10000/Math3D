import type { ModuleOperation } from "./moduleScientificOperations";
import { a, cross, dot, finiteResult as f, gcd, i, inverse, magnitude, mod, n, o,
  positive, t, unit, v2, v3, x } from "./moduleScientificOperationSupport";

const complex = o({ re: n, im: n });
const integerPair = t(2, { type: "integer", minimum: 0 });
const graphEdges = a(integerPair, 0, 20000);
const graphSchema = o({ vertexCount: { type: "integer", minimum: 1, maximum: 10000 }, edges: graphEdges });
const integerCoeff = { type: "integer" as const, minimum: -100000, maximum: 100000 };
const intPolynomial = a(integerCoeff, 1, 32);
const gridDimensions = t(3, { type: "integer", minimum: 2, maximum: 64 });
const gridValues = a(n, 8, 262144);
const gridInput = o({ dimensions: gridDimensions, values: gridValues });
const gridData = (input: Record<string, unknown>) => {
  const dimensions = input.dimensions as number[], values = input.values as number[];
  if (dimensions[0] * dimensions[1] * dimensions[2] !== values.length)
    throw new RangeError("Grid dimensions do not match scalar values.");
  return { dimensions, values,
    at: (ix: number, iy: number, iz: number) => values[ix + dimensions[0] * (iy + dimensions[1] * iz)] };
};
const graphRanks = (vertexCount: number, edges: number[][]) => {
  const parents = Array.from({ length: vertexCount }, (_, at) => at);
  const find = (at: number): number => {
    while (parents[at] !== at) { parents[at] = parents[parents[at]]; at = parents[at]; }
    return at;
  };
  const unique = new Set<string>();
  for (const [left, right] of edges) {
    if (left >= vertexCount || right >= vertexCount || left === right)
      throw new RangeError("Graph edges need two distinct valid vertices.");
    const key = `${Math.min(left, right)}:${Math.max(left, right)}`;
    if (unique.has(key)) throw new RangeError("Graph edges must be unique.");
    unique.add(key);
    parents[find(right)] = find(left);
  }
  const components = new Map<number, number[]>();
  for (let at = 0; at < vertexCount; at++) {
    const root = find(at);
    components.set(root, [...(components.get(root) ?? []), at]);
  }
  return { components: [...components.values()], b0: components.size,
    b1: edges.length - vertexCount + components.size };
};
const triangleFaces = a(t(3, { type: "integer", minimum: 0 }), 4, 20000);
const complexValue = (value: unknown) => value as { re: number; im: number };
const cmul = (left: { re: number; im: number }, right: { re: number; im: number }) => ({
  re: left.re * right.re - left.im * right.im,
  im: left.re * right.im + left.im * right.re,
});
const cadd = (left: { re: number; im: number }, right: { re: number; im: number }) => ({
  re: left.re + right.re, im: left.im + right.im,
});
const cdiv = (left: { re: number; im: number }, right: { re: number; im: number }) => {
  const denominator = right.re * right.re + right.im * right.im;
  if (denominator === 0) throw new RangeError("Complex denominator must be nonzero.");
  return { re: f((left.re * right.re + left.im * right.im) / denominator, "Complex quotient"),
    im: f((left.im * right.re - left.re * right.im) / denominator, "Complex quotient") };
};
const prime = (value: number): boolean => {
  if (value < 2) return false;
  for (let factor = 2; factor * factor <= value; factor++) if (value % factor === 0) return false;
  return true;
};
const eigen2 = (aa: number, bb: number, dd: number) => {
  const spread = Math.hypot(aa - dd, 2 * bb);
  return [(aa + dd - spread) / 2, (aa + dd + spread) / 2];
};

export const EXTENDED_SCIENTIFIC_OPERATIONS_B: readonly ModuleOperation[] = [
  { id: "volume.scalar-field.gaussian", module: "volume", capability: "scalar-fields",
    title: "Gaussian 3D scalar field", description: "Sample exp(−‖x−center‖²/(2σ²)) at one point.",
    method: "analytic", inputSchema: x(o({ point: v3, center: v3, sigma: positive }),
      { point: [1, 0, 0], center: [0, 0, 0], sigma: 1 }),
    outputSchema: o({ value: { type: "number", minimum: 0, maximum: 1 } }),
    execute: input => {
      const sigma = input.sigma as number;
      if (sigma === 0) throw new RangeError("Gaussian width must be positive.");
      const delta = (input.point as number[]).map((v, at) => v - (input.center as number[])[at]);
      return { value: f(Math.exp(-dot(delta, delta) / (2 * sigma * sigma)), "Scalar field") };
    } },
  { id: "volume.isosurface.affine-cell", module: "volume", capability: "isosurfaces",
    title: "Affine isosurface in unit cell", description: "Triangulate the plane F(x)=level for affine F(x)=gradient·x+offset inside [0,1]³.",
    method: "analytic", inputSchema: x(o({ gradient: v3, offset: n, level: n }),
      { gradient: [0, 0, 1], offset: 0, level: 0.5 }),
    outputSchema: o({ vertices: a(v3, 0, 12), triangles: a(t(3, { type: "integer", minimum: 0 }), 0, 10) }),
    execute: input => {
      const gradient = input.gradient as number[], offset = input.offset as number, level = input.level as number;
      const normal = unit(gradient, "Isosurface gradient");
      const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
        [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6],
        [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const points: number[][] = [];
      const addPoint = (point: number[]) => {
        if (!points.some(other => magnitude(other.map((v, at) => v - point[at])) < 1e-10))
          points.push(point);
      };
      for (const [left, right] of edges) {
        const p = corners[left], q = corners[right];
        const fp = dot(gradient, p) + offset - level, fq = dot(gradient, q) + offset - level;
        if (fp === 0) addPoint(p);
        if (fq === 0) addPoint(q);
        if (fp * fq < 0) {
          const fraction = fp / (fp - fq);
          addPoint(p.map((v, at) => f(v + fraction * (q[at] - v), "Isosurface vertex")));
        }
      }
      if (points.length < 3) return { vertices: points, triangles: [] };
      const center = [0, 1, 2].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
      const reference = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = unit(cross(normal, reference), "Isosurface basis"), v = cross(normal, u);
      points.sort((left, right) => Math.atan2(dot(left.map((item, at) => item - center[at]), v),
        dot(left.map((item, at) => item - center[at]), u)) -
        Math.atan2(dot(right.map((item, at) => item - center[at]), v),
          dot(right.map((item, at) => item - center[at]), u)));
      return { vertices: points, triangles: Array.from({ length: points.length - 2 }, (_, at) => [0, at + 1, at + 2]) };
    } },
  { id: "volume.slice.z-grid", module: "volume", capability: "slicing",
    title: "Z slice of scalar grid", description: "Extract one z-indexed slice from an x-fastest 3D scalar grid.",
    method: "algorithmic", inputSchema: x(o({ dimensions: gridDimensions, values: gridValues,
      zIndex: { type: "integer", minimum: 0 } }),
      { dimensions: [2, 2, 2], values: [0, 1, 2, 3, 4, 5, 6, 7], zIndex: 1 }),
    outputSchema: o({ width: i, height: i, values: a(n, 4, 4096) }),
    execute: input => {
      const { dimensions, values } = gridData(input), zIndex = input.zIndex as number;
      if (zIndex >= dimensions[2]) throw new RangeError("Z slice index is outside the grid.");
      const count = dimensions[0] * dimensions[1];
      return { width: dimensions[0], height: dimensions[1],
        values: values.slice(zIndex * count, (zIndex + 1) * count) };
    } },
  { id: "volume.integral.voxel-grid", module: "volume", capability: "integration",
    title: "Voxel scalar-field integral", description: "Sum finite grid samples times a strictly positive voxel volume.",
    method: "numerical", inputSchema: x(o({ values: a(n, 1, 262144), voxelVolume: positive }),
      { values: [1, 2, 3], voxelVolume: 0.5 }),
    outputSchema: o({ integral: n }),
    execute: input => {
      const voxelVolume = input.voxelVolume as number;
      if (voxelVolume === 0) throw new RangeError("Voxel volume must be positive.");
      return { integral: f((input.values as number[]).reduce((sum, value) => sum + value, 0) * voxelVolume,
        "Volume integral") };
    } },
  { id: "volume.gradient.trilinear", module: "volume", capability: "gradients",
    title: "Trilinear grid gradient", description: "Differentiate trilinear interpolation in index coordinates inside a scalar cell.",
    method: "numerical", inputSchema: x(o({ dimensions: gridDimensions, values: gridValues, point: v3 }),
      { dimensions: [2, 2, 2], values: [0, 1, 2, 3, 4, 5, 6, 7], point: [0.5, 0.5, 0.5] }),
    outputSchema: o({ gradient: v3 }),
    execute: input => {
      const { dimensions, at } = gridData(input), point = input.point as number[];
      if (point.some((v, axis) => v < 0 || v > dimensions[axis] - 1))
        throw new RangeError("Gradient sample is outside the grid.");
      const base = point.map((v, axis) => Math.min(Math.floor(v), dimensions[axis] - 2));
      const [u, v, w] = point.map((item, axis) => item - base[axis]);
      const [ix, iy, iz] = base;
      const cube = (dx: number, dy: number, dz: number) => at(ix + dx, iy + dy, iz + dz);
      const mix = (first: number, second: number, weight: number) => first * (1 - weight) + second * weight;
      const dx = mix(mix(cube(1, 0, 0) - cube(0, 0, 0), cube(1, 1, 0) - cube(0, 1, 0), v),
        mix(cube(1, 0, 1) - cube(0, 0, 1), cube(1, 1, 1) - cube(0, 1, 1), v), w);
      const dy = mix(mix(cube(0, 1, 0) - cube(0, 0, 0), cube(1, 1, 0) - cube(1, 0, 0), u),
        mix(cube(0, 1, 1) - cube(0, 0, 1), cube(1, 1, 1) - cube(1, 0, 1), u), w);
      const dz = mix(mix(cube(0, 0, 1) - cube(0, 0, 0), cube(1, 0, 1) - cube(1, 0, 0), u),
        mix(cube(0, 1, 1) - cube(0, 1, 0), cube(1, 1, 1) - cube(1, 1, 0), u), v);
      return { gradient: [f(dx, "Gradient"), f(dy, "Gradient"), f(dz, "Gradient")] };
    } },

  { id: "topology.genus.closed-triangles", module: "topology", capability: "genus",
    title: "Closed oriented triangle-mesh genus", description: "Verify a connected orientable triangle manifold, then compute genus (2−χ)/2.",
    method: "algorithmic", inputSchema: x(o({ vertexCount: { type: "integer", minimum: 4, maximum: 10000 },
      faces: triangleFaces }),
      { vertexCount: 4, faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] }),
    outputSchema: o({ eulerCharacteristic: i, genus: { type: "integer", minimum: 0 } }),
    execute: input => {
      const count = input.vertexCount as number, faces = input.faces as number[][];
      const edges = new Map<string, number[]>(), links = Array.from({ length: count }, () => new Map<number, Set<number>>());
      const faceKeys = new Set<string>();
      for (const face of faces) {
        if (new Set(face).size !== 3 || face.some(v => v >= count)) throw new RangeError("Invalid triangle face.");
        const key = [...face].sort((left, right) => left - right).join(":");
        if (faceKeys.has(key)) throw new RangeError("Duplicate triangle face.");
        faceKeys.add(key);
        for (let at = 0; at < 3; at++) {
          const left = face[at], right = face[(at + 1) % 3];
          const edge = `${Math.min(left, right)}:${Math.max(left, right)}`;
          edges.set(edge, [...(edges.get(edge) ?? []), left < right ? 1 : -1]);
          const center = face[at], one = face[(at + 1) % 3], two = face[(at + 2) % 3];
          if (!links[center].has(one)) links[center].set(one, new Set());
          if (!links[center].has(two)) links[center].set(two, new Set());
          links[center].get(one)!.add(two);
          links[center].get(two)!.add(one);
        }
      }
      if ([...edges.values()].some(incidence => incidence.length !== 2 || incidence[0] + incidence[1] !== 0))
        throw new RangeError("Mesh must be closed and consistently oriented.");
      for (const link of links) {
        if (!link.size || [...link.values()].some(neighbors => neighbors.size !== 2))
          throw new RangeError("Every vertex link must be one cycle.");
        const reached = new Set<number>(), start = link.keys().next().value as number, queue = [start];
        while (queue.length) {
          const vertex = queue.pop()!;
          if (reached.has(vertex)) continue;
          reached.add(vertex);
          queue.push(...link.get(vertex)!);
        }
        if (reached.size !== link.size) throw new RangeError("Vertex link is disconnected.");
      }
      const edgePairs = [...edges.keys()].map(key => key.split(":").map(Number));
      if (graphRanks(count, edgePairs).b0 !== 1) throw new RangeError("Mesh must be connected.");
      const chi = count - edges.size + faces.length, genus = (2 - chi) / 2;
      if (!Number.isInteger(genus) || genus < 0) throw new RangeError("Invalid orientable surface genus.");
      return { eulerCharacteristic: chi, genus };
    } },
  { id: "topology.components.graph", module: "topology", capability: "connected-components",
    title: "Graph connected components", description: "Find vertex components of a simple undirected graph.",
    method: "algorithmic", inputSchema: x(graphSchema,
      { vertexCount: 4, edges: [[0, 1], [2, 3]] }),
    outputSchema: o({ components: a(a(i, 1, 10000), 1, 10000) }),
    execute: input => ({ components: graphRanks(input.vertexCount as number,
      input.edges as number[][]).components }) },
  { id: "topology.homology.graph", module: "topology", capability: "homology",
    title: "Integral graph homology ranks", description: "Return free H₀ and H₁ ranks of a finite undirected graph; graph homology has no torsion.",
    method: "algorithmic", inputSchema: x(graphSchema,
      { vertexCount: 3, edges: [[0, 1], [1, 2], [0, 2]] }),
    outputSchema: o({ h0Rank: { type: "integer", minimum: 1 }, h1Rank: { type: "integer", minimum: 0 },
      torsion: a(i, 0, 0) }),
    execute: input => {
      const { b0, b1 } = graphRanks(input.vertexCount as number, input.edges as number[][]);
      return { h0Rank: b0, h1Rank: b1, torsion: [] };
    } },
  { id: "topology.betti.graph", module: "topology", capability: "betti-numbers",
    title: "Graph Betti numbers", description: "Compute β₀ and β₁ of a finite undirected graph.",
    method: "algorithmic", inputSchema: x(graphSchema,
      { vertexCount: 3, edges: [[0, 1], [1, 2], [0, 2]] }),
    outputSchema: o({ betti0: { type: "integer", minimum: 1 }, betti1: { type: "integer", minimum: 0 } }),
    execute: input => {
      const { b0, b1 } = graphRanks(input.vertexCount as number, input.edges as number[][]);
      return { betti0: b0, betti1: b1 };
    } },
  { id: "topology.persistence.graph-h0", module: "topology", capability: "persistent-homology",
    title: "Graph H₀ persistence", description: "Compute zero-dimensional deaths for vertices born at 0 and edges entering at nonnegative weights.",
    method: "algorithmic", inputSchema: x(o({ vertexCount: { type: "integer", minimum: 1, maximum: 10000 },
      weightedEdges: a(t(3, { type: "number", minimum: 0 }), 0, 20000) }),
      { vertexCount: 3, weightedEdges: [[0, 1, 1], [1, 2, 2]] }),
    outputSchema: o({ finiteDeaths: a(positive, 0, 10000), infiniteCount: { type: "integer", minimum: 1 } }),
    execute: input => {
      const count = input.vertexCount as number, edges = input.weightedEdges as number[][];
      const parents = Array.from({ length: count }, (_, at) => at), seen = new Set<string>();
      const find = (start: number): number => {
        while (parents[start] !== start) { parents[start] = parents[parents[start]]; start = parents[start]; }
        return start;
      };
      for (const [left, right] of edges) {
        if (!Number.isInteger(left) || !Number.isInteger(right) || left >= count || right >= count || left === right)
          throw new RangeError("Weighted graph needs distinct valid integer vertex IDs.");
        const key = `${Math.min(left, right)}:${Math.max(left, right)}`;
        if (seen.has(key)) throw new RangeError("Weighted edges must be unique.");
        seen.add(key);
      }
      const finiteDeaths: number[] = [];
      for (const [left, right, weight] of [...edges].sort((one, two) => one[2] - two[2])) {
        const a = find(left), b = find(right);
        if (a !== b) { parents[b] = a; finiteDeaths.push(weight); }
      }
      return { finiteDeaths, infiniteCount: count - finiteDeaths.length };
    } },

  { id: "cas.simplify.polynomial", module: "cas", capability: "simplification",
    title: "Polynomial canonical simplification", description: "Remove trailing zero terms from ascending integer coefficients.",
    method: "exact", inputSchema: x(o({ coefficients: intPolynomial }),
      { coefficients: [1, 2, 0, 0] }),
    outputSchema: o({ coefficients: a(i, 1, 32) }),
    execute: input => {
      const coefficients = [...input.coefficients as number[]];
      while (coefficients.length > 1 && coefficients.at(-1) === 0) coefficients.pop();
      return { coefficients };
    } },
  { id: "cas.integrate.polynomial", module: "cas", capability: "integration",
    title: "Exact polynomial antiderivative", description: "Integrate integer coefficients into reduced rational coefficients, with constant term zero.",
    method: "exact", inputSchema: x(o({ coefficients: intPolynomial }),
      { coefficients: [1, 2, 3] }),
    outputSchema: o({ rationalCoefficients: a(t(2, i), 2, 33) }),
    execute: input => ({ rationalCoefficients: [[0, 1], ...(input.coefficients as number[]).map((coefficient, at) => {
      const denominator = at + 1, divisor = gcd(coefficient, denominator);
      return [coefficient / divisor, denominator / divisor];
    })] }) },
  { id: "cas.solve.linear", module: "cas", capability: "equation-solving",
    title: "Exact linear equation solution", description: "Solve ax+b=0 over rational numbers, including none and all cases.",
    method: "exact", inputSchema: x(o({ a: integerCoeff, b: integerCoeff }), { a: 2, b: -3 }),
    outputSchema: o({ kind: { type: "string", enum: ["one", "none", "all"] },
      rationalRoot: { anyOf: [t(2, i), { type: "null" }] } }),
    execute: input => {
      const aa = input.a as number, bb = input.b as number;
      if (aa === 0) return { kind: bb === 0 ? "all" : "none", rationalRoot: null };
      const divisor = gcd(aa, bb), denominator = Math.abs(aa / divisor);
      return { kind: "one", rationalRoot: [-bb / divisor * Math.sign(aa), denominator] };
    } },
  { id: "cas.polynomial.multiply", module: "cas", capability: "polynomial-operations",
    title: "Exact integer polynomial product", description: "Convolve two bounded ascending-coefficient integer polynomials.",
    method: "exact", inputSchema: x(o({ first: intPolynomial, second: intPolynomial }),
      { first: [1, 1], second: [1, -1] }),
    outputSchema: o({ coefficients: a(i, 1, 63) }),
    execute: input => {
      const first = input.first as number[], second = input.second as number[];
      const coefficients = Array<number>(first.length + second.length - 1).fill(0);
      for (let at = 0; at < first.length; at++) for (let bt = 0; bt < second.length; bt++)
        coefficients[at + bt] += first[at] * second[bt];
      return { coefficients };
    } },

  { id: "number-theory.factor.integer", module: "number-theory", capability: "factorization",
    title: "Positive integer prime factorization", description: "Factor a positive integer at most 10⁹ by exact trial division.",
    method: "exact", inputSchema: x(o({ value: { type: "integer", minimum: 1, maximum: 1000000000 } }),
      { value: 360 }),
    outputSchema: o({ factors: a(o({ prime: { type: "integer", minimum: 2 },
      exponent: { type: "integer", minimum: 1 } }), 0, 32) }),
    execute: input => {
      let remainder = input.value as number;
      const factors: { prime: number; exponent: number }[] = [];
      for (let factor = 2; factor * factor <= remainder; factor += factor === 2 ? 1 : 2) {
        if (remainder % factor !== 0) continue;
        let exponent = 0;
        while (remainder % factor === 0) { remainder /= factor; exponent++; }
        factors.push({ prime: factor, exponent });
      }
      if (remainder > 1) factors.push({ prime: remainder, exponent: 1 });
      return { factors };
    } },
  { id: "number-theory.field.quadratic-element", module: "number-theory", capability: "number-fields",
    title: "Quadratic field norm and trace", description: "Compute norm and trace of a+b√D for positive squarefree nonsquare D.",
    method: "exact", inputSchema: x(o({ a: { type: "integer", minimum: -10000, maximum: 10000 },
      b: { type: "integer", minimum: -10000, maximum: 10000 },
      d: { type: "integer", minimum: 2, maximum: 1000 } }), { a: 3, b: 2, d: 2 }),
    outputSchema: o({ norm: i, trace: i }),
    execute: input => {
      const aa = input.a as number, bb = input.b as number, dd = input.d as number;
      for (let factor = 2; factor * factor <= dd; factor++)
        if (dd % (factor * factor) === 0) throw new RangeError("D must be squarefree.");
      return { norm: aa * aa - dd * bb * bb, trace: 2 * aa };
    } },
  { id: "number-theory.galois.quadratic", module: "number-theory", capability: "galois-groups",
    title: "Quadratic Galois group order", description: "Classify the splitting-field group of an integer quadratic as trivial or C₂.",
    method: "exact", inputSchema: x(o({ a: integerCoeff, b: integerCoeff, c: integerCoeff }),
      { a: 1, b: 0, c: -2 }),
    outputSchema: o({ discriminant: i, groupOrder: { type: "integer", enum: [1, 2] } }),
    execute: input => {
      const aa = input.a as number, bb = input.b as number, cc = input.c as number;
      if (aa === 0) throw new RangeError("Quadratic coefficient must be nonzero.");
      const discriminant = bb * bb - 4 * aa * cc;
      const root = Math.floor(Math.sqrt(Math.abs(discriminant)));
      return { discriminant, groupOrder: discriminant >= 0 && root * root === discriminant ? 1 : 2 };
    } },
  { id: "number-theory.elliptic.add-prime-field", module: "number-theory", capability: "elliptic-curves",
    title: "Elliptic point addition over Fp", description: "Add two points on nonsingular y²=x³+ax+b over a prime field; null is infinity.",
    method: "exact", inputSchema: x(o({ prime: { type: "integer", minimum: 3, maximum: 1009 },
      a: i, b: i, first: { anyOf: [t(2, i), { type: "null" }] },
      second: { anyOf: [t(2, i), { type: "null" }] } }),
      { prime: 17, a: 2, b: 2, first: [5, 1], second: [6, 3] }),
    outputSchema: o({ point: { anyOf: [t(2, i), { type: "null" }] } }),
    execute: input => {
      const p = input.prime as number, aa = mod(input.a as number, p), bb = mod(input.b as number, p);
      if (!prime(p) || mod(4 * aa ** 3 + 27 * bb ** 2, p) === 0)
        throw new RangeError("Use a prime field and nonsingular curve.");
      const check = (point: number[] | null) => {
        if (!point) return;
        if (point.some(v => v < 0 || v >= p) || mod(point[1] ** 2 - point[0] ** 3 - aa * point[0] - bb, p) !== 0)
          throw new RangeError("Point is not on the elliptic curve.");
      };
      const first = input.first as number[] | null, second = input.second as number[] | null;
      check(first); check(second);
      if (!first) return { point: second };
      if (!second) return { point: first };
      const [x1, y1] = first, [x2, y2] = second;
      if (x1 === x2 && mod(y1 + y2, p) === 0) return { point: null };
      const denominator = x1 === x2 ? mod(2 * y1, p) : mod(x2 - x1, p);
      const inv = inverse(denominator, p);
      if (inv === null) throw new RangeError("Elliptic slope is undefined.");
      const slope = mod((x1 === x2 ? 3 * x1 * x1 + aa : y2 - y1) * inv, p);
      const x3 = mod(slope * slope - x1 - x2, p), y3 = mod(slope * (x1 - x3) - y1, p);
      return { point: [x3, y3] };
    } },

  { id: "complex.pole.simple", module: "complex", capability: "poles",
    title: "Simple rational pole", description: "Locate the pole of numerator/(z−center), or null when numerator is zero.",
    method: "analytic", inputSchema: x(o({ center: complex, numerator: complex }),
      { center: { re: 1, im: 2 }, numerator: { re: 3, im: 0 } }),
    outputSchema: o({ pole: { anyOf: [complex, { type: "null" }] } }),
    execute: input => {
      const numerator = complexValue(input.numerator);
      return { pole: numerator.re === 0 && numerator.im === 0 ? null : input.center };
    } },
  { id: "complex.residue.simple", module: "complex", capability: "residues",
    title: "Simple rational residue", description: "Compute residue of numerator/(z−center) at center.",
    method: "analytic", inputSchema: x(o({ center: complex, numerator: complex }),
      { center: { re: 1, im: 2 }, numerator: { re: 3, im: -1 } }),
    outputSchema: o({ residue: complex }),
    execute: input => ({ residue: input.numerator }) },
  { id: "complex.mobius.real-coefficients", module: "complex", capability: "conformal-mappings",
    title: "Real-coefficient Möbius mapping", description: "Evaluate (az+b)/(cz+d) for real coefficients with ad−bc≠0 and finite denominator.",
    method: "analytic", inputSchema: x(o({ a: n, b: n, c: n, d: n, point: complex }),
      { a: 1, b: 1, c: 0, d: 1, point: { re: 2, im: 3 } }),
    outputSchema: o({ image: complex }),
    execute: input => {
      const aa = input.a as number, bb = input.b as number, cc = input.c as number, dd = input.d as number;
      if (aa * dd - bb * cc === 0) throw new RangeError("Möbius determinant must be nonzero.");
      const z = complexValue(input.point);
      return { image: cdiv(cadd(cmul({ re: aa, im: 0 }, z), { re: bb, im: 0 }),
        cadd(cmul({ re: cc, im: 0 }, z), { re: dd, im: 0 })) };
    } },
  { id: "complex.contour.simple-pole", module: "complex", capability: "contour-integration",
    title: "Circular simple-pole contour integral", description: "Integrate numerator/(z−pole) around a positively oriented circle using the residue theorem.",
    method: "analytic", inputSchema: x(o({ pole: complex, numerator: complex,
      center: complex, radius: positive }),
      { pole: { re: 0, im: 0 }, numerator: { re: 1, im: 0 }, center: { re: 0, im: 0 }, radius: 2 }),
    outputSchema: o({ integral: complex }),
    execute: input => {
      const pole = complexValue(input.pole), center = complexValue(input.center),
        numerator = complexValue(input.numerator), radius = input.radius as number;
      if (radius === 0) throw new RangeError("Contour radius must be positive.");
      const distance = Math.hypot(pole.re - center.re, pole.im - center.im);
      if (Math.abs(distance - radius) <= 1e-12 * Math.max(1, radius))
        throw new RangeError("Pole on the contour makes the integral undefined.");
      return { integral: distance < radius ?
        { re: f(-2 * Math.PI * numerator.im, "Contour integral"),
          im: f(2 * Math.PI * numerator.re, "Contour integral") } : { re: 0, im: 0 } };
    } },
  { id: "complex.domain-color.point", module: "complex", capability: "domain-coloring",
    title: "Complex point domain color coordinates", description: "Map phase to hue and log magnitude to lightness; hue is null at zero.",
    method: "analytic", inputSchema: x(o({ value: complex }), { value: { re: 0, im: 1 } }),
    outputSchema: o({ hue: { anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }] },
      lightness: { type: "number", minimum: 0, maximum: 1 } }),
    execute: input => {
      const z = complexValue(input.value), magnitude = Math.hypot(z.re, z.im);
      const phase = Math.atan2(z.im, z.re) / (2 * Math.PI);
      return { hue: magnitude === 0 ? null : mod(phase, 1),
        lightness: f(1 - 1 / (1 + Math.log1p(magnitude)), "Domain color lightness") };
    } },

  { id: "field.curl.affine", module: "field", capability: "curl",
    title: "Affine 3D vector-field curl", description: "Compute the constant curl of F(x)=Ax+b from row-major A.",
    method: "analytic", inputSchema: x(o({ matrixRowMajor: t(9) }),
      { matrixRowMajor: [0, -1, 0, 1, 0, 0, 0, 0, 0] }),
    outputSchema: o({ curl: v3 }),
    execute: input => {
      const m = input.matrixRowMajor as number[];
      return { curl: [f(m[7] - m[5], "Curl"), f(m[2] - m[6], "Curl"),
        f(m[3] - m[1], "Curl")] };
    } },
  { id: "field.streamline.constant", module: "field", capability: "streamlines",
    title: "Constant-field streamline", description: "Sample x(t)=x₀+tF for a constant 3D vector field.",
    method: "analytic", inputSchema: x(o({ initial: v3, vector: v3, times: a(n, 1, 1000) }),
      { initial: [0, 0, 0], vector: [1, 2, 0], times: [0, 1, 2] }),
    outputSchema: o({ points: a(v3, 1, 1000) }),
    execute: input => ({ points: (input.times as number[]).map(time =>
      (input.initial as number[]).map((value, at) => f(value + time * (input.vector as number[])[at],
        "Streamline point"))) }) },
  { id: "field.comparison.samples", module: "field", capability: "comparison",
    title: "Vector-field sample comparison", description: "Compute component-wise RMSE between equal-length 3D vector samples.",
    method: "numerical", inputSchema: x(o({ first: a(v3, 1, 10000), second: a(v3, 1, 10000) }),
      { first: [[1, 0, 0], [0, 1, 0]], second: [[1, 0, 0], [0, 1, 0]] }),
    outputSchema: o({ rmse: positive, sampleCount: { type: "integer", minimum: 1 } }),
    execute: input => {
      const first = input.first as number[][], second = input.second as number[][];
      if (first.length !== second.length) throw new RangeError("Field sample counts must match.");
      const squared = first.reduce((sum, point, at) => sum + point.reduce((inner, value, axis) =>
        inner + (value - second[at][axis]) ** 2, 0), 0);
      return { rmse: f(Math.sqrt(squared / (3 * first.length)), "Field RMSE"), sampleCount: first.length };
    } },
  { id: "field.flux.planar-patch", module: "field", capability: "flux",
    title: "Constant-field planar flux", description: "Compute area F·n through a flat patch with supplied outward normal.",
    method: "analytic", inputSchema: x(o({ vector: v3, normal: v3, area: positive }),
      { vector: [0, 0, 2], normal: [0, 0, 1], area: 3 }),
    outputSchema: o({ flux: n }),
    execute: input => ({ flux: f((input.area as number) * dot(input.vector as number[],
      unit(input.normal as number[], "Normal")), "Flux") }) },
  { id: "field.critical.diagonal-affine", module: "field", capability: "critical-points",
    title: "Diagonal affine field critical point", description: "Solve F(x)=diag(a)x+b=0 when all diagonal entries are nonzero.",
    method: "analytic", inputSchema: x(o({ diagonal: v3, offset: v3 }),
      { diagonal: [1, 2, 3], offset: [-1, -2, -3] }),
    outputSchema: o({ point: v3 }),
    execute: input => {
      const diagonal = input.diagonal as number[], offset = input.offset as number[];
      if (diagonal.some(value => value === 0)) throw new RangeError("Diagonal field entries must be nonzero.");
      return { point: diagonal.map((value, at) => f(-offset[at] / value, "Field critical point")) };
    } },

  { id: "quantum.eigenvalues.symmetric-two-state", module: "quantum", capability: "eigenvalues",
    title: "Two-state symmetric eigenvalues", description: "Compute ordered real eigenvalues of [[a,b],[b,d]].",
    method: "analytic", inputSchema: x(o({ a: n, b: n, d: n }), { a: 2, b: 1, d: 2 }),
    outputSchema: o({ eigenvalues: v2 }),
    execute: input => ({ eigenvalues: eigen2(input.a as number, input.b as number,
      input.d as number).map(value => f(value, "Eigenvalue")) }) },
  { id: "quantum.eigenstates.symmetric-two-state", module: "quantum", capability: "eigenstates",
    title: "Two-state symmetric eigenvectors", description: "Compute ordered normalized real eigenvectors of [[a,b],[b,d]].",
    method: "analytic", inputSchema: x(o({ a: n, b: n, d: n }), { a: 2, b: 1, d: 2 }),
    outputSchema: o({ eigenvalues: v2, eigenvectors: t(2, v2) }),
    execute: input => {
      const aa = input.a as number, bb = input.b as number, dd = input.d as number;
      const eigenvalues = eigen2(aa, bb, dd).map(value => f(value, "Eigenvalue"));
      if (bb === 0) return { eigenvalues, eigenvectors: aa <= dd ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]] };
      const first = unit(Math.abs(bb) >= Math.abs(eigenvalues[0] - aa) ?
        [bb, eigenvalues[0] - aa] : [eigenvalues[0] - dd, bb], "Eigenvector");
      return { eigenvalues, eigenvectors: [first, [-first[1], first[0]]] };
    } },
  { id: "quantum.expectation.diagonal-two-state", module: "quantum", capability: "expectation-values",
    title: "Two-state diagonal expectation", description: "Compute ⟨H⟩ for two complex amplitudes and real diagonal energies.",
    method: "analytic", inputSchema: x(o({ energies: v2, amplitudes: t(2, v2) }),
      { energies: [1, 3], amplitudes: [[1, 0], [1, 0]] }),
    outputSchema: o({ expectation: n, norm: positive }),
    execute: input => {
      const amplitudes = input.amplitudes as number[][], energies = input.energies as number[];
      const weights = amplitudes.map(([re, im]) => re * re + im * im);
      const norm = f(weights[0] + weights[1], "Wavefunction norm");
      if (norm === 0) throw new RangeError("Wavefunction norm must be positive.");
      return { expectation: f((weights[0] * energies[0] + weights[1] * energies[1]) / norm,
        "Expectation value"), norm };
    } },
  { id: "quantum.evolution.diagonal-two-state", module: "quantum", capability: "time-evolution",
    title: "Diagonal two-state time evolution", description: "Evolve each complex amplitude by exp(−iEt/ℏ) for real diagonal energies.",
    method: "analytic", inputSchema: x(o({ energies: v2, amplitudes: t(2, v2), time: n,
      hbar: positive }), { energies: [0, 1], amplitudes: [[1, 0], [0, 1]],
      time: Math.PI, hbar: 1 }),
    outputSchema: o({ amplitudes: t(2, v2) }),
    execute: input => {
      const hbar = input.hbar as number;
      if (hbar === 0) throw new RangeError("ℏ must be positive.");
      const energies = input.energies as number[], amplitudes = input.amplitudes as number[][];
      return { amplitudes: amplitudes.map(([re, im], at) => {
        const phase = energies[at] * (input.time as number) / hbar;
        return [f(re * Math.cos(phase) + im * Math.sin(phase), "Evolved amplitude"),
          f(im * Math.cos(phase) - re * Math.sin(phase), "Evolved amplitude")];
      }) };
    } },
];
