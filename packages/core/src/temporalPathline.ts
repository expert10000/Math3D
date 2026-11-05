import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { canonicalJsonStringify } from "./documentIdentity";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createVerifiedTemporalFieldSampler, projectTemporalFieldSourceStatus,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";

type Vec3 = readonly [number, number, number];
export type TemporalPathlineRecipe = Readonly<{ seed: Vec3; startTime: number;
  endTime: number; maxSteps: number; method: "fixed-rk4" }>;
export type TemporalPathlineStopReason = "time-end" | "boundary" | "unavailable";
export type TemporalPathlineOptions = Readonly<{
  transfers?: VerifiedTemporalTransfers;
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  currentProject?: () => Math3DProject;
  verifyBeforePublish?: () => Promise<VerifiedTemporalTransfers | undefined>;
}>;

const add = (a: Vec3, b: Vec3, scale: number): Vec3 =>
  [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const inside = (project: Math3DProject, temporal: TemporalFieldSourceDocument, point: Vec3) => {
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]?.documentId)?.checkpoint;
  return source?.format === "math3d.vector-field3d-document" &&
    point.every((value, axis) => Number.isFinite(value) &&
      value >= source.source.axes[axis]!.min && value <= source.source.axes[axis]!.max);
};

/** Bounded physical-time RK4. No Curve is published from cancelled or stale work. */
export async function computeTemporalPathline(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, recipe: TemporalPathlineRecipe,
  options: TemporalPathlineOptions = {}): Promise<CurveDocument> {
  if (recipe.method !== "fixed-rk4" || !Number.isSafeInteger(recipe.maxSteps) ||
      recipe.maxSteps < 2 || recipe.maxSteps > 512 ||
      !Number.isFinite(recipe.startTime) || !Number.isFinite(recipe.endTime) ||
      recipe.startTime >= recipe.endTime ||
      recipe.startTime < temporal.source.frames[0]!.time ||
      recipe.endTime > temporal.source.frames.at(-1)!.time ||
      recipe.seed.length !== 3 || !recipe.seed.every(Number.isFinite))
    throw new RangeError("Pathline needs a finite seed, saved time interval and 2–512 RK4 steps.");
  if (!inside(project, temporal, recipe.seed)) throw new RangeError("Pathline seed is outside the field domain.");
  const sample = createVerifiedTemporalFieldSampler(project, temporal, options.transfers);
  const check = () => {
    if (options.shouldCancel?.()) throw new Error("Pathline cancelled.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, options.transfers);
    if (status.status !== "current") throw new TypeError(`Pathline source withheld: ${status.reason}.`);
  };
  check();
  const h = (recipe.endTime - recipe.startTime) / recipe.maxSteps;
  const points: Vec3[] = [recipe.seed];
  let position = recipe.seed;
  let stopReason: TemporalPathlineStopReason = "time-end";
  for (let step = 0; step < recipe.maxSteps; step++) {
    if (options.shouldCancel?.()) throw new Error("Pathline cancelled.");
    const t = recipe.startTime + step * h;
    try {
      const k1 = sample(t, position).vector;
      const k2 = sample(t + h / 2, add(position, k1, h / 2)).vector;
      const k3 = sample(t + h / 2, add(position, k2, h / 2)).vector;
      const k4 = sample(t + h, add(position, k3, h)).vector;
      const next: Vec3 = [0, 1, 2].map(axis => position[axis]! + h *
        (k1[axis]! + 2 * k2[axis]! + 2 * k3[axis]! + k4[axis]!) / 6) as
        [number, number, number];
      if (!inside(project, temporal, next)) { stopReason = "boundary"; break; }
      position = next; points.push(position);
    } catch (cause) {
      if (cause instanceof RangeError && /outside|domain/i.test(cause.message))
        stopReason = "boundary";
      else stopReason = "unavailable";
      break;
    }
    options.onProgress?.(step + 1, recipe.maxSteps);
    if ((step + 1) % 16 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      check();
    }
  }
  if (points.length < 2) throw new TypeError(`Pathline has no publishable segment: ${stopReason}.`);
  check();
  if (temporal.schemaVersion === 3) {
    if (!options.verifyBeforePublish) throw new TypeError("Scientific pathline needs final source verification.");
    const finalTransfers = await options.verifyBeforePublish();
    const final = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, finalTransfers);
    if (final.status !== "current") throw new TypeError(`Pathline source withheld: ${final.reason}.`);
  }
  check();
  const first = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]!.documentId)!.checkpoint;
  if (first.format !== "math3d.vector-field3d-document") throw new TypeError("Pathline source missing.");
  const actualEnd = recipe.startTime + (points.length - 1) * h;
  const source: CurveDocumentSource = {
    representation: "polyline", dimension: 3,
    domain: { parameter: "t", min: recipe.startTime, max: actualEnd,
      closed: false, periodic: false },
    units: { position: first.source.axes[0].unit,
      parameter: temporal.source.timeAxis.unit, angle: "rad" },
    orientation: { direction: "forward", seed: recipe.seed }, derivatives: {},
    definition: { familyId: "vector3d.temporal-pathline",
      sourceIds: [temporal.identity.id, ...temporal.source.frames.map(frame => frame.documentId)],
      pointCount: points.length, points,
      settings: { temporalHash: temporal.identity.structuralHash,
        temporalRevision: temporal.identity.revision,
        generationHash: temporal.source.generationHash,
        startTime: recipe.startTime, requestedEndTime: recipe.endTime,
        actualEndTime: actualEnd, maxSteps: recipe.maxSteps,
        acceptedSteps: points.length - 1, evaluations: (points.length - 1) * 4,
        method: recipe.method, stopReason,
        seedX: recipe.seed[0], seedY: recipe.seed[1], seedZ: recipe.seed[2] } },
    dependencies: [{ temporalId: temporal.identity.id,
      temporalHash: temporal.identity.structuralHash,
      frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
        revision: frame.revision, structuralHash: frame.structuralHash })) }],
  };
  return createCurveDocument({ source, stableKey: { kind: "temporal-pathline",
    temporalId: temporal.identity.id, recipe },
    metadata: { title: `Pathline ${recipe.startTime}–${actualEndTimeLabel(actualEnd)}` } });
}

const actualEndTimeLabel = (value: number) => Number(value.toPrecision(8));

export function projectTemporalPathlineStatus(project: Math3DProject, curve: CurveDocument,
  transfers?: VerifiedTemporalTransfers): Readonly<{ status: "current" | "stale" | "unverified";
    reason: string | null }> {
  if (curve.source.definition.familyId !== "vector3d.temporal-pathline")
    return { status: "stale", reason: "wrong-curve-family" };
  const settings = curve.source.definition.settings;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === curve.source.definition.sourceIds?.[0]);
  if (!temporal) return { status: "stale", reason: "temporal-source-missing" };
  if (settings?.temporalHash !== temporal.identity.structuralHash ||
      settings?.temporalRevision !== temporal.identity.revision ||
      settings?.generationHash !== temporal.source.generationHash)
    return { status: "stale", reason: "temporal-source-changed" };
  const expected = curve.source.dependencies;
  if (canonicalJsonStringify(expected) !== canonicalJsonStringify([{
    temporalId: temporal.identity.id, temporalHash: temporal.identity.structuralHash,
    frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
      revision: frame.revision, structuralHash: frame.structuralHash })) }]))
    return { status: "stale", reason: "pathline-lineage-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  if (status.status !== "current") return { status: status.reason?.includes("verification") ?
    "unverified" : "stale", reason: status.reason };
  return { status: "current", reason: null };
}

export function upsertProjectTemporalPathline(project: Math3DProject,
  curve: CurveDocument, transfers?: VerifiedTemporalTransfers): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTemporalPathlineStatus(current, curve, transfers);
  if (status.status !== "current") throw new TypeError(`Pathline withheld: ${status.reason}.`);
  const settings = curve.source.definition.settings;
  if (settings?.method !== "fixed-rk4" ||
      !["time-end", "boundary", "unavailable"].includes(String(settings.stopReason)) ||
      !Number.isSafeInteger(settings.maxSteps) || Number(settings.maxSteps) > 512 ||
      !curve.source.definition.points ||
      curve.source.definition.pointCount !== curve.source.definition.points.length ||
      curve.source.definition.points.length > 513 ||
      curve.source.definition.points.length < 2)
    throw new TypeError("Invalid bounded pathline result.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, entries: [...current.workspace.entries.filter(item =>
      item.expected.id !== curve.identity.id),
      { module: "curve", checkpoint: curve, expected: curve.identity, replay: null }],
  }));
}
