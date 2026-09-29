import { graph2DPublicationTableAllowance, type Graph2DDocument, type Graph2DPointTableStore, type Graph2DPublicationRequest } from "@math3d/core";
import { isMobileGraphAnalysisCurrent, type MobileGraphAnalysis, type MobileGraphAnalysisDraft } from "./mobileGraphAnalysis";

export const mobileGraphPublicationRequest = (document: Graph2DDocument, tables: Graph2DPointTableStore,
  analysis: MobileGraphAnalysis | null, draft: MobileGraphAnalysisDraft, size: { width: number; height: number }, units: { x: string; y: string }): Graph2DPublicationRequest => {
  const allowance = graph2DPublicationTableAllowance(document);
  const current = analysis && isMobileGraphAnalysisCurrent(analysis, document, draft) ? analysis : null;
  return { document, size, units, analyses: current?.publicationTables ?? [], analysisNotes: current?.publicationNotes ?? [],
    pointTables: Object.fromEntries(document.source.objects.flatMap(object => object.kind === "point-series" && object.table.rowCount <= allowance &&
      document.display.objects.some(style => style.objectId === object.id && style.visible) ? [[object.table.id, tables.resolve(object.table)]] : [])) };
};
