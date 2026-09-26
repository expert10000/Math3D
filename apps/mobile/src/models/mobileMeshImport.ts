import {
  createSceneObjectEnvelope,
  type SceneDocument,
  type SceneObjectEnvelope,
} from "@math3d/core";
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
  | "ply-binary-be";

export type MobileMeshImportSource = Readonly<{
  sourceName: string;
  bytes: Uint8Array;
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
  const withoutExtension = sourceName.replace(/\.(?:obj|stl|ply)$/i, "");
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

export const parseMobileMeshFile = (
  source: MobileMeshImportSource,
  maxProcessingMs = DEFAULT_PARSE_DEADLINE_MS
): ParsedMesh => {
  if (source.bytes.byteLength === 0) throw new Error("The selected mesh file is empty.");
  if (source.bytes.byteLength > MAX_MOBILE_MESH_IMPORT_BYTES) throw new Error("The selected mesh exceeds the 32 MB mobile import limit.");
  const extension = source.sourceName.split(".").at(-1)?.toLocaleLowerCase();
  const tick = parseBudget(maxProcessingMs);
  if (extension === "obj") return parseObj(source.bytes, tick);
  if (extension === "ply") return parsePly(source.bytes, tick);
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
  throw new Error("Unsupported mesh file. Choose OBJ, STL, or PLY.");
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
        axisAssumption: "Source coordinates are treated as Math3D Z-up coordinates.",
        unitAssumption: "Source units are preserved as unitless scene units.",
        warnings: parsed.warnings,
        admission: admitted.admission,
      },
    };
  } catch (error) {
    return { status: "error", error: String((error as Error).message ?? error) };
  }
};
