import * as THREE from "three";

export const createDefaultSurfaceMaterial = (opts?: {
  color?: number;
  opacity?: number;
  wireframe?: boolean;
}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: opts?.color ?? 0x8aa4ff,
    transparent: (opts?.opacity ?? 1) < 1,
    opacity: opts?.opacity ?? 1,
    wireframe: !!opts?.wireframe,
    metalness: 0.05,
    roughness: 0.55,
  });

export const createDefaultLineMaterial = (opts?: { color?: number; opacity?: number }): THREE.LineBasicMaterial =>
  new THREE.LineBasicMaterial({
    color: opts?.color ?? 0x334155,
    transparent: (opts?.opacity ?? 1) < 1,
    opacity: opts?.opacity ?? 1,
  });
