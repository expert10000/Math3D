import { structuralHash } from "./documentIdentity";
import type { Graph2DPoincareOrigin } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import type { Math3DProject } from "./math3dProject";
import { projectVectorField3DTopologyStatus, type PoincareStudy } from
  "./vectorField3DTopologyStudies";

/** A physical time versus oriented-section distance table for Graphs. */
export const poincareGraphRows = (study: PoincareStudy): readonly Graph2DPointRow[] =>
  study.crossings.map((crossing, index) => ({ id: `row_${index + 1}`,
    x: crossing.time, y: crossing.sectionDistance }));

export function createPoincareGraphOrigin(project: Math3DProject,
  study: PoincareStudy): Graph2DPoincareOrigin {
  const result = study.publication;
  if (result.provenance.operation.type !== "vector3d.poincare-section" ||
      projectVectorField3DTopologyStatus(project, result).status !== "current" ||
      !project.workspace.results.some(item => item.resultId === result.resultId &&
        structuralHash(item.summary) === structuralHash(result.summary)))
    throw new TypeError("Save a current Poincaré section before Graph handoff.");
  const rows = poincareGraphRows(study);
  if (rows.length < 1 || rows.length > 64 ||
      rows.some((row, index) => !Number.isFinite(row.x) ||
        !Number.isFinite(row.y) || index > 0 && row.x <= rows[index - 1]!.x) ||
      result.summary.crossingCount !== rows.length ||
      result.summary.rowsHash !== structuralHash(study.crossings))
    throw new TypeError("Poincaré crossings are unavailable or changed.");
  return { kind: "project-poincare-section/v1", projectId: project.identity.id,
    resultId: result.resultId, summaryHash: structuralHash(result.summary),
    rowsSha256: structuralHash(rows),
    sourceDocumentId: result.provenance.source.documentId,
    axisUnit: String(result.summary.timeUnit),
    valueUnit: String(result.summary.coordinateUnit), crossingCount: rows.length };
}

export function projectPoincareGraphStatus(project: Math3DProject | null | undefined,
  origin: Graph2DPoincareOrigin, rows: readonly Graph2DPointRow[] | null):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (!project || project.identity.id !== origin.projectId)
    return { status: "withheld", reason: "project-missing" };
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  if (!result) return { status: "withheld", reason: "result-missing" };
  if (result.provenance.operation.type !== "vector3d.poincare-section" ||
      result.provenance.source.documentId !== origin.sourceDocumentId ||
      structuralHash(result.summary) !== origin.summaryHash ||
      result.summary.crossingCount !== origin.crossingCount ||
      result.summary.timeUnit !== origin.axisUnit ||
      result.summary.coordinateUnit !== origin.valueUnit)
    return { status: "withheld", reason: "result-changed" };
  if (!rows || structuralHash(rows) !== origin.rowsSha256)
    return { status: "withheld", reason: "crossings-missing-or-changed" };
  return projectVectorField3DTopologyStatus(project, result);
}
