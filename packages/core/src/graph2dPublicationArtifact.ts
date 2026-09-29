import { renderGraph2DPublicationCSV, renderGraph2DPublicationReport, renderGraph2DPublicationSVG, type Graph2DPublication } from "./graph2dPublication";
import { renderGraph2DPublicationPNG } from "./graph2dPublicationPNG";

export const GRAPH2D_PUBLICATION_FORMATS = ["svg", "png", "csv", "html"] as const;
export type Graph2DPublicationFormat = typeof GRAPH2D_PUBLICATION_FORMATS[number];
const types = { svg: ["image/svg+xml", "public.svg-image"], png: ["image/png", "public.png"],
  csv: ["text/csv", "public.comma-separated-values-text"], html: ["text/html", "public.html"] } as const;
export const renderGraph2DPublicationArtifact = (publication: Graph2DPublication, format: Graph2DPublicationFormat) => {
  if (!GRAPH2D_PUBLICATION_FORMATS.includes(format)) throw new TypeError("Unknown publication format.");
  const stem = publication.metadata.title.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "graph";
  const [mimeType, uti] = types[format];
  const content = format === "svg" ? renderGraph2DPublicationSVG(publication) : format === "csv" ? renderGraph2DPublicationCSV(publication) :
    format === "html" ? renderGraph2DPublicationReport(publication) : renderGraph2DPublicationPNG(publication);
  return { format, fileName: `${stem}-publication-${publication.snapshotId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}.${format}`,
    mimeType, uti, snapshotId: publication.snapshotId, bytes: typeof content === "string" ? new TextEncoder().encode(content) : content };
};
export type Graph2DPublicationArtifact = ReturnType<typeof renderGraph2DPublicationArtifact>;
