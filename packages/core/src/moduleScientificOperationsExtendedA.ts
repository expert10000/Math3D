import type { ModuleOperation } from "./moduleScientificOperations";
import { a, cross, dot, finiteResult as f, magnitude, n, o, positive, t, unit, v2, v3, x } from
  "./moduleScientificOperationSupport";

const c = { type: "number" as const, minimum: -1000000, maximum: 1000000 };
const abc = o({ a: c, b: c, c });
const pointArray = a(v3, 3, 3);
const polySchema = a(c, 1, 9);
const value = (coefficients: number[], at: number) => coefficients.reduceRight((sum, coefficient) =>
  sum * at + coefficient, 0);
const angle = (left: number[], right: number[]) => Math.acos(Math.max(-1, Math.min(1,
  dot(unit(left, "Vector"), unit(right, "Vector")))));
const triangleEdges = (face: number[]) => [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]];
const faceKey = (face: number[]) => [...face].sort((left, right) => left - right).join(":");
const edgeKey = (left: number, right: number) => `${Math.min(left, right)}:${Math.max(left, right)}`;
const sphereDistance = (first: number[], second: number[], radius: number) =>
  f(radius * angle(first, second), "Great-circle distance");

export const EXTENDED_SCIENTIFIC_OPERATIONS_A: readonly ModuleOperation[] = [
  { id: "graph2d.extrema.quadratic", module: "graph2d", capability: "extrema",
    title: "Quadratic extremum", description: "Find the minimum or maximum of ax²+bx+c for nonzero a.",
    method: "analytic", inputSchema: x(abc, { a: 1, b: -4, c: 5 }),
    outputSchema: o({ x: n, y: n, kind: { type: "string", enum: ["minimum", "maximum"] } }),
    execute: input => {
      const { a, b, c } = input as { a: number; b: number; c: number };
      if (a === 0) throw new RangeError("Quadratic coefficient a must be nonzero.");
      const at = f(-b / (2 * a), "Extremum coordinate");
      return { x: at, y: f(a * at * at + b * at + c, "Extremum value"),
        kind: a > 0 ? "minimum" : "maximum" };
    } },
  { id: "graph2d.derivative.polynomial", module: "graph2d", capability: "derivatives",
    title: "Polynomial derivative at x", description: "Evaluate a polynomial and its derivative from ascending coefficients.",
    method: "analytic", inputSchema: x(o({ coefficients: polySchema, at: n }),
      { coefficients: [1, 2, 3], at: 2 }),
    outputSchema: o({ value: n, derivative: n }),
    execute: input => {
      const coefficients = input.coefficients as number[], at = input.at as number;
      return { value: f(value(coefficients, at), "Polynomial value"),
        derivative: f(value(coefficients.slice(1).map((v, i) => v * (i + 1)), at), "Derivative") };
    } },
  { id: "graph2d.integral.polynomial", module: "graph2d", capability: "integrals",
    title: "Definite polynomial integral", description: "Integrate an ascending-coefficient polynomial between finite bounds.",
    method: "analytic", inputSchema: x(o({ coefficients: polySchema, lower: n, upper: n }),
      { coefficients: [0, 0, 1], lower: 0, upper: 1 }),
    outputSchema: o({ integral: n }),
    execute: input => {
      const coefficients = input.coefficients as number[], lo = input.lower as number, hi = input.upper as number;
      return { integral: f(coefficients.reduce((sum, coefficient, degree) => sum +
        coefficient * (hi ** (degree + 1) - lo ** (degree + 1)) / (degree + 1), 0), "Integral") };
    } },
  { id: "graph2d.intersection.lines", module: "graph2d", capability: "intersections",
    title: "Two line intersection", description: "Intersect y=m₁x+b₁ and y=m₂x+b₂; return null for parallel lines.",
    method: "analytic", inputSchema: x(o({ first: v2, second: v2 }),
      { first: [1, 0], second: [-1, 2] }),
    outputSchema: o({ point: { anyOf: [v2, { type: "null" }] } }),
    execute: input => {
      const [m1, b1] = input.first as number[], [m2, b2] = input.second as number[];
      if (m1 === m2) {
        if (b1 === b2) throw new RangeError("Coincident lines have infinitely many intersections.");
        return { point: null };
      }
      const at = f((b2 - b1) / (m1 - m2), "Intersection coordinate");
      return { point: [at, f(m1 * at + b1, "Intersection coordinate")] };
    } },
  { id: "graph2d.asymptotes.linear-rational", module: "graph2d", capability: "asymptotes",
    title: "Linear rational asymptotes", description: "Find horizontal and possible vertical asymptotes of (ax+b)/(cx+d), c≠0.",
    method: "analytic", inputSchema: x(o({ a: c, b: c, c, d: c }), { a: 2, b: 1, c: 1, d: -3 }),
    outputSchema: o({ horizontal: n, vertical: { anyOf: [n, { type: "null" }] } }),
    execute: input => {
      const { a, b, c, d } = input as { a: number; b: number; c: number; d: number };
      if (c === 0) throw new RangeError("Denominator coefficient c must be nonzero.");
      const pole = f(-d / c, "Denominator zero");
      return { horizontal: f(a / c, "Horizontal asymptote"),
        vertical: a * d - b * c === 0 ? null : pole };
    } },
  { id: "graph2d.regression.linear", module: "graph2d", capability: "regression",
    title: "Linear least-squares regression", description: "Fit y=mx+b to distinct x samples and report RMSE.",
    method: "numerical", inputSchema: x(o({ points: a(v2, 2, 1000) }),
      { points: [[0, 1], [1, 3], [2, 5]] }),
    outputSchema: o({ slope: n, intercept: n, rmse: positive }),
    execute: input => {
      const points = input.points as number[][];
      const meanX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const meanY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      const variance = points.reduce((sum, p) => sum + (p[0] - meanX) ** 2, 0);
      if (variance === 0) throw new RangeError("Regression needs distinct x values.");
      const slope = f(points.reduce((sum, p) => sum + (p[0] - meanX) * (p[1] - meanY), 0) /
        variance, "Slope");
      const intercept = f(meanY - slope * meanX, "Intercept");
      const rmse = f(Math.sqrt(points.reduce((sum, p) => sum +
        (p[1] - slope * p[0] - intercept) ** 2, 0) / points.length), "RMSE");
      return { slope, intercept, rmse };
    } },
  { id: "graph2d.ode.exponential", module: "graph2d", capability: "ode-solutions",
    title: "Exponential ODE solution", description: "Solve y′=ky with y(0)=y₀ at supplied times.",
    method: "analytic", inputSchema: x(o({ k: n, initial: n, times: a(n, 1, 1000) }),
      { k: -1, initial: 2, times: [0, 1, 2] }),
    outputSchema: o({ values: a(n, 1, 1000) }),
    execute: input => {
      const k = input.k as number, initial = input.initial as number;
      return { values: (input.times as number[]).map(time => f(initial * Math.exp(k * time), "ODE value")) };
    } },

  { id: "graph3d.critical.diagonal-quadratic", module: "graph3d", capability: "critical-points",
    title: "3D quadratic critical point", description: "Locate and classify the stationary point of ax²+by²+cz²+dx+ey+fz+g.",
    method: "analytic", inputSchema: x(o({ coefficients: t(7) }),
      { coefficients: [1, 2, 3, -2, -4, -6, 0] }),
    outputSchema: o({ point: v3, kind: { type: "string", enum: ["minimum", "maximum", "saddle"] } }),
    execute: input => {
      const [a, b, c, d, e, f0] = input.coefficients as number[];
      if ([a, b, c].some(v => v === 0)) throw new RangeError("Diagonal quadratic coefficients must be nonzero.");
      return { point: [f(-d / (2 * a), "Critical point"), f(-e / (2 * b), "Critical point"),
        f(-f0 / (2 * c), "Critical point")],
      kind: [a, b, c].every(v => v > 0) ? "minimum" :
        [a, b, c].every(v => v < 0) ? "maximum" : "saddle" };
    } },
  { id: "graph3d.hessian.diagonal-quadratic", module: "graph3d", capability: "hessians",
    title: "3D quadratic Hessian", description: "Compute the constant Hessian of ax²+by²+cz²+dx+ey+fz+g.",
    method: "analytic", inputSchema: x(o({ coefficients: t(7) }),
      { coefficients: [1, 2, 3, 4, 5, 6, 0] }),
    outputSchema: o({ matrixRowMajor: t(9) }),
    execute: input => {
      const [a, b, c] = input.coefficients as number[];
      return { matrixRowMajor: [f(2 * a, "Hessian"), 0, 0, 0, f(2 * b, "Hessian"), 0,
        0, 0, f(2 * c, "Hessian")] };
    } },
  { id: "graph3d.level-set.sphere", module: "graph3d", capability: "level-sets",
    title: "Spherical level-set point", description: "Find a point on ‖x−center‖²=radius² along a given direction.",
    method: "analytic", inputSchema: x(o({ center: v3, radius: positive, direction: v3 }),
      { center: [0, 0, 0], radius: 2, direction: [1, 1, 0] }),
    outputSchema: o({ point: v3 }),
    execute: input => {
      const center = input.center as number[], radius = input.radius as number;
      if (radius === 0) throw new RangeError("Sphere radius must be positive.");
      return { point: unit(input.direction as number[], "Direction")
        .map((v, at) => f(center[at] + radius * v, "Level-set point")) };
    } },
  { id: "graph3d.constrained-extrema.unit-sphere", module: "graph3d", capability: "constrained-extrema",
    title: "Quadratic extrema on unit sphere", description: "Find min and max of ax²+by²+cz² under x²+y²+z²=1.",
    method: "analytic", inputSchema: x(o({ diagonal: v3 }), { diagonal: [1, 2, 3] }),
    outputSchema: o({ minimum: n, maximum: n, minimumAxis: { type: "integer", minimum: 0, maximum: 2 },
      maximumAxis: { type: "integer", minimum: 0, maximum: 2 } }),
    execute: input => {
      const values = input.diagonal as number[];
      const minimum = Math.min(...values), maximum = Math.max(...values);
      return { minimum, maximum, minimumAxis: values.indexOf(minimum), maximumAxis: values.indexOf(maximum) };
    } },

  { id: "curve.curvature.circle", module: "curve", capability: "curvature",
    title: "Circle curvature", description: "Compute constant curvature 1/r of a circle of positive radius.",
    method: "analytic", inputSchema: x(o({ radius: positive }), { radius: 2 }),
    outputSchema: o({ curvature: positive }),
    execute: input => {
      const radius = input.radius as number;
      if (radius === 0) throw new RangeError("Circle radius must be positive.");
      return { curvature: f(1 / radius, "Curvature") };
    } },
  { id: "curve.torsion.helix", module: "curve", capability: "torsion",
    title: "Helix torsion", description: "Compute torsion of (r cos t,r sin t,p t) as p/(r²+p²).",
    method: "analytic", inputSchema: x(o({ radius: positive, pitch: n }), { radius: 2, pitch: 1 }),
    outputSchema: o({ torsion: n }),
    execute: input => {
      const radius = input.radius as number, pitch = input.pitch as number;
      if (radius === 0) throw new RangeError("Helix radius must be positive.");
      return { torsion: f(pitch / (radius * radius + pitch * pitch), "Torsion") };
    } },
  { id: "curve.frenet.helix", module: "curve", capability: "frenet-frame",
    title: "Helix Frenet frame", description: "Compute the unit tangent, normal and binormal of a circular helix at t.",
    method: "analytic", inputSchema: x(o({ radius: positive, pitch: n, at: n }),
      { radius: 2, pitch: 1, at: 0 }),
    outputSchema: o({ tangent: v3, normal: v3, binormal: v3 }),
    execute: input => {
      const radius = input.radius as number, pitch = input.pitch as number, at = input.at as number;
      if (radius === 0) throw new RangeError("Helix radius must be positive.");
      const tangent = unit([-radius * Math.sin(at), radius * Math.cos(at), pitch], "Tangent");
      const normal = [-Math.cos(at), -Math.sin(at), 0];
      return { tangent, normal, binormal: unit(cross(tangent, normal), "Binormal") };
    } },
  { id: "curve.intersection.planar-segments", module: "curve", capability: "intersections",
    title: "Planar curve segment intersection", description: "Intersect two non-collinear closed line segments in the plane.",
    method: "analytic", inputSchema: x(o({ firstStart: v2, firstEnd: v2, secondStart: v2, secondEnd: v2 }),
      { firstStart: [0, 0], firstEnd: [2, 2], secondStart: [0, 2], secondEnd: [2, 0] }),
    outputSchema: o({ point: { anyOf: [v2, { type: "null" }] } }),
    execute: input => {
      const p = input.firstStart as number[], q = input.secondStart as number[];
      const r = (input.firstEnd as number[]).map((v, at) => v - p[at]);
      const s = (input.secondEnd as number[]).map((v, at) => v - q[at]);
      const det = r[0] * s[1] - r[1] * s[0];
      if (det === 0) {
        if ((q[0] - p[0]) * r[1] === (q[1] - p[1]) * r[0])
          throw new RangeError("Collinear segments require an overlap operation.");
        return { point: null };
      }
      const u = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / det;
      const v = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / det;
      return { point: u >= 0 && u <= 1 && v >= 0 && v <= 1 ?
        [f(p[0] + u * r[0], "Intersection"), f(p[1] + u * r[1], "Intersection")] : null };
    } },
  { id: "curve.geodesic.sphere", module: "curve", capability: "geodesics",
    title: "Spherical geodesic length", description: "Measure the shorter great-circle arc between two nonzero directions.",
    method: "analytic", inputSchema: x(o({ radius: positive, firstDirection: v3, secondDirection: v3 }),
      { radius: 2, firstDirection: [1, 0, 0], secondDirection: [0, 1, 0] }),
    outputSchema: o({ length: positive }),
    execute: input => {
      if (input.radius === 0) throw new RangeError("Sphere radius must be positive.");
      return { length: sphereDistance(input.firstDirection as number[],
        input.secondDirection as number[], input.radius as number) };
    } },

  { id: "surface.forms.sphere", module: "surface", capability: "fundamental-forms",
    title: "Sphere fundamental forms", description: "Compute first and outward-oriented second form coefficients at colatitude θ.",
    method: "analytic", inputSchema: x(o({ radius: positive, colatitude: n }),
      { radius: 2, colatitude: Math.PI / 2 }),
    outputSchema: o({ first: t(3), second: t(3) }),
    execute: input => {
      const radius = input.radius as number, theta = input.colatitude as number;
      if (radius === 0 || theta <= 0 || theta >= Math.PI)
        throw new RangeError("Use a positive radius and interior colatitude.");
      const sine2 = Math.sin(theta) ** 2;
      return { first: [f(radius * radius, "First form"), 0, f(radius * radius * sine2, "First form")],
        second: [-radius, 0, -radius * sine2] };
    } },
  { id: "surface.area.spherical-cap", module: "surface", capability: "area",
    title: "Spherical cap area", description: "Compute area 2πr²(1−cos θ) of a spherical cap.",
    method: "analytic", inputSchema: x(o({ radius: positive, colatitude: n }),
      { radius: 2, colatitude: Math.PI / 2 }),
    outputSchema: o({ area: positive }),
    execute: input => {
      const radius = input.radius as number, theta = input.colatitude as number;
      if (radius === 0 || theta < 0 || theta > Math.PI)
        throw new RangeError("Use a positive radius and colatitude in [0,π].");
      return { area: f(2 * Math.PI * radius * radius * (1 - Math.cos(theta)), "Area") };
    } },
  { id: "surface.geodesic.sphere", module: "surface", capability: "geodesics",
    title: "Sphere geodesic length", description: "Measure the shorter great-circle distance on a sphere.",
    method: "analytic", inputSchema: x(o({ radius: positive, firstDirection: v3, secondDirection: v3 }),
      { radius: 2, firstDirection: [1, 0, 0], secondDirection: [0, 1, 0] }),
    outputSchema: o({ length: positive }),
    execute: input => {
      if (input.radius === 0) throw new RangeError("Sphere radius must be positive.");
      return { length: sphereDistance(input.firstDirection as number[],
        input.secondDirection as number[], input.radius as number) };
    } },

  { id: "mesh.topology.summary", module: "mesh", capability: "topology",
    title: "Triangle mesh topology summary", description: "Count unique edges, boundary edges and Euler characteristic.",
    method: "algorithmic", inputSchema: x(o({ vertexCount: { type: "integer", minimum: 3, maximum: 100000 },
      faces: a(t(3, { type: "integer", minimum: 0 }), 1, 20000) }),
      { vertexCount: 4, faces: [[0, 1, 2], [0, 2, 3]] }),
    outputSchema: o({ vertices: { type: "integer", minimum: 3 }, edges: { type: "integer", minimum: 3 },
      faces: { type: "integer", minimum: 1 }, boundaryEdges: { type: "integer", minimum: 0 },
      eulerCharacteristic: { type: "integer" } }),
    execute: input => {
      const count = input.vertexCount as number, faces = input.faces as number[][];
      const edges = new Map<string, number>(), seen = new Set<string>();
      for (const face of faces) {
        if (new Set(face).size !== 3 || face.some(index => index >= count) || seen.has(faceKey(face)))
          throw new RangeError("Faces must be distinct valid triangles.");
        seen.add(faceKey(face));
        for (const [left, right] of triangleEdges(face)) {
          const key = edgeKey(left, right);
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      return { vertices: count, edges: edges.size, faces: faces.length,
        boundaryEdges: [...edges.values()].filter(value => value === 1).length,
        eulerCharacteristic: count - edges.size + faces.length };
    } },
  { id: "mesh.curvature.angle-defect", module: "mesh", capability: "curvature-estimation",
    title: "Interior vertex angle-defect curvature", description: "Estimate Gaussian curvature from incident corner angles and a positive dual area.",
    method: "numerical", inputSchema: x(o({ anglesRadians: a(n, 3, 64), dualArea: positive }),
      { anglesRadians: [Math.PI / 2, Math.PI / 2, Math.PI / 2, Math.PI / 2], dualArea: 1 }),
    outputSchema: o({ angleDefect: n, gaussianCurvature: n }),
    execute: input => {
      const angles = input.anglesRadians as number[], area = input.dualArea as number;
      if (area === 0 || angles.some(value => value <= 0 || value >= Math.PI))
        throw new RangeError("Use interior corner angles and positive dual area.");
      const angleDefect = f(2 * Math.PI - angles.reduce((sum, value) => sum + value, 0), "Angle defect");
      return { angleDefect, gaussianCurvature: f(angleDefect / area, "Estimated curvature") };
    } },
  { id: "mesh.quality.triangle", module: "mesh", capability: "quality",
    title: "Triangle quality", description: "Report minimum angle and normalized aspect ratio of a nondegenerate triangle.",
    method: "numerical", inputSchema: x(o({ vertices: pointArray }),
      { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }),
    outputSchema: o({ area: positive, minimumAngleRadians: positive, aspectRatio: positive }),
    execute: input => {
      const [p, q, r] = input.vertices as number[][];
      const pq = q.map((v, at) => v - p[at]), pr = r.map((v, at) => v - p[at]);
      const area = f(magnitude(cross(pq, pr)) / 2, "Triangle area");
      if (area === 0) throw new RangeError("Triangle must be nondegenerate.");
      const sides = [magnitude(q.map((v, at) => v - r[at])), magnitude(pr), magnitude(pq)];
      const angles = [angle(q.map((v, at) => v - p[at]), pr),
        angle(p.map((v, at) => v - q[at]), r.map((v, at) => v - q[at])),
        angle(p.map((v, at) => v - r[at]), q.map((v, at) => v - r[at]))];
      return { area, minimumAngleRadians: f(Math.min(...angles), "Minimum angle"),
        aspectRatio: f(Math.max(...sides) * sides.reduce((sum, v) => sum + v, 0) /
          (4 * Math.sqrt(3) * area), "Aspect ratio") };
    } },
  { id: "mesh.remesh.longest-edge", module: "mesh", capability: "remeshing",
    title: "Longest-edge triangle bisection", description: "Split one triangle across its longest edge into two oriented faces.",
    method: "algorithmic", inputSchema: x(o({ vertices: pointArray }),
      { vertices: [[0, 0, 0], [2, 0, 0], [0, 1, 0]] }),
    outputSchema: o({ vertices: a(v3, 4, 4), faces: a(t(3, { type: "integer", minimum: 0 }), 2, 2) }),
    execute: input => {
      const vertices = input.vertices as number[][];
      if (magnitude(cross(vertices[1].map((v, at) => v - vertices[0][at]),
        vertices[2].map((v, at) => v - vertices[0][at]))) === 0)
        throw new RangeError("Triangle must be nondegenerate.");
      const lengths = [0, 1, 2].map(at => magnitude(vertices[at]
        .map((v, axis) => v - vertices[(at + 1) % 3][axis])));
      const at = lengths.indexOf(Math.max(...lengths)), end = (at + 1) % 3, other = (at + 2) % 3;
      const midpoint = vertices[at].map((v, axis) => (v + vertices[end][axis]) / 2);
      return { vertices: [...vertices, midpoint], faces: [[at, 3, other], [3, end, other]] };
    } },
  { id: "mesh.subdivide.midpoint", module: "mesh", capability: "subdivision",
    title: "Midpoint triangle subdivision", description: "Subdivide one nondegenerate triangle into four oriented triangles.",
    method: "algorithmic", inputSchema: x(o({ vertices: pointArray }),
      { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }),
    outputSchema: o({ vertices: a(v3, 6, 6), faces: a(t(3, { type: "integer", minimum: 0 }), 4, 4) }),
    execute: input => {
      const [p, q, r] = input.vertices as number[][];
      if (magnitude(cross(q.map((v, at) => v - p[at]), r.map((v, at) => v - p[at]))) === 0)
        throw new RangeError("Triangle must be nondegenerate.");
      const mid = (left: number[], right: number[]) => left.map((v, at) => (v + right[at]) / 2);
      return { vertices: [p, q, r, mid(p, q), mid(q, r), mid(r, p)],
        faces: [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]] };
    } },
  { id: "mesh.simplify.duplicate-faces", module: "mesh", capability: "simplification",
    title: "Duplicate-face simplification", description: "Remove geometrically duplicate indexed triangle faces while retaining their first orientation.",
    method: "algorithmic", inputSchema: x(o({ vertexCount: { type: "integer", minimum: 3 },
      faces: a(t(3, { type: "integer", minimum: 0 }), 1, 20000) }),
      { vertexCount: 3, faces: [[0, 1, 2], [2, 1, 0]] }),
    outputSchema: o({ faces: a(t(3, { type: "integer", minimum: 0 }), 1, 20000), removed: { type: "integer", minimum: 0 } }),
    execute: input => {
      const faces = input.faces as number[][], count = input.vertexCount as number;
      const seen = new Set<string>(), retained: number[][] = [];
      for (const face of faces) {
        if (new Set(face).size !== 3 || face.some(index => index >= count))
          throw new RangeError("Faces must have three distinct valid indices.");
        const key = faceKey(face);
        if (!seen.has(key)) { seen.add(key); retained.push(face); }
      }
      return { faces: retained, removed: faces.length - retained.length };
    } },

  { id: "geometry.intersection.ray-sphere", module: "geometry", capability: "intersections",
    title: "Ray and sphere intersections", description: "Find nonnegative ray parameters for a sphere intersection.",
    method: "analytic", inputSchema: x(o({ origin: v3, direction: v3, center: v3, radius: positive }),
      { origin: [-2, 0, 0], direction: [1, 0, 0], center: [0, 0, 0], radius: 1 }),
    outputSchema: o({ parameters: a(n, 0, 2) }),
    execute: input => {
      const origin = input.origin as number[], direction = input.direction as number[], center = input.center as number[];
      const radius = input.radius as number;
      if (radius === 0) throw new RangeError("Sphere radius must be positive.");
      const offset = origin.map((v, at) => v - center[at]);
      const A = dot(direction, direction), B = 2 * dot(offset, direction), C = dot(offset, offset) - radius * radius;
      if (A === 0) throw new RangeError("Ray direction must be nonzero.");
      const d = f(B * B - 4 * A * C, "Discriminant");
      if (d < 0) return { parameters: [] };
      const roots = [(-B - Math.sqrt(d)) / (2 * A), (-B + Math.sqrt(d)) / (2 * A)]
        .filter((v, at, all) => v >= 0 && (at === 0 || v !== all[0]));
      return { parameters: roots.map(v => f(v, "Ray parameter")) };
    } },
  { id: "geometry.volume.box", module: "geometry", capability: "volumes",
    title: "Axis-aligned box volume", description: "Multiply three strictly positive side lengths.",
    method: "analytic", inputSchema: x(o({ sideLengths: v3 }), { sideLengths: [2, 3, 4] }),
    outputSchema: o({ volume: positive }),
    execute: input => {
      const sides = input.sideLengths as number[];
      if (sides.some(v => v <= 0)) throw new RangeError("Box side lengths must be positive.");
      return { volume: f(sides[0] * sides[1] * sides[2], "Box volume") };
    } },
  { id: "geometry.angle.vectors", module: "geometry", capability: "angles",
    title: "Angle between 3D vectors", description: "Return the principal angle in radians between nonzero vectors.",
    method: "analytic", inputSchema: x(o({ first: v3, second: v3 }),
      { first: [1, 0, 0], second: [0, 1, 0] }),
    outputSchema: o({ radians: positive }),
    execute: input => ({ radians: f(angle(input.first as number[], input.second as number[]), "Angle") }) },
  { id: "geometry.transform.affine", module: "geometry", capability: "transformations",
    title: "Affine 3D point transform", description: "Apply a row-major 4×4 affine matrix to one 3D point.",
    method: "analytic", inputSchema: x(o({ matrixRowMajor: t(16), point: v3 }),
      { matrixRowMajor: [1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4, 0, 0, 0, 1], point: [1, 1, 1] }),
    outputSchema: o({ point: v3 }),
    execute: input => {
      const matrix = input.matrixRowMajor as number[], point = input.point as number[];
      if (matrix[12] !== 0 || matrix[13] !== 0 || matrix[14] !== 0 || matrix[15] !== 1)
        throw new RangeError("Last matrix row must be [0,0,0,1].");
      return { point: [0, 1, 2].map(row => f(matrix[row * 4] * point[0] +
        matrix[row * 4 + 1] * point[1] + matrix[row * 4 + 2] * point[2] + matrix[row * 4 + 3],
      "Transformed point")) };
    } },
  { id: "geometry.constraint.distance", module: "geometry", capability: "constraints",
    title: "Distance constraint residual", description: "Report current distance minus a nonnegative target separation.",
    method: "analytic", inputSchema: x(o({ first: v3, second: v3, target: positive }),
      { first: [0, 0, 0], second: [3, 4, 0], target: 5 }),
    outputSchema: o({ residual: n, satisfied: { type: "boolean" } }),
    execute: input => {
      const first = input.first as number[], second = input.second as number[];
      const residual = f(magnitude(first.map((v, at) => v - second[at])) - (input.target as number), "Constraint residual");
      return { residual, satisfied: Math.abs(residual) <= 1e-9 };
    } },
];
