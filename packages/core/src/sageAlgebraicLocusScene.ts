/** Exact algebra source and bounded real-coordinate intent, before any numerical plot is made. */
import { canonicalJsonStringify, createStableDocumentId, isStableDocumentId, isStructuralHash,
  structuralHash, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { parseAlgebraObjectRecord, type AlgebraObjectRecord, type AlgebraObjectRef } from "./algebraObjects";
import { parseIdealGenerator } from "./algebraIdealGenerators";
import { inspectProjectAlgebraFreshness } from "./projectAlgebraRegistry";
import type { Math3DProject } from "./math3dProject";
import { createGeometryDocument, normalizeGeometryDocument, type GeometryDocument } from "./geometryDocument";
import { canonicalJsonByteLength } from "./scientificJobs";

export const SAGE_LOCUS_SCENE_FORMAT = "math3d.sage-algebraic-locus-scene";
export const SAGE_LOCUS_GEOMETRY_EXTENSION = "math3d.sage-algebraic-locus-scene.v1";
export const MAX_LOCUS_SCENE_BYTES = 32 * 1024;
export type SageLocusAxis = "x" | "y" | "z";
export type SageLocusBound = Readonly<{ variable: string; axis: SageLocusAxis; min: number; max: number }>;
export type SageLocusSettings = Readonly<{ polynomial?: string;
  bounds: readonly Readonly<{ min: number; max: number }>[];
  tolerance: number; maxSamples: number }>;
export type SageAlgebraicLocusScene = Readonly<{ format: typeof SAGE_LOCUS_SCENE_FORMAT; schemaVersion: 1;
  id: StableDocumentId; sceneHash: StructuralHash;
  source: Readonly<{ projectId: StableDocumentId; target: AlgebraObjectRecord;
    ambientRing: AlgebraObjectRecord; coefficientRing: AlgebraObjectRecord;
    equations: readonly string[] }>;
  domain: Readonly<{ kind: "real"; coordinates: "cartesian"; units: "unitless";
    bounds: readonly SageLocusBound[] }>;
  precision: Readonly<{ tolerance: number; maxSamples: number }>;
  rendering: Readonly<{ status: "uncomputed"; algorithm: null; completeness: "unknown";
    singularityWarnings: readonly string[] }> }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const sameRef = (ref: AlgebraObjectRef, record: AlgebraObjectRecord) =>
  ref.objectId === record.id && ref.revision === record.revision;
const bounded = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) &&
  Math.abs(value) <= 1_000_000;
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const axes: readonly SageLocusAxis[] = ["x", "y", "z"];

/** Standalone import checks every embedded object hash, ring edge, equation and display-policy field. */
export const parseSageAlgebraicLocusScene = (value: unknown, project?: Math3DProject): SageAlgebraicLocusScene => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "id", "sceneHash", "source",
    "domain", "precision", "rendering"]) || value.format !== SAGE_LOCUS_SCENE_FORMAT ||
    value.schemaVersion !== 1 || !isStableDocumentId(value.id) || !isStructuralHash(value.sceneHash) ||
    !object(value.source) || !exact(value.source, ["projectId", "target", "ambientRing", "coefficientRing", "equations"]) ||
    !isStableDocumentId(value.source.projectId) || !object(value.domain) ||
    !exact(value.domain, ["kind", "coordinates", "units", "bounds"]) || value.domain.kind !== "real" ||
    value.domain.coordinates !== "cartesian" || value.domain.units !== "unitless" ||
    !object(value.precision) || !exact(value.precision, ["tolerance", "maxSamples"]) ||
    !object(value.rendering) || !exact(value.rendering, ["status", "algorithm", "completeness", "singularityWarnings"]) ||
    value.rendering.status !== "uncomputed" || value.rendering.algorithm !== null ||
    value.rendering.completeness !== "unknown" || !Array.isArray(value.rendering.singularityWarnings) ||
    value.rendering.singularityWarnings.length !== 0)
    throw new TypeError("Invalid versioned algebraic-locus scene contract.");
  const source = value.source;
  const target = parseAlgebraObjectRecord(source.target), ambient = parseAlgebraObjectRecord(source.ambientRing),
    coefficient = parseAlgebraObjectRecord(source.coefficientRing);
  if (ambient.definition.kind !== "polynomial-ring" || coefficient.definition.kind !== "rational-field" ||
    !sameRef(ambient.definition.coefficientDomain, coefficient) ||
    !["ideal", "polynomial-ring"].includes(target.definition.kind) ||
    (target.definition.kind === "ideal" && !sameRef(target.definition.ambientRing, ambient)) ||
    (target.definition.kind === "polynomial-ring" && (target.id !== ambient.id || target.revision !== ambient.revision)) ||
    ambient.definition.variables.length < 1 || ambient.definition.variables.length > 3 ||
    !Array.isArray(source.equations) || source.equations.length < 1 || source.equations.length > 6 ||
    (target.definition.kind === "ideal" && canonicalJsonStringify(source.equations) !==
      canonicalJsonStringify(target.definition.generators)))
    throw new TypeError("Locus source must be an ideal or one polynomial in a pinned QQ ring with 1–3 variables.");
  const variables = ambient.definition.variables;
  const equations = source.equations.map((entry: unknown) => parseIdealGenerator(entry, variables));
  if (target.definition.kind === "polynomial-ring" && equations.length !== 1)
    throw new TypeError("A polynomial-ring locus requires exactly one saved equation in the scene contract.");
  if (!Array.isArray(value.domain.bounds) || value.domain.bounds.length !== variables.length ||
    !value.domain.bounds.every((item: unknown, index: number) => object(item) &&
      exact(item, ["variable", "axis", "min", "max"]) && item.variable === variables[index] &&
      item.axis === axes[index] && bounded(item.min) && bounded(item.max) &&
      (item.max as number) - (item.min as number) >= 1e-9) ||
    typeof value.precision.tolerance !== "number" || !Number.isFinite(value.precision.tolerance) ||
    value.precision.tolerance < 1e-6 || value.precision.tolerance > 0.1 ||
    !Number.isSafeInteger(value.precision.maxSamples) || (value.precision.maxSamples as number) < 1000 ||
    (value.precision.maxSamples as number) > 200000)
    throw new TypeError("Locus bounds, Cartesian axes or numerical precision are invalid or unbounded.");
  const projectId = source.projectId as StableDocumentId;
  const domain = value.domain as SageAlgebraicLocusScene["domain"];
  const precision = value.precision as SageAlgebraicLocusScene["precision"];
  const rendering = value.rendering as SageAlgebraicLocusScene["rendering"];
  const base = { format: SAGE_LOCUS_SCENE_FORMAT, schemaVersion: 1 as const,
    source: { projectId, target, ambientRing: ambient, coefficientRing: coefficient,
      equations }, domain, precision, rendering };
  const id = createStableDocumentId("algebraic-locus", { projectId, targetId: target.id,
    revision: target.revision, equations, bounds: domain.bounds,
    tolerance: precision.tolerance, maxSamples: precision.maxSamples });
  if (value.id !== id || value.sceneHash !== structuralHash(base))
    throw new TypeError("Locus scene ID or structural hash differs from its exact source and settings.");
  if (project) {
    if (project.identity.id !== source.projectId) throw new TypeError("Locus scene belongs to another Project.");
    for (const embedded of [target, ambient, coefficient]) {
      const pinned = project.algebraObjects?.find((entry) => entry.id === embedded.id)?.revisions[embedded.revision - 1];
      if (!pinned || canonicalJsonStringify(pinned) !== canonicalJsonStringify(embedded))
        throw new TypeError("Locus scene source differs from its pinned Project revision.");
    }
  }
  const scene = { ...base, id, sceneHash: value.sceneHash } as SageAlgebraicLocusScene;
  if (canonicalJsonStringify(value) !== canonicalJsonStringify(scene))
    throw new TypeError("Locus scene fields differ from their canonical exact-source contract.");
  if (canonicalJsonByteLength(scene) > MAX_LOCUS_SCENE_BYTES)
    throw new TypeError("Locus scene contract exceeds its size limit.");
  return clone(scene);
};

export const buildSageAlgebraicLocusScene = (project: Math3DProject, targetRef: AlgebraObjectRef,
  settings: SageLocusSettings): SageAlgebraicLocusScene => {
  const entry = project.algebraObjects?.find((item) => item.id === targetRef.objectId);
  const target = entry?.revisions[targetRef.revision - 1];
  if (!entry || !target || entry.archived || target.revision !== entry.revisions.length ||
    inspectProjectAlgebraFreshness(project).find((item) => item.objectId === target.id)?.status !== "fresh")
    throw new TypeError("Choose a current, fresh polynomial ring or ideal revision for a real locus.");
  const targetDefinition = target.definition;
  const ambient = targetDefinition.kind === "ideal"
    ? project.algebraObjects?.find((item) => item.id === targetDefinition.ambientRing.objectId)
      ?.revisions[targetDefinition.ambientRing.revision - 1]
    : targetDefinition.kind === "polynomial-ring" ? target : null;
  if (ambient?.definition.kind !== "polynomial-ring") throw new TypeError("Real locus requires a pinned QQ polynomial ring.");
  const ambientDefinition = ambient.definition;
  const coefficient = project.algebraObjects?.find((item) => item.id === ambientDefinition.coefficientDomain.objectId)
    ?.revisions[ambientDefinition.coefficientDomain.revision - 1];
  if (coefficient?.definition.kind !== "rational-field") throw new TypeError("Real locus requires a ring directly over QQ.");
  if (!Array.isArray(settings.bounds) || settings.bounds.length !== ambient.definition.variables.length ||
      !settings.bounds.every((item) => object(item) && bounded(item.min) && bounded(item.max) &&
        (item.max as number) - (item.min as number) >= 1e-9) ||
      typeof settings.tolerance !== "number" || !Number.isFinite(settings.tolerance) ||
      settings.tolerance < 1e-6 || settings.tolerance > 0.1 ||
      !Number.isSafeInteger(settings.maxSamples) || settings.maxSamples < 1000 || settings.maxSamples > 200000)
    throw new TypeError("Real-locus bounds or numerical precision are invalid or unbounded.");
  if (target.definition.kind === "polynomial-ring" && typeof settings.polynomial !== "string")
    throw new TypeError("Enter one exact polynomial equation in the selected ring.");
  if (target.definition.kind === "ideal" && settings.polynomial !== undefined)
    throw new TypeError("An ideal locus uses its saved generators; no replacement equation is accepted.");
  const equations = target.definition.kind === "ideal" ? [...target.definition.generators] :
    [parseIdealGenerator(settings.polynomial, ambient.definition.variables)];
  const base = { format: SAGE_LOCUS_SCENE_FORMAT, schemaVersion: 1,
    source: { projectId: project.identity.id, target, ambientRing: ambient, coefficientRing: coefficient, equations },
    domain: { kind: "real" as const, coordinates: "cartesian" as const, units: "unitless" as const,
      bounds: ambient.definition.variables.map((variable, index) => ({ variable, axis: axes[index],
        min: settings.bounds[index]?.min, max: settings.bounds[index]?.max })) },
    precision: { tolerance: settings.tolerance, maxSamples: settings.maxSamples },
    rendering: { status: "uncomputed" as const, algorithm: null, completeness: "unknown" as const,
      singularityWarnings: [] as string[] } };
  const id = createStableDocumentId("algebraic-locus", { projectId: project.identity.id, targetId: target.id,
    revision: target.revision, equations, bounds: base.domain.bounds,
    tolerance: settings.tolerance, maxSamples: settings.maxSamples });
  return parseSageAlgebraicLocusScene({ ...base, id, sceneHash: structuralHash(base) }, project);
};

export const sageAlgebraicLocusSceneStatus = (scene: SageAlgebraicLocusScene, project: Math3DProject):
  "current" | "historical" | "stale" | "archived" | "missing" => {
  const checked = parseSageAlgebraicLocusScene(scene);
  if (checked.source.projectId !== project.identity.id) return "missing";
  const entry = project.algebraObjects?.find((item) => item.id === checked.source.target.id);
  if (!entry?.revisions[checked.source.target.revision - 1]) return "missing";
  if (entry.archived) return "archived";
  if (entry.revisions.length !== checked.source.target.revision) return "historical";
  return inspectProjectAlgebraFreshness(project).find((item) => item.objectId === entry.id)?.status === "stale"
    ? "stale" : "current";
};

/** Geometry handoff contains the exact contract and intentionally no sampled shape. */
export const algebraicLocusGeometryDocument = (scene: SageAlgebraicLocusScene): GeometryDocument => {
  const checked = parseSageAlgebraicLocusScene(scene);
  return createGeometryDocument({ stableKey: { algebraicLocusScene: checked.id },
    source: { geometry: null, objects: [], surfaces: [], constructions: [], relationships: [], parameters: {},
      extensions: { [SAGE_LOCUS_GEOMETRY_EXTENSION]: checked } },
    metadata: { title: `Real locus contract (uncomputed): ${checked.source.target.label}` },
    provenance: { sourceFormat: SAGE_LOCUS_SCENE_FORMAT, sourceVersion: 1, sourceSceneId: checked.id,
      diagnostics: ["Exact source and rendering settings retained; numerical locus not computed."] } });
};

export const parseAlgebraicLocusGeometryDocument = (value: unknown,
  project?: Math3DProject): { document: GeometryDocument; scene: SageAlgebraicLocusScene } => {
  const normalized = normalizeGeometryDocument(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const document = normalized.value, source = document.source;
  if (source.geometry !== null || source.objects.length || source.surfaces.length ||
      source.constructions.length || source.relationships.length || Object.keys(source.parameters).length ||
      Object.keys(source.extensions).length !== 1 ||
      document.provenance.sourceFormat !== SAGE_LOCUS_SCENE_FORMAT ||
      document.provenance.sourceVersion !== 1)
    throw new TypeError("F01 locus Geometry document must contain only the uncomputed source contract.");
  const scene = parseSageAlgebraicLocusScene(source.extensions[SAGE_LOCUS_GEOMETRY_EXTENSION], project);
  if (document.provenance.sourceSceneId !== scene.id)
    throw new TypeError("Geometry document provenance differs from its locus scene ID.");
  return { document, scene };
};
