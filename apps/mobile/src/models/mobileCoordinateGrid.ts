export const MOBILE_GRID_PLANES = ["xy", "xz", "yz"] as const;

export type MobileGridPlane = (typeof MOBILE_GRID_PLANES)[number];

export const DEFAULT_MOBILE_GRID_PLANES: MobileGridPlane[] = [...MOBILE_GRID_PLANES];

export const normalizeMobileGridPlanes = (value: unknown): MobileGridPlane[] => {
  if (!Array.isArray(value)) return [...DEFAULT_MOBILE_GRID_PLANES];
  const selected = MOBILE_GRID_PLANES.filter((plane) => value.includes(plane));
  return selected.length > 0 ? selected : [...DEFAULT_MOBILE_GRID_PLANES];
};
