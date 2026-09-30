import { structuralHash } from "./documentIdentity";
import { parseGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import type { Graph2DPublication } from "./graph2dPublication";

/** A local, inspectable recipe accompanying a G2D36 publication, not a second renderer. */
export function createGraph2DCaptureRecipe(document: Graph2DDocument, publication: Pick<Graph2DPublication, "snapshotId" | "metadata">,
  theme: "light" | "dark", attribution: string) {
  const checked = parseGraph2DDocument(JSON.stringify(document));
  if (publication.metadata.source.id !== checked.identity.id ||
      publication.metadata.source.structuralHash !== checked.identity.structuralHash)
    throw new TypeError("Publication no longer matches the committed Graph source.");
  if (attribution.length > 256) throw new TypeError("Attribution is too long.");
  const externalTables = checked.source.objects.flatMap(object => object.kind === "point-series" ?
    [{ id: object.table.id, rowCount: object.table.rowCount, checksum: object.table.checksum }] : []);
  return {
    format: "math3d.graph2d-capture-recipe", version: 1,
    snapshotId: publication.snapshotId,
    sourceHash: structuralHash(checked.source),
    document: checked,
    view: { viewport: checked.display.viewport, effectiveViewport: publication.metadata.effectiveViewport,
      size: publication.metadata.size, uiTheme: theme, publicationTheme: "light" },
    attribution: attribution.trim() || "Math3D Graph publication",
    publicationMetadata: publication.metadata,
    externalTables,
    completeness: externalTables.length ? "external-point-tables-required" :
      publication.metadata.warnings.some(warning => /incomplete|omitted|missing|budget/i.test(warning)) ? "limited" : "complete-within-publication-policy",
    note: "Recreate the static image with Graph publication export. G2D36 publication currently uses a light canvas regardless of UI theme. This recipe does not embed external table rows or result artifacts; sampling is approximate.",
  } as const;
}
