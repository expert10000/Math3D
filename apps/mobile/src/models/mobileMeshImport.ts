import {
  createSceneObjectEnvelope,
  type SceneDocument,
  type SceneObjectEnvelope,
} from "@math3d/core";
import { decode as decodeBase64String } from "base-64";
import { admitMobileMeshForRendering, type MobileMeshAdmission } from "./mobileMeshAdmission";
import { createUniqueMobileSceneObjectId } from "./mobileSceneObjectOperations";
import type { MobileSceneObjectImportPreview } from "./mobileSceneObjectImport";
import type { MobileMeshPayload, MobileRenderQuality } from "../viewer/mobileSurfacePreview";

export const MAX_MOBILE_MESH_IMPORT_BYTES = 32 * 1024 * 1024;
export const MAX_MOBILE_MESH_IMPORT_VERTICES = 250_000;
export const MAX_MOBILE_MESH_IMPORT_TRIANGLES = 500_000;
const DEFAULT_PARSE_DEADLINE_MS = 2_500;

export type MobileMeshImportFormat =
  | "obj"
  | "stl-ascii"
  | "stl-binary"
  | "ply-ascii"
  | "ply-binary-le"
  | "ply-binary-be"
  | "glb"
  | "gltf";

export type MobileMeshImportSource = Readonly<{
  sourceName: string;
  bytes: Uint8Array;
  dependencies?: Readonly<Record<string, Uint8Array>>;
}>;

export type MobileMeshImportPreview = Readonly<{
  transferPreview: MobileSceneObjectImportPreview;
  format: MobileMeshImportFormat;
  mesh: MobileMeshPayload;
  sourceVertexCount: number;
  sourceTriangleCount: number;
  sourceHadNormals: boolean;
  normalsGenerated: boolean;
  axisAssumption: string;
  unitAssumption: string;
  warnings: readonly string[];
  admission: MobileMeshAdmission;
}>;

export type MobileMeshImportPreparation =
  | { status: "ready"; preview: MobileMeshImportPreview }
  | { status: "cancelled" }
  | { status: "error"; error: string };

type ParsedMesh = {
  format: MobileMeshImportFormat;
  mesh: MobileMeshPayload;
  sourceHadNormals: boolean;
  normalsGenerated: boolean;
  warnings: string[];
};

const decoder = new TextDecoder("utf-8", { fatal: true });

const parseBudget = (deadlineMs: number) => {
  const deadline = Date.now() + Math.max(1, deadlineMs);
  let operations = 0;
  return () => {
    operations += 1;
    if ((operations & 4095) === 0 && Date.now() > deadline) {
      throw new Error("Mesh parsing exceeded the mobile processing-time limit.");
    }
  };
};

const finite = (value: string | number, label: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
};

const safeStem = (sourceName: string): string => {
  const withoutExtension = sourceName.replace(/\.(?:obj|stl|ply|glb|gltf)$/i, "");
  const normalized = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "imported-mesh";
};

const indexArray = (values: readonly number[], vertexCount: number): Uint16Array | Uint32Array =>
  vertexCount <= 65_535 ? new Uint16Array(values) : new Uint32Array(values);

const normalizeNormals = (normals: Float32Array): Float32Array => {
  for (let offset = 0; offset < normals.length; offset += 3) {
    const x = normals[offset];
    const y = normals[offset + 1];
    const z = normals[offset + 2];
    const length = Math.hypot(x, y, z);
    if (length > 1e-12) {
      normals[offset] = x / length;
      normals[offset + 1] = y / length;
      normals[offset + 2] = z / length;
    }
  }
  return normals;
};

export const generateMobileMeshNormals = (positions: Float32Array, indices: Uint16Array | Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ia = indices[offset] * 3;
    const ib = indices[offset + 1] * 3;
    const ic = indices[offset + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const vertexOffset of [ia, ib, ic]) {
      normals[vertexOffset] += nx;
      normals[vertexOffset + 1] += ny;
      normals[vertexOffset + 2] += nz;
    }
  }
  return normalizeNormals(normals);
};

const checkedMesh = (
  positions: number[],
  indices: number[],
  normals: number[] | null,
  sourceHadNormals: boolean,
  format: MobileMeshImportFormat,
  warnings: string[]
): ParsedMesh => {
  const vertexCount = positions.length / 3;
  const triCount = indices.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount === 0) throw new Error("Mesh contains no valid vertices.");
  if (!Number.isInteger(triCount) || triCount === 0) throw new Error("Mesh contains no valid triangles.");
  if (vertexCount > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error(`Mesh exceeds the ${MAX_MOBILE_MESH_IMPORT_VERTICES.toLocaleString()} vertex import limit.`);
  if (triCount > MAX_MOBILE_MESH_IMPORT_TRIANGLES) throw new Error(`Mesh exceeds the ${MAX_MOBILE_MESH_IMPORT_TRIANGLES.toLocaleString()} triangle import limit.`);
  if (positions.some((value) => !Number.isFinite(value))) throw new Error("Mesh contains a non-finite position.");
  if (indices.some((value) => !Number.isSafeInteger(value) || value < 0 || value >= vertexCount)) throw new Error("Mesh contains an invalid vertex index.");
  const typedPositions = new Float32Array(positions);
  const typedIndices = indexArray(indices, vertexCount);
  const completeNormals = normals && normals.length === positions.length && normals.every(Number.isFinite);
  const typedNormals = completeNormals
    ? normalizeNormals(new Float32Array(normals))
    : generateMobileMeshNormals(typedPositions, typedIndices);
  return {
    format,
    sourceHadNormals,
    normalsGenerated: !completeNormals,
    warnings,
    mesh: { positions: typedPositions, indices: typedIndices, normals: typedNormals, vertexCount, triCount },
  };
};

const parseObj = (bytes: Uint8Array, tick: () => void): ParsedMesh => {
  const text = decoder.decode(bytes);
  const sourcePositions: number[][] = [];
  const sourceNormals: number[][] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  let hasTexcoords = false;
  let hasMaterials = false;
  let missingNormal = false;

  const resolveIndex = (raw: string, count: number, label: string): number => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed === 0) throw new Error(`OBJ ${label} index '${raw}' is invalid.`);
    const index = parsed > 0 ? parsed - 1 : count + parsed;
    if (index < 0 || index >= count) throw new Error(`OBJ ${label} index '${raw}' is out of range.`);
    return index;
  };

  const lines = text.split(/\r?\n/);
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    tick();
    const line = lines[lineNumber].trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(/\s+/);
    const keyword = fields.shift();
    if (keyword === "v") {
      if (fields.length < 3) throw new Error(`OBJ line ${lineNumber + 1} has an incomplete vertex.`);
      sourcePositions.push(fields.slice(0, 3).map((value) => finite(value, `OBJ line ${lineNumber + 1} vertex`)));
    } else if (keyword === "vn") {
      if (fields.length < 3) throw new Error(`OBJ line ${lineNumber + 1} has an incomplete normal.`);
      sourceNormals.push(fields.slice(0, 3).map((value) => finite(value, `OBJ line ${lineNumber + 1} normal`)));
    } else if (keyword === "vt") {
      hasTexcoords = true;
    } else if (keyword === "mtllib" || keyword === "usemtl") {
      hasMaterials = true;
    } else if (keyword === "f") {
      if (fields.length < 3) throw new Error(`OBJ line ${lineNumber + 1} has a face with fewer than three vertices.`);
      const face = fields.map((token) => {
        const [rawPosition, rawTexcoord, rawNormal] = token.split("/");
        const positionIndex = resolveIndex(rawPosition, sourcePositions.length, "position");
        const normalIndex = rawNormal ? resolveIndex(rawNormal, sourceNormals.length, "normal") : null;
        if (rawTexcoord) hasTexcoords = true;
        if (normalIndex === null) missingNormal = true;
        const key = `${positionIndex}/${normalIndex ?? ""}`;
        const existing = vertices.get(key);
        if (existing !== undefined) return existing;
        const outputIndex = positions.length / 3;
        if (outputIndex >= MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("OBJ exceeds the mobile vertex import limit.");
        positions.push(...sourcePositions[positionIndex]);
        if (normalIndex !== null) normals.push(...sourceNormals[normalIndex]);
        else normals.push(0, 0, 0);
        vertices.set(key, outputIndex);
        return outputIndex;
      });
      for (let index = 1; index < face.length - 1; index += 1) {
        if (indices.length / 3 >= MAX_MOBILE_MESH_IMPORT_TRIANGLES) throw new Error("OBJ exceeds the mobile triangle import limit.");
        indices.push(face[0], face[index], face[index + 1]);
      }
    }
  }
  const warnings: string[] = [];
  if (hasTexcoords) warnings.push("Texture coordinates are not retained by the mobile mesh preview.");
  if (hasMaterials) warnings.push("OBJ materials are not retained; the project style is used instead.");
  if (missingNormal) warnings.push("Missing OBJ normals were generated from triangle geometry.");
  return checkedMesh(positions, indices, missingNormal ? null : normals, sourceNormals.length > 0, "obj", warnings);
};

const parseBinaryStl = (bytes: Uint8Array, tick: () => void): ParsedMesh => {
  if (bytes.length < 84) throw new Error("Binary STL header is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  const expected = 84 + triangleCount * 50;
  if (expected !== bytes.length) throw new Error(`Binary STL length is invalid: expected ${expected} bytes, received ${bytes.length}.`);
  if (triangleCount > MAX_MOBILE_MESH_IMPORT_TRIANGLES || triangleCount * 3 > MAX_MOBILE_MESH_IMPORT_VERTICES) {
    throw new Error("Binary STL exceeds the mobile vertex or triangle import limit.");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  let usableNormals = true;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    tick();
    const offset = 84 + triangle * 50;
    const normal = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)];
    if (!normal.every(Number.isFinite) || Math.hypot(...normal) <= 1e-12) usableNormals = false;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + 12 + vertex * 12;
      positions.push(
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true)
      );
      normals.push(...normal);
    }
  }
  const indices = Array.from({ length: triangleCount * 3 }, (_, index) => index);
  return checkedMesh(positions, indices, usableNormals ? normals : null, usableNormals, "stl-binary", usableNormals ? [] : ["Missing or invalid STL facet normals were regenerated."]);
};

const parseAsciiStl = (bytes: Uint8Array, tick: () => void): ParsedMesh => {
  const text = decoder.decode(bytes);
  const positions: number[] = [];
  const normals: number[] = [];
  let currentNormal: number[] | null = null;
  let verticesInFacet = 0;
  let facetCount = 0;
  let usableNormals = true;
  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    tick();
    const line = rawLine.trim();
    const normalMatch = /^facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)$/i.exec(line);
    if (normalMatch) {
      if (verticesInFacet !== 0) throw new Error(`ASCII STL facet before line ${lineIndex + 1} is incomplete.`);
      currentNormal = normalMatch.slice(1).map((value) => finite(value, `STL line ${lineIndex + 1} normal`));
      if (Math.hypot(...currentNormal) <= 1e-12) usableNormals = false;
      continue;
    }
    const vertexMatch = /^vertex\s+(\S+)\s+(\S+)\s+(\S+)$/i.exec(line);
    if (vertexMatch) {
      if (!currentNormal) throw new Error(`ASCII STL line ${lineIndex + 1} has a vertex outside a facet.`);
      positions.push(...vertexMatch.slice(1).map((value) => finite(value, `STL line ${lineIndex + 1} vertex`)));
      normals.push(...currentNormal);
      verticesInFacet += 1;
      if (verticesInFacet > 3) throw new Error(`ASCII STL facet at line ${lineIndex + 1} has more than three vertices.`);
      continue;
    }
    if (/^endfacet$/i.test(line)) {
      if (verticesInFacet !== 3) throw new Error(`ASCII STL facet ending at line ${lineIndex + 1} is incomplete.`);
      facetCount += 1;
      if (facetCount > MAX_MOBILE_MESH_IMPORT_TRIANGLES || facetCount * 3 > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("ASCII STL exceeds the mobile import limit.");
      verticesInFacet = 0;
      currentNormal = null;
    }
  }
  if (verticesInFacet !== 0 || facetCount === 0) throw new Error("ASCII STL is truncated or contains no complete facets.");
  const indices = Array.from({ length: facetCount * 3 }, (_, index) => index);
  return checkedMesh(positions, indices, usableNormals ? normals : null, usableNormals, "stl-ascii", usableNormals ? [] : ["Missing or invalid STL facet normals were regenerated."]);
};

type PlyScalarType = "char" | "uchar" | "short" | "ushort" | "int" | "uint" | "float" | "double";
type PlyFormat = "ascii" | "binary_little_endian" | "binary_big_endian";
type PlyProperty = { name: string; type: PlyScalarType } | { name: string; list: true; countType: PlyScalarType; itemType: PlyScalarType };
type PlyElement = { name: string; count: number; properties: PlyProperty[] };

const PLY_TYPE_BYTES: Record<PlyScalarType, number> = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8 };
const PLY_TYPE_ALIASES: Record<string, PlyScalarType | undefined> = {
  int8: "char", uint8: "uchar", int16: "short", uint16: "ushort", int32: "int", uint32: "uint", float32: "float", float64: "double",
  char: "char", uchar: "uchar", short: "short", ushort: "ushort", int: "int", uint: "uint", float: "float", double: "double",
};

const parsePlyHeader = (bytes: Uint8Array) => {
  const probe = new TextDecoder("ascii").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
  const match = /end_header\r?\n/.exec(probe);
  if (!match || match.index === undefined) throw new Error("PLY header is missing end_header or exceeds 64 KB.");
  const headerLength = match.index + match[0].length;
  const lines = probe.slice(0, match.index).split(/\r?\n/);
  if (lines[0]?.trim() !== "ply") throw new Error("PLY magic header is missing.");
  let format: PlyFormat | null = null;
  const elements: PlyElement[] = [];
  let current: PlyElement | null = null;
  const warnings: string[] = [];
  for (const rawLine of lines.slice(1)) {
    const fields = rawLine.trim().split(/\s+/);
    if (fields[0] === "format") {
      if (fields[2] !== "1.0" || !["ascii", "binary_little_endian", "binary_big_endian"].includes(fields[1])) throw new Error("PLY format/version is unsupported.");
      format = fields[1] as PlyFormat;
    } else if (fields[0] === "element") {
      const count = Number(fields[2]);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`PLY element '${fields[1]}' has an invalid count.`);
      current = { name: fields[1], count, properties: [] };
      elements.push(current);
    } else if (fields[0] === "property") {
      if (!current) throw new Error("PLY property appears before an element.");
      if (fields[1] === "list") {
        const countType = PLY_TYPE_ALIASES[fields[2]];
        const itemType = PLY_TYPE_ALIASES[fields[3]];
        if (!countType || !itemType || !fields[4]) throw new Error("PLY list property type is unsupported.");
        current.properties.push({ name: fields[4], list: true, countType, itemType });
      } else {
        const type = PLY_TYPE_ALIASES[fields[1]];
        if (!type || !fields[2]) throw new Error("PLY scalar property type is unsupported.");
        current.properties.push({ name: fields[2], type });
      }
    } else if (fields[0] === "comment" && /texture|material/i.test(rawLine)) {
      warnings.push("PLY material or texture comments are not retained.");
    }
  }
  if (!format) throw new Error("PLY format declaration is missing.");
  const vertex = elements.find((element) => element.name === "vertex");
  const face = elements.find((element) => element.name === "face");
  if (!vertex || vertex.count === 0) throw new Error("PLY contains no vertices.");
  if (!face || face.count === 0) throw new Error("PLY contains no faces.");
  if (vertex.count > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("PLY exceeds the mobile vertex import limit.");
  return { format, elements, headerLength, warnings };
};

const readPlyScalar = (view: DataView, offset: number, type: PlyScalarType, littleEndian: boolean): [number, number] => {
  const size = PLY_TYPE_BYTES[type];
  if (offset + size > view.byteLength) throw new Error("Binary PLY payload is truncated.");
  const value = type === "char" ? view.getInt8(offset)
    : type === "uchar" ? view.getUint8(offset)
      : type === "short" ? view.getInt16(offset, littleEndian)
        : type === "ushort" ? view.getUint16(offset, littleEndian)
          : type === "int" ? view.getInt32(offset, littleEndian)
            : type === "uint" ? view.getUint32(offset, littleEndian)
              : type === "float" ? view.getFloat32(offset, littleEndian)
                : view.getFloat64(offset, littleEndian);
  return [value, offset + size];
};

const parsePly = (bytes: Uint8Array, tick: () => void): ParsedMesh => {
  const header = parsePlyHeader(bytes);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let hasAllNormals = true;
  const extraProperties = new Set<string>();

  const consume = (elementName: string, values: Record<string, number | number[]>) => {
    if (elementName === "vertex") {
      positions.push(finite(values.x as number, "PLY vertex x"), finite(values.y as number, "PLY vertex y"), finite(values.z as number, "PLY vertex z"));
      if ([values.nx, values.ny, values.nz].every((value) => typeof value === "number" && Number.isFinite(value))) {
        normals.push(values.nx as number, values.ny as number, values.nz as number);
      } else {
        normals.push(0, 0, 0);
        hasAllNormals = false;
      }
      for (const name of Object.keys(values)) if (!["x", "y", "z", "nx", "ny", "nz"].includes(name)) extraProperties.add(name);
    } else if (elementName === "face") {
      const face = (values.vertex_indices ?? values.vertex_index) as number[] | undefined;
      if (!Array.isArray(face) || face.length < 3) throw new Error("PLY face has fewer than three vertex indices.");
      for (let index = 1; index < face.length - 1; index += 1) {
        if (indices.length / 3 >= MAX_MOBILE_MESH_IMPORT_TRIANGLES) throw new Error("PLY exceeds the mobile triangle import limit.");
        indices.push(face[0], face[index], face[index + 1]);
      }
    }
  };

  if (header.format === "ascii") {
    const body = decoder.decode(bytes.subarray(header.headerLength)).trim().split(/\s+/);
    let cursor = 0;
    for (const element of header.elements) {
      for (let row = 0; row < element.count; row += 1) {
        tick();
        const values: Record<string, number | number[]> = {};
        for (const property of element.properties) {
          if ("list" in property) {
            const count = Number(body[cursor++]);
            if (!Number.isSafeInteger(count) || count < 0 || count > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("PLY list count is invalid.");
            const list = body.slice(cursor, cursor + count).map((value) => finite(value, `PLY ${property.name}`));
            if (list.length !== count) throw new Error("ASCII PLY payload is truncated.");
            cursor += count;
            values[property.name] = list;
          } else {
            if (cursor >= body.length) throw new Error("ASCII PLY payload is truncated.");
            values[property.name] = finite(body[cursor++], `PLY ${property.name}`);
          }
        }
        consume(element.name, values);
      }
    }
    if (cursor !== body.length) header.warnings.push("Trailing ASCII PLY values were ignored.");
  } else {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const littleEndian = header.format === "binary_little_endian";
    let offset = header.headerLength;
    for (const element of header.elements) {
      for (let row = 0; row < element.count; row += 1) {
        tick();
        const values: Record<string, number | number[]> = {};
        for (const property of element.properties) {
          if ("list" in property) {
            let count: number;
            [count, offset] = readPlyScalar(view, offset, property.countType, littleEndian);
            if (!Number.isSafeInteger(count) || count < 0 || count > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("Binary PLY list count is invalid.");
            const list: number[] = [];
            for (let index = 0; index < count; index += 1) {
              let value: number;
              [value, offset] = readPlyScalar(view, offset, property.itemType, littleEndian);
              list.push(value);
            }
            values[property.name] = list;
          } else {
            let value: number;
            [value, offset] = readPlyScalar(view, offset, property.type, littleEndian);
            values[property.name] = value;
          }
        }
        consume(element.name, values);
      }
    }
    if (offset !== bytes.length) header.warnings.push("Trailing binary PLY bytes were ignored.");
  }
  if (extraProperties.size > 0) header.warnings.push(`Unsupported PLY attributes were omitted: ${[...extraProperties].sort().join(", ")}.`);
  if (!hasAllNormals) header.warnings.push("Missing PLY normals were generated from triangle geometry.");
  const format: MobileMeshImportFormat = header.format === "ascii" ? "ply-ascii" : header.format === "binary_little_endian" ? "ply-binary-le" : "ply-binary-be";
  return checkedMesh(positions, indices, hasAllNormals ? normals : null, hasAllNormals, format, header.warnings);
};

type GltfRecord = Record<string, unknown>;
type GltfContainer = { document: GltfRecord; binaryChunk: Uint8Array | null; format: "glb" | "gltf" };

const record = (value: unknown, label: string): GltfRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as GltfRecord;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

const decodeGltfContainer = (source: MobileMeshImportSource): GltfContainer => {
  const extension = source.sourceName.split(".").at(-1)?.toLocaleLowerCase();
  if (extension === "gltf") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(source.bytes));
    } catch (error) {
      throw new Error(`Invalid glTF JSON: ${String((error as Error).message ?? error)}`);
    }
    return { document: record(parsed, "glTF document"), binaryChunk: null, format: "gltf" };
  }
  if (extension !== "glb") throw new Error("Expected a GLB or glTF source.");
  if (source.bytes.length < 20) throw new Error("GLB header is truncated.");
  const view = new DataView(source.bytes.buffer, source.bytes.byteOffset, source.bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB magic header is invalid.");
  if (view.getUint32(4, true) !== 2) throw new Error("Only GLB version 2 is supported.");
  if (view.getUint32(8, true) !== source.bytes.length) throw new Error("GLB declared length does not match the selected file.");
  let offset = 12;
  let jsonChunk: Uint8Array | null = null;
  let binaryChunk: Uint8Array | null = null;
  let chunkCount = 0;
  while (offset < source.bytes.length) {
    if (offset + 8 > source.bytes.length) throw new Error("GLB chunk header is truncated.");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 !== 0 || offset + length > source.bytes.length) throw new Error("GLB chunk length is invalid or truncated.");
    const chunk = source.bytes.subarray(offset, offset + length);
    offset += length;
    chunkCount += 1;
    if (chunkCount > 16) throw new Error("GLB contains too many chunks.");
    if (type === 0x4e4f534a) {
      if (jsonChunk) throw new Error("GLB contains more than one JSON chunk.");
      jsonChunk = chunk;
    } else if (type === 0x004e4942) {
      if (binaryChunk) throw new Error("GLB contains more than one BIN chunk.");
      binaryChunk = chunk;
    }
  }
  if (!jsonChunk) throw new Error("GLB JSON chunk is missing.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(jsonChunk).replace(/[\u0000\s]+$/g, ""));
  } catch (error) {
    throw new Error(`Invalid GLB JSON chunk: ${String((error as Error).message ?? error)}`);
  }
  return { document: record(parsed, "GLB document"), binaryChunk, format: "glb" };
};

const isDataUri = (uri: string): boolean => uri.startsWith("data:");
const isRemoteUri = (uri: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(uri) && !isDataUri(uri);

const validateLocalGltfUri = (uri: string): void => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    throw new Error(`glTF dependency URI '${uri}' is not valid percent-encoding.`);
  }
  if (isRemoteUri(uri)) throw new Error(`Remote glTF URI '${uri}' is not allowed.`);
  if (decoded.includes("?") || decoded.includes("#") || decoded.includes("\\") || decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded) || decoded.split("/").some((segment) => segment === "" || segment === "..")) {
    throw new Error(`glTF dependency URI '${uri}' is outside the selected local package.`);
  }
};

export const listMobileGltfDependencies = (source: MobileMeshImportSource): string[] => {
  const { document, format } = decodeGltfContainer(source);
  const uris = new Set<string>();
  for (const collectionName of ["buffers", "images"] as const) {
    const collection = document[collectionName];
    if (collection === undefined) continue;
    for (const entry of array(collection, `glTF ${collectionName}`)) {
      const candidate = record(entry, `glTF ${collectionName} entry`).uri;
      if (candidate === undefined) continue;
      if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`glTF ${collectionName} URI is invalid.`);
      if (isDataUri(candidate)) continue;
      validateLocalGltfUri(candidate);
      if (format === "glb") throw new Error("GLB must be self-contained and cannot reference external files.");
      uris.add(candidate);
      if (uris.size > 128) throw new Error("glTF declares more than 128 managed local dependencies.");
    }
  }
  return [...uris].sort();
};

const decodeDataUri = (uri: string): Uint8Array => {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!match || !match[2]) throw new Error("Only base64 glTF data URIs are supported.");
  let binary: string;
  try {
    binary = decodeBase64String(match[3]);
  } catch {
    throw new Error("glTF data URI contains invalid base64.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
  return bytes;
};

const gltfBuffers = (container: GltfContainer, dependencies: Readonly<Record<string, Uint8Array>>): Uint8Array[] => {
  const definitions = array(container.document.buffers, "glTF buffers");
  let binaryUsed = false;
  let totalBytes = 0;
  return definitions.map((entry, index) => {
    const definition = record(entry, `glTF buffer ${index}`);
    const declaredLength = Number(definition.byteLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) throw new Error(`glTF buffer ${index} byteLength is invalid.`);
    let bytes: Uint8Array;
    if (definition.uri === undefined) {
      if (container.format !== "glb" || !container.binaryChunk || binaryUsed) throw new Error(`glTF buffer ${index} has no resolvable URI or GLB BIN chunk.`);
      bytes = container.binaryChunk;
      binaryUsed = true;
    } else {
      if (typeof definition.uri !== "string") throw new Error(`glTF buffer ${index} URI is invalid.`);
      if (isRemoteUri(definition.uri)) throw new Error(`Remote glTF URI '${definition.uri}' is not allowed.`);
      if (isDataUri(definition.uri)) bytes = decodeDataUri(definition.uri);
      else {
        validateLocalGltfUri(definition.uri);
        const dependency = dependencies[definition.uri];
        if (!dependency) throw new Error(`glTF dependency '${definition.uri}' was not supplied from the selected local package.`);
        bytes = dependency;
      }
    }
    if (bytes.byteLength < declaredLength) throw new Error(`glTF buffer ${index} is truncated.`);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_MOBILE_MESH_IMPORT_BYTES) throw new Error("glTF buffers exceed the 32 MB mobile import limit.");
    return bytes;
  });
};

const GLTF_COMPONENT_BYTES: Record<number, number | undefined> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const GLTF_COMPONENTS: Record<string, number | undefined> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const readGltfComponent = (view: DataView, offset: number, componentType: number): number => {
  if (componentType === 5120) return view.getInt8(offset);
  if (componentType === 5121) return view.getUint8(offset);
  if (componentType === 5122) return view.getInt16(offset, true);
  if (componentType === 5123) return view.getUint16(offset, true);
  if (componentType === 5125) return view.getUint32(offset, true);
  if (componentType === 5126) return view.getFloat32(offset, true);
  throw new Error(`glTF component type ${componentType} is unsupported.`);
};

const gltfAccessorValues = (
  document: GltfRecord,
  buffers: Uint8Array[],
  accessorIndex: number,
  expectedType: "SCALAR" | "VEC3",
  allowedComponentTypes: readonly number[]
): { values: number[]; count: number } => {
  const accessors = array(document.accessors, "glTF accessors");
  const views = array(document.bufferViews, "glTF bufferViews");
  const accessor = record(accessors[accessorIndex], `glTF accessor ${accessorIndex}`);
  if (accessor.sparse !== undefined) throw new Error("Sparse glTF accessors are not supported.");
  if (accessor.type !== expectedType) throw new Error(`glTF accessor ${accessorIndex} must be ${expectedType}.`);
  const componentType = Number(accessor.componentType);
  if (!allowedComponentTypes.includes(componentType)) throw new Error(`glTF accessor ${accessorIndex} component type is unsupported.`);
  const count = Number(accessor.count);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_MOBILE_MESH_IMPORT_VERTICES * 3) throw new Error(`glTF accessor ${accessorIndex} count is invalid.`);
  const viewIndex = Number(accessor.bufferView);
  if (!Number.isSafeInteger(viewIndex) || !views[viewIndex]) throw new Error(`glTF accessor ${accessorIndex} bufferView is missing.`);
  const viewDefinition = record(views[viewIndex], `glTF bufferView ${viewIndex}`);
  if (viewDefinition.extensions !== undefined) throw new Error("Compressed glTF bufferViews are not supported.");
  const bufferIndex = Number(viewDefinition.buffer);
  const buffer = buffers[bufferIndex];
  if (!buffer) throw new Error(`glTF bufferView ${viewIndex} references a missing buffer.`);
  const componentBytes = GLTF_COMPONENT_BYTES[componentType]!;
  const componentCount = GLTF_COMPONENTS[expectedType]!;
  const elementBytes = componentBytes * componentCount;
  const byteStride = viewDefinition.byteStride === undefined ? elementBytes : Number(viewDefinition.byteStride);
  if (!Number.isSafeInteger(byteStride) || byteStride < elementBytes || byteStride > 252) throw new Error(`glTF bufferView ${viewIndex} byteStride is invalid.`);
  const start = Number(viewDefinition.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const viewLength = Number(viewDefinition.byteLength);
  if (![start, viewLength].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error(`glTF bufferView ${viewIndex} byte range is invalid.`);
  const requiredEnd = count === 0 ? start : start + (count - 1) * byteStride + elementBytes;
  const viewEnd = Number(viewDefinition.byteOffset ?? 0) + viewLength;
  if (requiredEnd > buffer.byteLength || requiredEnd > viewEnd) throw new Error(`glTF accessor ${accessorIndex} is truncated.`);
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const values: number[] = [];
  for (let item = 0; item < count; item += 1) {
    const itemOffset = start + item * byteStride;
    for (let component = 0; component < componentCount; component += 1) {
      values.push(readGltfComponent(data, itemOffset + component * componentBytes, componentType));
    }
  }
  return { values, count };
};

type Matrix4 = readonly number[];
const IDENTITY_MATRIX: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiplyMatrices = (a: Matrix4, b: Matrix4): number[] => {
  const output = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) output[column * 4 + row] += a[inner * 4 + row] * b[column * 4 + inner];
    }
  }
  return output;
};

const nodeMatrix = (node: GltfRecord): Matrix4 => {
  if (node.matrix !== undefined) {
    const matrix = array(node.matrix, "glTF node matrix").map((value) => finite(value as number, "glTF node matrix"));
    if (matrix.length !== 16) throw new Error("glTF node matrix must contain 16 values.");
    return matrix;
  }
  const translation = node.translation === undefined ? [0, 0, 0] : array(node.translation, "glTF node translation").map((value) => finite(value as number, "glTF node translation"));
  const rotation = node.rotation === undefined ? [0, 0, 0, 1] : array(node.rotation, "glTF node rotation").map((value) => finite(value as number, "glTF node rotation"));
  const scale = node.scale === undefined ? [1, 1, 1] : array(node.scale, "glTF node scale").map((value) => finite(value as number, "glTF node scale"));
  if (translation.length !== 3 || rotation.length !== 4 || scale.length !== 3) throw new Error("glTF node TRS dimensions are invalid.");
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  return [
    (1 - 2 * y * y - 2 * z * z) * sx, (2 * x * y + 2 * z * w) * sx, (2 * x * z - 2 * y * w) * sx, 0,
    (2 * x * y - 2 * z * w) * sy, (1 - 2 * x * x - 2 * z * z) * sy, (2 * y * z + 2 * x * w) * sy, 0,
    (2 * x * z + 2 * y * w) * sz, (2 * y * z - 2 * x * w) * sz, (1 - 2 * x * x - 2 * y * y) * sz, 0,
    translation[0], translation[1], translation[2], 1,
  ];
};

const transformGltfPoint = (matrix: Matrix4, x: number, y: number, z: number): [number, number, number] => {
  const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  return [worldX === 0 ? 0 : worldX, worldZ === 0 ? 0 : -worldZ, worldY === 0 ? 0 : worldY];
};

const parseGltf = (source: MobileMeshImportSource, tick: () => void): ParsedMesh => {
  const container = decodeGltfContainer(source);
  const document = container.document;
  const asset = record(document.asset, "glTF asset");
  if (typeof asset.version !== "string" || !asset.version.startsWith("2.")) throw new Error("Only glTF 2.x is supported.");
  const extensionsUsed = Array.isArray(document.extensionsUsed) ? document.extensionsUsed.map(String) : [];
  if (extensionsUsed.some((extension) => extension === "KHR_draco_mesh_compression" || extension === "EXT_meshopt_compression")) {
    throw new Error("Draco and meshopt compressed glTF are not supported on mobile.");
  }
  listMobileGltfDependencies(source);
  const buffers = gltfBuffers(container, source.dependencies ?? {});
  const meshes = array(document.meshes, "glTF meshes");
  const nodes = document.nodes === undefined ? [] : array(document.nodes, "glTF nodes");
  const positions: number[] = [];
  const indices: number[] = [];
  const warnings = new Set<string>();
  let sourceHadNormals = true;

  if (document.materials !== undefined || document.textures !== undefined || document.images !== undefined) warnings.add("glTF materials and textures are not retained; the project style is used instead.");
  warnings.add("glTF Y-up coordinates were converted to Math3D Z-up coordinates.");

  const appendMesh = (meshIndex: number, matrix: Matrix4) => {
    const mesh = record(meshes[meshIndex], `glTF mesh ${meshIndex}`);
    for (const [primitiveIndex, primitiveValue] of array(mesh.primitives, `glTF mesh ${meshIndex} primitives`).entries()) {
      tick();
      const primitive = record(primitiveValue, `glTF mesh ${meshIndex} primitive ${primitiveIndex}`);
      if (primitive.extensions !== undefined) throw new Error("Compressed or extended glTF primitives are not supported.");
      if (primitive.targets !== undefined) warnings.add("glTF morph targets were omitted.");
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error("Only glTF TRIANGLES primitives are supported.");
      const attributes = record(primitive.attributes, "glTF primitive attributes");
      const positionAccessor = Number(attributes.POSITION);
      if (!Number.isSafeInteger(positionAccessor)) throw new Error("glTF primitive POSITION accessor is missing.");
      const positionData = gltfAccessorValues(document, buffers, positionAccessor, "VEC3", [5126]);
      if (attributes.NORMAL === undefined) sourceHadNormals = false;
      else gltfAccessorValues(document, buffers, Number(attributes.NORMAL), "VEC3", [5126]);
      const unsupportedAttributes = Object.keys(attributes).filter((name) => !["POSITION", "NORMAL"].includes(name));
      if (unsupportedAttributes.length > 0) warnings.add(`Unsupported glTF attributes were omitted: ${unsupportedAttributes.sort().join(", ")}.`);
      const vertexOffset = positions.length / 3;
      if (vertexOffset + positionData.count > MAX_MOBILE_MESH_IMPORT_VERTICES) throw new Error("glTF exceeds the mobile vertex import limit.");
      for (let offset = 0; offset < positionData.values.length; offset += 3) {
        positions.push(...transformGltfPoint(matrix, positionData.values[offset], positionData.values[offset + 1], positionData.values[offset + 2]));
      }
      const primitiveIndices = primitive.indices === undefined
        ? Array.from({ length: positionData.count }, (_, index) => index)
        : gltfAccessorValues(document, buffers, Number(primitive.indices), "SCALAR", [5121, 5123, 5125]).values;
      if (primitiveIndices.length % 3 !== 0) throw new Error("glTF TRIANGLES index count must be divisible by three.");
      if (indices.length / 3 + primitiveIndices.length / 3 > MAX_MOBILE_MESH_IMPORT_TRIANGLES) throw new Error("glTF exceeds the mobile triangle import limit.");
      for (const index of primitiveIndices) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= positionData.count) throw new Error("glTF contains an out-of-range vertex index.");
        indices.push(vertexOffset + index);
      }
    }
  };

  const visitNode = (nodeIndex: number, parent: Matrix4, ancestors: Set<number>, depth: number) => {
    if (depth > 64) throw new Error("glTF node hierarchy exceeds the recursion limit.");
    if (!Number.isSafeInteger(nodeIndex) || !nodes[nodeIndex]) throw new Error("glTF scene references a missing node.");
    if (ancestors.has(nodeIndex)) throw new Error("glTF node hierarchy contains a cycle.");
    const node = record(nodes[nodeIndex], `glTF node ${nodeIndex}`);
    if (node.skin !== undefined) throw new Error("Skinned glTF meshes are not supported.");
    const nextAncestors = new Set(ancestors).add(nodeIndex);
    const matrix = multiplyMatrices(parent, nodeMatrix(node));
    if (node.mesh !== undefined) appendMesh(Number(node.mesh), matrix);
    if (node.children !== undefined) for (const child of array(node.children, `glTF node ${nodeIndex} children`)) visitNode(Number(child), matrix, nextAncestors, depth + 1);
  };

  if (nodes.length > 0 && document.scenes !== undefined) {
    const scenes = array(document.scenes, "glTF scenes");
    const sceneIndex = Number(document.scene ?? 0);
    const selectedScene = record(scenes[sceneIndex], `glTF scene ${sceneIndex}`);
    for (const root of array(selectedScene.nodes ?? [], `glTF scene ${sceneIndex} nodes`)) visitNode(Number(root), IDENTITY_MATRIX, new Set(), 0);
  } else {
    for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) appendMesh(meshIndex, IDENTITY_MATRIX);
  }
  if (!sourceHadNormals) warnings.add("Missing glTF normals were generated from triangle geometry.");
  else warnings.add("glTF normals were regenerated after scene transforms and axis conversion.");
  return checkedMesh(positions, indices, null, sourceHadNormals, container.format, [...warnings]);
};

export const parseMobileMeshFile = (
  source: MobileMeshImportSource,
  maxProcessingMs = DEFAULT_PARSE_DEADLINE_MS
): ParsedMesh => {
  if (source.bytes.byteLength === 0) throw new Error("The selected mesh file is empty.");
  const dependencyBytes = Object.values(source.dependencies ?? {}).reduce((total, bytes) => total + bytes.byteLength, 0);
  if (source.bytes.byteLength + dependencyBytes > MAX_MOBILE_MESH_IMPORT_BYTES) throw new Error("The selected mesh package exceeds the 32 MB mobile import limit.");
  const extension = source.sourceName.split(".").at(-1)?.toLocaleLowerCase();
  const tick = parseBudget(maxProcessingMs);
  if (extension === "obj") return parseObj(source.bytes, tick);
  if (extension === "ply") return parsePly(source.bytes, tick);
  if (extension === "glb" || extension === "gltf") return parseGltf(source, tick);
  if (extension === "stl") {
    if (source.bytes.length >= 84) {
      const view = new DataView(source.bytes.buffer, source.bytes.byteOffset, source.bytes.byteLength);
      const expected = 84 + view.getUint32(80, true) * 50;
      if (expected === source.bytes.length) return parseBinaryStl(source.bytes, tick);
      const startsWithSolid = new TextDecoder("ascii").decode(source.bytes.subarray(0, 5)).toLocaleLowerCase() === "solid";
      if (!startsWithSolid && expected > source.bytes.length) throw new Error("Binary STL payload is truncated.");
    }
    return parseAsciiStl(source.bytes, tick);
  }
  throw new Error("Unsupported mesh file. Choose OBJ, STL, PLY, GLB, or glTF.");
};

const meshEnvelope = (parsed: ParsedMesh, sourceName: string, objectId: string): SceneObjectEnvelope =>
  createSceneObjectEnvelope({
    producer: { name: "Math3D Mobile", version: "1.5.1", platform: "mobile" },
    object: {
      id: objectId,
      kind: "mesh",
      definition: { id: objectId, kind: "mesh", source: "math3d-object:embedded" },
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      visible: true,
      style: { color: "#5b8def", opacity: 1 },
    },
    geometry: {
      kind: "embedded-mesh",
      positions: Array.from(parsed.mesh.positions),
      indices: Array.from(parsed.mesh.indices),
      normals: parsed.mesh.normals ? Array.from(parsed.mesh.normals) : undefined,
    },
    provenance: { sourceFormat: parsed.format, sourceProjectId: null, sourceObjectId: objectId, importedAt: null },
    analysisMetadata: {
      sourceFileName: sourceName.slice(0, 240),
      sourceHadNormals: parsed.sourceHadNormals,
      normalsGenerated: parsed.normalsGenerated,
    },
  });

export const prepareMobileMeshImport = (
  source: MobileMeshImportSource | null,
  destinationScene: SceneDocument,
  quality: MobileRenderQuality,
  maxProcessingMs = DEFAULT_PARSE_DEADLINE_MS
): MobileMeshImportPreparation => {
  if (source === null) return { status: "cancelled" };
  try {
    const parsed = parseMobileMeshFile(source, maxProcessingMs);
    const admitted = admitMobileMeshForRendering(parsed.mesh, quality, false);
    if (!admitted.mesh) return { status: "error", error: admitted.admission.reason };
    const preferredId = safeStem(source.sourceName);
    const destinationObjectId = createUniqueMobileSceneObjectId(destinationScene, preferredId);
    const envelope = meshEnvelope(parsed, source.sourceName, preferredId);
    const transferPreview: MobileSceneObjectImportPreview = {
      envelope,
      sourceName: source.sourceName.slice(0, 240),
      sourceVersion: envelope.version,
      migrated: false,
      destinationObjectId,
      hasIdentityCollision: destinationObjectId !== preferredId,
      definitionSummary: `${parsed.format.toUpperCase()} mesh · ${parsed.mesh.vertexCount.toLocaleString()} vertices · ${parsed.mesh.triCount.toLocaleString()} triangles`,
      analysisMetadataKeys: Object.keys(envelope.analysisMetadata).sort(),
    };
    return {
      status: "ready",
      preview: {
        transferPreview,
        format: parsed.format,
        mesh: admitted.mesh,
        sourceVertexCount: parsed.mesh.vertexCount,
        sourceTriangleCount: parsed.mesh.triCount,
        sourceHadNormals: parsed.sourceHadNormals,
        normalsGenerated: parsed.normalsGenerated,
        axisAssumption: parsed.format === "glb" || parsed.format === "gltf"
          ? "glTF Y-up coordinates are converted to Math3D Z-up coordinates."
          : "Source coordinates are treated as Math3D Z-up coordinates.",
        unitAssumption: parsed.format === "glb" || parsed.format === "gltf"
          ? "glTF meter units are preserved as scene units."
          : "Source units are preserved as unitless scene units.",
        warnings: parsed.warnings,
        admission: admitted.admission,
      },
    };
  } catch (error) {
    return { status: "error", error: String((error as Error).message ?? error) };
  }
};
