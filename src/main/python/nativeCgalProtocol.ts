/** Phase 3A native CGAL transport: one fixed header followed by opaque M3D mesh resources. */
export const NATIVE_CGAL_PROTOCOL = 1;
export const NATIVE_CGAL_HEADER_BYTES = 28;
export const NATIVE_CGAL_MAX_MESH_BYTES = 512 * 1024 * 1024;
export type NativeCgalOpcode = 1 | 2 | 3;
export type NativeCgalOperation = "union" | "difference" | "intersection";

function rawBuffer(value: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

export function encodeM3DMesh(positions: ArrayBuffer | ArrayBufferView | Buffer,
                              indices: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
  const p = rawBuffer(positions), i = rawBuffer(indices);
  if (p.length % 12 || i.length % 12 || p.length + i.length + 32 > NATIVE_CGAL_MAX_MESH_BYTES) {
    throw new RangeError("Invalid or oversized M3D mesh buffers");
  }
  const vertices = p.length / 12, faces = i.length / 12;
  const header = Buffer.alloc(32);
  header.write("M3DM", 0, "ascii");
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(32, 6);
  header.writeUInt32LE(vertices, 8);
  header.writeUInt32LE(faces, 12);
  header.writeUInt32LE(p.length, 16);
  header.writeUInt32LE(i.length, 20);
  header.writeUInt32LE(32 + p.length + i.length, 24);
  return Buffer.concat([header, p, i]);
}

export function decodeM3DMesh(resource: Buffer): {
  positions: ArrayBuffer; indices: ArrayBuffer; vertexCount: number; triCount: number;
} {
  if (resource.length < 32 || resource.toString("ascii", 0, 4) !== "M3DM" ||
      resource.readUInt16LE(4) !== 1 || resource.readUInt16LE(6) !== 32 || resource.readUInt32LE(28) !== 0) {
    throw new Error("Invalid M3D mesh header from native worker");
  }
  const vertexCount = resource.readUInt32LE(8), triCount = resource.readUInt32LE(12);
  const pLength = resource.readUInt32LE(16), iLength = resource.readUInt32LE(20);
  if (pLength !== vertexCount * 12 || iLength !== triCount * 12 ||
      resource.readUInt32LE(24) !== resource.length || resource.length !== 32 + pLength + iLength ||
      resource.length > NATIVE_CGAL_MAX_MESH_BYTES) {
    throw new Error("Invalid M3D mesh length from native worker");
  }
  const positions = Uint8Array.from(resource.subarray(32, 32 + pLength)).buffer;
  const indices = Uint8Array.from(resource.subarray(32 + pLength)).buffer;
  for (const coordinate of new Float32Array(positions)) {
    if (!Number.isFinite(coordinate)) throw new Error("Non-finite native CGAL result vertex");
  }
  for (const index of new Uint32Array(indices)) {
    if (index >= vertexCount) throw new Error("Native CGAL result index is out of range");
  }
  return { positions, indices, vertexCount, triCount };
}

export function encodeNativeCgalRequest(opcode: NativeCgalOpcode, jobId: string,
                                        meshA?: Buffer, meshB?: Buffer,
                                        operation?: NativeCgalOperation): Buffer {
  const job = Buffer.from(jobId, "utf8");
  const a = meshA ?? Buffer.alloc(0), b = meshB ?? Buffer.alloc(0);
  if (job.length > 4096 || a.length > NATIVE_CGAL_MAX_MESH_BYTES || b.length > NATIVE_CGAL_MAX_MESH_BYTES ||
      job.length + a.length + b.length > 1024 * 1024 * 1024) throw new RangeError("Native CGAL frame is too large");
  const header = Buffer.alloc(NATIVE_CGAL_HEADER_BYTES);
  header.write("M3DC", 0, "ascii");
  header.writeUInt16LE(NATIVE_CGAL_PROTOCOL, 4);
  header.writeUInt16LE(opcode, 6);
  header.writeUInt32LE(job.length, 8);
  header.writeUInt32LE(a.length, 12);
  header.writeUInt32LE(b.length, 16);
  header.writeUInt32LE(operation === "union" ? 1 : operation === "difference" ? 2 : operation === "intersection" ? 3 : 0, 20);
  return Buffer.concat([header, job, a, b]);
}

export function nativeCgalResponseLength(header: Buffer): number {
  if (header.length < NATIVE_CGAL_HEADER_BYTES || header.toString("ascii", 0, 4) !== "M3DC" ||
      header.readUInt16LE(4) !== NATIVE_CGAL_PROTOCOL || header.readUInt32LE(24) !== 0) {
    throw new Error("Invalid native CGAL response header");
  }
  const job = header.readUInt32LE(8), mesh = header.readUInt32LE(12), message = header.readUInt32LE(16);
  if (job > 4096 || mesh > NATIVE_CGAL_MAX_MESH_BYTES || message > 65536 ||
      job + mesh + message > 1024 * 1024 * 1024) throw new Error("Native CGAL response exceeds limits");
  return NATIVE_CGAL_HEADER_BYTES + job + mesh + message;
}

export function decodeNativeCgalResponse(frame: Buffer): {
  ok: boolean; opcode: number; jobId: string; mesh: Buffer; message: string;
} {
  const length = nativeCgalResponseLength(frame.subarray(0, NATIVE_CGAL_HEADER_BYTES));
  if (frame.length !== length) throw new Error("Truncated native CGAL response");
  const jobLength = frame.readUInt32LE(8), meshLength = frame.readUInt32LE(12);
  const start = NATIVE_CGAL_HEADER_BYTES;
  return {
    ok: frame.readUInt16LE(6) === 0,
    opcode: frame.readUInt32LE(20),
    jobId: frame.toString("utf8", start, start + jobLength),
    mesh: frame.subarray(start + jobLength, start + jobLength + meshLength),
    message: frame.toString("utf8", start + jobLength + meshLength),
  };
}
