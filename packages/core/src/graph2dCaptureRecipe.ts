import { structuralHash } from "./documentIdentity";
import { parseGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import type { Graph2DPublication } from "./graph2dPublication";

/** A local, inspectable recipe accompanying a G2D36 publication, not a second renderer. */
export function createGraph2DCaptureRecipe(document: Graph2DDocument, publication: Pick<Graph2DPublication, "snapshotId" | "metadata">,
  theme: "light" | "dark", attribution: string, hostWindow?: { width: number; height: number }) {
  const checked = parseGraph2DDocument(JSON.stringify(document));
  if (publication.metadata.source.id !== checked.identity.id ||
      publication.metadata.source.structuralHash !== checked.identity.structuralHash)
    throw new TypeError("Publication no longer matches the committed Graph source.");
  if (attribution.length > 256) throw new TypeError("Attribution is too long.");
  if (hostWindow && ![hostWindow.width, hostWindow.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192))
    throw new TypeError("Invalid capture window size.");
  const externalTables = checked.source.objects.flatMap(object => object.kind === "point-series" ?
    [{ id: object.table.id, rowCount: object.table.rowCount, checksum: object.table.checksum }] : []);
  return {
    format: "math3d.graph2d-capture-recipe", version: 1,
    snapshotId: publication.snapshotId,
    sourceHash: structuralHash(checked.source),
    document: checked,
    view: { viewport: checked.display.viewport, effectiveViewport: publication.metadata.effectiveViewport,
      size: publication.metadata.size, hostWindow: hostWindow ?? null, uiTheme: theme, publicationTheme: "light" },
    attribution: attribution.trim() || "Math3D Graph publication",
    publicationMetadata: publication.metadata,
    externalTables,
    completeness: externalTables.length ? "external-point-tables-required" :
      publication.metadata.warnings.some(warning => /incomplete|omitted|missing|budget/i.test(warning)) ? "limited" : "complete-within-publication-policy",
    note: "Recreate the static image with Graph publication export. G2D36 publication currently uses a light canvas regardless of UI theme. This recipe does not embed external table rows or result artifacts; sampling is approximate.",
  } as const;
}

export function renderGraph2DCaptureRecipeArtifact(document: Graph2DDocument, publication: Graph2DPublication,
  theme: "light" | "dark", attribution: string, hostWindow?: { width: number; height: number }) {
  const recipe = createGraph2DCaptureRecipe(document, publication, theme, attribution, hostWindow);
  const stem = document.metadata.title.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "graph";
  return { format: "json" as const, fileName: `${stem}-capture-${publication.snapshotId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}.json`,
    mimeType: "application/json", uti: "public.json", snapshotId: publication.snapshotId,
    bytes: new TextEncoder().encode(JSON.stringify(recipe, null, 2)) };
}
export type Graph2DCaptureRecipeArtifact = ReturnType<typeof renderGraph2DCaptureRecipeArtifact>;
