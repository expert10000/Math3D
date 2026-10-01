import { canonicalJsonStringify, createVolumeDocument, type VolumeDocument, type VolumeDocumentSource } from "@math3d/core";
import { compileExpression } from "../math/expression";
import type { VolumeDataset } from "../scene/datasets";
import { samplingFromBounds } from "../scene/volume/volumeSampling";
import { adaptVolumeObject, type VolumeRevisionTracker } from "../volume/infrastructure";
import type { VolumeSource } from "../volume/contracts";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Triple = [number, number, number];

/** Only self-contained scalar recipes can regenerate their samples without sidecars. */
export const volumeEditorSeed = (document: VolumeDocument) => {
  const { source } = document, { spatial, recipe } = source;
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
  const min = spatial.origin.map((value, axis) => value - (spatial.centering === "cell" ? spatial.spacing[axis]! / 2 : 0)) as Triple;
  const max = min.map((value, axis) => value + spatial.spacing[axis]! * (spatial.dimensions[axis]! - (spatial.centering === "point" ? 1 : 0))) as Triple;
  if (![...min, ...max].every(Number.isFinite) || max.some((value, axis) => value <= min[axis]!)) throw new TypeError("Volume sampling bounds cannot be represented by this editor.");
  return { expression: recipe.expression, parameters: { ...parameters }, spatial,
    sampling: samplingFromBounds({ min, max }, [...spatial.dimensions] as Triple), fn: compiled.fn };
};

export const volumeDocumentEditable = (document: VolumeDocument) => {
  try { volumeEditorSeed(document); return true; } catch { return false; }
};

/** Opening retains cached-payload references; a source edit explicitly discards old sample caches. */
export const volumeSourceFromEditor = (document: VolumeDocument, values: {
  expression: string; parameters: Record<string, number>; spatial: VolumeDocumentSource["spatial"];
}): VolumeDocumentSource => {
  const saved = document.source;
  const candidate: VolumeDocumentSource = { ...saved, recipe: { ...saved.recipe, expression: values.expression, parameters: values.parameters }, spatial: values.spatial };
  if (canonicalJsonStringify(candidate) === canonicalJsonStringify(saved)) return saved;
  const next = { ...candidate, payload: null };
  const checked = createVolumeDocument({ source: next, stableKey: document.identity.id, metadata: document.metadata, display: document.display });
  volumeEditorSeed(checked);
  return checked.source;
};

/** Samples are derived artifacts; generating them never commits a source command. */
export const buildNativeVolumeDataset = (document: VolumeDocument): VolumeDataset => {
  const seed = volumeEditorSeed(document), spatial = document.source.spatial;
  const [nx, ny, nz] = spatial.dimensions;
  const scalars = new Float32Array(nx * ny * nz);
  const vars = { ...seed.parameters, x: 0, y: 0, z: 0 };
  let index = 0;
  for (let z = 0; z < nz; z++) {
    vars.z = spatial.origin[2]! + z * spatial.spacing[2]!;
    for (let y = 0; y < ny; y++) {
      vars.y = spatial.origin[1]! + y * spatial.spacing[1]!;
      for (let x = 0; x < nx; x++) {
        vars.x = spatial.origin[0]! + x * spatial.spacing[0]!;
        const value = Math.fround(seed.fn(vars));
        scalars[index++] = Number.isFinite(value) ? value : Number.NaN;
      }
    }
  }
  return { kind: "volume", label: document.metadata.title, sourceId: document.identity.id,
    note: "Procedural samples regenerated from the saved recipe; referenced cache bytes remain unverified.",
    grid: { dims: [...spatial.dimensions] as Triple, origin: [...spatial.origin] as Triple, spacing: [...spatial.spacing] as Triple,
      direction: [...spatial.direction] as [number, number, number, number, number, number, number, number, number], centering: spatial.centering, scalars } };
};

export const nativeVolumeObject = (document: VolumeDocument, dataset: VolumeDataset, tracker: VolumeRevisionTracker) => adaptVolumeObject({
  id: document.identity.id, label: document.metadata.title, source: document.source.recipe as VolumeSource,
  representation: document.source.representation, grid: dataset.grid, values: dataset.grid.scalars, tracker,
  coordinateSystem: document.source.spatial.coordinateSystem, positionUnits: document.source.spatial.positionUnits,
  valueUnits: document.source.spatial.valueUnits, centering: document.source.spatial.centering,
  missingValuePolicy: "nan",
});
