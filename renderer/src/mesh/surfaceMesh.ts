import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type MeshImportFormat = "stl" | "obj" | "ply" | "gltf" | "glb";

export type SurfaceMeshSource =
  | { kind: "import"; format?: MeshImportFormat; filename?: string }
  | { kind: "bakedFromImplicit" }
  | { kind: "bakedFromExplicit" }
  | { kind: "bakedFromParam" }
  | { kind: "bakedFromWeierstrass" }
  | { kind: "detachedMesh"; fromKind?: string; fromLabel?: string }
  | {
      kind: "geometryObject";
      objectId?: string;
      objectName?: string;
      params?: Record<string, number | boolean | string>;
      transform?: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        scale: { x: number; y: number; z: number };
      };
      material?: { color?: number; opacity?: number };
      objects?: Array<{
        objectId?: string;
        objectName?: string;
        params?: Record<string, number | boolean | string>;
        transform?: {
          position: { x: number; y: number; z: number };
          rotation: { x: number; y: number; z: number };
          scale: { x: number; y: number; z: number };
        };
        material?: { color?: number; opacity?: number };
      }>;
    }
  | { kind: "polyhedronPreset"; id?: string; label?: string }
  | { kind: "halfspaceIntersection" }
  | { kind: "convexHull" }
  | { kind: "csg" }
  | { kind: "proceduralObjects" };

export const formatSurfaceMeshSource = (source: SurfaceMeshSource | string): string => {
  if (typeof source === "string") return source;
  switch (source.kind) {
    case "import": {
      const fmt = source.format ? source.format.toUpperCase() : null;
      return fmt ? `import (${fmt})` : "import";
    }
    case "bakedFromImplicit":
      return "baked from implicit";
    case "bakedFromExplicit":
      return "baked from explicit";
    case "bakedFromParam":
      return "baked from param";
    case "bakedFromWeierstrass":
      return "baked from weierstrass";
    case "detachedMesh":
      return source.fromLabel ? `mesh (detached from ${source.fromLabel})` : "mesh (detached)";
    case "geometryObject": {
      if (source.objectName) return `geometry object: ${source.objectName}`;
      if (source.objects?.length) return `geometry objects (${source.objects.length})`;
      return "geometry object";
    }
    case "polyhedronPreset": {
      const label = source.label ?? source.id;
      return label ? `preset: ${label}` : "preset";
    }
    case "halfspaceIntersection":
      return "halfspace intersection";
    case "convexHull":
      return "convex hull";
    case "csg":
      return "CSG";
    case "proceduralObjects":
      return "procedural objects";
    default:
      return "mesh";
  }
};

export type MeshValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    vertexCount: number;
    faceCount: number;
    degenerateFaces: number;
    outOfRangeIndices: number;
    nanPositions: number;
    nanNormals: number;
    nanUvs: number;
  };
};

export type SurfaceMeshData = {
  label: string;
  positions: Float32Array;
  indices: Uint32Array | null;
  normals?: Float32Array | null;
  uvs?: Float32Array | null;
  source: SurfaceMeshSource;
  adjacency?: number[][] | null;
  meanEdgeLength?: number | null;
  validation?: MeshValidation | null;
};

export type SurfaceMeshPreset = {
  id: string;
  label: string;
  build: () => THREE.BufferGeometry;
};

type GeometryOpts = { mergeVertices: boolean; mergeTolerance?: number };
export type SurfaceMeshImportStage =
  | "fileRead"
  | "parse"
  | "fastObjParse"
  | "objLoaderFallback"
  | "normalize"
  | "vertexWeld"
  | "normalCompute"
  | "meshExtract";
export type SurfaceMeshImportTelemetry = {
  readonly stage: SurfaceMeshImportStage;
  readonly ms: number;
};
type SurfaceMeshImportTimingSink = (entry: SurfaceMeshImportTelemetry) => void;
type SurfaceMeshImportOptions = GeometryOpts & {
  onStage?: SurfaceMeshImportTimingSink;
};

type FileLikeList = File[] | FileList;

const toFloat32 = (arr: ArrayLike<number>) =>
  arr instanceof Float32Array ? arr.slice() : Float32Array.from(arr);

const toUint32 = (arr: ArrayLike<number>) => Uint32Array.from(arr);

const stripToPositions = (geom: THREE.BufferGeometry): THREE.BufferGeometry => {
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  const out = new THREE.BufferGeometry();
  if (posAttr) {
    out.setAttribute("position", posAttr.clone());
  }
  return out;
};

const stripToMergeableSurfaceMeshAttributes = (
  geom: THREE.BufferGeometry,
  options: { normals: boolean; uvs: boolean }
): THREE.BufferGeometry => {
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  const out = new THREE.BufferGeometry();
  if (!posAttr) return out;
  out.setAttribute("position", posAttr.clone());
  if (options.normals) {
    const normalAttr = geom.getAttribute("normal") as THREE.BufferAttribute | null;
    if (normalAttr && normalAttr.count === posAttr.count) {
      out.setAttribute("normal", normalAttr.clone());
    }
  }
  if (options.uvs) {
    const uvAttr = geom.getAttribute("uv") as THREE.BufferAttribute | null;
    if (uvAttr && uvAttr.count === posAttr.count) {
      out.setAttribute("uv", uvAttr.clone());
    }
  }
  return out;
};

const weldGeometryPositions = (geom: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry => {
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!posAttr) return stripToPositions(geom);
  const scale = 1 / Math.max(1e-12, tolerance);
  const source = posAttr.array as ArrayLike<number>;
  const itemSize = Math.max(3, posAttr.itemSize || 3);
  const weldedPositions = new Float32Array(posAttr.count * 3);
  const indices = new Uint32Array(posAttr.count);
  const indexByKey = new Map<string, number>();
  let weldedCount = 0;

  for (let i = 0; i < posAttr.count; i += 1) {
    const base = i * itemSize;
    const x = Number(source[base] ?? 0);
    const y = Number(source[base + 1] ?? 0);
    const z = Number(source[base + 2] ?? 0);
    const key = `${Math.round(x * scale)},${Math.round(y * scale)},${Math.round(z * scale)}`;
    const existing = indexByKey.get(key);
    if (existing != null) {
      indices[i] = existing;
      continue;
    }
    const nextIndex = weldedCount;
    indexByKey.set(key, nextIndex);
    const outBase = weldedCount * 3;
    weldedPositions[outBase] = x;
    weldedPositions[outBase + 1] = y;
    weldedPositions[outBase + 2] = z;
    indices[i] = nextIndex;
    weldedCount += 1;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(weldedPositions.slice(0, weldedCount * 3), 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
};

const getFileBaseUrl = (file: File): string | null => {
  const filePath = (file as File & { path?: string }).path;
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const dir = normalized.slice(0, lastSlash + 1);
  if (dir.startsWith("//")) {
    return `file:${dir}`;
  }
  if (dir.startsWith("/")) {
    return `file://${dir}`;
  }
  return `file:///${dir}`;
};

const toFileList = (files: FileLikeList | null | undefined): File[] =>
  files ? Array.from(files as FileLikeList) : [];

const normalizeResourceKey = (url: string) => {
  const clean = url.split("?")[0].split("#")[0];
  return clean.replace(/^(\.?\/)+/, "");
};

const parseBinaryStlGeometryIfExact = (buffer: ArrayBuffer): THREE.BufferGeometry | null => {
  if (buffer.byteLength < 84) return null;
  const reader = new DataView(buffer);
  const faces = reader.getUint32(80, true);
  const expectedBytes = 84 + faces * 50;
  if (expectedBytes !== buffer.byteLength || faces <= 0) return null;

  const positions = new Float32Array(faces * 9);
  const normals = new Float32Array(faces * 9);
  let out = 0;
  let offset = 84;
  for (let face = 0; face < faces; face += 1) {
    const nx = reader.getFloat32(offset, true);
    const ny = reader.getFloat32(offset + 4, true);
    const nz = reader.getFloat32(offset + 8, true);
    offset += 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      positions[out] = reader.getFloat32(offset, true);
      positions[out + 1] = reader.getFloat32(offset + 4, true);
      positions[out + 2] = reader.getFloat32(offset + 8, true);
      normals[out] = nx;
      normals[out + 1] = ny;
      normals[out + 2] = nz;
      out += 3;
      offset += 12;
    }
    offset += 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
};

const parseObjIndex = (raw: string, vertexCount: number): number | null => {
  if (raw.trim().startsWith("-")) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  const index = parsed < 0 ? vertexCount + parsed : parsed - 1;
  return index >= 0 && index < vertexCount ? index : null;
};

const parseSimpleObjSurfaceMesh = (text: string, label: string, source: SurfaceMeshSource): SurfaceMeshData | null => {
  const positions: number[] = [];
  const indices: number[] = [];
  let sawFace = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const commentAt = rawLine.indexOf("#");
    const line = (commentAt >= 0 ? rawLine.slice(0, commentAt) : rawLine).trim();
    if (!line) continue;
    const recordType = line.split(/\s+/, 1)[0] ?? "";

    if (recordType === "v") {
      const parts = line.split(/\s+/);
      if (parts.length < 4) return null;
      const x = Number.parseFloat(parts[1] ?? "");
      const y = Number.parseFloat(parts[2] ?? "");
      const z = Number.parseFloat(parts[3] ?? "");
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      positions.push(x, y, z);
      continue;
    }

    if (recordType === "f") {
      sawFace = true;
      const vertexCount = Math.floor(positions.length / 3);
      const tokens = line.split(/\s+/).slice(1);
      if (tokens.length < 3) return null;
      const face: number[] = [];
      for (const token of tokens) {
        if (!token || token.includes("/")) return null;
        const index = parseObjIndex(token, vertexCount);
        if (index == null) return null;
        face.push(index);
      }
      for (let i = 1; i + 1 < face.length; i += 1) {
        indices.push(face[0] as number, face[i] as number, face[i + 1] as number);
      }
      continue;
    }

    if (recordType === "vt" || recordType === "vn") {
      return null;
    }

    return null;
  }

  if (!sawFace || positions.length < 9 || indices.length < 3) return null;

  return {
    label,
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    normals: null,
    uvs: null,
    source,
  };
};

const createUrlModifier = (files: File[], urlCache: Map<string, string>) => {
  if (!files.length) return null;
  const fileMap = new Map<string, File>();
  for (const f of files) {
    if (f.webkitRelativePath) {
      fileMap.set(f.webkitRelativePath.replace(/\\/g, "/"), f);
    }
    fileMap.set(f.name, f);
  }
  return (url: string) => {
    const key = normalizeResourceKey(url);
    const byPath = fileMap.get(key);
    const byName = byPath ?? fileMap.get(key.split(/[\\/]/).pop() ?? key);
    if (!byName) return url;
    const existing = urlCache.get(byName.name);
    if (existing) return existing;
    const blobUrl = URL.createObjectURL(byName);
    urlCache.set(byName.name, blobUrl);
    return blobUrl;
  };
};

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const recordStage = (opts: SurfaceMeshImportOptions, stage: SurfaceMeshImportStage, startAt: number) => {
  opts.onStage?.({ stage, ms: Math.max(0, nowMs() - startAt) });
};

const normalizeGeometry = (geom: THREE.BufferGeometry, opts: SurfaceMeshImportOptions): THREE.BufferGeometry => {
  let g = geom;
  if (opts.mergeVertices) {
    const normalizeStart = nowMs();
    if (g.index) {
      g = g.toNonIndexed();
    }
    g = stripToPositions(g);
    recordStage(opts, "normalize", normalizeStart);
    const weldStart = nowMs();
    g = weldGeometryPositions(g, opts.mergeTolerance ?? 1e-4);
    recordStage(opts, "vertexWeld", weldStart);
  } else {
    const normalizeStart = nowMs();
    const posAttr = g.getAttribute("position") as THREE.BufferAttribute | null;
    const normalAttr = g.getAttribute("normal") as THREE.BufferAttribute | null;
    const uvAttr = g.getAttribute("uv") as THREE.BufferAttribute | null;
    const out = new THREE.BufferGeometry();
    if (posAttr) {
      out.setAttribute("position", posAttr.clone());
    }
    if (normalAttr) {
      out.setAttribute("normal", normalAttr.clone());
    }
    if (uvAttr) {
      out.setAttribute("uv", uvAttr.clone());
    }
    if (g.index) {
      out.setIndex((g.index as THREE.BufferAttribute).clone());
    }
    g = out;
    recordStage(opts, "normalize", normalizeStart);
  }
  if (!g.getAttribute("normal")) {
    const normalStart = nowMs();
    g.computeVertexNormals();
    recordStage(opts, "normalCompute", normalStart);
  }
  return g;
};

export function surfaceMeshToGeometry(mesh: SurfaceMeshData): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions = mesh.positions instanceof Float32Array ? mesh.positions : Float32Array.from(mesh.positions);
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  if (mesh.indices && mesh.indices.length >= 3) {
    const indices = mesh.indices instanceof Uint32Array ? mesh.indices : Uint32Array.from(mesh.indices);
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  if (mesh.normals && mesh.normals.length >= positions.length) {
    const normals = mesh.normals instanceof Float32Array ? mesh.normals : Float32Array.from(mesh.normals);
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }

  if (mesh.uvs && mesh.uvs.length >= 2) {
    const uvs = mesh.uvs instanceof Float32Array ? mesh.uvs : Float32Array.from(mesh.uvs);
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  }

  return geom;
}

const surfaceMeshFromGeometry = (
  geom: THREE.BufferGeometry,
  label: string,
  source: SurfaceMeshSource
): SurfaceMeshData => {
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!posAttr) {
    throw new Error("Surface mesh missing position attribute.");
  }
  const indexAttr = geom.getIndex();
  const normalAttr = geom.getAttribute("normal") as THREE.BufferAttribute | null;
  const uvAttr = geom.getAttribute("uv") as THREE.BufferAttribute | null;

  return {
    label,
    positions: toFloat32(posAttr.array as ArrayLike<number>),
    indices: indexAttr ? toUint32(indexAttr.array as ArrayLike<number>) : null,
    normals: normalAttr ? toFloat32(normalAttr.array as ArrayLike<number>) : null,
    uvs: uvAttr ? toFloat32(uvAttr.array as ArrayLike<number>) : null,
    source,
  };
};

export function buildSurfaceMeshFromGeometry(
  geometry: THREE.BufferGeometry,
  label: string,
  source: SurfaceMeshSource,
  opts: SurfaceMeshImportOptions = { mergeVertices: false }
): SurfaceMeshData {
  const geom = normalizeGeometry(geometry, opts);
  const extractStart = nowMs();
  const mesh = surfaceMeshFromGeometry(geom, label, source);
  recordStage(opts, "meshExtract", extractStart);
  return mesh;
}

export function weldSurfaceMeshVertices(
  mesh: SurfaceMeshData,
  tolerance = 1e-4,
  labelOverride?: string
): SurfaceMeshData {
  const geometry = surfaceMeshToGeometry(mesh);
  const merged = mergeVertices(geometry, tolerance);
  if (!merged.getAttribute("normal")) {
    merged.computeVertexNormals();
  }
  return surfaceMeshFromGeometry(merged, labelOverride ?? mesh.label, mesh.source);
}

export function mergeMeshData(meshes: { positions: ArrayLike<number>; indices: ArrayLike<number> | null }[]) {
  const totalVerts = meshes.reduce((acc, mesh) => acc + Math.floor(mesh.positions.length / 3), 0);
  if (!totalVerts) {
    return { positions: new Float32Array(), indices: new Uint32Array() };
  }
  const positions = new Float32Array(totalVerts * 3);
  const indices: number[] = [];
  let vertexOffset = 0;
  let positionOffset = 0;

  for (const mesh of meshes) {
    const vertCount = Math.floor(mesh.positions.length / 3);
    if (!vertCount) continue;
    const len = vertCount * 3;
    if (mesh.positions instanceof Float32Array) {
      positions.set(mesh.positions.subarray(0, len), positionOffset);
    } else {
      positions.set(Array.from(mesh.positions).slice(0, len), positionOffset);
    }

    if (mesh.indices && mesh.indices.length >= 3) {
      for (let i = 0; i < mesh.indices.length; i++) {
        indices.push(vertexOffset + (mesh.indices[i] as number));
      }
    } else {
      for (let i = 0; i < vertCount; i++) {
        indices.push(vertexOffset + i);
      }
    }

    vertexOffset += vertCount;
    positionOffset += vertCount * 3;
  }

  return { positions, indices: Uint32Array.from(indices) };
}

const mergeObjectGeometries = (root: THREE.Object3D): THREE.BufferGeometry => {
  const sourceGeometries: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh?.isMesh || !mesh.geometry) return;
    const geom = (mesh.geometry as THREE.BufferGeometry).clone();
    geom.applyMatrix4(mesh.matrixWorld);
    const base = geom.index ? geom.toNonIndexed() : geom;
    sourceGeometries.push(base);
  });
  if (!sourceGeometries.length) {
    throw new Error("No mesh geometry found in file.");
  }
  const canPreserveNormals = sourceGeometries.every((geom) => {
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
    const normalAttr = geom.getAttribute("normal") as THREE.BufferAttribute | null;
    return !!posAttr && !!normalAttr && normalAttr.count === posAttr.count;
  });
  const canPreserveUvs = sourceGeometries.every((geom) => {
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
    const uvAttr = geom.getAttribute("uv") as THREE.BufferAttribute | null;
    return !!posAttr && !!uvAttr && uvAttr.count === posAttr.count;
  });
  const geometries = sourceGeometries.map((geom) =>
    stripToMergeableSurfaceMeshAttributes(geom, { normals: canPreserveNormals, uvs: canPreserveUvs })
  );
  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    throw new Error("Failed to merge mesh geometry.");
  }
  return merged;
};

export async function loadSurfaceMeshFromFile(
  files: FileLikeList,
  opts: SurfaceMeshImportOptions = { mergeVertices: true }
): Promise<SurfaceMeshData> {
  const fileList = toFileList(files);
  const file =
    fileList.find((item) => {
      const ext = item.name.split(".").pop()?.toLowerCase();
      return ext === "stl" || ext === "obj" || ext === "ply" || ext === "gltf" || ext === "glb";
    }) ?? null;
  if (!file) {
    throw new Error("No mesh file selected.");
  }
  const name = file.name || "mesh";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const readStart = nowMs();
  const buffer = await file.arrayBuffer();
  recordStage(opts, "fileRead", readStart);
  const importSource: SurfaceMeshSource = {
    kind: "import",
    format: ext as MeshImportFormat,
    filename: name,
  };

  if (ext === "stl") {
    const parseStart = nowMs();
    const geometry = parseBinaryStlGeometryIfExact(buffer) ?? new STLLoader().parse(buffer);
    recordStage(opts, "parse", parseStart);
    return buildSurfaceMeshFromGeometry(geometry, name, importSource, opts);
  }

  if (ext === "ply") {
    const loader = new PLYLoader();
    const parseStart = nowMs();
    const geometry = loader.parse(buffer);
    recordStage(opts, "parse", parseStart);
    return buildSurfaceMeshFromGeometry(geometry, name, importSource, opts);
  }

  if (ext === "obj") {
    const parseStart = nowMs();
    const text = new TextDecoder().decode(buffer);
    const simpleMesh = parseSimpleObjSurfaceMesh(text, name, importSource);
    if (simpleMesh) {
      recordStage(opts, "parse", parseStart);
      recordStage(opts, "fastObjParse", parseStart);
      if (!opts.mergeVertices) {
        const normalizeStart = nowMs();
        recordStage(opts, "normalize", normalizeStart);
        const extractStart = nowMs();
        recordStage(opts, "meshExtract", extractStart);
        return simpleMesh;
      }
      return buildSurfaceMeshFromGeometry(surfaceMeshToGeometry(simpleMesh), name, importSource, opts);
    }
    const fallbackStart = nowMs();
    recordStage(opts, "objLoaderFallback", fallbackStart);
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    const merged = mergeObjectGeometries(obj);
    recordStage(opts, "parse", parseStart);
    return buildSurfaceMeshFromGeometry(merged, name, importSource, opts);
  }

  if (ext === "glb" || ext === "gltf") {
    const urlCache = new Map<string, string>();
    const resourcePath = getFileBaseUrl(file) ?? "";
    const manager = new THREE.LoadingManager();
    const modifier = createUrlModifier(fileList, urlCache);
    if (modifier) {
      manager.setURLModifier(modifier);
    }
    const loader = new GLTFLoader(manager);
    let gltf: GLTF;
    try {
      const parseStart = nowMs();
      gltf = await new Promise<GLTF>((resolve, reject) => {
        if (ext === "gltf") {
          const text = new TextDecoder().decode(buffer);
          loader.parse(text, resourcePath, resolve, reject);
        } else {
          loader.parse(buffer, resourcePath, resolve, reject);
        }
      });
      recordStage(opts, "parse", parseStart);
    } finally {
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url);
      }
    }
    const merged = mergeObjectGeometries(gltf.scene);
    return buildSurfaceMeshFromGeometry(merged, name, importSource, opts);
  }

  throw new Error("Unsupported file format. Use STL, OBJ, PLY, or GLTF/GLB.");
}
