export type MeshSourceBuffers = { positions: Float32Array; indices: Uint32Array | null; normals?: Float32Array | null; uvs?: Float32Array | null };

const MAGIC = 0x4d33444d; // M3DM
const HEADER_BYTES = 24;
const ENCODING = "math3d.mesh-buffers.v1" as const;

const bytesOf = (array: Float32Array | Uint32Array): Uint8Array =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/** A deterministic binary sidecar; no vertex/index arrays enter document or command JSON. */
export const encodeMeshBuffers = <T extends MeshSourceBuffers>(mesh: T): Uint8Array => {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const normals = mesh.normals ?? null;
  const uvs = mesh.uvs ?? null;
  // Preserve even malformed imported buffers so Mesh Health can diagnose/repair them.
  const lengths = [positions.length, indices?.length ?? 0, normals?.length ?? 0, uvs?.length ?? 0];
  const size = HEADER_BYTES + lengths.reduce((total, length) => total + length * 4, 0);
  const bytes = new Uint8Array(size);
  const header = new DataView(bytes.buffer);
  [MAGIC, 1, ...lengths].forEach((value, index) => header.setUint32(index * 4, value, true));
  let offset = HEADER_BYTES;
  for (const array of [positions, indices, normals, uvs]) {
    if (!array) continue;
    bytes.set(bytesOf(array), offset);
    offset += array.byteLength;
  }
  return bytes;
};

export const decodeMeshBuffers = (bytes: Uint8Array): { positions: Float32Array; indices: Uint32Array | null; normals: Float32Array | null; uvs: Float32Array | null } => {
  if (bytes.length < HEADER_BYTES) throw new TypeError("Mesh sidecar is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 1) throw new TypeError("Mesh sidecar header is invalid.");
  const lengths = [8, 12, 16, 20].map((offset) => view.getUint32(offset, true));
  if (HEADER_BYTES + lengths.reduce((sum, length) => sum + length * 4, 0) !== bytes.length) {
    throw new TypeError("Mesh sidecar lengths are invalid.");
  }
  let offset = HEADER_BYTES;
  const read = (length: number, kind: "float" | "uint"): Float32Array | Uint32Array => {
    const copy = bytes.slice(offset, offset + length * 4);
    offset += length * 4;
    return kind === "float" ? new Float32Array(copy.buffer) : new Uint32Array(copy.buffer);
  };
  const positions = read(lengths[0]!, "float") as Float32Array;
  const indices = lengths[1] ? read(lengths[1], "uint") as Uint32Array : null;
  const normals = lengths[2] ? read(lengths[2], "float") as Float32Array : null;
  const uvs = lengths[3] ? read(lengths[3], "float") as Float32Array : null;
  return { positions, indices, normals, uvs };
};

