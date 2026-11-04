import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createStableDocumentId, structuralHash } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { normalizeScientificSelection, type ScientificSelection } from "./scientificSelection";
import { upsertProjectScientificSelection } from "./projectScientificSelections";
import { reviseVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { integrateVectorField3DTrajectories, type VectorField3DStopReason } from "./vectorField3DTrajectories";
import { viewerSourceFromDocument } from "./viewerProvenance";

type Vec3 = readonly [number, number, number];
export type TrajectorySeedRecipe = Extract<ScientificSelection["geometry"],
  { kind: "trajectory-seed-recipe" }>["recipe"];
export type TrajectoryCurvePromotion = Readonly<{ curve: CurveDocument;
  source: VectorField3DDocument; selection: ScientificSelection;
  seedId: string; stopReason: VectorField3DStopReason }>;

export function trajectorySeedPositions(recipe: TrajectorySeedRecipe): readonly Vec3[] {
  const positions: Vec3[] = [];
  if (recipe.kind === "point-set") positions.push(...recipe.points);
  else if (recipe.kind === "line") for (let i = 0; i < recipe.count; i++) {
    const t = i / (recipe.count - 1);
    positions.push(recipe.start.map((v, axis) => v + t * (recipe.end[axis]! - v)) as unknown as Vec3);
  } else if (recipe.kind === "ring") {
    const tangent = [0, 1, 2].filter(axis => axis !== recipe.normalAxis);
    for (let i = 0; i < recipe.count; i++) {
      const point = [...recipe.center];
      point[tangent[0]!] += recipe.radius * Math.cos(2 * Math.PI * i / recipe.count);
      point[tangent[1]!] += recipe.radius * Math.sin(2 * Math.PI * i / recipe.count);
      positions.push(point as unknown as Vec3);
    }
  } else {
    const tangent = [0, 1, 2].filter(axis => axis !== recipe.normalAxis);
    for (let i = 0; i < recipe.counts[0]; i++) for (let j = 0; j < recipe.counts[1]; j++) {
      const point = [0, 0, 0]; point[recipe.normalAxis] = recipe.coordinate;
      point[tangent[0]!] = recipe.bounds[0][0] + i *
        (recipe.bounds[0][1] - recipe.bounds[0][0]) / (recipe.counts[0] - 1);
      point[tangent[1]!] = recipe.bounds[1][0] + j *
        (recipe.bounds[1][1] - recipe.bounds[1][0]) / (recipe.counts[1] - 1);
      positions.push(point as unknown as Vec3);
    }
  }
  return positions;
}

/** Returns the revised source and the recipe pinned to exactly that generation. */
export function prepareVectorField3DTrajectorySeeds(document: VectorField3DDocument,
  recipe: TrajectorySeedRecipe, stableKey: string): Readonly<{
    document: VectorField3DDocument; selection: ScientificSelection }> {
  const id = createStableDocumentId("scientific-selection", { sourceId: document.identity.id, stableKey });
  const candidate = { format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "authored", id }, role: "analysis", source: null,
    frame: { kind: "cartesian", axes: document.source.axes.map(axis =>
      ({ name: axis.label, unit: axis.unit })) },
    geometry: { kind: "trajectory-seed-recipe", recipe } };
  const checked = normalizeScientificSelection(candidate);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const positions = trajectorySeedPositions(recipe);
  if (positions.some(point => point.some((value, axis) =>
      value < document.source.axes[axis]!.min || value > document.source.axes[axis]!.max)))
    throw new RangeError("Every generated trajectory seed must lie inside the source domain.");
  const prefix = structuralHash({ id, recipe }).slice(7, 19);
  const seeds = positions.map((position, index) =>
    ({ id: `recipe-${prefix}-${index}`, position, group: `recipe-${prefix}` }));
  const revised = reviseVectorField3DDocument(document, { ...document.source, seeds });
  const pinned = normalizeScientificSelection({ ...candidate,
    source: { kind: "document", documentId: revised.identity.id,
      checkpoint: { revision: revised.identity.revision,
        structuralHash: revised.identity.structuralHash } } });
  if (!pinned.ok) throw new TypeError(pinned.errors.join(" "));
  return { document: revised, selection: pinned.value };
}

export function upsertProjectTrajectorySeedRecipe(project: Math3DProject,
  document: VectorField3DDocument, selection: ScientificSelection): Math3DProject {
  if (selection.geometry.kind !== "trajectory-seed-recipe" ||
      selection.source?.kind !== "document" ||
      selection.source.checkpoint?.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Seed recipe must be pinned to the revised vector source.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (!current.workspace.entries.some(item => item.module === "vector3d" &&
      item.expected.id === document.identity.id))
    throw new TypeError("The Project does not contain this vector source.");
  const replaced = replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, entries: current.workspace.entries.map(item =>
      item.module === "vector3d" && item.expected.id === document.identity.id ?
        { ...item, checkpoint: document, expected: document.identity } : item) }));
  return upsertProjectScientificSelection(replaced, selection);
}

export function promoteVectorField3DTrajectory(document: VectorField3DDocument,
  selection: ScientificSelection, seedIndex: number,
  direction: "forward" | "backward" = "forward"): TrajectoryCurvePromotion {
  if (selection.identity.kind !== "authored" || selection.geometry.kind !== "trajectory-seed-recipe" ||
      selection.source?.kind !== "document" ||
      selection.source.documentId !== document.identity.id ||
      selection.source.checkpoint?.revision !== document.identity.revision ||
      selection.source.checkpoint.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Trajectory recipe is stale or belongs to another source.");
  const positions = trajectorySeedPositions(selection.geometry.recipe);
  if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= positions.length)
    throw new RangeError("Choose a seed from the saved recipe.");
  const seed = document.source.seeds[seedIndex];
  if (!seed || seed.position.some((value, axis) => value !== positions[seedIndex]![axis]))
    throw new TypeError("Saved source seeds no longer match the recipe.");
  const artifact = integrateVectorField3DTrajectories(document, { seedIds: [seed.id], direction });
  const trajectory = artifact.trajectories[0]!;
  if (trajectory.stopReason === "cancelled" || trajectory.points.length < 2)
    throw new TypeError(`Trajectory cannot become a Curve: ${trajectory.stopReason}.`);
  const stride = Math.max(1, Math.ceil((trajectory.points.length - 1) / 255));
  const sampled = trajectory.points.filter((_, index) => index % stride === 0 ||
    index === trajectory.points.length - 1);
  const mode = artifact.solver.mode;
  const parameters = sampled.map(point => mode === "time-trajectory" ? point.time : point.arcLength);
  const source: CurveDocumentSource = {
    representation: "polyline", dimension: 3,
    domain: { parameter: mode === "time-trajectory" ? "t" : "s",
      min: Math.min(...parameters), max: Math.max(...parameters), closed: false, periodic: false },
    units: { position: document.source.axes[0].unit,
      parameter: artifact.solver.parameterUnit, angle: "rad" },
    orientation: { direction, seedId: seed.id }, derivatives: {},
    definition: { familyId: "vector3d.trajectory", sourceIds: [document.identity.id],
      pointCount: sampled.length, points: sampled.map(point => point.position),
      settings: { sourceRevision: document.identity.revision,
        sourceStructuralHash: document.identity.structuralHash,
        selectionId: selection.identity.id, selectionHash: structuralHash(selection),
        seedId: seed.id, direction, solverMethod: artifact.solver.method,
        solverMode: mode, parameterUnit: artifact.solver.parameterUnit,
        stopReason: trajectory.stopReason, stopDetail: trajectory.stopDetail,
        acceptedSteps: trajectory.acceptedSteps, rejectedSteps: trajectory.rejectedSteps,
        evaluations: trajectory.evaluations,
        maxEstimatedLocalError: trajectory.maxEstimatedLocalError,
        absoluteTolerance: artifact.solver.absoluteTolerance,
        relativeTolerance: artifact.solver.relativeTolerance,
        parameterLimit: artifact.solver.parameterLimit,
        originalPointCount: trajectory.points.length } },
    dependencies: [{ sourceId: document.identity.id,
      revision: document.identity.revision,
      structuralHash: document.identity.structuralHash,
      selectionId: selection.identity.id, selectionHash: structuralHash(selection) }] };
  const curve = createCurveDocument({ source,
    stableKey: { operation: "vector3d.promote-trajectory", sourceId: document.identity.id,
      selectionId: selection.identity.id, seedId: seed.id, direction },
    metadata: { title: `Trajectory ${seed.id}` } });
  return { curve, source: document, selection, seedId: seed.id,
    stopReason: trajectory.stopReason };
}

export function upsertProjectTrajectoryCurve(project: Math3DProject,
  promotion: TrajectoryCurvePromotion): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTrajectoryCurveStatus(current, promotion.curve);
  if (status.status !== "current") throw new TypeError(`Cannot save stale Curve: ${status.reason}.`);
  const orientation = promotion.curve.source.orientation as { direction?: string };
  const expected = promoteVectorField3DTrajectory(promotion.source, promotion.selection,
    promotion.source.source.seeds.findIndex(seed => seed.id === promotion.seedId),
    orientation?.direction === "backward" ? "backward" : "forward");
  if (structuralHash(expected.curve.source) !== structuralHash(promotion.curve.source))
    throw new TypeError("Curve samples or solver provenance no longer match the source.");
  const relation = createDocumentRelation({ kind: "promoted-from",
    sources: [viewerSourceFromDocument(promotion.source)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(promotion.curve) },
    operation: "vector3d.promote-trajectory",
    parameters: { selectionId: promotion.selection.identity.kind === "authored" ?
      promotion.selection.identity.id : "", selectionHash: structuralHash(promotion.selection),
      seedId: promotion.seedId, stopReason: promotion.stopReason } });
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    entries: [...current.workspace.entries.filter(item => item.expected.id !== promotion.curve.identity.id),
      { module: "curve", checkpoint: promotion.curve, expected: promotion.curve.identity, replay: null }],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}

export function projectTrajectoryCurveStatus(project: Math3DProject,
  curve: CurveDocument, liveSource?: VectorField3DDocument): Readonly<{
    status: "current" | "stale"; reason: string | null }> {
  if (curve.source.definition.familyId !== "vector3d.trajectory")
    return { status: "stale", reason: "wrong-curve-family" };
  const settings = curve.source.definition.settings;
  const reasons: readonly VectorField3DStopReason[] = ["boundary", "stationary", "undefined",
    "step-limit", "time-limit", "line-limit", "length-limit", "cancelled", "solver-failure"];
  if (!reasons.includes(settings?.stopReason as VectorField3DStopReason) ||
      settings?.stopReason === "cancelled" ||
      (settings?.solverMode !== "time-trajectory" && settings?.solverMode !== "normalized-field-line") ||
      curve.source.domain.parameter !== (settings.solverMode === "time-trajectory" ? "t" : "s") ||
      curve.source.units.parameter !== settings.parameterUnit)
    return { status: "stale", reason: "invalid-solver-provenance" };
  const sourceId = curve.source.definition.sourceIds?.[0];
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === sourceId)?.checkpoint;
  if (source?.format !== "math3d.vector-field3d-document")
    return { status: "stale", reason: "source-missing" };
  if ([source, liveSource].some(doc => doc && (doc.identity.id !== sourceId ||
      doc.identity.revision !== settings?.sourceRevision ||
      doc.identity.structuralHash !== settings?.sourceStructuralHash)))
    return { status: "stale", reason: "source-changed" };
  const selection = project.workspace.scientificSelections?.find(item =>
    item.identity.kind === "authored" && item.identity.id === settings?.selectionId);
  if (!selection) return { status: "stale", reason: "recipe-missing" };
  if (structuralHash(selection) !== settings?.selectionHash)
    return { status: "stale", reason: "recipe-changed" };
  return { status: "current", reason: null };
}
