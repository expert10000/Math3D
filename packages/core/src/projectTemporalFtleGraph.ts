import { structuralHash } from "./documentIdentity";
import type { Graph2DTemporalFtleOrigin } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import type { Math3DProject } from "./math3dProject";
import { projectTemporalFtleProfileStatus,
  type TemporalFtleProfileStudy } from "./temporalFtleProfile";
import type { VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";

export const temporalFtleGraphRows = (study: TemporalFtleProfileStudy):
  readonly Graph2DPointRow[] => study.rows.map((row, index) => ({
    id: `row_${index + 1}`, x: row.x, y: row.y }));

export function createTemporalFtleGraphOrigin(project: Math3DProject,
  study: TemporalFtleProfileStudy,
  transfers?: VerifiedTemporalTransfers): Graph2DTemporalFtleOrigin {
  const result = study.publication;
  if (!result || !project.workspace.results.some(item => item.resultId ===
      result.resultId && structuralHash(item.summary) === structuralHash(result.summary)) ||
      projectTemporalFtleProfileStatus(project, result, transfers).status !== "current")
    throw new TypeError("Save and verify the refined FTLE profile before Graph handoff.");
  const rows = temporalFtleGraphRows(study);
  if (rows.length !== 2 || !rows.some(row => row.y !== null))
    throw new TypeError("The FTLE profile has no converged physical values.");
  const recipe = result.provenance.operation.parameters.recipe as
    { convergenceTolerance: number; profileRow: 0 | 1 };
  return { kind: "project-temporal-ftle-profile/v1",
    projectId: project.identity.id, resultId: result.resultId,
    summaryHash: structuralHash(result.summary),
    rowsSha256: structuralHash(rows),
    axisUnit: String(result.summary.axisUnit),
    valueUnit: String(result.summary.valueUnit),
    profileRow: recipe.profileRow,
    convergenceTolerance: recipe.convergenceTolerance };
}

export function projectTemporalFtleGraphStatus(project: Math3DProject | null | undefined,
  origin: Graph2DTemporalFtleOrigin,
  rows: readonly Graph2DPointRow[] | null,
  transfers?: VerifiedTemporalTransfers):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (!project || project.identity.id !== origin.projectId)
    return { status: "withheld", reason: "project-missing" };
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  if (!result) return { status: "withheld", reason: "result-missing" };
  if (structuralHash(result.summary) !== origin.summaryHash ||
      String(result.summary.axisUnit) !== origin.axisUnit ||
      String(result.summary.valueUnit) !== origin.valueUnit ||
      (result.provenance.operation.parameters.recipe as
        { profileRow?: number; convergenceTolerance?: number } | undefined)
        ?.profileRow !== origin.profileRow ||
      (result.provenance.operation.parameters.recipe as
        { convergenceTolerance?: number } | undefined)?.convergenceTolerance !==
        origin.convergenceTolerance)
    return { status: "withheld", reason: "result-changed" };
  if (!rows || structuralHash(rows) !== origin.rowsSha256)
    return { status: "withheld", reason: "profile-artifact-missing-or-changed" };
  const status = projectTemporalFtleProfileStatus(project, result, transfers);
  return status.status === "current" ? { status: "current", reason: null } :
    { status: "withheld", reason: status.reason };
}
