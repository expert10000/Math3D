import type { SurfaceDocument } from "@math3d/core";

export const SURFACE_STUDY_RESOLUTIONS = [
  { size: 17, label: "Coarse · 17 samples/axis" },
  { size: 33, label: "Medium · 33 samples/axis" },
  { size: 65, label: "Fine · 65 samples/axis" },
] as const;
export type SurfaceStudyResolution = 17 | 33 | 65;
export const validateSurfaceStudyResolution = (value: number): SurfaceStudyResolution => {
  if (!SURFACE_STUDY_RESOLUTIONS.some(item => item.size === value)) throw new TypeError("Choose a saved analysis resolution of 17, 33 or 65 samples per axis.");
  return value as SurfaceStudyResolution;
};
export const supportsSavedSurfaceResolution = (document: SurfaceDocument) => ["parametric", "explicit", "implicit", "spline", "weierstrass"].includes(document.source.representation);
