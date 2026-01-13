import * as THREE from "three";

export function stabilizeTangentDirection(
  dir: THREE.Vector3,
  normal: THREE.Vector3,
  refAxis: THREE.Vector3
) {
  if (Math.abs(normal.x) < 0.9) {
    refAxis.set(1, 0, 0);
  } else if (Math.abs(normal.y) < 0.9) {
    refAxis.set(0, 1, 0);
  } else {
    refAxis.set(0, 0, 1);
  }

  refAxis.addScaledVector(normal, -refAxis.dot(normal));
  const len2 = refAxis.lengthSq();
  if (len2 < 1e-12) return;

  refAxis.multiplyScalar(1 / Math.sqrt(len2));
  if (dir.dot(refAxis) < 0) dir.negate();
}
