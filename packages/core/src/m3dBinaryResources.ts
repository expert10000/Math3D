import { isStructuralHash, sha256Checksum, type StructuralHash } from "./documentIdentity";

export const M3D_BINARY_RESOURCE_SCHEMA_VERSION = 1 as const;
export const M3D_MESH_FORMAT = "math3d.mesh.v1" as const;
const MESH_MAGIC = [0x4d, 0x33, 0x44, 0x4d] as const; // M3DM
const MESH_HEADER_BYTES = 32;

export type M3DResourceDescriptor = Readonly<{
  schemaVersion: typeof M3D_BINARY_RESOURCE_SCHEMA_VERSION;
  format: typeof M3D_MESH_FORMAT;
  byteLength: number;
  checksum: StructuralHash;
}>;

export type M3DResourceReference = Readonly<{
  resourceId: `m3d:${string}`;
  descriptor: M3DResourceDescriptor;
}>;

export type M3DMeshResource = Readonly<{
  descriptor: M3DResourceDescriptor;
  bytes: Uint8Array;
  vertexCount: number;
  triangleCount: number;
}>;

export type M3DMeshBuffers = Readonly<{
  positions: Float32Array;
  indices: Uint32Array;
}>;

const assertSafeCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`);
};

const assertMesh = (mesh: M3DMeshBuffers): void => {
  if (!(mesh.positions instanceof Float32Array) || mesh.positions.length % 3 !== 0) {
    throw new TypeError("M3D mesh positions must be a Float32Array of xyz triples.");
  }
  if (!(mesh.indices instanceof Uint32Array) || mesh.indices.length % 3 !== 0) {
    throw new TypeError("M3D mesh indices must be a Uint32Array of triangle triples.");
  }
  const vertexCount = mesh.positions.length / 3;
  for (const value of mesh.positions) {
    if (!Number.isFinite(value)) throw new TypeError("M3D mesh positions must be finite.");
  }
  for (const index of mesh.indices) {
    if (index >= vertexCount) throw new RangeError("M3D mesh index is outside the position array.");
  }
};

const alignedBytes = (value: Uint8Array): Uint8Array => {
  if (value.byteOffset % 4 === 0) return value;
  return new Uint8Array(value);
};

/** Serializes indexed Float32/Uint32 geometry into the portable M3D mesh resource. */
export const encodeM3DMeshResource = (mesh: M3DMeshBuffers): M3DMeshResource => {
  assertMesh(mesh);
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  assertSafeCount(vertexCount, "vertexCount");
  assertSafeCount(triangleCount, "triangleCount");
  const positionsBytes = mesh.positions.byteLength;
  const indicesBytes = mesh.indices.byteLength;
  const totalBytes = MESH_HEADER_BYTES + positionsBytes + indicesBytes;
  assertSafeCount(totalBytes, "M3D mesh byteLength");

  const bytes = new Uint8Array(totalBytes);
  bytes.set(MESH_MAGIC, 0);
  const header = new DataView(bytes.buffer);
  header.setUint16(4, M3D_BINARY_RESOURCE_SCHEMA_VERSION, true);
  header.setUint16(6, MESH_HEADER_BYTES, true);
  header.setUint32(8, vertexCount, true);
  header.setUint32(12, triangleCount, true);
  header.setUint32(16, positionsBytes, true);
  header.setUint32(20, indicesBytes, true);
  header.setUint32(24, totalBytes, true);
  header.setUint32(28, 0, true);
  bytes.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, positionsBytes), MESH_HEADER_BYTES);
  bytes.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, indicesBytes), MESH_HEADER_BYTES + positionsBytes);
  const descriptor = Object.freeze({
    schemaVersion: M3D_BINARY_RESOURCE_SCHEMA_VERSION,
    format: M3D_MESH_FORMAT,
    byteLength: totalBytes,
    checksum: sha256Checksum(bytes),
  });
  return Object.freeze({ descriptor, bytes, vertexCount, triangleCount });
};

/**
 * Validates and exposes typed-array views over an M3D mesh resource. The
 * returned arrays share the supplied resource bytes; callers must treat them
 * as immutable input.
 */
export const decodeM3DMeshResource = (candidate: Uint8Array): M3DMeshBuffers => {
  if (!(candidate instanceof Uint8Array)) throw new TypeError("M3D mesh resource must be a Uint8Array.");
  const bytes = alignedBytes(candidate);
  if (bytes.byteLength < MESH_HEADER_BYTES) throw new TypeError("M3D mesh resource is smaller than its header.");
  if (!MESH_MAGIC.every((value, index) => bytes[index] === value)) throw new TypeError("M3D mesh resource has an invalid magic value.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, MESH_HEADER_BYTES);
  if (header.getUint16(4, true) !== M3D_BINARY_RESOURCE_SCHEMA_VERSION) throw new TypeError("M3D mesh resource schema version is unsupported.");
  if (header.getUint16(6, true) !== MESH_HEADER_BYTES) throw new TypeError("M3D mesh resource header length is unsupported.");
  const vertexCount = header.getUint32(8, true);
  const triangleCount = header.getUint32(12, true);
  const positionsBytes = header.getUint32(16, true);
  const indicesBytes = header.getUint32(20, true);
  const totalBytes = header.getUint32(24, true);
  if (header.getUint32(28, true) !== 0) throw new TypeError("M3D mesh resource has unsupported flags.");
  if (positionsBytes !== vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT || indicesBytes !== triangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT) {
    throw new TypeError("M3D mesh resource counts do not match its typed-array byte lengths.");
  }
  if (totalBytes !== bytes.byteLength || totalBytes !== MESH_HEADER_BYTES + positionsBytes + indicesBytes) {
    throw new TypeError("M3D mesh resource byte length does not match its header.");
  }
  const positions = new Float32Array(bytes.buffer, bytes.byteOffset + MESH_HEADER_BYTES, vertexCount * 3);
  const indices = new Uint32Array(bytes.buffer, bytes.byteOffset + MESH_HEADER_BYTES + positionsBytes, triangleCount * 3);
  assertMesh({ positions, indices });
  return Object.freeze({ positions, indices });
};

export const verifyM3DMeshResource = (resource: M3DMeshResource): boolean =>
  resource.descriptor.schemaVersion === M3D_BINARY_RESOURCE_SCHEMA_VERSION &&
  resource.descriptor.format === M3D_MESH_FORMAT &&
  resource.descriptor.byteLength === resource.bytes.byteLength &&
  resource.descriptor.checksum === sha256Checksum(resource.bytes);

export const isM3DResourceReference = (value: unknown): value is M3DResourceReference => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  if (Object.keys(reference).length !== 2 || typeof reference.resourceId !== "string" || !reference.resourceId.startsWith("m3d:")) return false;
  if (!reference.descriptor || typeof reference.descriptor !== "object" || Array.isArray(reference.descriptor)) return false;
  const descriptor = reference.descriptor as Record<string, unknown>;
  return Object.keys(descriptor).length === 4 &&
    descriptor.schemaVersion === M3D_BINARY_RESOURCE_SCHEMA_VERSION &&
    descriptor.format === M3D_MESH_FORMAT &&
    Number.isSafeInteger(descriptor.byteLength) && Number(descriptor.byteLength) > 0 &&
    isStructuralHash(descriptor.checksum) && reference.resourceId === `m3d:${descriptor.checksum.slice("sha256:".length)}`;
};
