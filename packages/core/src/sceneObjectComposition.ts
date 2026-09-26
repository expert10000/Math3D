import {
  canonicalJsonStringify,
  type CanonicalJsonValue,
  type StructuralHash,
} from "./documentIdentity";
import {
  createSceneObjectEnvelope,
  validateSceneObjectEnvelope,
  type SceneObjectEnvelope,
  type SceneObjectProducer,
} from "./sceneObjectTransfer";

export const SCENE_OBJECT_COMPOSITION_VERSION = 1 as const;
export const MAX_SCENE_OBJECT_COMPOSITION_OBJECTS = 512;
export const MAX_SCENE_OBJECT_COMPOSITION_DEPENDENCIES = 4_096;

export type SceneObjectDependency = Readonly<{
  fromObjectId: string;
  toObjectId: string;
  relation: string;
  referencePath: string | null;
}>;

export type SceneObjectCompositionInput = Readonly<{
  sourceFormat: string;
  sourceProjectId: string;
  objects: readonly SceneObjectEnvelope[];
  dependencies: readonly SceneObjectDependency[];
}>;

export type SceneObjectRemapProvenance = Readonly<{
  sourceFormat: string;
  sourceProjectId: string;
  sourceObjectId: string;
  sourceContentHash: StructuralHash;
  producer: SceneObjectProducer;
  importedAt: number;
  destinationObjectId: string;
  destinationContentHash: StructuralHash;
}>;

export type SceneObjectCompositionPlan = Readonly<{
  version: typeof SCENE_OBJECT_COMPOSITION_VERSION;
  idMap: Readonly<Record<string, string>>;
  objects: readonly SceneObjectEnvelope[];
  dependencies: readonly SceneObjectDependency[];
  provenance: readonly SceneObjectRemapProvenance[];
}>;

export type SceneObjectCompositionResult =
  | { ok: true; plan: SceneObjectCompositionPlan }
  | { ok: false; errors: readonly string[] };

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const SAFE_RELATION = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const EXTERNAL_SOURCE = /^(?:[a-z]+:\/\/|[a-zA-Z]:[\\/]|\\\\|\/)/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const cloneCanonical = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const dependencyKey = (dependency: SceneObjectDependency): string => [
  dependency.fromObjectId,
  dependency.toObjectId,
  dependency.relation,
  dependency.referencePath ?? "",
].join("\u0000");

const decodePointerSegment = (segment: string): string | null => {
  if (/~(?:[^01]|$)/.test(segment)) return null;
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
};

const referencePathSegments = (path: string): string[] | null => {
  if (!path.startsWith("/analysisMetadata/") || path.endsWith("/") || path.length > 512) return null;
  const decoded = path.slice(1).split("/").map(decodePointerSegment);
  return decoded.some((segment) => segment === null) ? null : decoded as string[];
};

const valueAtPath = (root: unknown, segments: readonly string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else return undefined;
  }
  return current;
};

const replaceValueAtPath = (root: unknown, segments: readonly string[], value: string): boolean => {
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) return false;
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else return false;
  }
  const finalSegment = segments.at(-1);
  if (finalSegment === undefined) return false;
  if (Array.isArray(current)) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(finalSegment) || Number(finalSegment) >= current.length) return false;
    current[Number(finalSegment)] = value;
    return true;
  }
  if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, finalSegment)) return false;
  current[finalSegment] = value;
  return true;
};

const uniqueId = (preferred: string, reserved: Set<string>): string => {
  if (!reserved.has(preferred)) return preferred;
  let suffix = 2;
  while (reserved.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
};

const validateInput = (
  input: SceneObjectCompositionInput,
  destinationObjectIds: readonly string[],
  importedAt: number
): string[] => {
  const errors: string[] = [];
  if (!input.sourceFormat || input.sourceFormat.length > 120 || EXTERNAL_SOURCE.test(input.sourceFormat)) {
    errors.push("sourceFormat must be a bounded portable format name.");
  }
  if (!SAFE_ID.test(input.sourceProjectId)) errors.push("sourceProjectId must be a portable identifier.");
  if (!Number.isFinite(importedAt) || importedAt < 0) errors.push("importedAt must be a non-negative finite timestamp.");
  if (!Array.isArray(input.objects) || input.objects.length === 0 || input.objects.length > MAX_SCENE_OBJECT_COMPOSITION_OBJECTS) {
    errors.push(`objects must contain 1 to ${MAX_SCENE_OBJECT_COMPOSITION_OBJECTS} entries.`);
  }
  if (!Array.isArray(input.dependencies) || input.dependencies.length > MAX_SCENE_OBJECT_COMPOSITION_DEPENDENCIES) {
    errors.push(`dependencies cannot exceed ${MAX_SCENE_OBJECT_COMPOSITION_DEPENDENCIES} entries.`);
  }
  const sourceIds = new Set<string>();
  for (const [index, object] of input.objects.entries()) {
    const validated = validateSceneObjectEnvelope(object);
    if (!validated.ok) errors.push(`objects[${index}] is invalid: ${validated.errors.join("; ")}`);
    const objectId = isRecord(object?.object) && typeof object.object.id === "string" ? object.object.id : "";
    if (sourceIds.has(objectId)) errors.push(`Source object ID '${objectId}' is duplicated.`);
    sourceIds.add(objectId);
  }
  const destinationIds = new Set<string>();
  for (const [index, objectId] of destinationObjectIds.entries()) {
    if (!SAFE_ID.test(objectId)) errors.push(`destinationObjectIds[${index}] is not portable.`);
    if (destinationIds.has(objectId)) errors.push(`Destination object ID '${objectId}' is duplicated.`);
    destinationIds.add(objectId);
  }
  const dependencyKeys = new Set<string>();
  for (const [index, dependency] of input.dependencies.entries()) {
    const path = `dependencies[${index}]`;
    if (!isRecord(dependency)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    const fields = Object.keys(dependency).sort();
    if (fields.join(",") !== "fromObjectId,referencePath,relation,toObjectId") errors.push(`${path} has unsupported or missing fields.`);
    if (!sourceIds.has(dependency.fromObjectId)) errors.push(`${path}.fromObjectId '${dependency.fromObjectId}' is not in the source selection.`);
    if (!sourceIds.has(dependency.toObjectId)) errors.push(`${path}.toObjectId '${dependency.toObjectId}' is a dangling dependency.`);
    if (!SAFE_RELATION.test(dependency.relation) || dependency.relation.length > 120) errors.push(`${path}.relation is invalid.`);
    if (!(dependency.referencePath === null || typeof dependency.referencePath === "string")) errors.push(`${path}.referencePath must be a JSON pointer or null.`);
    if (typeof dependency.referencePath === "string") {
      const segments = referencePathSegments(dependency.referencePath);
      if (!segments) errors.push(`${path}.referencePath must point inside analysisMetadata.`);
      else {
        const sourceObject = input.objects.find((object) => object.object.id === dependency.fromObjectId);
        if (sourceObject && valueAtPath(sourceObject, segments) !== dependency.toObjectId) {
          errors.push(`${path}.referencePath does not contain '${dependency.toObjectId}'.`);
        }
      }
    }
    const key = dependencyKey(dependency);
    if (dependencyKeys.has(key)) errors.push(`${path} duplicates another dependency.`);
    dependencyKeys.add(key);
  }
  return errors;
};

export const planSceneObjectComposition = (
  input: SceneObjectCompositionInput,
  options: Readonly<{ destinationObjectIds: readonly string[]; importedAt: number }>
): SceneObjectCompositionResult => {
  const errors = validateInput(input, options.destinationObjectIds, options.importedAt);
  if (errors.length > 0) return { ok: false, errors };

  const sourceObjects = [...input.objects].sort((left, right) => compareText(left.object.id, right.object.id));
  const reserved = new Set(options.destinationObjectIds);
  const idMap: Record<string, string> = {};
  for (const object of sourceObjects) {
    const destinationId = uniqueId(object.object.id, reserved);
    reserved.add(destinationId);
    idMap[object.object.id] = destinationId;
  }

  const dependencies = [...input.dependencies]
    .sort((left, right) => compareText(dependencyKey(left), dependencyKey(right)))
    .map((dependency) => ({
      ...dependency,
      fromObjectId: idMap[dependency.fromObjectId],
      toObjectId: idMap[dependency.toObjectId],
    }));

  const objects: SceneObjectEnvelope[] = [];
  const provenance: SceneObjectRemapProvenance[] = [];
  for (const source of sourceObjects) {
    const mutable = cloneCanonical(source) as unknown as Record<string, unknown>;
    for (const dependency of input.dependencies.filter((entry) => entry.fromObjectId === source.object.id && entry.referencePath !== null)) {
      const segments = referencePathSegments(dependency.referencePath!);
      if (!segments || !replaceValueAtPath(mutable, segments, idMap[dependency.toObjectId])) {
        return { ok: false, errors: [`Failed to rewrite '${dependency.referencePath}' for '${source.object.id}'.`] };
      }
    }
    const rewrittenMetadata = (mutable.analysisMetadata ?? {}) as Readonly<Record<string, CanonicalJsonValue>>;
    const destinationObjectId = idMap[source.object.id];
    const destination = createSceneObjectEnvelope({
      producer: source.producer,
      object: {
        ...source.object,
        id: destinationObjectId,
        definition: { ...source.object.definition, id: destinationObjectId },
      },
      geometry: source.geometry,
      provenance: {
        sourceFormat: input.sourceFormat,
        sourceProjectId: input.sourceProjectId,
        sourceObjectId: source.object.id,
        importedAt: options.importedAt,
      },
      analysisMetadata: rewrittenMetadata,
    });
    objects.push(destination);
    provenance.push({
      sourceFormat: input.sourceFormat,
      sourceProjectId: input.sourceProjectId,
      sourceObjectId: source.object.id,
      sourceContentHash: source.contentHash,
      producer: source.producer,
      importedAt: options.importedAt,
      destinationObjectId,
      destinationContentHash: destination.contentHash,
    });
  }

  const plan: SceneObjectCompositionPlan = cloneCanonical({
    version: SCENE_OBJECT_COMPOSITION_VERSION,
    idMap,
    objects,
    dependencies,
    provenance,
  });
  const planErrors = validateSceneObjectCompositionPlan(plan);
  return planErrors.length > 0 ? { ok: false, errors: planErrors } : { ok: true, plan };
};

export const validateSceneObjectCompositionPlan = (plan: SceneObjectCompositionPlan): string[] => {
  const errors: string[] = [];
  if (!isRecord(plan) || plan.version !== SCENE_OBJECT_COMPOSITION_VERSION) return ["Composition plan version is invalid."];
  if (!isRecord(plan.idMap)) errors.push("idMap must be an object.");
  if (!Array.isArray(plan.objects) || plan.objects.length === 0) errors.push("objects must be a non-empty array.");
  if (!Array.isArray(plan.dependencies)) errors.push("dependencies must be an array.");
  if (!Array.isArray(plan.provenance)) errors.push("provenance must be an array.");
  if (errors.length > 0) return errors;
  const objectIds = new Set<string>();
  for (const [index, object] of plan.objects.entries()) {
    const validated = validateSceneObjectEnvelope(object);
    if (!validated.ok) errors.push(`objects[${index}] is invalid: ${validated.errors.join("; ")}`);
    if (objectIds.has(object.object.id)) errors.push(`objects[${index}] duplicates '${object.object.id}'.`);
    objectIds.add(object.object.id);
  }
  for (const [index, dependency] of plan.dependencies.entries()) {
    if (!objectIds.has(dependency.fromObjectId) || !objectIds.has(dependency.toObjectId)) {
      errors.push(`dependencies[${index}] contains a dangling reference.`);
    }
    if (dependency.referencePath) {
      const source = plan.objects.find((object) => object.object.id === dependency.fromObjectId);
      const segments = referencePathSegments(dependency.referencePath);
      if (!source || !segments || valueAtPath(source, segments) !== dependency.toObjectId) {
        errors.push(`dependencies[${index}] reference path was not rewritten.`);
      }
    }
  }
  if (plan.provenance.length !== plan.objects.length) errors.push("provenance must contain one entry per object.");
  for (const [sourceId, destinationId] of Object.entries(plan.idMap)) {
    if (!SAFE_ID.test(sourceId) || !objectIds.has(destinationId)) errors.push(`idMap entry '${sourceId}' is invalid.`);
  }
  for (const [index, record] of plan.provenance.entries()) {
    const object = plan.objects.find((candidate) => candidate.object.id === record.destinationObjectId);
    if (!object || object.contentHash !== record.destinationContentHash) errors.push(`provenance[${index}] does not match its destination object.`);
    if (plan.idMap[record.sourceObjectId] !== record.destinationObjectId) errors.push(`provenance[${index}] does not match idMap.`);
  }
  return errors;
};

export const serializeSceneObjectCompositionPlan = (plan: SceneObjectCompositionPlan): string => {
  const errors = validateSceneObjectCompositionPlan(plan);
  if (errors.length > 0) throw new TypeError(errors.join(" "));
  return canonicalJsonStringify(plan);
};
