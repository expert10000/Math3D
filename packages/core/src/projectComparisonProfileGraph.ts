import { structuralHash } from "./documentIdentity";
import type { AnalysisResultEnvelope } from "./analysisResults";
import type { Graph2DComparisonProfileOrigin } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import type { Math3DProject } from "./math3dProject";
import { projectVectorField3DComparisonStatus, VECTOR_FIELD3D_COMPARISON_RESULT_TYPE } from
  "./vectorField3DComparison";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Profile = Readonly<{ axis: Readonly<{ name: string; unit: string;
  min: number; max: number }>; unit: string;
  rows: readonly Readonly<{ x: number; y: number | null }>[] }>;
const profile = (result: AnalysisResultEnvelope): Profile => {
  const candidate = result.summary.profile as Profile | undefined;
  if (!candidate || !candidate.axis || !Array.isArray(candidate.rows) ||
      candidate.rows.length < 2 || candidate.rows.length > 16 ||
      candidate.rows.some((row, index) => !Number.isFinite(row.x) ||
        row.y !== null && !Number.isFinite(row.y) ||
        index > 0 && row.x <= candidate.rows[index - 1]!.x))
    throw new TypeError("Saved comparison has no bounded physical profile.");
  return candidate;
};
export const projectComparisonProfileRows = (result: AnalysisResultEnvelope):
  readonly Graph2DPointRow[] => profile(result).rows.map((row, index) =>
    ({ id: `row_${index + 1}`, x: row.x, y: row.y }));

export function createProjectComparisonProfileOrigin(project: Math3DProject,
  result: AnalysisResultEnvelope,
  verifiedTransfer?: (source: VectorField3DDocument) => string | null):
  Graph2DComparisonProfileOrigin {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_COMPARISON_RESULT_TYPE ||
      projectVectorField3DComparisonStatus(project, result, verifiedTransfer).status !== "current" ||
      !project.workspace.results.some(item => item.resultId === result.resultId &&
        structuralHash(item.summary) === structuralHash(result.summary)))
    throw new TypeError("Save and verify both comparison sources before Graph export.");
  const checked = profile(result);
  return { kind: "project-field-comparison-profile/v1", projectId: project.identity.id,
    resultId: result.resultId, summaryHash: structuralHash(result.summary),
    rowsSha256: structuralHash(projectComparisonProfileRows(result)),
    axis: checked.axis, unit: checked.unit };
}

export function projectComparisonProfileGraphStatus(project: Math3DProject | null | undefined,
  origin: Graph2DComparisonProfileOrigin,
  verifiedTransfer?: (source: VectorField3DDocument) => string | null):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (!project || project.identity.id !== origin.projectId)
    return { status: "withheld", reason: "project-missing" };
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  if (!result) return { status: "withheld", reason: "result-missing" };
  if (structuralHash(result.summary) !== origin.summaryHash)
    return { status: "withheld", reason: "result-changed" };
  try {
    const current = profile(result);
    if (structuralHash(projectComparisonProfileRows(result)) !== origin.rowsSha256 ||
        JSON.stringify(current.axis) !== JSON.stringify(origin.axis) ||
        current.unit !== origin.unit)
      return { status: "withheld", reason: "profile-changed" };
  } catch { return { status: "withheld", reason: "profile-invalid" }; }
  return projectVectorField3DComparisonStatus(project, result, verifiedTransfer);
}
