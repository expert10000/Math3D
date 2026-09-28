import { getGraph2DPresetCatalog, type Graph2DPresetCategory } from "@math3d/core";

export const mobileGraphGalleryItems = (query: string, category: Graph2DPresetCategory | "All", featured: boolean) =>
  getGraph2DPresetCatalog().filter(query, category).filter(item => !featured || item.featuredOrder !== null)
    .sort((a, b) => featured ? (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0) : 0);

/** Keep cards readable under native large text; the entire content scrolls on short screens. */
export const mobileGraphGalleryLayout = (width: number, height: number, fontScale: number) => {
  const columns = fontScale > 1.3 ? 1 : width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  return { columns, compact: height < 500, cardWidth: Math.max(1, (width - 40 - 12 * (columns - 1)) / columns) };
};
