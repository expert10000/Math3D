import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { normalizeVectorField3DDocument, type VectorField3DClipBounds,
  type VectorField3DDocument } from "./vectorField3DDocument";
import type { VectorField3DVolumes } from "./vectorField3DScientific";

type Vec3 = readonly [number, number, number];
export type VectorField3DIsosurfaceTopology = Readonly<{ connectedComponents: number;
  boundaryEdgeCount: number; clipBoundaryEdgeCount: number;
  nonManifoldEdgeCount: number; watertight: boolean }>;
export type VectorField3DIsosurfacePlan = Readonly<{
  coordinates: readonly [readonly number[], readonly number[], readonly number[]];
  clipBounds: VectorField3DClipBounds; cellCount: number;
}>;
export type VectorField3DIsosurface = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  sourceHash: string | null;
  sourceReferences: Extract<VectorField3DDocument["source"]["field"],
    { kind: "scientific-bundle" }>["references"] | null;
  level: number; unit: string; clipBounds: VectorField3DClipBounds;
  coordinateAxes: VectorField3DDocument["source"]["axes"];
  gridShape: Vec3; sampledPoints: number; triangleBudget: number;
  triangleCount: number; vertexCount: number; complete: boolean; clipped: boolean;
  topology: VectorField3DIsosurfaceTopology;
  bounds: VectorField3DClipBounds | null;
  positions: Float32Array; normals: Float32Array; indices: Uint32Array;
  verifiedTiles?: readonly Readonly<{ name: string; resourceSha256: string;
    verifiedTiles: number; totalTiles: number; tileIndices: readonly number[];
    tileSha256: readonly string[]; tileSetSha256: string }>[];
  residentTileBytes?: number;
}>;

/** Include the physical clip planes and sample native grid points inside them. */
export function planVectorField3DIsosurface(document: VectorField3DDocument,
  clipBounds: VectorField3DClipBounds, maxCells = 64_000,
  sampleShape?: Vec3): VectorField3DIsosurfacePlan {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  if (!Number.isSafeInteger(maxCells) || maxCells < 64 || maxCells > 262_144)
    throw new RangeError("Invalid isosurface cell budget.");
  const field = checked.value.source.field;
  const componentUnits = field.kind === "scientific-bundle" ? field.componentUnits :
    field.components.map(component => component.unit);
  if (new Set(componentUnits).size !== 1)
    throw new TypeError("Speed isosurface requires matching component units.");
  const shape = field.kind === "scientific-bundle" ? sampleShape ?? field.references[0].shape :
    [37, 37, 37];
  if (shape.length !== 3 || shape.some(size => !Number.isSafeInteger(size) || size < 2))
    throw new TypeError("An isosurface needs a three-dimensional grid.");
  const raw = checked.value.source.axes.map((axis, index) => {
    const [min, max] = clipBounds[index] ?? [];
    if (!Number.isFinite(min) || !Number.isFinite(max) || min! < axis.min || max! > axis.max || min! >= max!)
      throw new RangeError("Isosurface clip bounds must lie inside the field.");
    const coordinates = [min!];
    const reference = field.kind === "scientific-bundle" ? field.references[0].axes[index] : null;
    const sourceCount = field.kind === "scientific-bundle" ? field.references[0].shape[index]! : null;
    for (let i = 0; i < shape[index]!; i++) {
      const value = reference ? reference.origin + reference.spacing *
        (shape[index] === sourceCount ? i :
          Math.round(i * (sourceCount! - 1) / (shape[index]! - 1))) :
        axis.min + (axis.max - axis.min) * i / (shape[index]! - 1);
      if (value > min! + 1e-12 && value < max! - 1e-12) coordinates.push(value);
    }
    coordinates.push(max!);
    return coordinates;
  });
  let stride = 1;
  while (raw.reduce((count, axis) => count * Math.ceil((axis.length - 1) / stride), 1) > maxCells)
    stride++;
  const coordinates = raw.map(axis => {
    const selected = axis.filter((_, index) => index % stride === 0 || index === axis.length - 1);
    return selected;
  }) as [number[], number[], number[]];
  return { coordinates, clipBounds, cellCount: coordinates.reduce((count, axis) =>
    count * (axis.length - 1), 1) };
}

export function vectorField3DIsosurfaceSampler(document: VectorField3DDocument,
  volumes?: VectorField3DVolumes): (point: Vec3) => Vec3 | null {
  const field = document.source.field;
  if (field.kind === "expressions") return point => {
    const variables = { x: point[0], y: point[1], z: point[2] };
    const values = field.components.map(component =>
      evaluateGraph2DExpression(component.ast, variables, { maxEvaluations: 256 }));
    return values.every(value => value.ok) ? values.map(value => value.ok ? value.value : NaN) as
      [number, number, number] : null;
  };
  if (!volumes || volumes.length !== 3) throw new TypeError("Verified vector volumes are required.");
  const shape = volumes[0].sampleShape;
  const lattice = field.references[0].axes.map((axis, index) => Array.from({ length: shape[index]! },
    (_, i) => axis.origin + axis.spacing * Math.round(i * (field.references[0].shape[index]! - 1) /
      (shape[index]! - 1))));
  return point => {
    const bracket = point.map((value, axis) => {
      const coordinates = lattice[axis]!;
      let lo = 0, hi = coordinates.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1;
        if (coordinates[mid]! <= value) lo = mid; else hi = mid; }
      const width = coordinates[hi]! - coordinates[lo]!;
      return width > 0 ? { lo, weight: Math.max(0, Math.min(1, (value - coordinates[lo]!) / width)) } : null;
    });
    if (bracket.some(item => !item)) return null;
    const result = [0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
      const indices = bracket.map((item, axis) => item!.lo + ((corner >> axis) & 1));
      const weight = bracket.reduce((product, item, axis) => product *
        (((corner >> axis) & 1) ? item!.weight : 1 - item!.weight), 1);
      const offset = (indices[0]! * shape[1]! + indices[1]!) * shape[2]! + indices[2]!;
      for (let component = 0; component < 3; component++)
        result[component] += weight * volumes[component]!.values[offset]!;
    }
    return result.every(Number.isFinite) ? result as [number, number, number] : null;
  };
}

const tetrahedra = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7],
  [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]] as const;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
type IsoVertex = Readonly<{ key: string; position: Vec3 }>;

export function analyzeVectorField3DIsosurfaceTopology(positions: ArrayLike<number>,
  indices: ArrayLike<number>, clip: VectorField3DClipBounds,
  complete: boolean): VectorField3DIsosurfaceTopology {
  if (positions.length % 3 || indices.length % 3)
    throw new TypeError("An indexed isosurface needs three coordinates and three indices per triangle.");
  const vertexCount = positions.length / 3;
  const parent = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  const edges = new Map<number, { a: number; b: number; count: number }>();
  const addEdge = (left: number, right: number) => {
    const a = Math.min(left, right), b = Math.max(left, right);
    const key = a * (vertexCount + 1) + b;
    const previous = edges.get(key);
    if (previous) previous.count++;
    else edges.set(key, { a, b, count: 1 });
  };
  for (let at = 0; at < indices.length; at += 3) {
    const a = indices[at]!, b = indices[at + 1]!, c = indices[at + 2]!;
    if ([a, b, c].some(index => !Number.isSafeInteger(index) || index < 0 || index >= vertexCount))
      throw new RangeError("Isosurface triangle index is outside the vertex buffer.");
    parent[root(b)] = root(a); parent[root(c)] = root(a);
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  let boundaryEdgeCount = 0, clipBoundaryEdgeCount = 0, nonManifoldEdgeCount = 0;
  for (const edge of edges.values()) {
    if (edge.count > 2) { nonManifoldEdgeCount++; continue; }
    if (edge.count !== 1) continue;
    boundaryEdgeCount++;
    if (clip.some((bounds, axis) => {
      const tolerance = 1e-6 * (bounds[1] - bounds[0]);
      const left = positions[edge.a * 3 + axis]!, right = positions[edge.b * 3 + axis]!;
      return Math.abs(left - bounds[0]) <= tolerance &&
        Math.abs(right - bounds[0]) <= tolerance ||
        Math.abs(left - bounds[1]) <= tolerance && Math.abs(right - bounds[1]) <= tolerance;
    })) clipBoundaryEdgeCount++;
  }
  const connectedComponents = new Set(Array.from({ length: vertexCount }, (_, i) => root(i))).size;
  return { connectedComponents, boundaryEdgeCount, clipBoundaryEdgeCount,
    nonManifoldEdgeCount, watertight: complete && indices.length > 0 &&
      boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0 };
}

/** Marching tetrahedra over a bounded, verified scalar speed lattice. */
export function extractVectorField3DSpeedIsosurface(document: VectorField3DDocument,
  plan: VectorField3DIsosurfacePlan, speeds: Float64Array, level: number,
  triangleBudget = 40_000): VectorField3DIsosurface {
  const coords = plan.coordinates, shape = coords.map(axis => axis.length) as [number, number, number];
  const pointCount = shape[0] * shape[1] * shape[2];
  if (!(speeds instanceof Float64Array) || speeds.length !== pointCount ||
      speeds.some(value => !Number.isFinite(value) || value < 0) ||
      !Number.isFinite(level) || level < 0 ||
      !Number.isSafeInteger(triangleBudget) || triangleBudget < 1 || triangleBudget > 100_000)
    throw new TypeError("Invalid bounded isosurface input.");
  const offset = (x: number, y: number, z: number) => (x * shape[1] + y) * shape[2] + z;
  const positions: number[] = [], normalSums: number[] = [], indices: number[] = [];
  const vertexByEdge = new Map<string, number>();
  const lower = [Infinity, Infinity, Infinity], upper = [-Infinity, -Infinity, -Infinity];
  let complete = true;
  const vertexIndex = (vertex: IsoVertex) => {
    const existing = vertexByEdge.get(vertex.key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    vertexByEdge.set(vertex.key, index);
    positions.push(...vertex.position); normalSums.push(0, 0, 0);
    for (let axis = 0; axis < 3; axis++) {
      lower[axis] = Math.min(lower[axis]!, vertex.position[axis]!);
      upper[axis] = Math.max(upper[axis]!, vertex.position[axis]!);
    }
    return index;
  };
  const emit = (a: IsoVertex, b: IsoVertex, c: IsoVertex, direction: Vec3) => {
    if (indices.length / 3 >= triangleBudget) { complete = false; return; }
    let normal = cross(subtract(b.position, a.position), subtract(c.position, a.position));
    const length = Math.hypot(...normal);
    if (length < 1e-14) return;
    if (normal.reduce((sum, value, axis) => sum + value * direction[axis]!, 0) < 0) {
      [b, c] = [c, b]; normal = normal.map(value => -value) as unknown as Vec3;
    }
    if (new Set([a.key, b.key, c.key]).size !== 3) return;
    const triangle = [vertexIndex(a), vertexIndex(b), vertexIndex(c)];
    indices.push(...triangle);
    for (const index of triangle) for (let axis = 0; axis < 3; axis++) {
      normalSums[index * 3 + axis] += normal[axis]!;
    }
  };
  for (let x = 0; x < shape[0] - 1 && complete; x++)
    for (let y = 0; y < shape[1] - 1 && complete; y++)
      for (let z = 0; z < shape[2] - 1 && complete; z++) {
        const points = Array.from({ length: 8 }, (_, corner) => [
          coords[0][x + (corner & 1)]!, coords[1][y + ((corner >> 1) & 1)]!,
          coords[2][z + ((corner >> 2) & 1)]!] as Vec3);
        const values = Array.from({ length: 8 }, (_, corner) => speeds[offset(
          x + (corner & 1), y + ((corner >> 1) & 1), z + ((corner >> 2) & 1))]!);
        if (Math.min(...values) > level || Math.max(...values) < level) continue;
        const nodeIds = Array.from({ length: 8 }, (_, corner) => offset(
          x + (corner & 1), y + ((corner >> 1) & 1), z + ((corner >> 2) & 1)));
        const edge = (a: number, b: number): IsoVertex => {
          const denominator = values[b]! - values[a]!;
          const t = Math.abs(denominator) < 1e-15 ? 0.5 :
            Math.max(0, Math.min(1, (level - values[a]!) / denominator));
          const key = t <= 1e-12 ? `node:${nodeIds[a]}` :
            t >= 1 - 1e-12 ? `node:${nodeIds[b]}` :
            `edge:${Math.min(nodeIds[a]!, nodeIds[b]!)}:${Math.max(nodeIds[a]!, nodeIds[b]!)}`;
          return { key, position: points[a]!.map((value, axis) =>
            value + t * (points[b]![axis]! - value)) as [number, number, number] };
        };
        for (const tetra of tetrahedra) {
          const inside = tetra.filter(index => values[index]! < level);
          const outside = tetra.filter(index => values[index]! >= level);
          if (!inside.length || !outside.length) continue;
          const center = (indices: readonly number[]): Vec3 => [0, 1, 2].map(axis =>
            indices.reduce((sum, index) => sum + points[index]![axis]!, 0) / indices.length) as
            [number, number, number];
          const lowCenter = center(inside);
          const highCenter = center(outside);
          const direction = subtract(highCenter, lowCenter);
          if (inside.length === 1) {
            emit(edge(inside[0]!, outside[0]!), edge(inside[0]!, outside[1]!),
              edge(inside[0]!, outside[2]!), direction);
          } else if (outside.length === 1) {
            emit(edge(inside[0]!, outside[0]!), edge(inside[1]!, outside[0]!),
              edge(inside[2]!, outside[0]!), direction);
          } else {
            const ac = edge(inside[0]!, outside[0]!);
            const ad = edge(inside[0]!, outside[1]!);
            const bc = edge(inside[1]!, outside[0]!);
            const bd = edge(inside[1]!, outside[1]!);
            emit(ac, ad, bc, direction); emit(ad, bd, bc, direction);
          }
          if (!complete) break;
        }
      }
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < positions.length / 3; index++) {
    const length = Math.hypot(normalSums[index * 3]!, normalSums[index * 3 + 1]!,
      normalSums[index * 3 + 2]!);
    if (length > 0) for (let axis = 0; axis < 3; axis++)
      normals[index * 3 + axis] = normalSums[index * 3 + axis]! / length;
  }
  const topology = analyzeVectorField3DIsosurfaceTopology(positions, indices, plan.clipBounds, complete);
  const source = document.source.field;
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash },
  sourceHash: source.kind === "scientific-bundle" ? createScientificDatasetLink(source.references).sourceHash : null,
  sourceReferences: source.kind === "scientific-bundle" ? source.references : null,
  level, unit: source.kind === "scientific-bundle" ? source.componentUnits[0] : source.components[0].unit,
  clipBounds: plan.clipBounds, coordinateAxes: document.source.axes,
  gridShape: shape, sampledPoints: pointCount, triangleBudget,
  triangleCount: indices.length / 3, vertexCount: positions.length / 3, complete,
  clipped: topology.clipBoundaryEdgeCount > 0, topology,
  bounds: positions.length ? lower.map((value, axis) => [value, upper[axis]!]) as unknown as
    VectorField3DClipBounds : null,
  positions: new Float32Array(positions), normals, indices: new Uint32Array(indices) };
}
