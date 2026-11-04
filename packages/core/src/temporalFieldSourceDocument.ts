import { canonicalJsonStringify, createDocumentIdentity, createStableDocumentId, isDocumentIdentity,
  structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import type { ValidationResult } from "./validation";

export const TEMPORAL_FIELD_SOURCE_FORMAT = "math3d.temporal-field-source" as const;
export type TemporalFieldFrame = Readonly<{ time: number; documentId: string;
  revision: number; structuralHash: string }>;
export type TemporalFieldSource = Readonly<{
  frames: readonly TemporalFieldFrame[];
  timeAxis: Readonly<{ unit: string; sampling: "discrete-frames";
    interpolation: "none" | "linear" }>;
  frame: "cartesian-identical";
  calculus: "per-frame-cartesian-only";
  export: "per-frame-source-lineage";
  generationHash: string;
}>;
export type TemporalFieldSourceDocument = Readonly<{
  format: typeof TEMPORAL_FIELD_SOURCE_FORMAT; schemaVersion: 1 | 2;
  identity: DocumentIdentity; source: TemporalFieldSource;
  metadata: Readonly<{ title: string }>;
}>;

const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sourceHash = (source: Omit<TemporalFieldSource, "generationHash">) =>
  structuralHash(source);
const physicalTimeUnits = new Set(["ms", "s", "min", "h"]);

export function normalizeTemporalFieldSourceDocument(value: unknown): ValidationResult<TemporalFieldSourceDocument> {
  const errors: string[] = [];
  if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "source", "metadata"]) ||
      value.format !== TEMPORAL_FIELD_SOURCE_FORMAT || ![1, 2].includes(Number(value.schemaVersion)) ||
      !record(value.identity) || !record(value.source) || !record(value.metadata) ||
      !exact(value.metadata, ["title"]) || typeof value.metadata.title !== "string" ||
      !value.metadata.title.trim() || value.metadata.title.length > 160 ||
      !isDocumentIdentity(value.identity))
    return { ok: false, errors: ["Invalid temporal field document."] };
  const source = value.source;
  if (!exact(source, ["frames", "timeAxis", "frame", "calculus", "export", "generationHash"]) ||
      source.frame !== "cartesian-identical" || source.calculus !== "per-frame-cartesian-only" ||
      source.export !== "per-frame-source-lineage" ||
      !record(source.timeAxis) || !exact(source.timeAxis, ["unit", "sampling", "interpolation"]) ||
      typeof source.timeAxis.unit !== "string" || !physicalTimeUnits.has(source.timeAxis.unit) ||
      source.timeAxis.sampling !== "discrete-frames" ||
      !["none", "linear"].includes(String(source.timeAxis.interpolation)) ||
      (value.schemaVersion === 1 && source.timeAxis.interpolation !== "none") ||
      (value.schemaVersion === 2 && source.timeAxis.interpolation !== "linear") ||
      !Array.isArray(source.frames) || source.frames.length < 2 || source.frames.length > 64)
    errors.push("Temporal source needs 2–64 Cartesian frames and a versioned interpolation rule.");
  const frames = Array.isArray(source.frames) ? source.frames : [];
  for (const [index, frame] of frames.entries()) {
    if (!record(frame) || !exact(frame, ["time", "documentId", "revision", "structuralHash"]) ||
        typeof frame.time !== "number" || !Number.isFinite(frame.time) ||
        index > 0 && frame.time <= Number((frames[index - 1] as TemporalFieldFrame).time) ||
        typeof frame.documentId !== "string" || !frame.documentId ||
        !Number.isSafeInteger(frame.revision) || Number(frame.revision) < 0 ||
        typeof frame.structuralHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(frame.structuralHash))
      errors.push(`Invalid or unordered temporal frame ${index}.`);
  }
  if (new Set(frames.map(frame => (frame as TemporalFieldFrame).documentId)).size !== frames.length)
    errors.push("Temporal frames must reference distinct source documents.");
  if (errors.length) return { ok: false, errors };
  try {
    const candidate = value as unknown as TemporalFieldSourceDocument;
    const { generationHash, ...recipe } = candidate.source;
    if (generationHash !== sourceHash(recipe) ||
        candidate.identity.structuralHash !== structuralHash(candidate.source) ||
        !candidate.identity.id || !Number.isSafeInteger(candidate.identity.revision))
      return { ok: false, errors: ["Temporal source generation or identity hash changed."] };
    if (canonicalJsonStringify(candidate).length > 64 * 1024)
      return { ok: false, errors: ["Temporal source document exceeds 64 KiB."] };
    return { ok: true, value: JSON.parse(canonicalJsonStringify(candidate)) as TemporalFieldSourceDocument };
  } catch (cause) { return { ok: false, errors: [String((cause as Error).message)] }; }
}

const sameSpace = (left: VectorField3DDocument, right: VectorField3DDocument) =>
  canonicalJsonStringify(left.source.axes) === canonicalJsonStringify(right.source.axes) &&
  left.source.timeUnit === right.source.timeUnit &&
  canonicalJsonStringify(left.source.field.kind === "expressions" ?
    left.source.field.components.map(item => item.unit) : left.source.field.componentUnits) ===
    canonicalJsonStringify(right.source.field.kind === "expressions" ?
      right.source.field.components.map(item => item.unit) : right.source.field.componentUnits);

/** Pin existing Project snapshots at explicit physical times; no between-frame values exist yet. */
export function createTemporalFieldSourceDocument(project: Math3DProject,
  frames: readonly Readonly<{ time: number; documentId: string }>[],
  options: Readonly<{ stableKey: CanonicalJsonValue; title?: string; timeUnit: string;
    interpolation?: "none" | "linear" }> ): TemporalFieldSourceDocument {
  if (frames.length < 2 || frames.length > 64)
    throw new RangeError("A temporal source requires 2–64 saved frames.");
  const documents = frames.map(frame => project.workspace.entries.find(item =>
    item.module === "vector3d" && item.expected.id === frame.documentId)?.checkpoint);
  if (documents.some(document => document?.format !== "math3d.vector-field3d-document"))
    throw new TypeError("Every temporal frame must be a saved 3D vector source.");
  const checked = documents as VectorField3DDocument[];
  if (checked.some(document => !normalizeVectorField3DDocument(document).ok ||
      document.source.field.kind !== "expressions" ||
      document.source.timeUnit !== options.timeUnit || !sameSpace(checked[0]!, document)))
    throw new TypeError("Temporal frames need matching analytic Cartesian grids, units and time unit.");
  const recipe = { frames: frames.map((frame, index) => ({ time: frame.time,
      documentId: checked[index]!.identity.id, revision: checked[index]!.identity.revision,
      structuralHash: checked[index]!.identity.structuralHash })),
    timeAxis: { unit: options.timeUnit, sampling: "discrete-frames" as const,
      interpolation: options.interpolation ?? "none" }, frame: "cartesian-identical" as const,
    calculus: "per-frame-cartesian-only" as const, export: "per-frame-source-lineage" as const };
  const source = { ...recipe, generationHash: sourceHash(recipe) };
  const document = { format: TEMPORAL_FIELD_SOURCE_FORMAT,
    schemaVersion: options.interpolation === "linear" ? 2 as const : 1 as const,
    identity: createDocumentIdentity(createStableDocumentId("temporal-field", options.stableKey), source),
    source, metadata: { title: options.title ?? "Temporal field source" } };
  const normalized = normalizeTemporalFieldSourceDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
}

export function projectTemporalFieldSourceStatus(project: Math3DProject,
  temporal: TemporalFieldSourceDocument): Readonly<{ status: "current" | "withheld";
    reason: string | null }> {
  const normalized = normalizeTemporalFieldSourceDocument(temporal);
  if (!normalized.ok) return { status: "withheld", reason: "invalid-temporal-contract" };
  const documents = temporal.source.frames.map(frame => project.workspace.entries.find(item =>
    item.module === "vector3d" && item.expected.id === frame.documentId)?.checkpoint);
  for (const [index, frame] of temporal.source.frames.entries()) {
    const document = documents[index];
    if (document?.format !== "math3d.vector-field3d-document")
      return { status: "withheld", reason: `frame-${index + 1}-missing` };
    if (document.identity.revision !== frame.revision ||
        document.identity.structuralHash !== frame.structuralHash)
      return { status: "withheld", reason: `frame-${index + 1}-changed` };
    if (document.source.field.kind !== "expressions")
      return { status: "withheld", reason: `frame-${index + 1}-verification-required` };
    if (!sameSpace(documents[0] as VectorField3DDocument, document))
      return { status: "withheld", reason: "frame-alignment-changed" };
  }
  return { status: "current", reason: null };
}

export function temporalFrameAtTime(project: Math3DProject, temporal: TemporalFieldSourceDocument,
  time: number): VectorField3DDocument {
  const status = projectTemporalFieldSourceStatus(project, temporal);
  if (status.status !== "current") throw new TypeError(`Temporal source withheld: ${status.reason}.`);
  const frame = temporal.source.frames.find(item => item.time === time);
  if (!frame) throw new RangeError("Time lies between saved frames; interpolation is not defined.");
  return project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === frame.documentId)!.checkpoint as VectorField3DDocument;
}

export type TemporalFieldProbe = Readonly<{ time: number;
  position: readonly [number, number, number]; vector: readonly [number, number, number];
  magnitude: number; componentUnit: string; timeUnit: string;
  interpolation: "none" | "linear"; frameIds: readonly string[] }>;

/** Exact frames or declared linear interpolation only; no temporal extrapolation. */
export function sampleTemporalFieldProbe(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, time: number,
  position: readonly [number, number, number]): TemporalFieldProbe {
  const status = projectTemporalFieldSourceStatus(project, temporal);
  if (status.status !== "current") throw new TypeError(`Temporal source withheld: ${status.reason}.`);
  if (!Number.isFinite(time) || position.length !== 3 || position.some(value => !Number.isFinite(value)))
    throw new RangeError("Time and physical position must be finite.");
  const frames = temporal.source.frames;
  const exactIndex = frames.findIndex(frame => frame.time === time);
  const lowerIndex = exactIndex >= 0 ? exactIndex : frames.findIndex((frame, index) =>
    frame.time < time && (frames[index + 1]?.time ?? Infinity) > time);
  if (lowerIndex < 0 || time < frames[0]!.time || time > frames.at(-1)!.time)
    throw new RangeError("Time is outside the saved frame interval.");
  const lower = frames[lowerIndex]!, upper = exactIndex >= 0 ? undefined : frames[lowerIndex + 1];
  if (time !== lower.time && temporal.source.timeAxis.interpolation === "none")
    throw new RangeError("Between-frame sampling is not defined for this source version.");
  const sample = (frame: TemporalFieldFrame) => {
    const document = project.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === frame.documentId)?.checkpoint;
    if (document?.format !== "math3d.vector-field3d-document" ||
        document.source.field.kind !== "expressions") throw new TypeError("Temporal frame is unavailable.");
    if (position.some((value, axis) => value < document.source.axes[axis]!.min ||
        value > document.source.axes[axis]!.max)) throw new RangeError("Probe lies outside the physical domain.");
    const components = document.source.field.components.map(component =>
      evaluateGraph2DExpression(component.ast, { x: position[0], y: position[1],
        z: position[2] }, { maxEvaluations: 256 }));
    if (components.some(value => !value.ok || !Number.isFinite(value.value)))
      throw new TypeError("Temporal frame has an unavailable value at this point.");
    return { vector: components.map(value => value.ok ? value.value : NaN) as
      [number, number, number], unit: document.source.field.components[0].unit };
  };
  const a = sample(lower), b = time === lower.time ? null : sample(upper!);
  const fraction = b ? (time - lower.time) / (upper!.time - lower.time) : 0;
  const vector = a.vector.map((value, index) =>
    b ? value * (1 - fraction) + b.vector[index]! * fraction : value) as
    [number, number, number];
  return { time, position, vector, magnitude: Math.hypot(...vector),
    componentUnit: a.unit, timeUnit: temporal.source.timeAxis.unit,
    interpolation: temporal.source.timeAxis.interpolation,
    frameIds: b ? [lower.documentId, upper!.documentId] : [lower.documentId] };
}

export function sampleTemporalFieldSlice(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, time: number, normalAxis: 0 | 1 | 2,
  coordinate: number, resolution: number): Readonly<{ time: number;
    normalAxis: number; coordinate: number; shape: readonly [number, number];
    values: readonly number[]; unit: string; frameIds: readonly string[] }> {
  if (![0, 1, 2].includes(normalAxis) || !Number.isSafeInteger(resolution) ||
      resolution < 2 || resolution > 32 || resolution * resolution > 1024)
    throw new RangeError("Temporal slice requires a 2–32 by 2–32 bounded grid.");
  const first = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]?.documentId)?.checkpoint;
  if (first?.format !== "math3d.vector-field3d-document" ||
      !Number.isFinite(coordinate) || coordinate < first.source.axes[normalAxis].min ||
      coordinate > first.source.axes[normalAxis].max)
    throw new RangeError("Temporal slice plane is outside the source domain.");
  const axes = [0, 1, 2].filter(axis => axis !== normalAxis);
  const values: number[] = [];
  let frameIds: readonly string[] = [];
  for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution; j++) {
    const point = [0, 0, 0] as [number, number, number];
    point[normalAxis] = coordinate;
    for (const [axis, index] of axes.map((axis, index) => [axis, index] as const)) {
      const bounds = first.source.axes[axis]!;
      point[axis] = bounds.min + (bounds.max - bounds.min) * (index === 0 ? i : j) /
        (resolution - 1);
    }
    const probe = sampleTemporalFieldProbe(project, temporal, time, point);
    frameIds = probe.frameIds;
    values.push(probe.magnitude);
  }
  return { time, normalAxis, coordinate, shape: [resolution, resolution], values,
    unit: first.source.field.kind === "expressions" ? first.source.field.components[0].unit :
      first.source.field.componentUnits[0], frameIds };
}

export const serializeTemporalFieldSourceDocument = (document: TemporalFieldSourceDocument) =>
  canonicalJsonStringify(document);
export function parseTemporalFieldSourceDocument(text: string): TemporalFieldSourceDocument {
  const checked = normalizeTemporalFieldSourceDocument(JSON.parse(text));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
