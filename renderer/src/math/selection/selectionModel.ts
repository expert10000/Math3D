import * as THREE from "three";
import type { SurfaceSample } from "../sampling/surfaceSampling";

export type SelectionMode = "none" | "surfaceDisk" | "gaussCap";

export type SurfaceDiskSelection = {
  kind: "surfaceDisk";
  centerWorld: THREE.Vector3;
  radius: number;
  useUV?: false;
};

export type UVDiskSelection = {
  kind: "surfaceDisk";
  centerUV: { u: number; v: number };
  radius: number;
  useUV: true;
};

export type GaussCapSelection = {
  kind: "gaussCap";
  capNormal: THREE.Vector3;
  angleRad: number;
};

export type RegionSelection = SurfaceDiskSelection | UVDiskSelection | GaussCapSelection;

export type SelectionMask = {
  selected: Uint8Array;
  count: number;
};

export function computeSelectionMask(
  samples: SurfaceSample[],
  selection: RegionSelection | null
): SelectionMask {
  const selected = new Uint8Array(samples.length);
  if (!selection) {
    return { selected, count: 0 };
  }

  let hits = 0;
  if (selection.kind === "surfaceDisk") {
    const radius2 = selection.radius * selection.radius;
    if (selection.useUV) {
      const centerUV = selection.centerUV;
      samples.forEach((sample, idx) => {
        if (!sample.uv) return;
        const du = sample.uv.u - centerUV.u;
        const dv = sample.uv.v - centerUV.v;
        if (du * du + dv * dv <= radius2) {
          selected[idx] = 1;
          hits++;
        }
      });
    } else {
      const center = selection.centerWorld;
      samples.forEach((sample, idx) => {
        if (sample.position.distanceToSquared(center) <= radius2) {
          selected[idx] = 1;
          hits++;
        }
      });
    }
  } else if (selection.kind === "gaussCap") {
    const cosThreshold = Math.cos(selection.angleRad);
    const cap = selection.capNormal;
    samples.forEach((sample, idx) => {
      const dot = sample.normal.dot(cap);
      if (dot >= cosThreshold) {
        selected[idx] = 1;
        hits++;
      }
    });
  }

  return { selected, count: hits };
}
