import { getGraph2DPresetCatalog } from "@math3d/core";
import { mobileExamples } from "../data/mobileSeedData";

export type MobileCatalogCard = Readonly<{
  key: string; module: "graph2d" | "surface"; sourceId: string; title: string; description: string;
  category: string; requiredCapabilities: readonly string[];
}>;

/** Thin cards only: opening still delegates to the module's normal preset/scene factory. */
export const mobileCrossModuleCatalog = (): readonly MobileCatalogCard[] => [
  ...getGraph2DPresetCatalog().entries.map(item => ({ key: `graph2d:${item.id}`, module: "graph2d" as const,
    sourceId: item.id, title: item.title, description: item.description, category: item.category,
    requiredCapabilities: item.requiredCapabilities })),
  ...mobileExamples.map(item => ({ key: `surface:${item.id}`, module: "surface" as const,
    sourceId: item.id, title: item.title, description: item.description, category: item.category,
    requiredCapabilities: item.capabilities })),
];

export const searchMobileCrossModuleCatalog = (query: string, module?: MobileCatalogCard["module"]) => {
  const needle = query.trim().toLocaleLowerCase().slice(0, 160);
  return mobileCrossModuleCatalog().filter(card => (!module || card.module === module) &&
    (!needle || `${card.sourceId} ${card.title} ${card.description} ${card.category}`.toLocaleLowerCase().includes(needle)));
};

// Curated mathematical comparisons, not source conversion or implicit-to-Surface promotion.
const related = [
  { graphId: "translated-quadratic", surfaceId: "paraboloid", reason: "Compare a 1D quadratic graph with a 2D quadratic surface." },
  { graphId: "sine-cosine", surfaceId: "sinc-ripple", reason: "Compare one-dimensional oscillation with a radial wave." },
  { graphId: "polar-rose", surfaceId: "wave-torus", reason: "Compare periodic planar and spatial parameterizations." },
] as const;

export const relatedSurfaceScenesForGraph = (graphId: string, available: (surfaceId: string) => boolean) =>
  related.filter(link => link.graphId === graphId).flatMap(link => {
    const surface = mobileExamples.find(item => item.id === link.surfaceId);
    return surface ? [{ card: mobileCrossModuleCatalog().find(card => card.key === `surface:${surface.id}`)!,
      reason: link.reason, available: available(surface.id) }] : [];
  });

export const relatedGraphScenesForSurface = (surfaceId: string) =>
  related.filter(link => link.surfaceId === surfaceId).flatMap(link => {
    const card = mobileCrossModuleCatalog().find(item => item.key === `graph2d:${link.graphId}`);
    return card ? [{ card, reason: link.reason }] : [];
  });
