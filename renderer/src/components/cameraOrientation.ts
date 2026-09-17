import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type CameraOrientation = "xy" | "xyNeg" | "xz" | "xzNeg" | "yz" | "yzNeg" | "iso";

export const CAMERA_ORIENTATION_LABEL: Record<CameraOrientation, string> = {
  xy: "+Z Front",
  xyNeg: "−Z Back",
  xz: "+Y Top",
  xzNeg: "−Y Bottom",
  yz: "+X Right",
  yzNeg: "−X Left",
  iso: "Isometric",
};

export const applyCameraOrientation = (
  camera: THREE.Camera,
  controls: OrbitControls,
  center: THREE.Vector3,
  radius: number,
  orientation: CameraOrientation
) => {
  const distance = Math.max(0.001, radius || 3) * 2.0;
  if (orientation === "xy") {
    camera.position.set(center.x, center.y, center.z + distance);
    camera.up.set(0, 1, 0);
  } else if (orientation === "xyNeg") {
    camera.position.set(center.x, center.y, center.z - distance);
    camera.up.set(0, 1, 0);
  } else if (orientation === "xz") {
    camera.position.set(center.x, center.y + distance, center.z);
    camera.up.set(0, 0, 1);
  } else if (orientation === "xzNeg") {
    camera.position.set(center.x, center.y - distance, center.z);
    camera.up.set(0, 0, -1);
  } else if (orientation === "yz") {
    camera.position.set(center.x + distance, center.y, center.z);
    camera.up.set(0, 1, 0);
  } else if (orientation === "yzNeg") {
    camera.position.set(center.x - distance, center.y, center.z);
    camera.up.set(0, 1, 0);
  } else {
    const isometricDirection = new THREE.Vector3(1, 0.85, 1.12).normalize();
    camera.position.copy(center).addScaledVector(isometricDirection, distance * 1.08);
    camera.up.set(0, 1, 0);
  }
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
};

export const orbitCameraAroundTarget = (
  camera: THREE.Camera,
  controls: OrbitControls,
  deltaX: number,
  deltaY: number
) => {
  const offset = camera.position.clone().sub(controls.target);
  if (offset.lengthSq() < 1e-8) return false;
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= deltaX * 0.012;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaY * 0.012, 0.04, Math.PI - 0.04);
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  camera.lookAt(controls.target);
  controls.update();
  return true;
};
