import type { VolumeGrid } from "../datasets";

export function buildToyVolumeGrid(dims: [number, number, number] = [64, 64, 64]): VolumeGrid {
  const [nx, ny, nz] = dims;
  const total = nx * ny * nz;
  const scalars = new Float32Array(total);

  const spacing: [number, number, number] = [0.04, 0.04, 0.04];
  const origin: [number, number, number] = [
    -(nx - 1) * spacing[0] * 0.5,
    -(ny - 1) * spacing[1] * 0.5,
    -(nz - 1) * spacing[2] * 0.5,
  ];

  const rx = nx > 1 ? 1 / (nx - 1) : 1;
  const ry = ny > 1 ? 1 / (ny - 1) : 1;
  const rz = nz > 1 ? 1 / (nz - 1) : 1;

  let idx = 0;
  for (let z = 0; z < nz; z++) {
    const zn = (z * rz - 0.5) * 2;
    for (let y = 0; y < ny; y++) {
      const yn = (y * ry - 0.5) * 2;
      for (let x = 0; x < nx; x++) {
        const xn = (x * rx - 0.5) * 2;
        const r2 = xn * xn + yn * yn + zn * zn;
        const blob = Math.exp(-4 * r2);
        const shell = Math.exp(-16 * Math.abs(r2 - 0.35));
        scalars[idx++] = 0.65 * blob + 0.35 * shell;
      }
    }
  }

  return { dims, scalars, spacing, origin };
}
