import { describe, expect, it } from "vitest";
import { encodeM3DMeshResource, decodeM3DMeshResource } from "../../../packages/core/src/m3dBinaryResources";
import {
  decodeM3DMesh, decodeNativeCgalResponse, encodeM3DMesh,
  encodeNativeCgalRequest, nativeCgalResponseLength,
} from "../../../src/main/python/nativeCgalProtocol";

describe("standalone native CGAL protocol", () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);

  it("uses the exact shared math3d.mesh.v1 resource layout", () => {
    const native = encodeM3DMesh(positions, indices);
    const core = encodeM3DMeshResource({ positions, indices });
    expect(native).toEqual(Buffer.from(core.bytes));
    expect(decodeM3DMesh(native).triCount).toBe(1);
    expect(decodeM3DMeshResource(native).positions).toEqual(positions);
  });

  it("frames two binary resources with a bounded job identity", () => {
    const mesh = encodeM3DMesh(positions, indices);
    const request = encodeNativeCgalRequest(3, "boolean-1", mesh, mesh, "difference");
    expect(request.toString("ascii", 0, 4)).toBe("M3DC");
    expect(request.readUInt16LE(6)).toBe(3);
    expect(request.readUInt32LE(20)).toBe(2);
    expect(request.readUInt32LE(12)).toBe(mesh.length);
    expect(request.readUInt32LE(16)).toBe(mesh.length);
    expect(request.subarray(28 + "boolean-1".length, 28 + "boolean-1".length + mesh.length)).toEqual(mesh);
    expect(() => encodeNativeCgalRequest(1, "x".repeat(4097))).toThrow();
  });

  it("rejects malformed response lengths before allocation", () => {
    const header = Buffer.alloc(28);
    header.write("M3DC", 0, "ascii");
    header.writeUInt16LE(1, 4);
    header.writeUInt32LE(1, 8);
    header.writeUInt32LE(512 * 1024 * 1024 + 1, 12);
    expect(() => nativeCgalResponseLength(header)).toThrow();
    header.writeUInt32LE(0, 12);
    expect(() => decodeNativeCgalResponse(header)).toThrow();
  });

  it("rejects a structurally valid result with an invalid index", () => {
    const mesh = encodeM3DMesh(positions, indices);
    mesh.writeUInt32LE(99, mesh.length - 4);
    expect(() => decodeM3DMesh(mesh)).toThrow(/out of range/);
  });
});
