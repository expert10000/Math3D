import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { computeMeshTopologyInspector, type MeshTopologyInspectorDetails } from "../mesh/topologyInspector";

export type ExactPositionTopologyInterpretation = {
  readonly method: "exact-position-identification";
  readonly inputVertexCount: number;
  readonly identifiedVertexCount: number;
  readonly mergedVertexCount: number;
  readonly collapsedTriangleCount: number;
  readonly topology: MeshTopologyInspectorDetails | null;
};

/** A read-only interpretation of one mesh. Equal coordinates are identified only when explicitly requested. */
export const interpretTopologyByExactPosition = (
  mesh: SurfaceMeshData
): ExactPositionTopologyInterpretation | null => {
  const inputVertexCount = Math.floor(mesh.positions.length / 3);
  if (!inputVertexCount) return null;
  const vertexMap = new Uint32Array(inputVertexCount);
  const uniquePositions: number[] = [];
  const indexByPosition = new Map<string, number>();
  for (let index = 0; index < inputVertexCount; index += 1) {
    const x = Number(mesh.positions[index * 3]);
    const y = Number(mesh.positions[index * 3 + 1]);
    const z = Number(mesh.positions[index * 3 + 2]);
    if (![x, y, z].every(Number.isFinite)) return null;
    const key = `${x === 0 ? 0 : x}|${y === 0 ? 0 : y}|${z === 0 ? 0 : z}`;
    let identifiedIndex = indexByPosition.get(key);
    if (identifiedIndex === undefined) {
      identifiedIndex = uniquePositions.length / 3;
      indexByPosition.set(key, identifiedIndex);
      uniquePositions.push(x, y, z);
    }
    vertexMap[index] = identifiedIndex;
  }

  const inputIndices = mesh.indices && mesh.indices.length >= 3
    ? mesh.indices
    : Uint32Array.from({ length: inputVertexCount }, (_, index) => index);
  const remapped = new Uint32Array(inputIndices.length);
  for (let index = 0; index < inputIndices.length; index += 1) {
    const sourceIndex = Number(inputIndices[index]);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= inputVertexCount) return null;
    remapped[index] = vertexMap[sourceIndex];
  }
  let collapsedTriangleCount = 0;
  for (let index = 0; index + 2 < remapped.length; index += 3) {
    const a = remapped[index];
    const b = remapped[index + 1];
    const c = remapped[index + 2];
    if (a === b || b === c || a === c) collapsedTriangleCount += 1;
  }
  const interpretationMesh: SurfaceMeshData = {
    label: `${mesh.label} (exact-position interpretation)`,
    positions: Float32Array.from(uniquePositions),
    indices: remapped,
    source: mesh.source,
  };
  return {
    method: "exact-position-identification",
    inputVertexCount,
    identifiedVertexCount: uniquePositions.length / 3,
    mergedVertexCount: inputVertexCount - uniquePositions.length / 3,
    collapsedTriangleCount,
    topology: computeMeshTopologyInspector(interpretationMesh),
  };
};
