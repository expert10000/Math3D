import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type SurfaceMeshSource = "generated" | "imported" | "surface";

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

type GeometryOpts = { mergeVertices: boolean };

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

const normalizeGeometry = (geom: THREE.BufferGeometry, opts: GeometryOpts): THREE.BufferGeometry => {
  let g = geom;
  if (opts.mergeVertices) {
    if (g.index) {
      g = g.toNonIndexed();
    }
    g = stripToPositions(g);
    g = mergeVertices(g);
  } else {
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
  }
  if (!g.getAttribute("normal")) {
    g.computeVertexNormals();
  }
  return g;
};

export function buildSurfaceMeshFromGeometry(
  geometry: THREE.BufferGeometry,
  label: string,
  source: SurfaceMeshSource,
  opts: GeometryOpts = { mergeVertices: false }
): SurfaceMeshData {
  const geom = normalizeGeometry(geometry, opts);
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
  const geometries: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh?.isMesh || !mesh.geometry) return;
    const geom = (mesh.geometry as THREE.BufferGeometry).clone();
    geom.applyMatrix4(mesh.matrixWorld);
    const base = geom.index ? geom.toNonIndexed() : geom;
    geometries.push(stripToPositions(base));
  });
  if (!geometries.length) {
    throw new Error("No mesh geometry found in file.");
  }
  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    throw new Error("Failed to merge mesh geometry.");
  }
  return merged;
};

export async function loadSurfaceMeshFromFile(
  files: FileLikeList,
  opts: GeometryOpts = { mergeVertices: true }
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
  const buffer = await file.arrayBuffer();

  if (ext === "stl") {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    return buildSurfaceMeshFromGeometry(geometry, name, "imported", opts);
  }

  if (ext === "ply") {
    const loader = new PLYLoader();
    const geometry = loader.parse(buffer);
    return buildSurfaceMeshFromGeometry(geometry, name, "imported", opts);
  }

  if (ext === "obj") {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    const merged = mergeObjectGeometries(obj);
    return buildSurfaceMeshFromGeometry(merged, name, "imported", opts);
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
      gltf = await new Promise<GLTF>((resolve, reject) => {
        if (ext === "gltf") {
          const text = new TextDecoder().decode(buffer);
          loader.parse(text, resourcePath, resolve, reject);
        } else {
          loader.parse(buffer, resourcePath, resolve, reject);
        }
      });
    } finally {
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url);
      }
    }
    const merged = mergeObjectGeometries(gltf.scene);
    return buildSurfaceMeshFromGeometry(merged, name, "imported", opts);
  }

  throw new Error("Unsupported file format. Use STL, OBJ, PLY, or GLTF/GLB.");
}
