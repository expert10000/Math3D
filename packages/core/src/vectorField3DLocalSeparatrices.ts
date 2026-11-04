import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createDocumentRelation } from "./documentRelations";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createVectorField3DDocument, type VectorField3DDocument,
  type VectorField3DEquilibriumConstruction } from "./vectorField3DDocument";
import { analyzeVectorField3DEigenvalues } from "./vectorField3DEigenanalysis";
import { type VectorField3DEquilibriumSearch } from "./vectorField3DEquilibria";
import { integrateVectorField3DTrajectories } from "./vectorField3DTrajectories";
import { viewerSourceFromDocument } from "./viewerProvenance";

type Vec3 = readonly [number, number, number];
export type LocalEigendirection = Readonly<{ eigenvalue: number; vector: Vec3;
  branch: "stable" | "unstable"; index: number }>;
export type LocalTopology = Readonly<{ status: "resolved" | "unavailable";
  label: string; directions: readonly LocalEigendirection[]; reason: string | null;
  conditionEstimate: number | null }>;
export type LocalSeparatrixPromotion = Readonly<{ curve: CurveDocument;
  source: VectorField3DDocument; construction: VectorField3DEquilibriumConstruction;
  branch: "stable" | "unstable"; offset: number }>;

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: Vec3) => Math.hypot(...v);

/** Real, separated eigendirections only. Classifications describe local linear behavior. */
export function analyzeVectorField3DLocalTopology(search: VectorField3DEquilibriumSearch,
  candidateIndex: number): LocalTopology {
  const candidate = search.candidates[candidateIndex];
  const unavailable = (reason: string): LocalTopology => ({ status: "unavailable",
    label: `Local ${candidate?.classification ?? "equilibrium"}`, directions: [], reason,
    conditionEstimate: candidate?.conditionEstimate ?? null });
  if (!candidate || !candidate.jacobian || !candidate.eigenvalues ||
      candidate.residual > search.residualTolerance)
    return unavailable("A converged equilibrium with a verified Jacobian is required.");
  const analysis = analyzeVectorField3DEigenvalues(candidate.jacobian,
    candidate.eigenvalueUnit, candidate.diagnostics.some(message => /boundary|two-point/i.test(message)));
  if (analysis.status !== "resolved" || !analysis.eigenvalues ||
      analysis.conditionEstimate === null || analysis.conditionEstimate >= 1e8)
    return unavailable("Jacobian eigendirections are poorly conditioned or uncertain.");
  const roots = analysis.eigenvalues;
  if (roots.some(root => Math.abs(root.imaginary) > 1e-10 ||
      Math.abs(root.real) <= 1e-10) || roots.some((root, i) => roots.some((other, j) =>
        j !== i && Math.abs(root.real - other.real) <= 1e-7 *
          Math.max(1, Math.abs(root.real), Math.abs(other.real)))))
    return unavailable("Only separated, nonzero real eigenvalues have seedable one-dimensional branches.");
  const directions: LocalEigendirection[] = [];
  for (const [index, root] of roots.entries()) {
    const rows = candidate.jacobian.map((row, i) => row.map((value, j) =>
      value - (i === j ? root.real : 0)) as unknown as Vec3);
    const pairs: readonly [number, number][] = [[0, 1], [0, 2], [1, 2]];
    const vectors = pairs.map(([i, j]) => cross(rows[i]!, rows[j]!));
    const strongest = vectors.sort((a, b) => norm(b) - norm(a))[0]!;
    const length = norm(strongest);
    const matrixScale = Math.max(1, ...candidate.jacobian.flat().map(Math.abs));
    if (length <= 1e-10 * matrixScale ** 2) return unavailable("An eigendirection is numerically unresolved.");
    const vector = strongest.map(value => value / length) as unknown as Vec3;
    const residual = Math.hypot(...rows.map(row => row.reduce((sum, value, j) =>
      sum + value * vector[j]!, 0)));
    if (residual > 1e-6 * matrixScale)
      return unavailable("An eigenvector residual exceeds the local tolerance.");
    directions.push({ eigenvalue: root.real, vector,
      branch: root.real < 0 ? "stable" : "unstable", index });
  }
  return { status: "resolved", label: `Local ${candidate.classification}`,
    directions, reason: null, conditionEstimate: analysis.conditionEstimate };
}

/** Integrate ± offsets from one saved equilibrium; the transient seed never revises the pinned source. */
export function promoteVectorField3DLocalSeparatrix(document: VectorField3DDocument,
  search: VectorField3DEquilibriumSearch, constructionId: string,
  eigenIndex: number, side: -1 | 1,
  offsetFraction = .01): LocalSeparatrixPromotion {
  if (document.source.field.kind !== "expressions")
    throw new TypeError("Verified scientific source branch integration needs a verified sampler.");
  if (search.source.documentId !== document.identity.id ||
      search.source.revision !== document.identity.revision ||
      search.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Equilibrium search is stale for this source generation.");
  const construction = document.workspace?.equilibriumConstructions.find(item => item.id === constructionId);
  if (!construction || construction.sourceRevision !== document.identity.revision ||
      construction.sourceStructuralHash !== document.identity.structuralHash ||
      construction.sourceHash !== search.sourceHash)
    throw new TypeError("Save the current equilibrium construction before promoting a branch.");
  const candidateIndex = search.candidates.findIndex(item => item.position.every((value, i) =>
    Math.abs(value - construction.position[i]!) <= 1e-9 && item.residual === construction.residual));
  const topology = analyzeVectorField3DLocalTopology(search, candidateIndex);
  const direction = topology.directions.find(item => item.index === eigenIndex);
  if (!direction) throw new TypeError(topology.reason ?? "Eigendirection is unavailable.");
  if (side !== -1 && side !== 1) throw new TypeError("Branch side must be +1 or -1.");
  if (!Number.isFinite(offsetFraction) || offsetFraction < .0001 || offsetFraction > .05)
    throw new RangeError("Offset fraction must lie between 0.0001 and 0.05 of the shortest axis span.");
  const span = Math.min(...document.source.axes.map(axis => axis.max - axis.min));
  const offset = span * offsetFraction;
  const position = construction.position.map((value, i) => value + side * offset * direction.vector[i]!) as unknown as Vec3;
  if (position.some((value, i) => value <= document.source.axes[i]!.min ||
      value >= document.source.axes[i]!.max))
    throw new RangeError("The local branch seed lies outside the source domain.");
  const seedId = `local-${construction.id}-${eigenIndex}-${side === 1 ? "plus" : "minus"}`;
  const transient = createVectorField3DDocument({ ...document.source,
    seeds: [{ id: seedId, position }], solver: { ...document.source.solver,
      maxSteps: Math.min(document.source.solver.maxSteps, 512) } },
    { stableKey: { source: document.identity.id, seedId } });
  const travel = direction.branch === "stable" ? "backward" : "forward";
  const artifact = integrateVectorField3DTrajectories(transient, { seedIds: [seedId], direction: travel });
  const path = artifact.trajectories[0]!;
  if (path.points.length < 2 || path.stopReason === "cancelled")
    throw new TypeError(`Branch integration is unavailable: ${path.stopReason}.`);
  const stride = Math.max(1, Math.ceil((path.points.length - 1) / 255));
  const sampled = path.points.filter((_, index) => index % stride === 0 || index === path.points.length - 1);
  const parameter = sampled.map(point => point.time);
  const source: CurveDocumentSource = {
    representation: "polyline", dimension: 3,
    domain: { parameter: "t", min: Math.min(...parameter), max: Math.max(...parameter),
      closed: false, periodic: false },
    units: { position: document.source.axes[0].unit, parameter: document.source.timeUnit, angle: "rad" },
    orientation: { branch: direction.branch, travel, side }, derivatives: {},
    definition: { familyId: "vector3d.local-separatrix", sourceIds: [document.identity.id],
      pointCount: sampled.length, points: sampled.map(point => point.position),
      settings: { sourceRevision: document.identity.revision,
        sourceStructuralHash: document.identity.structuralHash,
        constructionId, constructionHash: structuralHash(construction),
        localClassification: topology.label, eigenIndex, eigenvalue: direction.eigenvalue,
        eigenvectorX: direction.vector[0], eigenvectorY: direction.vector[1],
        eigenvectorZ: direction.vector[2], branch: direction.branch, side,
        offsetFraction, offset, solverMethod: artifact.solver.method,
        solverMode: artifact.solver.mode, maxSteps: transient.source.solver.maxSteps,
        stopReason: path.stopReason, acceptedSteps: path.acceptedSteps,
        rejectedSteps: path.rejectedSteps, evaluations: path.evaluations } },
    dependencies: [{ sourceId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, constructionId,
      constructionHash: structuralHash(construction) }] };
  const curve = createCurveDocument({ source,
    stableKey: { operation: "vector3d.local-separatrix", sourceId: document.identity.id,
      constructionId, eigenIndex, side },
    metadata: { title: `${topology.label} ${direction.branch} ${side === 1 ? "+" : "−"}` } });
  return { curve, source: document, construction, branch: direction.branch, offset };
}

export function projectLocalSeparatrixStatus(project: Math3DProject,
  curve: CurveDocument): Readonly<{ status: "current" | "stale"; reason: string | null }> {
  if (curve.source.definition.familyId !== "vector3d.local-separatrix")
    return { status: "stale", reason: "wrong-curve-family" };
  const settings = curve.source.definition.settings;
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === curve.source.definition.sourceIds?.[0])?.checkpoint;
  if (source?.format !== "math3d.vector-field3d-document")
    return { status: "stale", reason: "source-missing" };
  if (source.identity.revision !== settings?.sourceRevision ||
      source.identity.structuralHash !== settings?.sourceStructuralHash)
    return { status: "stale", reason: "source-changed" };
  const construction = source.workspace?.equilibriumConstructions.find(item => item.id === settings?.constructionId);
  if (!construction) return { status: "stale", reason: "equilibrium-missing" };
  if (structuralHash(construction) !== settings?.constructionHash)
    return { status: "stale", reason: "equilibrium-changed" };
  return { status: "current", reason: null };
}

export function upsertProjectLocalSeparatrix(project: Math3DProject,
  promotion: LocalSeparatrixPromotion): Math3DProject {
  const previous = parseMath3DProject(serializeMath3DProject(project));
  const savedSource = previous.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === promotion.source.identity.id)?.checkpoint;
  if (savedSource?.format !== "math3d.vector-field3d-document" ||
      savedSource.identity.revision !== promotion.source.identity.revision ||
      savedSource.identity.structuralHash !== promotion.source.identity.structuralHash ||
      !promotion.source.workspace?.equilibriumConstructions.some(item =>
        item.id === promotion.construction.id && structuralHash(item) === structuralHash(promotion.construction)))
    throw new TypeError("The saved Project source and local equilibrium generation must match.");
  const current = replaceMath3DProjectWorkspace(previous, createMixedWorkspaceDocument({
    ...previous.workspace, entries: previous.workspace.entries.map(item =>
      item.module === "vector3d" && item.expected.id === promotion.source.identity.id ?
        { ...item, checkpoint: promotion.source, expected: promotion.source.identity } : item) }));
  if (projectLocalSeparatrixStatus(current, promotion.curve).status !== "current")
    throw new TypeError("Save the matching field and equilibrium before promoting a branch.");
  const settings = promotion.curve.source.definition.settings!;
  const relation = createDocumentRelation({ kind: "promoted-from",
    sources: [viewerSourceFromDocument(promotion.source)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(promotion.curve) },
    operation: "vector3d.local-separatrix",
    parameters: { constructionId: promotion.construction.id,
      constructionHash: structuralHash(promotion.construction), branch: promotion.branch,
      eigenIndex: settings.eigenIndex!, side: settings.side!, offset: promotion.offset } });
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    entries: [...current.workspace.entries.filter(item => item.expected.id !== promotion.curve.identity.id),
      { module: "curve", checkpoint: promotion.curve, expected: promotion.curve.identity, replay: null }],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}
