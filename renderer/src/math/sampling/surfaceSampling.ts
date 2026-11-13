import * as THREE from "three";

export type SurfaceSample = {
  id: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv?: { u: number; v: number };
  vertexIndex?: number;
  meshKey?: string;
  meta?: { surfaceKind?: "graph" | "implicit" | "param" | "weierstrass" };
};

export type SurfaceSampleSet = {
  samples: SurfaceSample[];
  bbox?: THREE.Box3;
  center?: THREE.Vector3;
  meshData?: { key: string; positions: Float32Array; indices: ArrayLike<number> | null }[];
  curvatures?: {
    K: Float32Array;
    H: Float32Array;
    k1: Float32Array;
    k2: Float32Array;
  };
};

/** A closed viewer must not leave its large transient sample graph in old App render closures. */
export function releaseSurfaceSampleSet(set: SurfaceSampleSet): void {
  set.samples.length = 0;
  if (set.meshData) set.meshData.length = 0;
  delete set.meshData;
  delete set.curvatures;
  delete set.bbox;
  delete set.center;
}

/** Reuse an unchanged viewer sample set across Project returns without retaining another point graph. */
export function sameSurfaceSampleSet(left: SurfaceSampleSet, right: SurfaceSampleSet): boolean {
  const sameArray = (a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) if (!Object.is(a[index], b[index])) return false;
    return true;
  };
  const sameVector = (a: THREE.Vector3 | undefined, b: THREE.Vector3 | undefined) =>
    a === b || !!a && !!b && Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);
  if (left.samples.length !== right.samples.length ||
      !sameVector(left.center, right.center) ||
      !sameVector(left.bbox?.min, right.bbox?.min) ||
      !sameVector(left.bbox?.max, right.bbox?.max)) return false;
  for (let index = 0; index < left.samples.length; index++) {
    const a = left.samples[index]!, b = right.samples[index]!;
    if (a.id !== b.id || a.meshKey !== b.meshKey || a.vertexIndex !== b.vertexIndex ||
        a.meta?.surfaceKind !== b.meta?.surfaceKind || !sameVector(a.position, b.position) ||
        !sameVector(a.normal, b.normal) || !Object.is(a.uv?.u, b.uv?.u) ||
        !Object.is(a.uv?.v, b.uv?.v)) return false;
  }
  const leftMeshes = left.meshData ?? [], rightMeshes = right.meshData ?? [];
  if (leftMeshes.length !== rightMeshes.length) return false;
  for (let index = 0; index < leftMeshes.length; index++) {
    const a = leftMeshes[index]!, b = rightMeshes[index]!;
    if (a.key !== b.key || !sameArray(a.positions, b.positions) ||
        !sameArray(a.indices, b.indices)) return false;
  }
  for (const kind of ["K", "H", "k1", "k2"] as const)
    if (!sameArray(left.curvatures?.[kind], right.curvatures?.[kind])) return false;
  return true;
}

export type SurfaceSampleBuildOptions = {
  geometry: THREE.BufferGeometry;
  worldMatrix: THREE.Matrix4;
  maxSamples: number;
  includeUV: boolean;
  startId?: number;
  meshKey?: string;
};

export function getNonIndexedDrawCount(
  geometry: THREE.BufferGeometry,
  posAttr: THREE.BufferAttribute
): number | null {
  if (geometry.getIndex()) return null;
  const drawRange = geometry.drawRange;
  if (!drawRange || drawRange.start !== 0) return null;
  const count = Math.floor(drawRange.count);
  if (!Number.isFinite(count)) return null;
  if (count <= 0) return 0;
  if (count >= posAttr.count) return null;
  return count - (count % 3);
}

export function buildSurfaceSampleSetFromViewer(opts: SurfaceSampleBuildOptions): SurfaceSampleSet {
  const { geometry, worldMatrix, maxSamples, includeUV, startId = 0, meshKey } = opts;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
  const normAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | null;
  if (!posAttr || !normAttr) {
    return { samples: [] };
  }

  const uvAttr = includeUV ? (geometry.getAttribute("uv") as THREE.BufferAttribute | null) : null;
  const drawCount = getNonIndexedDrawCount(geometry, posAttr);
  const count = drawCount ?? posAttr.count;
  if (!count) return { samples: [] };

  const safeMax = Number.isFinite(maxSamples) && maxSamples > 0 ? Math.floor(maxSamples) : count;
  const limit = Math.max(1, Math.min(count, safeMax));
  const step = count > limit ? Math.ceil(count / limit) : 1;

  const samples: SurfaceSample[] = [];
  const tmpPosition = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

  for (let i = 0; i < count && samples.length < limit; i += step) {
    tmpPosition.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    tmpPosition.applyMatrix4(worldMatrix);

    tmpNormal.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
    tmpNormal.applyMatrix3(normalMatrix).normalize();
    if (!Number.isFinite(tmpNormal.x) || !Number.isFinite(tmpNormal.y) || !Number.isFinite(tmpNormal.z)) {
      continue;
    }

    const position = tmpPosition.clone();
    const normal = tmpNormal.clone();
    const sample: SurfaceSample = {
      id: startId + samples.length,
      position,
      normal,
    };

    if (uvAttr) {
      sample.uv = { u: uvAttr.getX(i), v: uvAttr.getY(i) };
    }
    if (typeof meshKey === "string") {
      sample.meshKey = meshKey;
      sample.vertexIndex = i;
    }

    samples.push(sample);
  }

  if (!samples.length) return { samples };

  const bbox = new THREE.Box3().setFromPoints(samples.map((s) => s.position));
  const center = bbox.getCenter(new THREE.Vector3());
  return { samples, bbox, center };
}
