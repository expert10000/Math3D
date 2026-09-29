import type { Graph2DDocument } from "./graph2dDocument";
import type { Graph2DViewport } from "./graph2dViewport";
import { graph2DParameterNumber } from "./graph2dParameterTypes";
export const GRAPH2D_GRID_CAPABILITY = "graph2d.grid.v1" as const;
export type Graph2DGridOptions = Readonly<{ minor: boolean; density: "sparse" | "normal" | "dense";
  contrast: "subtle" | "normal" | "strong"; xStep: number | null; yStep: number | null }>;
export const GRAPH2D_DEFAULT_GRID_OPTIONS: Graph2DGridOptions = Object.freeze({ minor: true, density: "normal", contrast: "normal", xStep: null, yStep: null });
export const isGraph2DGridOptions = (value: unknown, viewport: Graph2DViewport, mode?: string): value is Graph2DGridOptions => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (Object.keys(o).sort().join("|") !== "contrast|density|minor|xStep|yStep" || typeof o.minor !== "boolean" ||
    !["sparse", "normal", "dense"].includes(String(o.density)) || !["subtle", "normal", "strong"].includes(String(o.contrast))) return false;
  return (["x", "y"] as const).every(axis => { const step = o[`${axis}Step`];
    return step === null || mode !== "polar" && typeof step === "number" && Number.isFinite(step) &&
      (viewport[`${axis}Scale`] === "log10" ? Number.isSafeInteger(step) && step >= 1 && step <= 100 : step >= 1e-100 && step <= 1e100);
  });
};
export type Graph2DGridFields = { x: boolean; y: boolean; grid: boolean; labels: boolean; minor: boolean;
  density: Graph2DGridOptions["density"]; contrast: Graph2DGridOptions["contrast"]; xStep: string; yStep: string };
export const graph2DGridFields = (document: Graph2DDocument): Graph2DGridFields => {
  const axes = document.display.axes, options = axes.gridOptions ?? GRAPH2D_DEFAULT_GRID_OPTIONS;
  return { x: axes.x, y: axes.y, grid: axes.grid, labels: axes.labels, minor: options.minor, density: options.density,
    contrast: options.contrast, xStep: options.xStep === null ? "" : String(options.xStep), yStep: options.yStep === null ? "" : String(options.yStep) };
};
export const graph2DAxesFromGridFields = (document: Graph2DDocument, fields: Graph2DGridFields): Graph2DDocument["display"]["axes"] => {
  const gridOptions = { minor: fields.minor, density: fields.density, contrast: fields.contrast,
    xStep: fields.xStep.trim() ? graph2DParameterNumber(fields.xStep) : null, yStep: fields.yStep.trim() ? graph2DParameterNumber(fields.yStep) : null };
  if (!isGraph2DGridOptions(gridOptions, document.display.viewport, document.display.axes.gridMode))
    throw new TypeError("Manual spacing must be positive and finite (1e-100 to 1e100 world units); log axes require integer decades from 1 to 100. Polar grids require Auto spacing.");
  return { ...document.display.axes, x: fields.x, y: fields.y, grid: fields.grid, labels: fields.labels, gridOptions };
};
export const graph2DGridAppearance = (options?: Graph2DGridOptions) => {
  const contrast = options?.contrast ?? "normal";
  return { majorOpacity: contrast === "subtle" ? .4 : contrast === "strong" ? 1 : .85,
    minorOpacity: contrast === "subtle" ? .15 : contrast === "strong" ? .7 : .45,
    majorColor: !options ? "#e2e8f0" : contrast === "strong" ? "#94a3b8" : contrast === "subtle" ? "#e2e8f0" : "#cbd5e1",
    minorColor: contrast === "strong" ? "#cbd5e1" : contrast === "subtle" ? "#f1f5f9" : "#e2e8f0" };
};
