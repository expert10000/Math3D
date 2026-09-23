export type MobileSurfaceRenderMode = "solid" | "wireframe" | "solid-edges";

export type MobileSurfaceShading = "smooth" | "flat";

export const normalizeMobileSurfaceRenderMode = (value: unknown): MobileSurfaceRenderMode =>
  value === "wireframe" || value === "solid-edges" ? value : "solid";

export const normalizeMobileSurfaceShading = (value: unknown): MobileSurfaceShading =>
  value === "flat" ? "flat" : "smooth";
