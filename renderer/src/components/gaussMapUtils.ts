import * as THREE from "three";

export type GaussPoint = {
  id: number;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
};

export type GaussColorMode = "components" | "palette";

export function collectGaussPoints(root: THREE.Object3D | null, maxPoints = 600): GaussPoint[] {
  if (!root || maxPoints <= 0) return [];

  const points: GaussPoint[] = [];
  root.updateMatrixWorld(true);
  let counter = 0;

  const tempPos = new THREE.Vector3();
  const tempNorm = new THREE.Vector3();

  root.traverse((obj) => {
    if (points.length >= maxPoints) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const geom = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
    const normAttr = geom.getAttribute("normal") as THREE.BufferAttribute | null;
    if (!posAttr || !normAttr) return;

    const count = posAttr.count;
    const step = Math.max(1, Math.floor(count / maxPoints));

    mesh.updateMatrixWorld(true);

    for (let i = 0; i < count && points.length < maxPoints; i += step) {
      tempPos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      tempPos.applyMatrix4(mesh.matrixWorld);

      tempNorm.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      tempNorm.transformDirection(mesh.matrixWorld).normalize();

      if (!Number.isFinite(tempNorm.x) || !Number.isFinite(tempNorm.y) || !Number.isFinite(tempNorm.z)) continue;

      points.push({
        id: counter++,
        position: { x: tempPos.x, y: tempPos.y, z: tempPos.z },
        normal: { x: tempNorm.x, y: tempNorm.y, z: tempNorm.z },
      });
    }
  });

  return points;
}
