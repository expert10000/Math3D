import type { MeshDifferentialGeometryResult } from "./meshDifferentialGeometry";
import type { MeshQualityReport, MeshTriangleQualityMetricKey } from "./meshQualityReport";
import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshFieldCalculusOperator = "gradient" | "divergence" | "normal-curl" | "laplacian";

export const MESH_FIELD_CALCULUS_VERSION = "cotangent-barycentric-v1";

export const MESH_FIELD_CALCULUS_CONVENTIONS = {
  mass: "Diagonal lumped barycentric mass Mii = sum incident triangle area / 3.",
  gradient: "Piecewise-linear face gradient, area-weighted onto vertices.",
  divergence: "Weak FEM surface divergence divided by lumped barycentric mass; input vectors are projected to each face tangent plane.",
  normalCurl: "Oriented scalar curl curl_n(X) = div_S(X cross n), using normals induced by input triangle winding.",
  laplacian: "Laplace-Beltrami Delta f = M^-1 L f with Lij = (cot alpha + cot beta) / 2 and Lii = -sum_j Lij; sphere coordinates therefore have negative eigenvalues.",
  boundary: "Divergence, normal-curl, and Laplacian are reported as NaN on boundary vertices; gradient remains defined where incident nondegenerate faces exist.",
  invalid: "Invalid or unsupported vertex results are NaN and marked 0 in validMask.",
} as const;

export type MeshFieldCalculusPrepared = {
  vertexCount: number;
  faceCount: number;
  positions: Float64Array;
  triangles: Uint32Array;
  faceAreas: Float64Array;
  faceNormals: Float64Array;
  faceGradientBasis: Float64Array;
  faceValidMask: Uint8Array;
  vertexAreas: Float64Array;
  vertexNormals: Float64Array;
  vertexValence: Float64Array;
  vertexBoundaryMask: Uint8Array;
  vertexValidMask: Uint8Array;
  cotangentNeighbors: ReadonlyArray<ReadonlyArray<{ vertex: number; weight: number }>>;
};

export type MeshFieldCalculusResult = {
  version: typeof MESH_FIELD_CALCULUS_VERSION;
  operator: MeshFieldCalculusOperator;
  source: string;
  domain: "vertex";
  itemSize: 1 | 3;
  values: Float64Array;
  validMask: Uint8Array;
  validCount: number;
  conventions: typeof MESH_FIELD_CALCULUS_CONVENTIONS;
};

export type MeshFieldSourceCategory =
  | "coordinate"
  | "distance"
  | "geometry"
  | "curvature"
  | "quality"
  | "imported"
  | "derived"
  | "expression";

export type MeshScalarFieldSource = {
  id: string;
  label: string;
  category: MeshFieldSourceCategory;
  values: ArrayLike<number>;
  dependency?: { kind: string; variant?: string };
};

export type MeshVectorFieldSource = MeshScalarFieldSource & { itemSize: 3 };

export type MeshFieldSourceRegistry = {
  scalars: ReadonlyMap<string, MeshScalarFieldSource>;
  vectors: ReadonlyMap<string, MeshVectorFieldSource>;
};

type NamedField = { name: string; values: ArrayLike<number>; itemSize?: number };

export type MeshFieldSourceRegistryOptions = {
  curvature?: MeshDifferentialGeometryResult | null;
  quality?: MeshQualityReport | null;
  qualityVariant?: string;
  importedScalars?: Iterable<NamedField> | null;
  importedVectors?: Iterable<NamedField> | null;
  derivedScalars?: Iterable<NamedField> | null;
  derivedVectors?: Iterable<NamedField> | null;
};

const EPSILON = 1e-14;
const QUALITY_FIELDS: readonly MeshTriangleQualityMetricKey[] = [
  "triangleArea",
  "aspectRatio",
  "edgeRatio",
  "minimumAngleDeg",
  "maximumAngleDeg",
  "radiusRatio",
  "scaledJacobian",
];

const edgeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const finiteVertexValues = (values: ArrayLike<number>, count: number, itemSize = 1): boolean =>
  values.length >= count * itemSize;

const triangleIndices = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): Uint32Array => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (mesh.indices?.length) return Uint32Array.from(mesh.indices);
  const faceCount = Math.floor(vertexCount / 3);
  return Uint32Array.from({ length: faceCount * 3 }, (_, index) => index);
};

export const prepareMeshFieldCalculus = (
  mesh: Pick<SurfaceMeshData, "positions" | "indices">
): MeshFieldCalculusPrepared => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangles = triangleIndices(mesh);
  const faceCount = Math.floor(triangles.length / 3);
  const positions = Float64Array.from(mesh.positions);
  const faceAreas = new Float64Array(faceCount);
  const faceNormals = new Float64Array(faceCount * 3);
  const faceGradientBasis = new Float64Array(faceCount * 9);
  faceGradientBasis.fill(Number.NaN);
  const faceValidMask = new Uint8Array(faceCount);
  const vertexAreas = new Float64Array(vertexCount);
  const vertexNormals = new Float64Array(vertexCount * 3);
  const vertexBoundaryMask = new Uint8Array(vertexCount);
  const vertexValidMask = new Uint8Array(vertexCount);
  const valenceSets = Array.from({ length: vertexCount }, () => new Set<number>());
  const edgeRecords = new Map<string, { a: number; b: number; count: number; weight: number }>();

  const addEdge = (a: number, b: number, weight: number) => {
    const key = edgeKey(a, b);
    const existing = edgeRecords.get(key);
    if (existing) {
      existing.count += 1;
      existing.weight += weight;
    } else {
      edgeRecords.set(key, { a: Math.min(a, b), b: Math.max(a, b), count: 1, weight });
    }
    valenceSets[a]?.add(b);
    valenceSets[b]?.add(a);
  };

  for (let face = 0; face < faceCount; face += 1) {
    const offset = face * 3;
    const a = Number(triangles[offset]);
    const b = Number(triangles[offset + 1]);
    const c = Number(triangles[offset + 2]);
    if (![a, b, c].every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) continue;
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const twiceArea = Math.hypot(crossX, crossY, crossZ);
    addEdge(a, b, 0);
    addEdge(b, c, 0);
    addEdge(c, a, 0);
    if (!Number.isFinite(twiceArea) || twiceArea <= EPSILON) continue;

    const area = twiceArea / 2;
    const nx = crossX / twiceArea, ny = crossY / twiceArea, nz = crossZ / twiceArea;
    faceAreas[face] = area;
    faceNormals[offset] = nx;
    faceNormals[offset + 1] = ny;
    faceNormals[offset + 2] = nz;
    faceValidMask[face] = 1;

    for (const vertex of [a, b, c]) {
      vertexAreas[vertex] += area / 3;
      vertexNormals[vertex * 3] += crossX;
      vertexNormals[vertex * 3 + 1] += crossY;
      vertexNormals[vertex * 3 + 2] += crossZ;
    }

    const gradient = (ex: number, ey: number, ez: number) => [
      (ny * ez - nz * ey) / twiceArea,
      (nz * ex - nx * ez) / twiceArea,
      (nx * ey - ny * ex) / twiceArea,
    ] as const;
    const g0 = gradient(cx - bx, cy - by, cz - bz);
    const g1 = gradient(ax - cx, ay - cy, az - cz);
    const g2 = gradient(bx - ax, by - ay, bz - az);
    faceGradientBasis.set(g0, face * 9);
    faceGradientBasis.set(g1, face * 9 + 3);
    faceGradientBasis.set(g2, face * 9 + 6);

    const cotA = (abx * acx + aby * acy + abz * acz) / twiceArea;
    const bax = ax - bx, bay = ay - by, baz = az - bz;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const cotB = (bax * bcx + bay * bcy + baz * bcz) / twiceArea;
    const cax = ax - cx, cay = ay - cy, caz = az - cz;
    const cbx = bx - cx, cby = by - cy, cbz = bz - cz;
    const cotC = (cax * cbx + cay * cby + caz * cbz) / twiceArea;
    edgeRecords.get(edgeKey(b, c))!.weight += 0.5 * cotA;
    edgeRecords.get(edgeKey(c, a))!.weight += 0.5 * cotB;
    edgeRecords.get(edgeKey(a, b))!.weight += 0.5 * cotC;
  }

  const cotangentNeighbors: Array<Array<{ vertex: number; weight: number }>> = Array.from(
    { length: vertexCount },
    () => []
  );
  for (const edge of edgeRecords.values()) {
    if (edge.count === 1) {
      vertexBoundaryMask[edge.a] = 1;
      vertexBoundaryMask[edge.b] = 1;
    }
    if (Number.isFinite(edge.weight)) {
      cotangentNeighbors[edge.a].push({ vertex: edge.b, weight: edge.weight });
      cotangentNeighbors[edge.b].push({ vertex: edge.a, weight: edge.weight });
    }
  }

  const vertexValence = new Float64Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const base = vertex * 3;
    const length = Math.hypot(vertexNormals[base], vertexNormals[base + 1], vertexNormals[base + 2]);
    if (length > EPSILON && vertexAreas[vertex] > EPSILON) {
      vertexNormals[base] /= length;
      vertexNormals[base + 1] /= length;
      vertexNormals[base + 2] /= length;
      vertexValidMask[vertex] = 1;
    } else {
      vertexNormals[base] = Number.NaN;
      vertexNormals[base + 1] = Number.NaN;
      vertexNormals[base + 2] = Number.NaN;
    }
    vertexValence[vertex] = valenceSets[vertex].size;
  }

  return {
    vertexCount,
    faceCount,
    positions,
    triangles,
    faceAreas,
    faceNormals,
    faceGradientBasis,
    faceValidMask,
    vertexAreas,
    vertexNormals,
    vertexValence,
    vertexBoundaryMask,
    vertexValidMask,
    cotangentNeighbors,
  };
};

const createResult = (
  operator: MeshFieldCalculusOperator,
  source: string,
  itemSize: 1 | 3,
  values: Float64Array,
  validMask: Uint8Array
): MeshFieldCalculusResult => ({
  version: MESH_FIELD_CALCULUS_VERSION,
  operator,
  source,
  domain: "vertex",
  itemSize,
  values,
  validMask,
  validCount: validMask.reduce((sum, value) => sum + (value ? 1 : 0), 0),
  conventions: MESH_FIELD_CALCULUS_CONVENTIONS,
});

export const computeMeshFieldGradient = (
  prepared: MeshFieldCalculusPrepared,
  values: ArrayLike<number>,
  source = "scalar"
): MeshFieldCalculusResult => {
  const output = new Float64Array(prepared.vertexCount * 3);
  const weights = new Float64Array(prepared.vertexCount);
  const validMask = new Uint8Array(prepared.vertexCount);
  output.fill(Number.NaN);
  if (!finiteVertexValues(values, prepared.vertexCount)) return createResult("gradient", source, 3, output, validMask);
  output.fill(0);

  for (let face = 0; face < prepared.faceCount; face += 1) {
    if (!prepared.faceValidMask[face]) continue;
    const tri = face * 3;
    const a = prepared.triangles[tri], b = prepared.triangles[tri + 1], c = prepared.triangles[tri + 2];
    const fa = Number(values[a]), fb = Number(values[b]), fc = Number(values[c]);
    if (![fa, fb, fc].every(Number.isFinite)) continue;
    const basis = face * 9;
    const gx = fa * prepared.faceGradientBasis[basis] + fb * prepared.faceGradientBasis[basis + 3] + fc * prepared.faceGradientBasis[basis + 6];
    const gy = fa * prepared.faceGradientBasis[basis + 1] + fb * prepared.faceGradientBasis[basis + 4] + fc * prepared.faceGradientBasis[basis + 7];
    const gz = fa * prepared.faceGradientBasis[basis + 2] + fb * prepared.faceGradientBasis[basis + 5] + fc * prepared.faceGradientBasis[basis + 8];
    const area = prepared.faceAreas[face];
    for (const vertex of [a, b, c]) {
      output[vertex * 3] += area * gx;
      output[vertex * 3 + 1] += area * gy;
      output[vertex * 3 + 2] += area * gz;
      weights[vertex] += area;
    }
  }
  for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
    const weight = weights[vertex];
    if (!(weight > EPSILON) || !prepared.vertexValidMask[vertex]) {
      output[vertex * 3] = output[vertex * 3 + 1] = output[vertex * 3 + 2] = Number.NaN;
      continue;
    }
    output[vertex * 3] /= weight;
    output[vertex * 3 + 1] /= weight;
    output[vertex * 3 + 2] /= weight;
    validMask[vertex] = 1;
  }
  return createResult("gradient", source, 3, output, validMask);
};

const computeWeakDerivative = (
  prepared: MeshFieldCalculusPrepared,
  vectors: ArrayLike<number>,
  source: string,
  curl: boolean
): MeshFieldCalculusResult => {
  const output = new Float64Array(prepared.vertexCount);
  output.fill(Number.NaN);
  const numerator = new Float64Array(prepared.vertexCount);
  const touched = new Uint8Array(prepared.vertexCount);
  const validMask = new Uint8Array(prepared.vertexCount);
  if (!finiteVertexValues(vectors, prepared.vertexCount, 3)) {
    return createResult(curl ? "normal-curl" : "divergence", source, 1, output, validMask);
  }

  for (let face = 0; face < prepared.faceCount; face += 1) {
    if (!prepared.faceValidMask[face]) continue;
    const tri = face * 3;
    const vertices = [prepared.triangles[tri], prepared.triangles[tri + 1], prepared.triangles[tri + 2]];
    let vx = 0, vy = 0, vz = 0;
    let finite = true;
    for (const vertex of vertices) {
      const base = vertex * 3;
      const x = Number(vectors[base]), y = Number(vectors[base + 1]), z = Number(vectors[base + 2]);
      if (![x, y, z].every(Number.isFinite)) { finite = false; break; }
      vx += x / 3; vy += y / 3; vz += z / 3;
    }
    if (!finite) continue;
    const nx = prepared.faceNormals[tri], ny = prepared.faceNormals[tri + 1], nz = prepared.faceNormals[tri + 2];
    const normalComponent = vx * nx + vy * ny + vz * nz;
    vx -= normalComponent * nx; vy -= normalComponent * ny; vz -= normalComponent * nz;
    if (curl) {
      const rx = vy * nz - vz * ny;
      const ry = vz * nx - vx * nz;
      const rz = vx * ny - vy * nx;
      vx = rx; vy = ry; vz = rz;
    }
    const area = prepared.faceAreas[face];
    const basis = face * 9;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = vertices[corner];
      const gradient = basis + corner * 3;
      numerator[vertex] -= area * (
        vx * prepared.faceGradientBasis[gradient] +
        vy * prepared.faceGradientBasis[gradient + 1] +
        vz * prepared.faceGradientBasis[gradient + 2]
      );
      touched[vertex] = 1;
    }
  }
  for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
    const mass = prepared.vertexAreas[vertex];
    if (!touched[vertex] || !(mass > EPSILON) || prepared.vertexBoundaryMask[vertex]) continue;
    output[vertex] = numerator[vertex] / mass;
    if (Number.isFinite(output[vertex])) validMask[vertex] = 1;
  }
  return createResult(curl ? "normal-curl" : "divergence", source, 1, output, validMask);
};

export const computeMeshFieldDivergence = (
  prepared: MeshFieldCalculusPrepared,
  vectors: ArrayLike<number>,
  source = "vector"
): MeshFieldCalculusResult => computeWeakDerivative(prepared, vectors, source, false);

export const computeMeshFieldNormalCurl = (
  prepared: MeshFieldCalculusPrepared,
  vectors: ArrayLike<number>,
  source = "vector"
): MeshFieldCalculusResult => computeWeakDerivative(prepared, vectors, source, true);

export const computeMeshFieldLaplacian = (
  prepared: MeshFieldCalculusPrepared,
  values: ArrayLike<number>,
  source = "scalar"
): MeshFieldCalculusResult => {
  const output = new Float64Array(prepared.vertexCount);
  output.fill(Number.NaN);
  const validMask = new Uint8Array(prepared.vertexCount);
  if (!finiteVertexValues(values, prepared.vertexCount)) return createResult("laplacian", source, 1, output, validMask);
  for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
    const center = Number(values[vertex]);
    const mass = prepared.vertexAreas[vertex];
    if (!Number.isFinite(center) || !(mass > EPSILON) || prepared.vertexBoundaryMask[vertex]) continue;
    let sum = 0;
    let finite = true;
    for (const neighbor of prepared.cotangentNeighbors[vertex]) {
      const value = Number(values[neighbor.vertex]);
      if (!Number.isFinite(value)) { finite = false; break; }
      sum += neighbor.weight * (value - center);
    }
    if (!finite) continue;
    output[vertex] = sum / mass;
    if (Number.isFinite(output[vertex])) validMask[vertex] = 1;
  }
  return createResult("laplacian", source, 1, output, validMask);
};

export const mapFaceFieldToVertices = (
  prepared: MeshFieldCalculusPrepared,
  faceValues: ArrayLike<number>,
  faceValidMask?: ArrayLike<number>
): Float64Array => {
  const output = new Float64Array(prepared.vertexCount);
  const weights = new Float64Array(prepared.vertexCount);
  output.fill(Number.NaN);
  const sums = new Float64Array(prepared.vertexCount);
  for (let face = 0; face < prepared.faceCount; face += 1) {
    const value = Number(faceValues[face]);
    if (!prepared.faceValidMask[face] || (faceValidMask && !faceValidMask[face]) || !Number.isFinite(value)) continue;
    const weight = prepared.faceAreas[face];
    const tri = face * 3;
    for (const vertex of [prepared.triangles[tri], prepared.triangles[tri + 1], prepared.triangles[tri + 2]]) {
      sums[vertex] += weight * value;
      weights[vertex] += weight;
    }
  }
  for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
    if (weights[vertex] > EPSILON) output[vertex] = sums[vertex] / weights[vertex];
  }
  return output;
};

const maskedVector = (values: ArrayLike<number>, mask: ArrayLike<number> | undefined, count: number): Float64Array => {
  const output = Float64Array.from(values);
  if (!mask) return output;
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (mask[vertex]) continue;
    output[vertex * 3] = output[vertex * 3 + 1] = output[vertex * 3 + 2] = Number.NaN;
  }
  return output;
};

export const createMeshFieldSourceRegistry = (
  prepared: MeshFieldCalculusPrepared,
  options: MeshFieldSourceRegistryOptions = {}
): MeshFieldSourceRegistry => {
  const scalars = new Map<string, MeshScalarFieldSource>();
  const vectors = new Map<string, MeshVectorFieldSource>();
  const addScalar = (entry: MeshScalarFieldSource) => {
    if (finiteVertexValues(entry.values, prepared.vertexCount)) scalars.set(entry.id, entry);
  };
  const addVector = (entry: MeshVectorFieldSource) => {
    if (finiteVertexValues(entry.values, prepared.vertexCount, 3)) vectors.set(entry.id, entry);
  };

  const x = new Float64Array(prepared.vertexCount);
  const y = new Float64Array(prepared.vertexCount);
  const z = new Float64Array(prepared.vertexCount);
  const radius = new Float64Array(prepared.vertexCount);
  for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
    x[vertex] = prepared.positions[vertex * 3];
    y[vertex] = prepared.positions[vertex * 3 + 1];
    z[vertex] = prepared.positions[vertex * 3 + 2];
    radius[vertex] = Math.hypot(x[vertex], y[vertex], z[vertex]);
  }
  addScalar({ id: "x", label: "Coordinate x", category: "coordinate", values: x });
  addScalar({ id: "y", label: "Coordinate y", category: "coordinate", values: y });
  addScalar({ id: "z", label: "Coordinate z", category: "coordinate", values: z });
  addScalar({ id: "height", label: "Height (y)", category: "coordinate", values: y });
  addScalar({ id: "radius", label: "Distance from origin |p|", category: "distance", values: radius });
  addScalar({ id: "distance-origin", label: "Distance from origin", category: "distance", values: radius });
  addScalar({ id: "vertex-area", label: "Barycentric vertex area", category: "geometry", values: prepared.vertexAreas });
  addScalar({ id: "vertex-valence", label: "Vertex valence", category: "geometry", values: prepared.vertexValence });
  addVector({ id: "normals", label: "Surface normals", category: "geometry", values: prepared.vertexNormals, itemSize: 3, dependency: { kind: "normals", variant: "area-weighted-v1" } });

  const curvature = options.curvature;
  if (curvature) {
    const dependency = { kind: "curvature", variant: "discrete-differential-geometry-v2" };
    for (const [id, label, values] of [
      ["K", "Gaussian curvature K", curvature.K],
      ["H", "Mean curvature H", curvature.H],
      ["k1", "Principal curvature k1", curvature.k1],
      ["k2", "Principal curvature k2", curvature.k2],
      ["shapeIndex", "Shape index", curvature.shapeIndex],
      ["curvedness", "Curvedness", curvature.curvedness],
    ] as const) addScalar({ id, label, category: "curvature", values, dependency });
    const directionDependency = { kind: "principal-directions", variant: "shape-operator-v2" };
    addVector({ id: "principal-d1", label: "Principal direction d1", category: "curvature", values: maskedVector(curvature.d1, curvature.directionValidMask, prepared.vertexCount), itemSize: 3, dependency: directionDependency });
    addVector({ id: "principal-d2", label: "Principal direction d2", category: "curvature", values: maskedVector(curvature.d2, curvature.directionValidMask, prepared.vertexCount), itemSize: 3, dependency: directionDependency });
  }

  if (options.quality && options.quality.faceCount === prepared.faceCount) {
    for (const metric of QUALITY_FIELDS) {
      addScalar({
        id: `quality.${metric}`,
        label: `Quality: ${metric}`,
        category: "quality",
        values: mapFaceFieldToVertices(prepared, options.quality.fields.face[metric], options.quality.fields.faceValidMask),
        dependency: { kind: "quality", variant: options.qualityVariant },
      });
    }
  }

  for (const field of options.importedScalars ?? []) addScalar({ id: field.name, label: `Imported: ${field.name}`, category: "imported", values: field.values });
  for (const field of options.importedVectors ?? []) addVector({ id: field.name, label: `Imported: ${field.name}`, category: "imported", values: field.values, itemSize: 3 });
  for (const field of options.derivedScalars ?? []) addScalar({ id: field.name, label: field.name, category: "derived", values: field.values });
  for (const field of options.derivedVectors ?? []) addVector({ id: field.name, label: field.name, category: "derived", values: field.values, itemSize: 3 });
  return { scalars, vectors };
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const meshFieldCalculusResultVariant = (operator: MeshFieldCalculusOperator, source: string): string =>
  `${MESH_FIELD_CALCULUS_VERSION}:${operator}:${hashString(source)}`;

