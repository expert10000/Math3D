import type { Graph2DDocument } from "./graph2dDocument";
import { graph2DHasLogScale, isGraph2DViewport, type Graph2DViewport } from "./graph2dViewport";
import { graph2DParameterNumber } from "./graph2dParameterTypes";
import { isGraph2DGridOptions } from "./graph2dGridOptions";
export type Graph2DScaleFields = { xMin: string; xMax: string; yMin: string; yMax: string;
  xScale: "linear" | "log10"; yScale: "linear" | "log10"; aspect: "free" | "equal" };
export const graph2DScaleFields = (v: Graph2DViewport): Graph2DScaleFields => ({ xMin: String(v.xMin), xMax: String(v.xMax),
  yMin: String(v.yMin), yMax: String(v.yMax), xScale: v.xScale ?? "linear", yScale: v.yScale ?? "linear", aspect: v.aspect });
export const graph2DViewportFromScaleFields = (document: Graph2DDocument, fields: Graph2DScaleFields): Graph2DViewport => {
  const viewport = { ...document.display.viewport, ...fields, xMin: graph2DParameterNumber(fields.xMin), xMax: graph2DParameterNumber(fields.xMax),
    yMin: graph2DParameterNumber(fields.yMin), yMax: graph2DParameterNumber(fields.yMax) };
  if (graph2DHasLogScale(viewport) && fields.aspect === "equal") throw new TypeError("Equal world-unit scale requires two linear axes. Choose Free for logarithmic axes.");
  if (graph2DHasLogScale(viewport) && document.display.axes.gridMode === "polar") throw new TypeError("Choose Cartesian grid before enabling logarithmic axes.");
  if (!isGraph2DViewport(viewport)) throw new TypeError("Enter increasing finite bounds. Log axes require positive bounds from 1e-100 to 1e100, at least 1e-8 decades apart; linear spans must be 1e-9 to 1e12.");
  if (document.display.axes.gridOptions && !isGraph2DGridOptions(document.display.axes.gridOptions, viewport, document.display.axes.gridMode))
    throw new TypeError("Saved manual grid spacing is incompatible with these scales. Set spacing to Auto in Grid settings before changing scales.");
  return viewport;
};
export const GRAPH2D_SCALE_GUIDANCE = "Log axes omit non-positive coordinates; they do not transform source expressions or statistical data. Analysis uses authored world coordinates. Tangent, area and interval overlays are hidden on log axes. Continuation is visual-only, outside the authored x range; it is not probed, analysed or exported.";
