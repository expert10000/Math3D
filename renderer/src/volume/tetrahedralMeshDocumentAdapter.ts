import {
  createTetrahedralMeshDocument, normalizeTetrahedralMeshDocument,
  type TetrahedralMeshDocument,
} from "@math3d/core";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type TetrahedralMeshPackage = Readonly<{
  document: TetrahedralMeshDocument;
  resourceBytes: Uint8Array;
}>;

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
const vector = (a: readonly number[], b: readonly number[]) => a.map((value, index) => value - b[index]!);
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);
const key = (face: readonly number[]) => [...face].sort((a, b) => a - b).join(":");

export type TetrahedralMeshGeometry = Readonly<{
  points: readonly (readonly number[])[];
  cells: readonly (readonly number[])[];
  boundary: readonly (readonly number[])[];
  volume: number;
  surfaceArea: number;
  bounds: readonly number[];
  boundaryEdges: number;
  nonManifoldEdges: number;
}>;

export const decodeTetrahedralMeshResource = (bytes: Uint8Array): TetrahedralMeshGeometry => {
  if (bytes.byteLength < 16 || bytes.byteLength > 32 * 1024 * 1024) throw new TypeError("Tetrahedral resource size is invalid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([0, 1, 2, 3].map(index => String.fromCharCode(view.getUint8(index))).join("") !== "M3DT"
      || view.getUint32(4, true) !== 1) throw new TypeError("Unsupported tetrahedral resource format.");
  const pointCount = view.getUint32(8, true), tetrahedronCount = view.getUint32(12, true);
  if (pointCount < 4 || pointCount > 200_000 || tetrahedronCount < 1 || tetrahedronCount > 400_000
      || bytes.byteLength !== 16 + 24 * pointCount + 16 * tetrahedronCount)
    throw new TypeError("Tetrahedral resource length or counts changed.");
  const points = Array.from({ length: pointCount }, (_, index) =>
    [0, 1, 2].map(axis => view.getFloat64(16 + 24 * index + 8 * axis, true)));
  if (points.some(point => point.some(value => !Number.isFinite(value)))) throw new TypeError("Tetrahedral coordinates are not finite.");
  const cells = Array.from({ length: tetrahedronCount }, (_, index) =>
    [0, 1, 2, 3].map(slot => view.getUint32(16 + 24 * pointCount + 16 * index + 4 * slot, true)));
  const faces = new Map<string, number[][]>();
  let volume = 0;
  for (const cell of cells) {
    if (new Set(cell).size !== 4 || cell.some(index => index >= pointCount))
      throw new TypeError("Tetrahedral cell connectivity is invalid.");
    const [a, b, c, d] = cell.map(index => points[index]!);
    const signed = dot(vector(b!, a!), cross(vector(c!, a!), vector(d!, a!))) / 6;
    if (signed <= 1e-12) throw new TypeError("Tetrahedral cell is inverted or degenerate.");
    volume += signed;
    for (const [face, opposite] of [
      [[cell[0]!, cell[1]!, cell[2]!], cell[3]!], [[cell[0]!, cell[1]!, cell[3]!], cell[2]!],
      [[cell[0]!, cell[2]!, cell[3]!], cell[1]!], [[cell[1]!, cell[2]!, cell[3]!], cell[0]!],
    ] as [number[], number][]) {
      const [p, q, r] = face.map(index => points[index]!);
      if (dot(cross(vector(q!, p!), vector(r!, p!)), vector(points[opposite]!, p!)) > 0)
        [face[1], face[2]] = [face[2]!, face[1]!];
      const id = key(face);
      const group = faces.get(id) ?? [];
      group.push(face);
      if (group.length > 2) throw new TypeError("Nonmanifold tetrahedral face.");
      faces.set(id, group);
    }
  }
  const boundary = [...faces.values()].filter(group => group.length === 1).map(group => group[0]!);
  if (boundary.length < 4) throw new TypeError("Tetrahedral boundary is missing.");
  const edges = new Map<string, number>();
  let surfaceArea = 0;
  for (const face of boundary) {
    const [a, b, c] = face.map(index => points[index]!);
    const normal = cross(vector(b!, a!), vector(c!, a!));
    surfaceArea += Math.hypot(...normal) / 2;
    for (const pair of [[face[0]!, face[1]!], [face[1]!, face[2]!], [face[2]!, face[0]!]]) {
      const id = key(pair);
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  const boundaryEdges = [...edges.values()].filter(count => count === 1).length;
  const nonManifoldEdges = [...edges.values()].filter(count => count > 2).length;
  if (boundaryEdges || nonManifoldEdges) throw new TypeError("Tetrahedral boundary is open or nonmanifold.");
  const bounds = [0, 1, 2].flatMap(axis => [Math.min(...points.map(point => point[axis]!)), Math.max(...points.map(point => point[axis]!))]);
  return { points, cells, boundary, volume, surfaceArea, bounds, boundaryEdges, nonManifoldEdges };
};

export class TetrahedralMeshDocumentAdapter {
  readonly #document: TetrahedralMeshDocument;
  readonly #resourceBytes: Uint8Array;
  readonly #geometry: TetrahedralMeshGeometry;

  private constructor(document: TetrahedralMeshDocument, bytes: Uint8Array, geometry: TetrahedralMeshGeometry) {
    this.#document = document;
    this.#resourceBytes = new Uint8Array(bytes);
    this.#geometry = geometry;
  }

  static async importResource(bytes: Uint8Array, sourceMshSha256: string): Promise<TetrahedralMeshDocumentAdapter> {
    const geometry = decodeTetrahedralMeshResource(bytes);
    const digest = await sha256(bytes);
    const document = createTetrahedralMeshDocument({ sourceMshSha256,
      resource: { encoding: "math3d.tetmesh-buffers.v1", sha256: digest,
        byteLength: bytes.byteLength, pointCount: geometry.points.length, tetrahedronCount: geometry.cells.length } });
    return new TetrahedralMeshDocumentAdapter(document, bytes, geometry);
  }

  static async restore(pkg: TetrahedralMeshPackage): Promise<TetrahedralMeshDocumentAdapter> {
    const normalized = normalizeTetrahedralMeshDocument(pkg.document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    const resource = normalized.value.source.resource;
    if (pkg.resourceBytes.byteLength !== resource.byteLength || await sha256(pkg.resourceBytes) !== resource.sha256)
      throw new TypeError("Tetrahedral resource hash or length changed.");
    const geometry = decodeTetrahedralMeshResource(pkg.resourceBytes);
    if (geometry.points.length !== resource.pointCount || geometry.cells.length !== resource.tetrahedronCount)
      throw new TypeError("Tetrahedral resource counts changed.");
    return new TetrahedralMeshDocumentAdapter(normalized.value, pkg.resourceBytes, geometry);
  }

  document(): TetrahedralMeshDocument { return this.#document; }
  geometry(): TetrahedralMeshGeometry { return this.#geometry; }
  exportPackage(): TetrahedralMeshPackage { return { document: this.#document, resourceBytes: new Uint8Array(this.#resourceBytes) }; }
  boundaryMesh(): SurfaceMeshData {
    const shell = [...new Set(this.#geometry.boundary.flat())].sort((a, b) => a - b);
    const index = new Map(shell.map((point, offset) => [point, offset]));
    return { label: this.#document.metadata.label,
      source: { kind: "import", filename: "tetrahedral-boundary.m3dt" },
      positions: new Float32Array(shell.flatMap(point => this.#geometry.points[point]!)),
      indices: new Uint32Array(this.#geometry.boundary.flatMap(face => face.map(point => index.get(point)!))) };
  }
}
