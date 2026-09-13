import type { VolumeGrid } from "../scene/datasets";

export type VolumePoint3 = [number, number, number];
export type VolumeMatrix3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY_VOLUME_DIRECTION: VolumeMatrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const directionOf = (grid: Pick<VolumeGrid, "direction">): VolumeMatrix3 =>
  grid.direction ? [...grid.direction] : [...IDENTITY_VOLUME_DIRECTION];

const multiplyMatrixVector = (matrix: VolumeMatrix3, vector: VolumePoint3): VolumePoint3 => [
  matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
  matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
  matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
];

const inverseMatrix = (matrix: VolumeMatrix3): VolumeMatrix3 | null => {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  const inv = 1 / determinant;
  return [A * inv, B * inv, C * inv, D * inv, E * inv, F * inv, G * inv, H * inv, I * inv];
};

export const volumeGridIndexToWorld = (
  grid: Pick<VolumeGrid, "origin" | "spacing" | "direction">,
  index: VolumePoint3
): VolumePoint3 => {
  const origin = grid.origin ?? [0, 0, 0];
  const spacing = grid.spacing ?? [1, 1, 1];
  const offset: VolumePoint3 = [index[0] * spacing[0], index[1] * spacing[1], index[2] * spacing[2]];
  const rotated = multiplyMatrixVector(directionOf(grid), offset);
  return [origin[0] + rotated[0], origin[1] + rotated[1], origin[2] + rotated[2]];
};

export const volumeWorldToGridIndex = (
  grid: Pick<VolumeGrid, "origin" | "spacing" | "direction">,
  world: VolumePoint3
): VolumePoint3 => {
  const origin = grid.origin ?? [0, 0, 0];
  const spacing = grid.spacing ?? [1, 1, 1];
  const inverse = inverseMatrix(directionOf(grid));
  if (!inverse) return [Number.NaN, Number.NaN, Number.NaN];
  const local = multiplyMatrixVector(inverse, [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]]);
  return [
    spacing[0] ? local[0] / spacing[0] : Number.NaN,
    spacing[1] ? local[1] / spacing[1] : Number.NaN,
    spacing[2] ? local[2] / spacing[2] : Number.NaN,
  ];
};

export const volumeIndexInside = (dims: VolumePoint3, index: VolumePoint3, epsilon = 1e-6): boolean =>
  index.every((value, axis) => Number.isFinite(value) && value >= -epsilon && value <= dims[axis] - 1 + epsilon);

export const clampVolumeIndex = (dims: VolumePoint3, index: VolumePoint3): VolumePoint3 => [
  Math.min(Math.max(0, dims[0] - 1), Math.max(0, index[0])),
  Math.min(Math.max(0, dims[1] - 1), Math.max(0, index[1])),
  Math.min(Math.max(0, dims[2] - 1), Math.max(0, index[2])),
];

export const nearestVolumeVoxel = (dims: VolumePoint3, index: VolumePoint3): VolumePoint3 => {
  const clamped = clampVolumeIndex(dims, index);
  return [Math.round(clamped[0]), Math.round(clamped[1]), Math.round(clamped[2])];
};

export const volumeDirectionColumns = (grid: Pick<VolumeGrid, "direction">): [VolumePoint3, VolumePoint3, VolumePoint3] => {
  const d = directionOf(grid);
  return [
    [d[0], d[3], d[6]],
    [d[1], d[4], d[7]],
    [d[2], d[5], d[8]],
  ];
};

/** Convert derivatives along the physical index axes into a world-space gradient. */
export const volumeLocalGradientToWorld = (
  grid: Pick<VolumeGrid, "direction">,
  localGradient: VolumePoint3
): VolumePoint3 => {
  const inverse = inverseMatrix(directionOf(grid));
  if (!inverse) return [Number.NaN, Number.NaN, Number.NaN];
  return [
    inverse[0] * localGradient[0] + inverse[3] * localGradient[1] + inverse[6] * localGradient[2],
    inverse[1] * localGradient[0] + inverse[4] * localGradient[1] + inverse[7] * localGradient[2],
    inverse[2] * localGradient[0] + inverse[5] * localGradient[1] + inverse[8] * localGradient[2],
  ];
};
