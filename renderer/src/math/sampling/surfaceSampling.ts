import * as THREE from "three";

export type SurfaceSample = {
  id: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv?: { u: number; v: number };
  meta?: { surfaceKind?: "graph" | "implicit" | "param" | "weierstrass" };
};

export type SurfaceSampleSet = {
  samples: SurfaceSample[];
  bbox?: THREE.Box3;
  center?: THREE.Vector3;
};

export type SurfaceSampleBuildOptions = {
  geometry: THREE.BufferGeometry;
  worldMatrix: THREE.Matrix4;
  maxSamples: number;
  includeUV: boolean;
  startId?: number;
};

export function buildSurfaceSampleSetFromViewer(opts: SurfaceSampleBuildOptions): SurfaceSampleSet {
  const { geometry, worldMatrix, maxSamples, includeUV, startId = 0 } = opts;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
  const normAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | null;
  if (!posAttr || !normAttr) {
    return { samples: [] };
  }

  const uvAttr = includeUV ? (geometry.getAttribute("uv") as THREE.BufferAttribute | null) : null;
  const count = posAttr.count;
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

    samples.push(sample);
  }

  if (!samples.length) return { samples };

  const bbox = new THREE.Box3().setFromPoints(samples.map((s) => s.position));
  const center = bbox.getCenter(new THREE.Vector3());
  return { samples, bbox, center };
}
