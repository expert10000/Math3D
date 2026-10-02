import { canonicalJsonStringify, createVolumeDocument, type VolumeDocument, type VolumeDocumentSource } from "@math3d/core";
import { compileExpression } from "../math/expression";
import type { VolumeDataset } from "../scene/datasets";
import { samplingFromBounds } from "../scene/volume/volumeSampling";
import { adaptVolumeObject, type VolumeRevisionTracker } from "../volume/infrastructure";
import type { VolumeSource } from "../volume/contracts";
import type { VolumeReplayBundle } from "../volume/volumeDocumentAdapter";
import type { ManagedVolumeArray } from "../volume/typedArrayStore";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Triple = [number, number, number];
export type VolumeResourceReader = { bytes: (item: { kind: string; id: string }) => Uint8Array | null };
const scalarCodecs = {
  float32: { size: 4, read: (view: DataView, offset: number) => view.getFloat32(offset, true), array: Float32Array },
  float64: { size: 8, read: (view: DataView, offset: number) => view.getFloat64(offset, true), array: Float64Array },
  int32: { size: 4, read: (view: DataView, offset: number) => view.getInt32(offset, true), array: Int32Array },
  uint32: { size: 4, read: (view: DataView, offset: number) => view.getUint32(offset, true), array: Uint32Array },
  int16: { size: 2, read: (view: DataView, offset: number) => view.getInt16(offset, true), array: Int16Array },
  uint16: { size: 2, read: (view: DataView, offset: number) => view.getUint16(offset, true), array: Uint16Array },
  int8: { size: 1, read: (view: DataView, offset: number) => view.getInt8(offset), array: Int8Array },
  uint8: { size: 1, read: (view: DataView, offset: number) => view.getUint8(offset), array: Uint8Array },
};
const codecFor = (name: string) => Object.hasOwn(scalarCodecs, name) ? scalarCodecs[name as keyof typeof scalarCodecs] : null;
const samplingFor = (spatial: VolumeDocumentSource["spatial"]) => {
  const min = spatial.origin.map((value, axis) => value - (spatial.centering === "cell" ? spatial.spacing[axis]! / 2 : 0)) as Triple;
  const max = min.map((value, axis) => value + spatial.spacing[axis]! * (spatial.dimensions[axis]! - (spatial.centering === "point" ? 1 : 0))) as Triple;
  if (![...min, ...max].every(Number.isFinite) || max.some((value, axis) => value <= min[axis]!)) throw new TypeError("Volume sampling bounds cannot be represented by this editor.");
  return samplingFromBounds({ min, max }, [...spatial.dimensions] as Triple);
};

/** Qualify the whole representation; dense sources always require verified bytes. */
export const volumeEditorSeed = (document: VolumeDocument) => {
  const { source } = document, { spatial, recipe } = source;
  if (source.representation === "dense-scalar-grid" && recipe.kind === "dense-grid") {
    const payload = source.payload, codec = payload && codecFor(payload.scalarType);
    if (source.dependencies.length || !payload || payload.components !== 1 || !codec ||
        !spatial.dimensions.every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 128) ||
        !spatial.spacing.every((value) => value > 0) || !spatial.direction.every((value, index) => value === IDENTITY[index]) ||
        payload.byteLength !== spatial.dimensions.reduce((product, value) => product * value, 1) * codec.size)
      throw new TypeError("This dense Volume needs a different sampler or grid adapter.");
    return { kind: "payload" as const, expression: "", parameters: {} as Record<string, number>, spatial, sampling: samplingFor(spatial), fn: null };
  }
  if (!(source.representation === "analytic-scalar-field" && recipe.kind === "analytic-preset" || source.representation === "custom-scalar-field" && recipe.kind === "custom-field") ||
      source.dependencies.length || typeof recipe.expression !== "string" || !recipe.expression || recipe.expression.length > 4096 ||
      !recipe.parameters || typeof recipe.parameters !== "object" || Array.isArray(recipe.parameters) ||
      !spatial.dimensions.every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 128) ||
      !spatial.spacing.every((value) => value > 0) || !spatial.direction.every((value, index) => value === IDENTITY[index]))
    throw new TypeError("This Volume source needs a different editor or resource adapter.");
  const parameters = recipe.parameters as Record<string, number>;
  if (Object.keys(parameters).length > 64 || Object.entries(parameters).some(([key, value]) => !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) || ["x", "y", "z", "pi", "e"].includes(key) || !Number.isFinite(value)))
    throw new TypeError("Unsupported Volume recipe parameters.");
  const expression = recipe.expression.replace(/^\s*F\s*=\s*/i, "").trim();
  // The legacy expression evaluator has permissive stack defaults and inherited
  // object keys. Exclude incomplete expressions and non-mathematical identifiers
  // before qualifying a saved recipe for native activation.
  const inheritedNames = new Set(Object.getOwnPropertyNames(Object.prototype));
  if (!expression || /[+*/^,(-]\s*$/.test(expression) || (expression.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []).some((name) => inheritedNames.has(name)))
    throw new TypeError("Unsupported Volume expression.");
  const compiled = compileExpression(expression, ["x", "y", "z", ...Object.keys(parameters)]);
  if (!compiled.fn) throw new TypeError(compiled.error?.message ?? "Unsupported Volume expression.");
  return { kind: "recipe" as const, expression: recipe.expression, parameters: { ...parameters }, spatial,
    sampling: samplingFor(spatial), fn: compiled.fn };
};

export const volumeDocumentEditable = (document: VolumeDocument) => {
  try { volumeEditorSeed(document); return true; } catch { return false; }
};
export const volumePayloadRequired = (document: VolumeDocument) => {
  try { return volumeEditorSeed(document).kind === "payload"; } catch { return true; }
};
/** Little-endian decoding is independent of host alignment and never changes authoritative bytes. */
export const readNativeVolumeValues = (document: VolumeDocument, resources?: VolumeResourceReader): ManagedVolumeArray => {
  if (volumeEditorSeed(document).kind !== "payload") throw new TypeError("Expected a dense scalar Volume.");
  const payload = document.source.payload!, codec = codecFor(payload.scalarType)!;
  const bytes = resources?.bytes({ kind: "volume-payload", id: payload.handle });
  if (!bytes || bytes.length !== payload.byteLength) throw new TypeError(`Missing or invalid Volume source resource '${payload.handle}'.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), values = new codec.array(bytes.length / codec.size);
  for (let index = 0; index < values.length; index++) {
    const value = codec.read(view, index * codec.size);
    if (!Number.isNaN(value) && (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) throw new TypeError("Volume values exceed the native scalar viewer range.");
    values[index] = value;
  }
  return values;
};
/** A later undo must not activate an unqualified or missing historical source. */
export const validateNativeVolumeReplay = (document: VolumeDocument, replay?: VolumeReplayBundle, resources?: VolumeResourceReader) => {
  const sources = [document.source, ...(replay ? [replay.checkpoint.source] : [])];
  for (const transaction of replay?.transactions ?? []) for (const command of [transaction.forward, transaction.inverse])
    if (command.command.type === "volume.source.replace") sources.push(command.command.payload as VolumeDocumentSource);
  const checked = new Set<string>();
  const checkedPayloads = new Set<string>();
  for (const source of sources) {
    const key = canonicalJsonStringify(source); if (checked.has(key)) continue; checked.add(key);
    const candidate = createVolumeDocument({ source });
    if (volumeEditorSeed(candidate).kind === "payload") {
      const payloadKey = canonicalJsonStringify(source.payload);
      if (!checkedPayloads.has(payloadKey)) { readNativeVolumeValues(candidate, resources); checkedPayloads.add(payloadKey); }
    }
  }
};

/** Opening retains cached-payload references; a source edit explicitly discards old sample caches. */
export const volumeSourceFromEditor = (document: VolumeDocument, values: {
  expression: string; parameters: Record<string, number>; spatial: VolumeDocumentSource["spatial"];
}): VolumeDocumentSource => {
  const saved = document.source;
  if (volumeEditorSeed(document).kind === "payload") {
    if (canonicalJsonStringify(values.spatial.dimensions) !== canonicalJsonStringify(saved.spatial.dimensions))
      throw new TypeError("Dense dimensions are fixed by the saved payload; resampling requires a separate operation.");
    const candidate = { ...saved, spatial: values.spatial };
    const checked = createVolumeDocument({ source: candidate }); volumeEditorSeed(checked);
    return canonicalJsonStringify(candidate) === canonicalJsonStringify(saved) ? saved : checked.source;
  }
  const candidate: VolumeDocumentSource = { ...saved, recipe: { ...saved.recipe, expression: values.expression, parameters: values.parameters }, spatial: values.spatial };
  if (canonicalJsonStringify(candidate) === canonicalJsonStringify(saved)) return saved;
  const next = { ...candidate, payload: null };
  const checked = createVolumeDocument({ source: next, stableKey: document.identity.id, metadata: document.metadata, display: document.display });
  volumeEditorSeed(checked);
  return checked.source;
};

/** Samples are derived artifacts; generating them never commits a source command. */
export const buildNativeVolumeDataset = (document: VolumeDocument, resources?: VolumeResourceReader): VolumeDataset => {
  const seed = volumeEditorSeed(document), spatial = document.source.spatial;
  const [nx, ny, nz] = spatial.dimensions;
  const scalars = seed.kind === "payload" ? Float32Array.from(readNativeVolumeValues(document, resources)) : new Float32Array(nx * ny * nz);
  const vars = { ...seed.parameters, x: 0, y: 0, z: 0 };
  let index = 0;
  for (let z = 0; seed.kind === "recipe" && z < nz; z++) {
    vars.z = spatial.origin[2]! + z * spatial.spacing[2]!;
    for (let y = 0; y < ny; y++) {
      vars.y = spatial.origin[1]! + y * spatial.spacing[1]!;
      for (let x = 0; x < nx; x++) {
        vars.x = spatial.origin[0]! + x * spatial.spacing[0]!;
        const value = Math.fround(seed.fn!(vars));
        scalars[index++] = Number.isFinite(value) ? value : Number.NaN;
      }
    }
  }
  return { kind: "volume", label: document.metadata.title, sourceId: document.identity.id,
    note: seed.kind === "payload" ? "Samples decoded from verified saved scalar bytes; original encoding and resource remain unchanged." : "Procedural samples regenerated from the saved recipe; referenced cache bytes remain unverified.",
    grid: { dims: [...spatial.dimensions] as Triple, origin: [...spatial.origin] as Triple, spacing: [...spatial.spacing] as Triple,
      direction: [...spatial.direction] as [number, number, number, number, number, number, number, number, number], centering: spatial.centering, scalars } };
};

export const nativeVolumeObject = (document: VolumeDocument, dataset: VolumeDataset, tracker: VolumeRevisionTracker, resources?: VolumeResourceReader) => adaptVolumeObject({
  id: document.identity.id, label: document.metadata.title, source: document.source.recipe as VolumeSource,
  representation: document.source.representation, grid: dataset.grid, values: volumeEditorSeed(document).kind === "payload" ? readNativeVolumeValues(document, resources) : dataset.grid.scalars, tracker,
  coordinateSystem: document.source.spatial.coordinateSystem, positionUnits: document.source.spatial.positionUnits,
  valueUnits: document.source.spatial.valueUnits, centering: document.source.spatial.centering,
  missingValuePolicy: "nan",
});
