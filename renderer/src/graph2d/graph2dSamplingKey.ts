import { structuralHash, type Graph2DSceneSamplingRequest } from "@math3d/core";
/** Grid, pins, selection and metadata are presentation-only, not sampling inputs. */
export const graph2DSceneSamplingKey = (request: Graph2DSceneSamplingRequest) => structuralHash({
  source: request.document.source, identity: request.document.identity,
  styles: request.document.display.objects, sampling: request.document.display.sampling,
  viewport: request.viewport, width: request.width, height: request.height, interaction: request.interaction,
  pointTables: request.pointTables ?? {}, timeBudgetMs: request.timeBudgetMs ?? null, deterministic: request.deterministic ?? false,
});
