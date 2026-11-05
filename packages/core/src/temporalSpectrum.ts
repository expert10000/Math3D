import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createVerifiedTemporalFieldSampler, projectTemporalFieldSourceStatus,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from
  "./temporalFieldSourceDocument";

type Vec3 = readonly [number, number, number];
export type TemporalSpectrumRecipe = Readonly<{ position: Vec3;
  component: "magnitude" | "x" | "y" | "z"; startTime: number; endTime: number;
  sampleCount: 16 | 32 | 64; window: "rectangular" | "hann";
  detrend: "none" | "mean" }>;
export type TemporalSpectrumResult = Readonly<{
  publication: AnalysisResultEnvelope;
  samples: readonly Readonly<{ time: number; value: number }>[];
  psd: readonly Readonly<{ frequency: number; density: number }>[];
  autocorrelation: readonly Readonly<{ lag: number; separation: number;
    coefficient: number | null }>[];
}>;
export type TemporalSpectrumOptions = Readonly<{ transfers?: VerifiedTemporalTransfers;
  shouldCancel?: () => boolean; currentProject?: () => Math3DProject;
  onProgress?: (completed: number, total: number) => void;
  verifyBeforePublish?: () => Promise<VerifiedTemporalTransfers | undefined> }>;

/** Bounded, uniformly sampled physical-time periodogram and biased ACF. */
export async function computeTemporalSpectrum(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, recipe: TemporalSpectrumRecipe,
  options: TemporalSpectrumOptions = {}): Promise<TemporalSpectrumResult> {
  const firstTime = temporal.source.frames[0]?.time;
  const lastTime = temporal.source.frames.at(-1)?.time;
  if (recipe.position.length !== 3 || !recipe.position.every(Number.isFinite) ||
      !Number.isFinite(recipe.startTime) || !Number.isFinite(recipe.endTime) ||
      firstTime === undefined || lastTime === undefined ||
      recipe.startTime < firstTime || recipe.endTime > lastTime ||
      recipe.startTime >= recipe.endTime ||
      ![16, 32, 64].includes(recipe.sampleCount) ||
      !["magnitude", "x", "y", "z"].includes(recipe.component) ||
      !["rectangular", "hann"].includes(recipe.window) ||
      !["none", "mean"].includes(recipe.detrend))
    throw new RangeError("Temporal spectrum needs 16, 32 or 64 uniform samples inside the pinned time axis.");
  const started = Date.now();
  const sample = createVerifiedTemporalFieldSampler(project, temporal, options.transfers);
  const check = () => {
    if (options.shouldCancel?.()) throw new Error("Temporal spectrum cancelled.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, options.transfers);
    if (status.status !== "current")
      throw new TypeError(`Temporal spectrum source withheld: ${status.reason}.`);
  };
  check();
  const n = recipe.sampleCount;
  const dt = (recipe.endTime - recipe.startTime) / n;
  const values: number[] = [];
  const samples: { time: number; value: number }[] = [];
  let componentUnit = "";
  for (let i = 0; i < n; i++) {
    if (options.shouldCancel?.()) throw new Error("Temporal spectrum cancelled.");
    const time = recipe.startTime + i * dt;
    let probe;
    try { probe = sample(time, recipe.position); }
    catch (cause) { throw new TypeError(`Temporal spectrum sample ${i + 1} unavailable: ` +
      (cause instanceof Error ? cause.message : String(cause))); }
    const value = recipe.component === "magnitude" ? probe.magnitude :
      probe.vector[{ x: 0, y: 1, z: 2 }[recipe.component]]!;
    if (!Number.isFinite(value)) throw new TypeError(`Temporal spectrum sample ${i + 1} is undefined.`);
    componentUnit = probe.componentUnit;
    values.push(value); samples.push({ time, value });
    options.onProgress?.(i + 1, n);
    if ((i + 1) % 8 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); }
  }
  check();
  if (temporal.schemaVersion === 3) {
    if (!options.verifyBeforePublish)
      throw new TypeError("Scientific temporal spectrum needs final source verification.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, await options.verifyBeforePublish());
    if (status.status !== "current")
      throw new TypeError(`Temporal spectrum source withheld: ${status.reason}.`);
  }
  check();
  const mean = values.reduce((sum, value) => sum + value / n, 0);
  const centered = values.map(value => value - mean);
  const work = values.map((value, i) => (value - (recipe.detrend === "mean" ? mean : 0)) *
    (recipe.window === "hann" ? .5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))) : 1));
  const windowEnergy = Array.from({ length: n }, (_, i) => recipe.window === "hann" ?
    .5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))) : 1)
    .reduce((sum, weight) => sum + weight * weight, 0);
  const sampleRate = 1 / dt;
  const psd = Array.from({ length: n / 2 + 1 }, (_, k) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const angle = -2 * Math.PI * k * i / n;
      re += work[i]! * Math.cos(angle); im += work[i]! * Math.sin(angle);
    }
    return { frequency: k * sampleRate / n,
      density: (k === 0 || k === n / 2 ? 1 : 2) * (re * re + im * im) /
        (sampleRate * windowEnergy) };
  });
  const energy = centered.reduce((sum, value) => sum + value * value, 0);
  const autocorrelation = Array.from({ length: n }, (_, lag) => {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += centered[i]! * centered[i + lag]!;
    return { lag, separation: lag * dt,
      coefficient: energy > 0 ? Math.max(-1, Math.min(1, sum / energy)) : null };
  });
  const peak = psd.slice(1).reduce((best, bin) =>
    bin.density > best.density ? bin : best, psd[1]!);
  const first = temporal.source.frames[0]!;
  const lineage = { id: temporal.identity.id, revision: temporal.identity.revision,
    structuralHash: temporal.identity.structuralHash,
    generationHash: temporal.source.generationHash,
    frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
      revision: frame.revision, structuralHash: frame.structuralHash })) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-spectrum.${structuralHash({ lineage, recipe }).slice(7)}`,
    status: "numerical", provenance: {
      source: { documentId: first.documentId as `math3d:${string}:${string}`,
        revision: first.revision, structuralHash: first.structuralHash as `sha256:${string}`,
        generation: first.revision },
      operation: { type: "vector3d.temporal-spectrum",
        algorithm: "uniform-periodogram-biased-acf", algorithmVersion: "1",
        parameters: { temporal: lineage, recipe } },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "math3d-core", version: "1" },
      elapsedMs: Math.max(0, Date.now() - started) },
    summary: { sampleCount: n, sampleInterval: dt, sampleRate,
      timeUnit: temporal.source.timeAxis.unit, componentUnit,
      frequencyUnit: `cycles/${temporal.source.timeAxis.unit}`,
      powerUnit: `(${componentUnit})²·${temporal.source.timeAxis.unit}`,
      window: recipe.window, detrend: recipe.detrend,
      interpolation: temporal.source.timeAxis.interpolation,
      autocorrelationStatus: energy > 0 ? "resolved" : "undefined-zero-variance",
      peakFrequency: peak.frequency, peakPowerDensity: peak.density },
    warnings: ["Uniform times are sampled from the declared temporal interpolation; missing frames are not filled.",
      "The one-sided PSD is window-energy normalized. Zero variance leaves normalized autocorrelation undefined."],
    diagnostics: [], artifacts: [] });
  return { publication, samples, psd, autocorrelation };
}

export function projectTemporalSpectrumStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers):
  Readonly<{ status: "current" | "stale" | "unverified"; reason: string | null }> {
  if (result.provenance.operation.type !== "vector3d.temporal-spectrum")
    return { status: "stale", reason: "wrong-result-type" };
  const pinned = result.provenance.operation.parameters.temporal;
  if (!pinned || typeof pinned !== "object" || Array.isArray(pinned))
    return { status: "stale", reason: "missing-temporal-lineage" };
  const temporal = project.workspace.timeSources?.find(item => item.identity.id ===
    (pinned as Record<string, unknown>).id);
  if (!temporal) return { status: "stale", reason: "temporal-source-missing" };
  const current = { id: temporal.identity.id, revision: temporal.identity.revision,
    structuralHash: temporal.identity.structuralHash,
    generationHash: temporal.source.generationHash,
    frames: temporal.source.frames.map(frame => ({ documentId: frame.documentId,
      revision: frame.revision, structuralHash: frame.structuralHash })) };
  if (canonicalJsonStringify(current) !== canonicalJsonStringify(pinned))
    return { status: "stale", reason: "temporal-source-changed" };
  const first = temporal.source.frames[0]!;
  if (result.provenance.source.documentId !== first.documentId ||
      result.provenance.source.revision !== first.revision ||
      result.provenance.source.structuralHash !== first.structuralHash ||
      result.provenance.source.generation !== first.revision ||
      result.resultId !== `vector3d.temporal-spectrum.${structuralHash({ lineage: current,
        recipe: result.provenance.operation.parameters.recipe }).slice(7)}`)
    return { status: "stale", reason: "spectrum-lineage-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  if (status.status !== "current") return { status: status.reason?.includes("verification") ?
    "unverified" : "stale", reason: status.reason };
  return { status: "current", reason: null };
}

export function upsertProjectTemporalSpectrum(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTemporalSpectrumStatus(current, result, transfers);
  if (status.status !== "current") throw new TypeError(`Temporal spectrum withheld: ${status.reason}.`);
  const summary = result.summary;
  if (![16, 32, 64].includes(Number(summary.sampleCount)) ||
      !Number.isFinite(summary.sampleInterval) || Number(summary.sampleInterval) <= 0 ||
      !Number.isFinite(summary.peakFrequency) ||
      !Number.isFinite(summary.peakPowerDensity) || Number(summary.peakPowerDensity) < 0)
    throw new TypeError("Invalid bounded temporal spectrum result.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== result.resultId), result] }));
}
