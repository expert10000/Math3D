import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { evaluateGraph2DExpression, parseGraph2DExpression, type Graph2DExpressionAst } from "./mathExpressionRealAst";
import { isGraph2DFieldReference, type Graph2DFieldReference } from "./graph2dFieldReference";
import { scientificAxisCoordinate, scientificPointWithinBounds, scientificVelocityUnit } from "./scientificDatasetCoordinates";
import type { ValidationResult } from "./validation";

export const VECTOR_FIELD3D_DOCUMENT_FORMAT = "math3d.vector-field3d-document" as const;
export const VECTOR_FIELD3D_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const VECTOR_FIELD3D_MAX_DOCUMENT_BYTES = 256 * 1024;
export type VectorField3DAxis = Readonly<{ role: "x" | "y" | "z"; label: string; unit: string;
  min: number; max: number }>;
export type VectorField3DExpression = Readonly<{ source: string; ast: Graph2DExpressionAst; unit: string }>;
export type VectorField3DField = Readonly<{ kind: "expressions";
  components: readonly [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] }> |
  Readonly<{ kind: "scientific-bundle";
    componentUnits: readonly [string, string, string];
    references: readonly [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference] }>;
export type VectorField3DSource = Readonly<{
  axes: readonly [VectorField3DAxis, VectorField3DAxis, VectorField3DAxis]; timeUnit: string;
  field: VectorField3DField;
  seeds: readonly Readonly<{ id: string; position: readonly [number, number, number];
    group?: string }>[];
  display: Readonly<{ density: readonly [number, number, number]; maxGlyphs: number;
    magnitudeScale: number; colorBy: "speed" | "p" | "q" | "r" }>;
  solver: Readonly<{ method?: "rk4-step-doubling" | "rk45";
    mode?: "time-trajectory" | "normalized-field-line"; maxLineLength?: number;
    absoluteTolerance: number; relativeTolerance: number;
    maxSteps: number; maxTime: number; maxArcLength?: number }>;
}>;
export type VectorField3DLayer = "arrows" | "trajectories" | "xy" | "xz" | "yz";
export type VectorField3DCameraPreset = "perspective" | "xy" | "xz" | "yz";
export type VectorField3DClipBounds = readonly [readonly [number, number],
  readonly [number, number], readonly [number, number]];
export type VectorField3DCameraState = Readonly<{ position: readonly [number, number, number];
  target: readonly [number, number, number]; zoom: number }>;
export type VectorField3DEquilibriumConstruction = Readonly<{
  id: string; position: readonly [number, number, number]; residual: number;
  classification: "source" | "sink" | "saddle" | "spiral-source" | "spiral-sink" |
    "spiral-saddle" | "degenerate/uncertain";
  sourceRevision: number; sourceStructuralHash: string; sourceHash: string | null;
}>;
export type VectorField3DSeedGroupStyle = Readonly<{ id: string; name: string; color: string }>;
export type VectorField3DWorkspace = Readonly<{ selectedLayer: VectorField3DLayer;
  sliceChannel: "component" | "divergence" | "curl-magnitude" |
    "curl-x" | "curl-y" | "curl-z" | "grad-speed-x" | "grad-speed-y" |
    "grad-speed-z" | "grad-speed-magnitude" | "laplacian-speed";
  layout: "three-pane" | "viewer-focus" | "split" | "quad";
  sliceCoordinates: readonly [number, number, number];
  viewsLinked: boolean;
  viewZoom: Readonly<{ xy: number; xz: number; yz: number }>;
  viewCenter: Readonly<{ xy: readonly [number, number]; xz: readonly [number, number];
    yz: readonly [number, number] }>;
  probe: readonly [number, number, number] | null;
  linkedProbe: Readonly<{ point: readonly [number, number, number];
    units: readonly [string, string, string] }> | null;
  hiddenSeedGroups: readonly string[];
  seedGroupStyles: readonly VectorField3DSeedGroupStyle[];
  equilibriumConstructions: readonly VectorField3DEquilibriumConstruction[];
  isosurfaceLevel: number | null;
  isosurfaceTriangleBudget: number;
  clipBounds: VectorField3DClipBounds;
  cameraPreset: VectorField3DCameraPreset;
  cameraState: VectorField3DCameraState | null }>;
export type VectorField3DDocument = Readonly<{ format: typeof VECTOR_FIELD3D_DOCUMENT_FORMAT;
  schemaVersion: typeof VECTOR_FIELD3D_DOCUMENT_SCHEMA_VERSION; identity: DocumentIdentity;
  source: VectorField3DSource; metadata: Readonly<{ title: string }>;
  workspace?: VectorField3DWorkspace }>;

export const defaultVectorField3DWorkspace = (source: VectorField3DSource): VectorField3DWorkspace => ({
  selectedLayer: "arrows", layout: "three-pane", probe: null, linkedProbe: null,
  cameraPreset: "perspective",
  equilibriumConstructions: [],
  isosurfaceLevel: null,
  isosurfaceTriangleBudget: 40_000,
  hiddenSeedGroups: [],
  seedGroupStyles: [],
  sliceChannel: "component",
  cameraState: null,
  viewsLinked: true, viewZoom: { xy: 1, xz: 1, yz: 1 },
  viewCenter: { xy: [0.5, 0.5], xz: [0.5, 0.5], yz: [0.5, 0.5] },
  clipBounds: source.axes.map(axis => [axis.min, axis.max]) as unknown as VectorField3DClipBounds,
  sliceCoordinates: source.axes.map((axis, index) => {
    if (source.field.kind !== "scientific-bundle") return (axis.min + axis.max) / 2;
    const reference = source.field.references[0], count = reference.shape[index]!;
    const samples = Math.min(count, 32), middle = Math.floor(samples / 2);
    const sourceIndex = samples === 1 ? 0 : Math.round(middle * (count - 1) / (samples - 1));
    return scientificAxisCoordinate({ ...reference.axes[index]!, count }, sourceIndex);
  }) as [number, number, number],
});

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 80): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value &&
  !/[\x00-\x1f\x7f]/.test(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const tuple3 = (value: unknown): value is [unknown, unknown, unknown] =>
  Array.isArray(value) && value.length === 3;
const canonical = (value: unknown) => canonicalJsonStringify(value);

const validAxis = (axis: unknown, role: VectorField3DAxis["role"]): axis is VectorField3DAxis =>
  record(axis) && exact(axis, ["role", "label", "unit", "min", "max"]) && axis.role === role &&
  text(axis.label, 160) && text(axis.unit) && finite(axis.min) && finite(axis.max) &&
  axis.min < axis.max && Math.abs(axis.min) <= 1e9 && Math.abs(axis.max) <= 1e9;
const expectedUnit = scientificVelocityUnit;
const validExpression = (candidate: unknown, expected: string): candidate is VectorField3DExpression => {
  if (!record(candidate) || !exact(candidate, ["source", "ast", "unit"]) ||
      !text(candidate.source, 2048) || candidate.unit !== expected) return false;
  const parsed = parseGraph2DExpression(candidate.source, ["x", "y", "z"]);
  try { return parsed.ok && canonical(candidate.ast) === canonical(parsed.ast); }
  catch { return false; }
};
const validBundle = (candidate: unknown, axes: VectorField3DSource["axes"]): boolean => {
  if (!tuple3(candidate) || !candidate.every(isGraph2DFieldReference)) return false;
  const references = candidate as Graph2DFieldReference[];
  const first = references[0]!;
  if (first.semanticType !== "vector-field" || first.shape.length !== 3 ||
      first.axes.some((axis, i) => axis.name !== axes[i]!.label || axis.unit !== axes[i]!.unit ||
        axis.origin !== axes[i]!.min || axis.origin + axis.spacing * (first.shape[i]! - 1) !== axes[i]!.max))
    return false;
  if (new Set(references.map(reference => reference.component)).size !== 3) return false;
  return references.every(reference => reference.semanticType === "vector-field" &&
    reference.sceneId === first.sceneId && reference.datasetId === first.datasetId &&
    reference.sceneFingerprint === first.sceneFingerprint &&
    canonical(reference.locator) === canonical(first.locator) &&
    canonical(reference.shape) === canonical(first.shape) &&
    canonical(reference.axes) === canonical(first.axes));
};
const validSource = (source: unknown): source is VectorField3DSource => {
  if (!record(source) || !exact(source, ["axes", "timeUnit", "field", "seeds", "display", "solver"]) ||
      !tuple3(source.axes) ||
      !text(source.timeUnit) || !record(source.field) || !["expressions", "scientific-bundle"].includes(String(source.field.kind)))
    return false;
  const axes = source.axes as unknown as VectorField3DSource["axes"];
  if (!["x", "y", "z"].every((role, index) =>
      validAxis(axes[index], role as VectorField3DAxis["role"])) ||
      new Set(axes.map(axis => axis.label)).size !== 3) return false;
  if (source.field.kind === "expressions") {
    if (!exact(source.field, ["kind", "components"]) || !tuple3(source.field.components) ||
        !source.field.components.every((component, index) =>
          validExpression(component, expectedUnit(axes[index]!.unit, source.timeUnit as string)))) return false;
  } else if (!exact(source.field, ["kind", "componentUnits", "references"]) ||
      !tuple3(source.field.componentUnits) ||
      !source.field.componentUnits.every((unit, index) =>
        unit === expectedUnit(axes[index]!.unit, source.timeUnit as string)) ||
      !validBundle(source.field.references, axes)) return false;
  if (!Array.isArray(source.seeds) || source.seeds.length > 32 ||
      source.seeds.some((seed: unknown) => !record(seed) ||
        !(exact(seed, ["id", "position"]) || exact(seed, ["id", "position", "group"])) ||
        !text(seed.id, 64) || !tuple3(seed.position) ||
        (seed.group !== undefined && !text(seed.group, 64)) ||
        !scientificPointWithinBounds(seed.position as number[], axes)) ||
      new Set((source.seeds as { id: string }[]).map(seed => seed.id)).size !== source.seeds.length) return false;
  const display = source.display;
  if (!record(display) || !exact(display, ["density", "maxGlyphs", "magnitudeScale", "colorBy"]) ||
      !tuple3(display.density) || display.density.some(value => !integer(value, 2, 16)) ||
      !integer(display.maxGlyphs, 8, 4096) || !finite(display.magnitudeScale) ||
      display.magnitudeScale <= 0 || display.magnitudeScale > 1e9 ||
      !["speed", "p", "q", "r"].includes(String(display.colorBy))) return false;
  const solver = source.solver;
  return record(solver) && Object.keys(solver).every(key =>
    ["method", "mode", "maxLineLength", "absoluteTolerance", "relativeTolerance", "maxSteps", "maxTime", "maxArcLength"].includes(key)) &&
    ["absoluteTolerance", "relativeTolerance", "maxSteps", "maxTime"].every(key => key in solver) &&
    (solver.method === undefined || ["rk4-step-doubling", "rk45"].includes(String(solver.method))) &&
    (solver.mode === undefined || ["time-trajectory", "normalized-field-line"].includes(String(solver.mode))) &&
    (solver.maxLineLength === undefined || finite(solver.maxLineLength) &&
      solver.maxLineLength > 0 && solver.maxLineLength <= 1e9) &&
    finite(solver.absoluteTolerance) && solver.absoluteTolerance >= 1e-12 && solver.absoluteTolerance <= 1 &&
    finite(solver.relativeTolerance) && solver.relativeTolerance >= 1e-12 && solver.relativeTolerance <= 1 &&
    integer(solver.maxSteps, 1, 100000) && finite(solver.maxTime) && solver.maxTime > 0 && solver.maxTime <= 1e6 &&
    (solver.maxArcLength === undefined || finite(solver.maxArcLength) && solver.maxArcLength > 0 &&
      solver.maxArcLength <= 1e9);
};

export const normalizeVectorField3DDocument = (value: unknown): ValidationResult<VectorField3DDocument> => {
  if (!record(value) || value.format !== VECTOR_FIELD3D_DOCUMENT_FORMAT ||
      value.schemaVersion !== VECTOR_FIELD3D_DOCUMENT_SCHEMA_VERSION)
    return { ok: false, errors: ["Unsupported 3D vector-field document format or version."] };
  if (!(exact(value, ["format", "schemaVersion", "identity", "source", "metadata"]) ||
      exact(value, ["format", "schemaVersion", "identity", "source", "metadata", "workspace"])) ||
      !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:vector-field3d:") ||
      !validSource(value.source) || !record(value.metadata) ||
      !exact(value.metadata, ["title"]) || !text(value.metadata.title, 160))
    return { ok: false, errors: ["Invalid 3D vector-field document source, identity or metadata."] };
  const source = value.source as VectorField3DSource;
  const legacyWorkspace = value.workspace ?? defaultVectorField3DWorkspace(source);
  const defaults = defaultVectorField3DWorkspace(source);
  const workspace = record(legacyWorkspace) ? {
    ...legacyWorkspace,
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "sliceChannel") ?
      { sliceChannel: defaults.sliceChannel } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "probe") ? { probe: null } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "linkedProbe") ?
      { linkedProbe: null } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "hiddenSeedGroups") ?
      { hiddenSeedGroups: [] } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "seedGroupStyles") ?
      { seedGroupStyles: [] } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "equilibriumConstructions") ?
      { equilibriumConstructions: [] } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "clipBounds") ?
      { clipBounds: defaults.clipBounds } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "isosurfaceLevel") ?
      { isosurfaceLevel: null } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "isosurfaceTriangleBudget") ?
      { isosurfaceTriangleBudget: 40_000 } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "cameraPreset") ?
      { cameraPreset: defaults.cameraPreset } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "viewsLinked") ?
      { viewsLinked: defaults.viewsLinked } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "viewZoom") ?
      { viewZoom: defaults.viewZoom } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "viewCenter") ?
      { viewCenter: defaults.viewCenter } : {}),
    ...(!Object.prototype.hasOwnProperty.call(legacyWorkspace, "cameraState") ?
      { cameraState: null } : {}),
  } : legacyWorkspace;
  if (!record(workspace) || !exact(workspace,
      ["selectedLayer", "sliceChannel", "layout", "sliceCoordinates", "viewsLinked", "viewZoom", "viewCenter", "probe", "linkedProbe", "hiddenSeedGroups", "seedGroupStyles", "equilibriumConstructions", "isosurfaceLevel", "isosurfaceTriangleBudget", "clipBounds", "cameraPreset", "cameraState"]) ||
      workspace.isosurfaceLevel !== null && (!finite(workspace.isosurfaceLevel) ||
        workspace.isosurfaceLevel < 0 || workspace.isosurfaceLevel > 1e9) ||
      !integer(workspace.isosurfaceTriangleBudget, 1, 100_000) ||
      !Array.isArray(workspace.hiddenSeedGroups) || workspace.hiddenSeedGroups.length > 32 ||
      workspace.hiddenSeedGroups.some((group: unknown) => !text(group, 64)) ||
      new Set(workspace.hiddenSeedGroups).size !== workspace.hiddenSeedGroups.length ||
      !Array.isArray(workspace.seedGroupStyles) || workspace.seedGroupStyles.length > 32 ||
      workspace.seedGroupStyles.some((style: unknown) => !record(style) ||
        !exact(style, ["id", "name", "color"]) || !text(style.id, 64) ||
        !text(style.name, 64) || typeof style.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(style.color) ||
        !(source.seeds as VectorField3DSource["seeds"]).some(seed =>
          (seed.group ?? "manual") === style.id)) ||
      new Set((workspace.seedGroupStyles as { id: string }[]).map(style => style.id)).size !==
        workspace.seedGroupStyles.length ||
      new Set((workspace.seedGroupStyles as { name: string }[]).map(style =>
        style.name.toLowerCase())).size !== workspace.seedGroupStyles.length ||
      !["component", "divergence", "curl-magnitude", "curl-x", "curl-y", "curl-z",
        "grad-speed-x", "grad-speed-y", "grad-speed-z", "grad-speed-magnitude",
        "laplacian-speed"]
        .includes(String(workspace.sliceChannel)) ||
      !["arrows", "trajectories", "xy", "xz", "yz"].includes(String(workspace.selectedLayer)) ||
      !["three-pane", "viewer-focus", "split", "quad"].includes(String(workspace.layout)) ||
      !["perspective", "xy", "xz", "yz"].includes(String(workspace.cameraPreset)) ||
      typeof workspace.viewsLinked !== "boolean" || !record(workspace.viewZoom) ||
      !exact(workspace.viewZoom, ["xy", "xz", "yz"]) ||
      ["xy", "xz", "yz"].some(layer => !finite((workspace.viewZoom as Record<string, unknown>)[layer]) ||
        Number((workspace.viewZoom as Record<string, unknown>)[layer]) < 1 ||
        Number((workspace.viewZoom as Record<string, unknown>)[layer]) > 8) ||
      !record(workspace.viewCenter) || !exact(workspace.viewCenter, ["xy", "xz", "yz"]) ||
      ["xy", "xz", "yz"].some(layer => {
        const center = (workspace.viewCenter as Record<string, unknown>)[layer];
        const edge = 0.5 / Number((workspace.viewZoom as Record<string, unknown>)[layer]);
        return !Array.isArray(center) || center.length !== 2 || center.some(value =>
          !finite(value) || value < edge || value > 1 - edge);
      }) ||
      workspace.cameraState !== null && (!record(workspace.cameraState) ||
        !exact(workspace.cameraState, ["position", "target", "zoom"]) ||
        !tuple3(workspace.cameraState.position) || !tuple3(workspace.cameraState.target) ||
        [...workspace.cameraState.position, ...workspace.cameraState.target].some(value =>
          !finite(value) || Math.abs(value) > 1e4) ||
        !finite(workspace.cameraState.zoom) || workspace.cameraState.zoom <= 0 ||
        workspace.cameraState.zoom > 1e4) ||
      !tuple3(workspace.sliceCoordinates) ||
      !scientificPointWithinBounds(workspace.sliceCoordinates as number[], source.axes) ||
      workspace.probe !== null && (!tuple3(workspace.probe) ||
        !scientificPointWithinBounds(workspace.probe as number[], source.axes)) ||
      workspace.linkedProbe !== null && (!record(workspace.linkedProbe) ||
        !exact(workspace.linkedProbe, ["point", "units"]) ||
        !tuple3(workspace.linkedProbe.point) ||
        workspace.linkedProbe.point.some(value => !finite(value) || Math.abs(value) > 1e9) ||
        !tuple3(workspace.linkedProbe.units) ||
        workspace.linkedProbe.units.some(value => !text(value))) ||
      !Array.isArray(workspace.equilibriumConstructions) ||
      workspace.equilibriumConstructions.length > 32 ||
      workspace.equilibriumConstructions.some((item: unknown) => !record(item) ||
        !exact(item, ["id", "position", "residual", "classification", "sourceRevision", "sourceStructuralHash", "sourceHash"]) ||
        !text(item.id, 64) || !tuple3(item.position) ||
        item.position.some(value => !finite(value) || Math.abs(value) > 1e9) ||
        !finite(item.residual) || item.residual < 0 ||
        !["source", "sink", "saddle", "spiral-source", "spiral-sink", "spiral-saddle",
          "degenerate/uncertain"].includes(String(item.classification)) ||
        !integer(item.sourceRevision, 1, Number.MAX_SAFE_INTEGER) ||
        !text(item.sourceStructuralHash, 160) ||
        item.sourceHash !== null && !text(item.sourceHash, 160)) ||
      new Set((workspace.equilibriumConstructions as { id: string }[]).map(item => item.id)).size !==
        workspace.equilibriumConstructions.length ||
      !tuple3(workspace.clipBounds) ||
      workspace.clipBounds.some((bounds: unknown, axis: number) =>
        !Array.isArray(bounds) || bounds.length !== 2 || !finite(bounds[0]) || !finite(bounds[1]) ||
        bounds[0] < source.axes[axis]!.min || bounds[1] > source.axes[axis]!.max ||
        bounds[0] >= bounds[1]))
    return { ok: false, errors: ["Invalid 3D field workspace layer, layout, probe, clip bounds or camera preset."] };
  try {
    const serialized = canonical({ ...value, workspace });
    if (new TextEncoder().encode(serialized).length > VECTOR_FIELD3D_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["3D vector-field document exceeds size limit."] };
    const document = JSON.parse(serialized) as VectorField3DDocument;
    if (document.identity.structuralHash !== structuralHash(document.source))
      return { ok: false, errors: ["3D vector-field structural hash does not match source."] };
    return { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [(error as Error).message] }; }
};

export const vectorField3DExpression = (source: string, unit: string): VectorField3DExpression => {
  const parsed = parseGraph2DExpression(source, ["x", "y", "z"]);
  if (!parsed.ok) throw new TypeError(parsed.diagnostics.map(issue => issue.message).join(" "));
  return { source, ast: parsed.ast, unit };
};
export const createVectorField3DDocument = (source: VectorField3DSource,
  options: Readonly<{ stableKey: CanonicalJsonValue; title?: string; identity?: DocumentIdentity;
    workspace?: VectorField3DWorkspace }>): VectorField3DDocument => {
  const checked = JSON.parse(canonical(source)) as VectorField3DSource;
  const candidate = { format: VECTOR_FIELD3D_DOCUMENT_FORMAT, schemaVersion: VECTOR_FIELD3D_DOCUMENT_SCHEMA_VERSION,
    identity: options.identity ?? createDocumentIdentity(createStableDocumentId("vector-field3d", options.stableKey), checked),
    source: checked, metadata: { title: options.title ?? "3D vector field" },
    workspace: options.workspace ?? defaultVectorField3DWorkspace(checked) };
  const normalized = normalizeVectorField3DDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
export const reviseVectorField3DDocument = (document: VectorField3DDocument,
  source: VectorField3DSource): VectorField3DDocument => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const nextSource = JSON.parse(canonical(source)) as VectorField3DSource;
  return createVectorField3DDocument(nextSource, { stableKey: checked.value.identity.id,
    title: checked.value.metadata.title,
    identity: advanceDocumentIdentity(checked.value.identity, nextSource),
    workspace: checked.value.workspace });
};
export const reviseVectorField3DWorkspace = (document: VectorField3DDocument,
  workspace: VectorField3DWorkspace): VectorField3DDocument => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const candidate = normalizeVectorField3DDocument({ ...checked.value, workspace });
  if (!candidate.ok) throw new TypeError(candidate.errors.join(" "));
  return candidate.value;
};
export const serializeVectorField3DDocument = (document: VectorField3DDocument): string => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return canonical(checked.value);
};
export const parseVectorField3DDocument = (serialized: string): VectorField3DDocument => {
  if (new TextEncoder().encode(serialized).length > VECTOR_FIELD3D_MAX_DOCUMENT_BYTES)
    throw new TypeError("3D vector-field document exceeds size limit.");
  const checked = normalizeVectorField3DDocument(JSON.parse(serialized));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

export type VectorField3DArrowArtifact = Readonly<{ source: Readonly<{ documentId: string; revision: number;
  structuralHash: string }>; verifiedSamples: Readonly<{ sourceHash: string; viewHash: string;
    sampleShape: readonly [number, number, number];
    components: readonly Readonly<{ name: string; sampleSha256: string;
      verifiedChunks?: Readonly<{ loaded: number; total: number }>;
      verifiedTiles?: Readonly<{ loaded: number; total: number }>;
      verifiedOverview?: string }>[] }> | null;
  density: readonly [number, number, number]; evaluated: number; accepted: number;
  rejected: number; stationary: number; arrows: readonly Readonly<{ position: readonly [number, number, number];
    vector: readonly [number, number, number]; magnitude: number; kind: "arrow" | "stationary" }>[];
  coordinateUnits: readonly [string, string, string]; componentUnits: readonly [string, string, string];
  timeUnit: string; magnitudeScale: number; colorBy: VectorField3DSource["display"]["colorBy"] }>;

/** Pure world-space samples; camera projection and trajectories have independent future budgets. */
export const sampleVectorField3DArrows = (document: VectorField3DDocument): VectorField3DArrowArtifact => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const { source } = checked.value;
  if (source.field.kind !== "expressions")
    throw new TypeError("Reverify all three scientific bundle components before publishing 3D arrows.");
  const density = source.display.density;
  const evaluated = density[0] * density[1] * density[2];
  if (evaluated > source.display.maxGlyphs)
    throw new TypeError("3D arrow density exceeds the authored glyph budget.");
  const arrows: VectorField3DArrowArtifact["arrows"][number][] = [];
  let rejected = 0, stationary = 0;
  for (let i = 0; i < density[0]; i++) for (let j = 0; j < density[1]; j++) for (let k = 0; k < density[2]; k++) {
    const position = [i, j, k].map((index, axis) => {
      const bounds = source.axes[axis]!;
      return index === density[axis]! - 1 ? bounds.max :
        bounds.min + (bounds.max - bounds.min) * index / (density[axis]! - 1);
    }) as [number, number, number];
    const variables = { x: position[0], y: position[1], z: position[2] };
    const values = source.field.components.map(component => evaluateGraph2DExpression(component.ast, variables,
      { maxEvaluations: 256 }));
    if (values.some(result => !result.ok)) { rejected++; continue; }
    const vector = values.map(result => result.ok ? Object.is(result.value, -0) ? 0 : result.value : NaN) as
      [number, number, number];
    const magnitude = Math.hypot(...vector);
    if (!Number.isFinite(magnitude)) { rejected++; continue; }
    const kind = magnitude === 0 ? "stationary" : "arrow";
    if (kind === "stationary") stationary++;
    arrows.push({ position, vector, magnitude, kind });
  }
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash }, verifiedSamples: null,
    density, evaluated, accepted: arrows.length, rejected, stationary,
    arrows, coordinateUnits: source.axes.map(axis => axis.unit) as [string, string, string],
    componentUnits: source.field.components.map(component => component.unit) as [string, string, string],
    timeUnit: source.timeUnit, magnitudeScale: source.display.magnitudeScale, colorBy: source.display.colorBy };
};
