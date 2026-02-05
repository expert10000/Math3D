import type { VolumeGrid } from "../datasets";
import { getSliceInfo, type SliceAxis } from "./sliceVolume";

export function buildSliceSeeds(
  grid: VolumeGrid,
  axis: SliceAxis,
  index: number,
  uCount: number,
  vCount: number,
  inset = 0.06
): [number, number, number][] {
  const info = getSliceInfo(grid, axis, index);
  const plane = info.plane;
  const seeds: [number, number, number][] = [];

  const uAxis = plane.u;
  const vAxis = plane.v;
  const c = plane.center;

  const width = Math.max(0, plane.width);
  const height = Math.max(0, plane.height);
  const insetScale = Math.max(0, Math.min(0.45, inset));
  const uSpan = width * (1 - insetScale * 2);
  const vSpan = height * (1 - insetScale * 2);
  const u0 = -0.5 * uSpan;
  const v0 = -0.5 * vSpan;

  const uSteps = Math.max(1, Math.round(uCount));
  const vSteps = Math.max(1, Math.round(vCount));
  const du = uSteps > 1 ? uSpan / (uSteps - 1) : 0;
  const dv = vSteps > 1 ? vSpan / (vSteps - 1) : 0;

  for (let j = 0; j < vSteps; j++) {
    const vOffset = v0 + dv * j;
    for (let i = 0; i < uSteps; i++) {
      const uOffset = u0 + du * i;
      seeds.push([
        c[0] + uAxis[0] * uOffset + vAxis[0] * vOffset,
        c[1] + uAxis[1] * uOffset + vAxis[1] * vOffset,
        c[2] + uAxis[2] * uOffset + vAxis[2] * vOffset,
      ]);
    }
  }

  return seeds;
}
