import { structuralHash } from "./documentIdentity";
import { normalizeDerivedFieldProfileResult, type DerivedFieldProfileResult } from "./derivedFieldProfileResult";
import { parseMath3DProject, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { currentProjectDerivedFieldResult, reviewProjectDerivedField,
  type DerivedSourceVerification } from "./projectDerivedFields";
import { matchesScientificSourceGeneration } from "./scientificJobs";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import type { Graph2DProjectProfileOrigin } from "./graph2dDocument";
import type { ScientificSelection } from "./scientificSelection";

export type ProjectProfileGraphStatus = Readonly<{ status: "current" | "withheld";
  reason: "project-missing" | "source-missing" | "source-unverified" | "source-changed" |
    "recipe-changed" | "selection-missing" | "selection-changed" | null }>;

const chain = (project: Math3DProject, profileId: string) => {
  const fields = project.workspace.derivedFields ?? [];
  const profile = fields.find(item => item.identity.id === profileId);
  const plane = profile?.input.kind === "derived" ? fields.find(item =>
    item.identity.id === profile.input.documentId) : null;
  const magnitude = plane?.input.kind === "derived" ? fields.find(item =>
    item.identity.id === plane.input.documentId) : null;
  if (!profile || profile.operation.kind !== "line-profile" || !plane ||
      plane.operation.kind !== "plane-slice" || !magnitude ||
      magnitude.operation.kind !== "vector-magnitude" || magnitude.input.kind !== "vector3d")
    return null;
  return { profile, plane, magnitude, source: magnitude.input };
};

export const projectProfileGraphRows = (result: DerivedFieldProfileResult): readonly Graph2DPointRow[] =>
  result.rows.map((row, index) => ({ id: `row_${index + 1}`, x: row.x, y: row.y }));

/** Reuse a saved physical line, retaining its actual identity and absent pins. */
export const findProjectProfileSelection = (project: Math3DProject, profileId: string): ScientificSelection | null => {
  const found = chain(project, profileId);
  if (!found) return null;
  const { source, plane, profile } = found;
  const planeOperation = plane.operation, profileOperation = profile.operation;
  if (planeOperation.kind !== "plane-slice" || profileOperation.kind !== "line-profile") return null;
  const normalAxis = planeOperation.normalAxis, varyingAxis = profileOperation.varyingAxis;
  const fixedAxis = [0, 1, 2].find(axis => axis !== normalAxis && axis !== varyingAxis)!;
  return [...(project.workspace.scientificSelections ?? [])].filter(item =>
    item.identity.kind === "authored" && item.geometry.kind === "axis-line" &&
    source.shape.axes.every((axis, index) => item.frame.axes[index]?.name === axis.name &&
      item.frame.axes[index]?.unit === axis.unit) &&
    item.geometry.varyingAxis === varyingAxis &&
    item.geometry.fixedCoordinates[normalAxis] === planeOperation.coordinate &&
    item.geometry.fixedCoordinates[fixedAxis] === profileOperation.fixedCoordinate &&
    item.geometry.extent[0] <= profileOperation.extent[0] &&
    item.geometry.extent[1] >= profileOperation.extent[1] &&
    (item.source?.kind === "document" && item.source.documentId === source.documentId &&
      (item.source.checkpoint === null || item.source.checkpoint.revision === source.revision &&
        item.source.checkpoint.structuralHash === source.structuralHash) ||
      item.source === null && item.identity.kind === "authored" &&
        item.identity.migratedFrom?.ownerDocumentId === source.documentId))
    .sort((left, right) => Number(right.identity.kind === "authored" &&
      right.identity.migratedFrom?.ownerDocumentId === source.documentId) -
      Number(left.identity.kind === "authored" &&
        left.identity.migratedFrom?.ownerDocumentId === source.documentId))[0] ?? null;
};

export const createProjectProfileGraphOrigin = (project: Math3DProject, profileId: string,
  result: DerivedFieldProfileResult, verifySource: DerivedSourceVerification): Graph2DProjectProfileOrigin => {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const found = chain(current, profileId), selection = findProjectProfileSelection(current, profileId);
  const checked = normalizeDerivedFieldProfileResult(result);
  if (!found || !selection || selection.identity.kind !== "authored" || !checked.ok ||
      !currentProjectDerivedFieldResult(current, profileId,
        { cacheKey: result.cacheKey, value: result }, verifySource) ||
      result.profileId !== profileId ||
      !matchesScientificSourceGeneration(result.source, {
        documentId: found.source.documentId, revision: found.source.revision,
        structuralHash: found.source.structuralHash, generation: found.source.revision }))
    throw new TypeError("A current verified profile and matching saved line selection are required.");
  return { kind: "project-derived-profile/v1", projectId: current.identity.id,
    profileId, source: result.source,
    recipe: [found.magnitude, found.plane, found.profile].map(item => ({
      documentId: item.identity.id, revision: item.identity.revision,
      structuralHash: item.identity.structuralHash })),
    selection: { id: selection.identity.id, structuralHash: structuralHash(selection) },
    cacheKey: result.cacheKey, rowsSha256: structuralHash(projectProfileGraphRows(result)),
    method: result.method, axis: result.axis, unit: result.unit };
};

/** Saved Graph rows are available only while every Project reference still matches. */
export const projectProfileGraphStatus = (project: Math3DProject | null | undefined,
  origin: Graph2DProjectProfileOrigin, verifySource: DerivedSourceVerification): ProjectProfileGraphStatus => {
  if (!project || project.identity.id !== origin.projectId)
    return { status: "withheld", reason: "project-missing" };
  const found = chain(project, origin.profileId);
  if (!found) return { status: "withheld", reason: "recipe-changed" };
  const sourceEntry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === origin.source.documentId);
  if (!sourceEntry) return { status: "withheld", reason: "source-missing" };
  if (sourceEntry.expected.revision !== origin.source.revision ||
      sourceEntry.expected.structuralHash !== origin.source.structuralHash)
    return { status: "withheld", reason: "source-changed" };
  const actual = [found.magnitude, found.plane, found.profile];
  if (actual.some((item, index) => item.identity.id !== origin.recipe[index]?.documentId ||
      item.identity.revision !== origin.recipe[index]?.revision ||
      item.identity.structuralHash !== origin.recipe[index]?.structuralHash))
    return { status: "withheld", reason: "recipe-changed" };
  const review = reviewProjectDerivedField(project, origin.profileId, verifySource);
  if (review.status === "missing") return { status: "withheld", reason: "source-missing" };
  if (review.status === "unverified") return { status: "withheld", reason: "source-unverified" };
  if (review.status !== "current" || review.cacheKey !== origin.cacheKey)
    return { status: "withheld", reason: "recipe-changed" };
  const selection = project.workspace.scientificSelections?.find(item =>
    item.identity.kind === "authored" && item.identity.id === origin.selection.id);
  if (!selection) return { status: "withheld", reason: "selection-missing" };
  if (structuralHash(selection) !== origin.selection.structuralHash)
    return { status: "withheld", reason: "selection-changed" };
  if (found.profile.output.axes[0]?.name !== origin.axis.name ||
      found.profile.output.axes[0]?.unit !== origin.axis.unit ||
      found.profile.output.axes[0]?.min !== origin.axis.min ||
      found.profile.output.axes[0]?.max !== origin.axis.max ||
      found.profile.output.unit !== origin.unit)
    return { status: "withheld", reason: "recipe-changed" };
  return { status: "current", reason: null };
};
