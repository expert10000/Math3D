import type { SurfaceMeshData } from "./surfaceMesh";
import { computeMeshTopologyInspector, type MeshTopologyInspectorDetails, type MeshTopologyInspectorOptions } from "./topologyInspector";

/** A read-only comparison. The spatial result is an interpretation, not an edit to the source mesh. */
export type MeshTopologyInterpretations = Readonly<{
  indexedSource: MeshTopologyInspectorDetails;
  spatialWeld: MeshTopologyInspectorDetails;
  method: "position-distance";
  tolerance: number;
  mergedVertexCount: number;
  collapsedFaceCount: number;
}>;

const coordinateKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export const computeMeshTopologyInterpretations = (
  mesh: SurfaceMeshData,
  tolerance: number,
  options: MeshTopologyInspectorOptions = {}
): MeshTopologyInterpretations => {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("Spatial-weld tolerance must be finite and non-negative.");
  const indexedSource = computeMeshTopologyInspector(mesh, options);
  if (!indexedSource) throw new TypeError("A non-empty source mesh is required.");

  const sourcePositions = mesh.positions;
  const vertexCount = Math.floor(sourcePositions.length / 3);
  const representatives: number[] = [];
  const mapped = new Uint32Array(vertexCount);
  const cells = new Map<string, number[]>();
  const exact = new Map<string, number>();

  // First-seen representatives make the interpretation stable for the same source order.
  // A later vertex joins a representative only when their positions are within tolerance.
  for (let index = 0; index < vertexCount; index += 1) {
    const x = sourcePositions[index * 3]!;
    const y = sourcePositions[index * 3 + 1]!;
    const z = sourcePositions[index * 3 + 2]!;
    const finite = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
    let representative = -1;
    if (finite && tolerance === 0) {
      representative = exact.get(coordinateKey(x, y, z)) ?? -1;
    } else if (finite) {
      const cx = Math.floor(x / tolerance);
      const cy = Math.floor(y / tolerance);
      const cz = Math.floor(z / tolerance);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            for (const candidate of cells.get(coordinateKey(cx + dx, cy + dy, cz + dz)) ?? []) {
              const sourceIndex = representatives[candidate]!;
              const px = sourcePositions[sourceIndex * 3]!;
              const py = sourcePositions[sourceIndex * 3 + 1]!;
              const pz = sourcePositions[sourceIndex * 3 + 2]!;
              if (Math.hypot(x - px, y - py, z - pz) <= tolerance &&
                (representative < 0 || candidate < representative)) representative = candidate;
            }
          }
        }
      }
    }
    if (representative < 0) {
      representative = representatives.length;
      representatives.push(index);
      if (finite && tolerance === 0) exact.set(coordinateKey(x, y, z), representative);
      if (finite && tolerance > 0) {
        const cell = coordinateKey(Math.floor(x / tolerance), Math.floor(y / tolerance), Math.floor(z / tolerance));
        cells.set(cell, [...(cells.get(cell) ?? []), representative]);
      }
    }
    mapped[index] = representative;
  }

  const positions = new Float32Array(representatives.length * 3);
  representatives.forEach((sourceIndex, targetIndex) => {
    positions.set(sourcePositions.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3);
  });
  const sourceIndices = mesh.indices && mesh.indices.length >= 3
    ? mesh.indices
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const indices = Uint32Array.from(sourceIndices, (sourceIndex) => sourceIndex < vertexCount ? mapped[sourceIndex]! : 0xffffffff);
  const spatialWeld = computeMeshTopologyInspector({ label: mesh.label, source: mesh.source, positions, indices }, options);
  if (!spatialWeld) throw new TypeError("Spatial-weld interpretation could not be computed.");

  return {
    indexedSource,
    spatialWeld,
    method: "position-distance",
    tolerance,
    mergedVertexCount: vertexCount - representatives.length,
    collapsedFaceCount: indexedSource.faceCount - spatialWeld.faceCount,
  };
};
