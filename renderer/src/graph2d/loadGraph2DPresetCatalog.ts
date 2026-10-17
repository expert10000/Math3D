import type { Graph2DPreset, Graph2DPresetCategory } from "@math3d/core";

export type GalleryCatalog = Readonly<{
  entries: readonly Graph2DPreset[];
  get: (id: string) => Graph2DPreset | undefined;
  filter: (query?: string, category?: Graph2DPresetCategory | "All") => Graph2DPreset[];
}>;

let catalogPromise: Promise<GalleryCatalog> | null = null;

/** Generated from the checked core catalog; kept in a separate lazy bundle. */
export function loadGraph2DPresetCatalog(): Promise<GalleryCatalog> {
  if (catalogPromise) return catalogPromise;
  catalogPromise = import("../../../packages/core/fixtures/graph2d/preset-catalog.json").then(module => {
    const entries = Object.freeze(module.default as Graph2DPreset[]);
    // The authored source and generated catalog are compared in unit tests.
    // Core still validates each preset when the user opens it.
    return Object.freeze({ entries, get: (id: string) => entries.find(item => item.id === id),
      filter: (query = "", category: Graph2DPresetCategory | "All" = "All") => {
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return entries.filter(item => (category === "All" || item.category === category) &&
          words.every(word => [item.title, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(word)));
      } });
  }).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
