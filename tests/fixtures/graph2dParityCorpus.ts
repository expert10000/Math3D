import recipes from "../../packages/core/fixtures/graph2d/parity-corpus-v1.json";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, Graph2DPointTableStore,
  type Graph2DAuthoringAction, type Graph2DViewport, type Graph2DPointRow, type Graph2DSceneSamplingRequest,
  type Graph2DSampledSeries } from "@math3d/core";
export { recipes };
export const graph2DParityCorpus = () => recipes.cases.map((recipe) => {
  const store = new Graph2DPointTableStore(), rows = "rows" in recipe ? recipe.rows as Graph2DPointRow[] : undefined;
  const action = { type: recipe.type, draft: { label: recipe.id,
    domain: { min: -2, max: 2, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true }, ...recipe.draft,
    ...(rows ? { table: store.publish(rows) } : {}) } } as Graph2DAuthoringAction;
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(recipe.id), action);
  const viewport = ("viewport" in recipe ? recipe.viewport : { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" }) as Graph2DViewport;
  const document = createGraph2DDocument({ stableKey: { corpus: recipes.version, id: recipe.id }, ...scene,
    display: { ...scene.display, viewport, sampling: { maxSamples: 4000, maxDepth: 12, tolerancePx: 0.75 } } });
  const object = document.source.objects[0]!;
  const request: Graph2DSceneSamplingRequest = { document, viewport, width: 640, height: 480, interaction: false,
    pointTables: object.kind === "point-series" ? { [object.table.id]: rows! } : {}, timeBudgetMs: 1500 };
  return { id: recipe.id, oracle: recipe.oracle, request };
});
/** Derived visual geometry is rounded only for comparisons, never written back to source. */
export const graph2DParitySignature = (series: readonly Graph2DSampledSeries[]) => JSON.parse(JSON.stringify(series,
  (_key, value) => typeof value === "number" ? Number(value.toPrecision(12)) : value));
