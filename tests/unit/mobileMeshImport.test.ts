import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, deserializeSceneProject, serializeSceneProject, type SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  listMobileGltfDependencies,
  parseMobileMeshFile,
  prepareMobileMeshImport,
  type MobileMeshImportSource,
} from "../../apps/mobile/src/models/mobileMeshImport";
import { readMobileImportedObjectMeshes, readMobileImportedSceneObject } from "../../apps/mobile/src/models/mobileSceneObjectImport";
import { commitMobileWorkspaceAdd } from "../../apps/mobile/src/models/mobileWorkspaceAdd";

const asset = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../assets/mobile-mesh-import/${name}`, import.meta.url)));
const source = (sourceName: string, bytes: Uint8Array): MobileMeshImportSource => ({ sourceName, bytes });

const scene: SceneDocument = { id: "mesh-project", title: "Meshes", createdAt: 1, updatedAt: 2, surfaces: [] };
const project: MobileStoredSceneProject = {
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: 3,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
};

const binaryStl = (truncated = false): Uint8Array => {
  const bytes = new Uint8Array(84 + (truncated ? 20 : 50));
  const view = new DataView(bytes.buffer);
  view.setUint32(80, 1, true);
  if (!truncated) {
    view.setFloat32(84 + 8, 1, true);
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    positions.forEach((value, index) => view.setFloat32(96 + index * 4, value, true));
  }
  return bytes;
};

const binaryPly = (littleEndian: boolean): Uint8Array => {
  const format = littleEndian ? "binary_little_endian" : "binary_big_endian";
  const header = new TextEncoder().encode([
    "ply", `format ${format} 1.0`, "element vertex 3", "property float x", "property float y", "property float z",
    "element face 1", "property list uchar int vertex_indices", "end_header", "",
  ].join("\n"));
  const body = new Uint8Array(3 * 12 + 1 + 3 * 4);
  const view = new DataView(body.buffer);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  positions.forEach((value, index) => view.setFloat32(index * 4, value, littleEndian));
  let offset = 36;
  view.setUint8(offset, 3); offset += 1;
  [0, 1, 2].forEach((value) => { view.setInt32(offset, value, littleEndian); offset += 4; });
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return bytes;
};

const triangleBuffer = (): Uint8Array => {
  const bytes = new Uint8Array(42);
  const view = new DataView(bytes.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(index * 4, value, true));
  [0, 1, 2].forEach((value, index) => view.setUint16(36 + index * 2, value, true));
  return bytes;
};

const triangleGltfDocument = (uri?: string) => ({
  asset: { version: "2.0" },
  buffers: [{ ...(uri === undefined ? {} : { uri }), byteLength: 42 }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
    { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
  nodes: [{ mesh: 0 }],
  scenes: [{ nodes: [0] }],
  scene: 0,
});

const glb = (document = triangleGltfDocument()): Uint8Array => {
  const jsonSource = JSON.stringify(document);
  const jsonPadding = (4 - (new TextEncoder().encode(jsonSource).length % 4)) % 4;
  const json = new TextEncoder().encode(jsonSource + " ".repeat(jsonPadding));
  const rawBinary = triangleBuffer();
  const binLength = Math.ceil(rawBinary.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + json.length + 8 + binLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  const binHeader = 20 + json.length;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(rawBinary, binHeader + 8);
  return bytes;
};

describe("MOB60 bounded mobile mesh import", () => {
  it.each([
    ["OBJ", source("triangle.obj", asset("triangle.obj")), "obj"],
    ["ASCII STL", source("triangle.stl", asset("triangle-ascii.stl")), "stl-ascii"],
    ["binary STL", source("triangle.stl", binaryStl()), "stl-binary"],
    ["ASCII PLY", source("triangle.ply", asset("triangle-ascii.ply")), "ply-ascii"],
    ["binary little-endian PLY", source("triangle.ply", binaryPly(true)), "ply-binary-le"],
    ["binary big-endian PLY", source("triangle.ply", binaryPly(false)), "ply-binary-be"],
  ] as const)("parses the golden %s fixture", (_label, input, format) => {
    const parsed = parseMobileMeshFile(input);
    expect(parsed).toMatchObject({ format, mesh: { vertexCount: 3, triCount: 1 } });
    expect(parsed.mesh.positions).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    expect(parsed.mesh.indices).toEqual(new Uint16Array([0, 1, 2]));
    expect(parsed.mesh.normals?.length).toBe(9);
  });

  it("generates normals when the source omits them and reports unit/axis assumptions", () => {
    const prepared = prepareMobileMeshImport(source("triangle.obj", asset("triangle.obj")), scene, "balanced");
    expect(prepared).toMatchObject({
      status: "ready",
      preview: {
        format: "obj",
        sourceVertexCount: 3,
        sourceTriangleCount: 1,
        sourceHadNormals: false,
        normalsGenerated: true,
        admission: { action: "full" },
      },
    });
    if (prepared.status === "ready") {
      expect(prepared.preview.axisAssumption).toContain("Z-up");
      expect(prepared.preview.unitAssumption).toContain("unitless");
    }
  });

  it("uses MOB52 to create a reduced preview while retaining the source mesh envelope", () => {
    const faces = Array.from({ length: 50_000 }, () => "3 0 1 2").join("\n");
    const largePly = new TextEncoder().encode(`ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 50000\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n${faces}\n`);
    const prepared = prepareMobileMeshImport(source("large.ply", largePly), scene, "balanced");
    expect(prepared).toMatchObject({ status: "ready", preview: { admission: { action: "reduced", sourceTriangles: 50_000 }, mesh: { triCount: 32_000 } } });
    if (prepared.status === "ready") {
      expect(prepared.preview.transferPreview.envelope.geometry).toMatchObject({ kind: "embedded-mesh" });
      if (prepared.preview.transferPreview.envelope.geometry?.kind === "embedded-mesh") {
        expect(prepared.preview.transferPreview.envelope.geometry.indices).toHaveLength(150_000);
      }
    }
  });

  it("rejects truncation, malformed counts, unsupported formats, and cancellation", () => {
    expect(() => parseMobileMeshFile(source("truncated.stl", binaryStl(true)))).toThrow(/truncated/i);
    expect(() => parseMobileMeshFile(source("truncated.ply", asset("truncated-ascii.ply")))).toThrow(/truncated/i);
    expect(() => parseMobileMeshFile(source("mesh.xyz", new Uint8Array([1, 2, 3])))).toThrow(/unsupported/i);
    expect(prepareMobileMeshImport(null, scene, "balanced")).toEqual({ status: "cancelled" });
  });

  it("commits one admitted mesh atomically and reopens its embedded geometry", async () => {
    const prepared = prepareMobileMeshImport(source("triangle.obj", asset("triangle.obj")), scene, "balanced");
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const save = vi.fn(async () => undefined);
    const committed = await commitMobileWorkspaceAdd([project], project.id, scene, { route: "mesh", preview: prepared.preview }, save, 50);
    expect(committed.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (!committed.ok) return;
    expect(committed.addedObjectIds).toEqual(["triangle"]);
    expect(committed.importedMeshById.triangle).toMatchObject({ vertexCount: 3, triCount: 1 });
    expect(readMobileImportedSceneObject(committed.scene, "triangle")?.envelope.object.kind).toBe("mesh");
    const reopened = deserializeSceneProject(committed.project.serializedProject);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(readMobileImportedObjectMeshes(reopened.value.scene).triangle).toMatchObject({ vertexCount: 3, triCount: 1 });
  });

  it("does not expose a partially mutated scene when persistence fails", async () => {
    const prepared = prepareMobileMeshImport(source("triangle.obj", asset("triangle.obj")), scene, "balanced");
    if (prepared.status !== "ready") throw new Error("fixture preparation failed");
    const failed = await commitMobileWorkspaceAdd(
      [project], project.id, scene, { route: "mesh", preview: prepared.preview }, async () => { throw new Error("storage unavailable"); }, 50
    );
    expect(failed).toEqual({ ok: false, error: "storage unavailable" });
    expect(scene.surfaces).toEqual([]);
    expect(scene.extensions).toBeUndefined();
  });
});

describe("MOB61 GLB and managed glTF import", () => {
  it.each([
    ["embedded glTF", source("triangle.gltf", asset("triangle-embedded.gltf")), "gltf"],
    ["self-contained GLB", source("triangle.glb", glb()), "glb"],
  ] as const)("imports a %s fixture and converts Y-up to Z-up", (_label, input, format) => {
    const parsed = parseMobileMeshFile(input);
    expect(parsed).toMatchObject({ format, mesh: { vertexCount: 3, triCount: 1 }, normalsGenerated: true });
    expect(parsed.mesh.positions).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]));
    expect(parsed.warnings.join(" ")).toMatch(/Y-up/);
  });

  it("resolves an external buffer only from an explicitly supplied local package", () => {
    const document = triangleGltfDocument("mesh.bin");
    const input = source("triangle.gltf", new TextEncoder().encode(JSON.stringify(document)));
    expect(listMobileGltfDependencies(input)).toEqual(["mesh.bin"]);
    expect(() => parseMobileMeshFile(input)).toThrow(/was not supplied/);
    const parsed = parseMobileMeshFile({ ...input, dependencies: { "mesh.bin": triangleBuffer() } });
    expect(parsed.mesh).toMatchObject({ vertexCount: 3, triCount: 1 });
  });

  it("flattens node transforms before the glTF Y-up conversion", () => {
    const document = triangleGltfDocument("mesh.bin");
    (document.nodes as Array<Record<string, unknown>>)[0] = { mesh: 0, translation: [1, 2, 3] };
    const parsed = parseMobileMeshFile({
      sourceName: "translated.gltf",
      bytes: new TextEncoder().encode(JSON.stringify(document)),
      dependencies: { "mesh.bin": triangleBuffer() },
    });
    expect(Array.from(parsed.mesh.positions.slice(0, 3))).toEqual([1, -3, 2]);
  });

  it("rejects remote URIs, path escapes, external GLB files, and unsupported compression", () => {
    const remote = source("remote.gltf", new TextEncoder().encode(JSON.stringify({
      ...triangleGltfDocument("https://example.test/mesh.bin"),
      images: [{ uri: "https://example.test/texture.png" }],
    })));
    expect(() => listMobileGltfDependencies(remote)).toThrow(/Remote glTF URI/);

    const escaped = source("escaped.gltf", new TextEncoder().encode(JSON.stringify(triangleGltfDocument("../mesh.bin"))));
    expect(() => listMobileGltfDependencies(escaped)).toThrow(/outside the selected local package/);

    expect(() => parseMobileMeshFile(source("external.glb", glb(triangleGltfDocument("mesh.bin"))))).toThrow(/self-contained/);

    const compressedDocument = { ...triangleGltfDocument(), extensionsUsed: ["KHR_draco_mesh_compression"] };
    expect(() => parseMobileMeshFile(source("compressed.glb", glb(compressedDocument)))).toThrow(/Draco/);
  });

  it("previews and atomically commits admitted GLB geometry", async () => {
    const prepared = prepareMobileMeshImport(source("triangle.glb", glb()), scene, "balanced");
    expect(prepared).toMatchObject({
      status: "ready",
      preview: {
        format: "glb",
        admission: { action: "full" },
        axisAssumption: expect.stringContaining("Y-up"),
        unitAssumption: expect.stringContaining("meter"),
      },
    });
    if (prepared.status !== "ready") return;
    const save = vi.fn(async () => undefined);
    const committed = await commitMobileWorkspaceAdd([project], project.id, scene, { route: "mesh", preview: prepared.preview }, save, 60);
    expect(committed.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (committed.ok) expect(committed.importedMeshById.triangle).toMatchObject({ vertexCount: 3, triCount: 1 });
  });
});
