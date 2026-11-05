import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { canonicalJsonStringify } from "./documentIdentity";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createVerifiedTemporalFieldSampler, projectTemporalFieldSourceStatus,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from
  "./temporalFieldSourceDocument";

type Vec3 = readonly [number, number, number];
export type TemporalStreaklineRecipe = Readonly<{ seed: Vec3; releaseStart: number;
  releaseEnd: number; observationTime: number; releaseCount: number;
  stepsPerParticle: number; method: "fixed-rk4" }>;
export type TemporalStreaklineOptions = Readonly<{
  transfers?: VerifiedTemporalTransfers; shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  currentProject?: () => Math3DProject;
  verifyBeforePublish?: () => Promise<VerifiedTemporalTransfers | undefined>;
}>;

const advance = (p: Vec3, v: Vec3, h: number): Vec3 =>
  [p[0] + v[0] * h, p[1] + v[1] * h, p[2] + v[2] * h];

/** A line of particle locations at one observation time, ordered by release time. */
export async function computeTemporalStreakline(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, recipe: TemporalStreaklineRecipe,
  options: TemporalStreaklineOptions = {}): Promise<CurveDocument> {
  const firstTime = temporal.source.frames[0]?.time;
  const lastTime = temporal.source.frames.at(-1)?.time;
  const total = recipe.releaseCount * recipe.stepsPerParticle;
  if (recipe.method !== "fixed-rk4" || recipe.seed.length !== 3 ||
      !recipe.seed.every(Number.isFinite) ||
      ![recipe.releaseStart, recipe.releaseEnd, recipe.observationTime].every(Number.isFinite) ||
      firstTime === undefined || lastTime === undefined ||
      recipe.releaseStart < firstTime || recipe.releaseStart >= recipe.releaseEnd ||
      recipe.releaseEnd >= recipe.observationTime || recipe.observationTime > lastTime ||
      !Number.isSafeInteger(recipe.releaseCount) || recipe.releaseCount < 2 ||
      recipe.releaseCount > 16 || !Number.isSafeInteger(recipe.stepsPerParticle) ||
      recipe.stepsPerParticle < 2 || recipe.stepsPerParticle > 64 || total > 512)
    throw new RangeError("Streakline needs 2–16 releases, 2–64 steps per particle and at most 512 steps total.");
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]!.documentId)?.checkpoint;
  if (source?.format !== "math3d.vector-field3d-document")
    throw new TypeError("Streakline source frame is missing.");
  const inside = (point: Vec3) => point.every((value, axis) =>
    Number.isFinite(value) && value >= source.source.axes[axis]!.min &&
    value <= source.source.axes[axis]!.max);
  if (!inside(recipe.seed)) throw new RangeError("Streakline seed is outside the field domain.");
  const sample = createVerifiedTemporalFieldSampler(project, temporal, options.transfers);
  const check = () => {
    if (options.shouldCancel?.()) throw new Error("Streakline cancelled.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, options.transfers);
    if (status.status !== "current")
      throw new TypeError(`Streakline source withheld: ${status.reason}.`);
  };
  check();
  const points: Vec3[] = [];
  for (let release = 0; release < recipe.releaseCount; release++) {
    const releaseTime = recipe.releaseStart + (recipe.releaseEnd - recipe.releaseStart) *
      release / (recipe.releaseCount - 1);
    const h = (recipe.observationTime - releaseTime) / recipe.stepsPerParticle;
    let position = recipe.seed;
    for (let step = 0; step < recipe.stepsPerParticle; step++) {
      if (options.shouldCancel?.()) throw new Error("Streakline cancelled.");
      const t = releaseTime + step * h;
      const tNext = step === recipe.stepsPerParticle - 1 ? recipe.observationTime :
        releaseTime + (step + 1) * h;
      const stepSize = tNext - t;
      let next: Vec3;
      try {
        const k1 = sample(t, position).vector;
        const k2 = sample(t + stepSize / 2, advance(position, k1, stepSize / 2)).vector;
        const k3 = sample(t + stepSize / 2, advance(position, k2, stepSize / 2)).vector;
        const k4 = sample(tNext, advance(position, k3, stepSize)).vector;
        next = [0, 1, 2].map(axis => position[axis]! + stepSize *
          (k1[axis]! + 2 * k2[axis]! + 2 * k3[axis]! + k4[axis]!) / 6) as
          [number, number, number];
      } catch (cause) {
        throw new TypeError(`Streakline unavailable for release ${release + 1}: ` +
          (cause instanceof Error ? cause.message : String(cause)));
      }
      if (!inside(next)) throw new TypeError(`Streakline partial: release ${release + 1} left the domain.`);
      position = next;
      const done = release * recipe.stepsPerParticle + step + 1;
      options.onProgress?.(done, total);
      if (done % 16 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); }
    }
    check();
    points.push(position);
  }
  check();
  if (temporal.schemaVersion === 3) {
    if (!options.verifyBeforePublish)
      throw new TypeError("Scientific streakline needs final source verification.");
    const final = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, await options.verifyBeforePublish());
    if (final.status !== "current")
      throw new TypeError(`Streakline source withheld: ${final.reason}.`);
  }
  check();
  const curveSource: CurveDocumentSource = {
    representation: "polyline", dimension: 3,
    domain: { parameter: "releaseTime", min: recipe.releaseStart,
      max: recipe.releaseEnd, closed: false, periodic: false },
    units: { position: source.source.axes[0].unit,
      parameter: temporal.source.timeAxis.unit, angle: "rad" },
    orientation: { direction: "release-order", seed: recipe.seed }, derivatives: {},
    definition: { familyId: "vector3d.temporal-streakline",
      sourceIds: [temporal.identity.id, ...temporal.source.frames.map(frame => frame.documentId)],
      pointCount: points.length, points,
      settings: { temporalHash: temporal.identity.structuralHash,
        temporalRevision: temporal.identity.revision,
        generationHash: temporal.source.generationHash,
        releaseStart: recipe.releaseStart, releaseEnd: recipe.releaseEnd,
        observationTime: recipe.observationTime, releaseCount: recipe.releaseCount,
        stepsPerParticle: recipe.stepsPerParticle, evaluations: total * 4,
        method: recipe.method, stopReason: "observation-time",
        seedX: recipe.seed[0], seedY: recipe.seed[1], seedZ: recipe.seed[2] } },
    dependencies: [{ temporalId: temporal.identity.id,
      temporalHash: temporal.identity.structuralHash,
      frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
        revision: frame.revision, structuralHash: frame.structuralHash })) }],
  };
  return createCurveDocument({ source: curveSource, stableKey: { kind: "temporal-streakline",
    temporalId: temporal.identity.id, recipe },
  metadata: { title: `Streakline at ${Number(recipe.observationTime.toPrecision(8))}` } });
}

export function projectTemporalStreaklineStatus(project: Math3DProject, curve: CurveDocument,
  transfers?: VerifiedTemporalTransfers): Readonly<{ status: "current" | "stale" | "unverified";
    reason: string | null }> {
  if (curve.source.definition.familyId !== "vector3d.temporal-streakline")
    return { status: "stale", reason: "wrong-curve-family" };
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === curve.source.definition.sourceIds?.[0]);
  if (!temporal) return { status: "stale", reason: "temporal-source-missing" };
  const settings = curve.source.definition.settings;
  if (settings?.temporalHash !== temporal.identity.structuralHash ||
      settings?.temporalRevision !== temporal.identity.revision ||
      settings?.generationHash !== temporal.source.generationHash)
    return { status: "stale", reason: "temporal-source-changed" };
  const expected = [{ temporalId: temporal.identity.id,
    temporalHash: temporal.identity.structuralHash,
    frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
      revision: frame.revision, structuralHash: frame.structuralHash })) }];
  if (canonicalJsonStringify(curve.source.dependencies) !== canonicalJsonStringify(expected))
    return { status: "stale", reason: "streakline-lineage-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  if (status.status !== "current") return { status: status.reason?.includes("verification") ?
    "unverified" : "stale", reason: status.reason };
  return { status: "current", reason: null };
}

export function upsertProjectTemporalStreakline(project: Math3DProject,
  curve: CurveDocument, transfers?: VerifiedTemporalTransfers): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTemporalStreaklineStatus(current, curve, transfers);
  if (status.status !== "current") throw new TypeError(`Streakline withheld: ${status.reason}.`);
  const settings = curve.source.definition.settings;
  const count = curve.source.definition.points?.length;
  if (settings?.method !== "fixed-rk4" || settings.stopReason !== "observation-time" ||
      !Number.isSafeInteger(settings.releaseCount) || settings.releaseCount !== count ||
      !Number.isSafeInteger(settings.stepsPerParticle) ||
      Number(settings.releaseCount) * Number(settings.stepsPerParticle) > 512 ||
      !count || count < 2 || count > 16)
    throw new TypeError("Invalid bounded streakline result.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, entries: [...current.workspace.entries.filter(item =>
      item.expected.id !== curve.identity.id),
      { module: "curve", checkpoint: curve, expected: curve.identity, replay: null }],
  }));
}
