import type { Graph2DDocument } from "@math3d/core";

type Row = Extract<Graph2DDocument["source"]["objects"][number],
  { kind: "point-series" }>;

/** Mobile retains source-linked rows but has no verified external bundle reader. */
export const mobileScientificGraphRowWithheld = (row: Row): boolean =>
  !!(row.origin || row.analyticOrigin || row.derivedOrigin ||
    row.projectProfileOrigin || row.comparisonProfileOrigin ||
    row.temporalSpectrumOrigin || row.poincareOrigin || row.linkedOrigin);

export const mobileWithheldScientificRows = (document: Graph2DDocument):
  readonly Row[] => document.source.objects.filter((object): object is Row =>
    object.kind === "point-series" && mobileScientificGraphRowWithheld(object));
