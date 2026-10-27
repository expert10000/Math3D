import type { VectorField3DIsosurface } from "@math3d/core";

/** Self-contained glTF mesh. Provenance stays in extras without embedding source samples. */
export function exportVectorField3DIsosurfaceGltf(surface: VectorField3DIsosurface): string {
  if (surface.triangleCount === 0)
    throw new TypeError("Export requires a nonempty isosurface.");
  const positionBytes = new Uint8Array(surface.positions.buffer,
    surface.positions.byteOffset, surface.positions.byteLength);
  const normalBytes = new Uint8Array(surface.normals.buffer,
    surface.normals.byteOffset, surface.normals.byteLength);
  const indexBytes = new Uint8Array(surface.indices.buffer,
    surface.indices.byteOffset, surface.indices.byteLength);
  const accessorMin = [Infinity, Infinity, Infinity], accessorMax = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < surface.positions.length; index++) {
    const axis = index % 3, value = surface.positions[index]!;
    accessorMin[axis] = Math.min(accessorMin[axis]!, value);
    accessorMax[axis] = Math.max(accessorMax[axis]!, value);
  }
  const binary = new Uint8Array(positionBytes.length + normalBytes.length + indexBytes.length);
  binary.set(positionBytes); binary.set(normalBytes, positionBytes.length);
  binary.set(indexBytes, positionBytes.length + normalBytes.length);
  let encoded = "";
  for (let offset = 0; offset < binary.length; offset += 0x8000)
    encoded += String.fromCharCode(...binary.subarray(offset, offset + 0x8000));
  const provenance = {
    method: "bounded-speed-marching-tetrahedra", source: surface.source,
    sourceHash: surface.sourceHash, sourceReferences: surface.sourceReferences,
    verifiedTiles: surface.verifiedTiles ?? null, level: surface.level, unit: surface.unit,
    clipBounds: surface.clipBounds, coordinateAxes: surface.coordinateAxes,
    gridShape: surface.gridShape,
    sampledPoints: surface.sampledPoints, triangleBudget: surface.triangleBudget,
    complete: surface.complete, clipped: surface.clipped, bounds: surface.bounds,
    vertexCount: surface.vertexCount, triangleCount: surface.triangleCount,
    topology: surface.topology,
  };
  return JSON.stringify({ asset: { version: "2.0", generator: "MATH3D Scientific Field Explorer" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ name: "Speed isosurface", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2, material: 0, mode: 4 }], extras: provenance }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.12, 0.72, 0.9, 1],
      metallicFactor: 0.05, roughnessFactor: 0.7 } }],
    buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${btoa(encoded)}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indexBytes.length, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: surface.positions.length / 3,
      type: "VEC3", min: accessorMin, max: accessorMax },
      { bufferView: 1, componentType: 5126, count: surface.normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: surface.indices.length, type: "SCALAR" }],
    extras: { math3dScientificSource: provenance } });
}
