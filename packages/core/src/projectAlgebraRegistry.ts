import { parseAlgebraObjectRecord, type AlgebraObjectRecord, type AlgebraObjectRef } from "./algebraObjects";
import { parseIdealGenerator } from "./algebraIdealGenerators";
import { analyzeBiquadraticExtensionFromDefinition } from "./biquadraticFieldTower";
import { validateModuleMatrixScalars, type ModuleScalarRing } from "./modulePresentations";
import { resolveChainComplex } from "./chainComplex";
import { ellipticCurveFacts } from "./ellipticCurve";
import { createStableDocumentId, isStableDocumentId, type CanonicalJsonValue, type StableDocumentId } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";

export const MAX_PROJECT_ALGEBRA_OBJECTS = 128;
export const MAX_ALGEBRA_REVISIONS_PER_OBJECT = 32;

/** One project-local identity, with immutable definition snapshots and a recoverable archive state. */
export type ProjectAlgebraObjectEntry = Readonly<{
  id: StableDocumentId;
  revisions: readonly AlgebraObjectRecord[];
  archived: boolean;
}>;

export type ProjectAlgebraStaleCause = Readonly<{
  objectId: StableDocumentId;
  pinnedRevision: number;
  currentRevision: number;
}>;

export type ProjectAlgebraObjectFreshness = Readonly<{
  objectId: StableDocumentId;
  revision: number;
  archived: boolean;
  status: "fresh" | "stale";
  causes: readonly ProjectAlgebraStaleCause[];
  directDependencies: readonly AlgebraObjectRef[];
  directDependents: readonly StableDocumentId[];
}>;

export const createProjectAlgebraObjectId = (projectId: StableDocumentId, stableKey: CanonicalJsonValue): StableDocumentId => {
  if (!isStableDocumentId(projectId) || !projectId.startsWith("math3d:project:")) {
    throw new TypeError("Algebra object ID requires a stable Project ID.");
  }
  return createStableDocumentId("algebra", { projectId, stableKey });
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

/** Validates all revision identities and every saved parent edge, including cycles. */
export const validateProjectAlgebraRegistry = (input: unknown): readonly ProjectAlgebraObjectEntry[] => {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PROJECT_ALGEBRA_OBJECTS) {
    throw new TypeError(`Project algebra registry must contain 1 to ${MAX_PROJECT_ALGEBRA_OBJECTS} objects.`);
  }
  const entries: ProjectAlgebraObjectEntry[] = input.map((value: unknown, index: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !exact(value as Record<string, unknown>, ["id", "revisions", "archived"])) {
      throw new TypeError(`Invalid algebra registry entry at index ${index}.`);
    }
    const entry = value as Record<string, unknown>;
    if (!isStableDocumentId(entry.id) || !entry.id.startsWith("math3d:algebra:")) {
      throw new TypeError(`Invalid algebra object ID at registry index ${index}.`);
    }
    if (typeof entry.archived !== "boolean") throw new TypeError(`Invalid archive state for ${entry.id}.`);
    if (!Array.isArray(entry.revisions) || entry.revisions.length < 1 || entry.revisions.length > MAX_ALGEBRA_REVISIONS_PER_OBJECT) {
      throw new TypeError(`Invalid revision history for ${entry.id}.`);
    }
    const revisions = entry.revisions.map(parseAlgebraObjectRecord);
    revisions.forEach((record, offset) => {
      if (record.id !== entry.id || record.revision !== offset + 1 || record.kind !== revisions[0].kind) {
        throw new TypeError(`Invalid or duplicate revision in algebra object ${entry.id}; expected revision ${offset + 1}.`);
      }
    });
    return Object.freeze({ id: entry.id, revisions: Object.freeze(revisions), archived: entry.archived });
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new TypeError("Duplicate algebra object IDs in Project registry.");
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (record: AlgebraObjectRecord): void => {
    const key = `${record.id}@${record.revision}`;
    if (visiting.has(key)) throw new TypeError(`Cyclic algebra object dependency at ${key}.`);
    if (visited.has(key)) return;
    visiting.add(key);
    if (record.definition.kind === "module-map") {
      const source = byId.get(record.definition.sourceModule.objectId)
        ?.revisions[record.definition.sourceModule.revision - 1];
      const target = byId.get(record.definition.targetModule.objectId)
        ?.revisions[record.definition.targetModule.revision - 1];
      if (source?.definition.kind !== "module" || target?.definition.kind !== "module" ||
          source.definition.relationMap.domainRank !== 0 || target.definition.relationMap.domainRank !== 0)
        throw new TypeError(`Module map ${key} requires pinned free-module source and target.`);
      if (source.definition.baseRing.objectId !== target.definition.baseRing.objectId ||
          source.definition.baseRing.revision !== target.definition.baseRing.revision)
        throw new TypeError(`Module map ${key} requires the same pinned base ring on both sides.`);
      if (record.definition.domainRank !== source.definition.ambientRank ||
          record.definition.codomainRank !== target.definition.ambientRank)
        throw new TypeError(`Module map ${key} has dimensions inconsistent with its pinned free modules.`);
      const ring = byId.get(source.definition.baseRing.objectId)
        ?.revisions[source.definition.baseRing.revision - 1];
      if (!ring || !["integer-ring", "rational-field", "polynomial-ring"].includes(ring.kind))
        throw new TypeError(`Module map ${key} has an unsupported base ring.`);
      validateModuleMatrixScalars(record.definition.matrix, ring.definition as ModuleScalarRing);
    }
    if (record.definition.kind === "chain-complex") resolveChainComplex(record.definition, entries);
    for (const ref of record.dependencies) {
      const parent = byId.get(ref.objectId)?.revisions[ref.revision - 1];
      if (!parent || parent.revision !== ref.revision) {
        throw new TypeError(`Missing algebra parent ${ref.objectId}@${ref.revision} for ${key}.`);
      }
      if (record.definition.kind === "number-field" && parent.kind !== "rational-field")
        throw new TypeError(`Number field ${key} requires a pinned QQ base field.`);
      if (record.definition.kind === "elliptic-curve") {
        const field = parent.definition;
        if (field.kind !== "rational-field" && (field.kind !== "finite-field" || field.degree !== 1 ||
            field.characteristic < 5 || field.characteristic > 1009))
          throw new TypeError(`Elliptic curve ${key} requires pinned QQ or prime GF(p), 5 ≤ p ≤ 1009.`);
        ellipticCurveFacts(record.definition.a, record.definition.b,
          field.kind === "finite-field" ? field.characteristic : 0);
      }
      if (record.definition.kind === "finite-group" && parent.kind !== "polynomial-ring")
        throw new TypeError(`Finite group ${key} requires a pinned polynomial source ring.`);
      if (record.definition.kind === "field-extension") {
        if (parent.definition.kind !== "number-field")
          throw new TypeError(`Field extension ${key} requires a pinned quadratic number-field parent.`);
        analyzeBiquadraticExtensionFromDefinition(parent.definition.definingPolynomial,
          parent.definition.generator, record.definition.radicand, record.definition.generator);
      }
      if (record.definition.kind === "ideal") {
        if (parent.definition.kind !== "polynomial-ring")
          throw new TypeError(`Ideal ${key} requires a polynomial ambient ring.`);
        const coefficient = byId.get(parent.definition.coefficientDomain.objectId)
          ?.revisions[parent.definition.coefficientDomain.revision - 1];
        if (coefficient?.kind !== "rational-field")
          throw new TypeError(`Ideal ${key} requires a polynomial ambient ring directly over QQ.`);
        if (parent.definition.variables.length > 8)
          throw new TypeError(`Ideal ${key} supports at most eight ambient variables.`);
        for (const generator of record.definition.generators)
          parseIdealGenerator(generator, parent.definition.variables);
      }
      if (record.definition.kind === "quotient-ring") {
        const ring = byId.get(record.definition.ambientRing.objectId)
          ?.revisions[record.definition.ambientRing.revision - 1];
        const ideal = byId.get(record.definition.ideal.objectId)
          ?.revisions[record.definition.ideal.revision - 1];
        if (ring?.kind !== "polynomial-ring" || ideal?.definition.kind !== "ideal" ||
            ideal.definition.ambientRing.objectId !== ring.id ||
            ideal.definition.ambientRing.revision !== ring.revision)
          throw new TypeError(`Quotient ${key} requires an ideal in its pinned polynomial ambient ring.`);
      }
      if (record.definition.kind === "module") {
        if (!["integer-ring", "rational-field", "polynomial-ring"].includes(parent.kind))
          throw new TypeError(`Module ${key} requires pinned ZZ, QQ or QQ polynomial base ring.`);
        if (parent.definition.kind === "polynomial-ring") {
          const coefficient = byId.get(parent.definition.coefficientDomain.objectId)
            ?.revisions[parent.definition.coefficientDomain.revision - 1];
          if (coefficient?.kind !== "rational-field" || parent.definition.variables.length > 3)
            throw new TypeError(`Module ${key} requires a QQ polynomial ring with at most three variables.`);
        }
        validateModuleMatrixScalars(record.definition.relationMap.matrix, parent.definition as ModuleScalarRing);
      }
      visit(parent);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const entry of entries) for (const record of entry.revisions) visit(record);
  return Object.freeze(entries.sort((a, b) => a.id.localeCompare(b.id)));
};

/** Freshness is derived from saved revision hashes; historical definitions are never rewritten. */
export const inspectProjectAlgebraFreshness = (project: Pick<Math3DProject, "algebraObjects">): readonly ProjectAlgebraObjectFreshness[] => {
  if (project.algebraObjects === undefined) return Object.freeze([]);
  const entries = validateProjectAlgebraRegistry(project.algebraObjects);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const dependents = new Map<StableDocumentId, Set<StableDocumentId>>();
  for (const entry of entries) {
    const latest = entry.revisions[entry.revisions.length - 1];
    for (const ref of latest.dependencies) {
      const children = dependents.get(ref.objectId) ?? new Set<StableDocumentId>();
      children.add(entry.id);
      dependents.set(ref.objectId, children);
    }
  }
  const memo = new Map<string, readonly ProjectAlgebraStaleCause[]>();
  const causesFor = (record: AlgebraObjectRecord): readonly ProjectAlgebraStaleCause[] => {
    const key = `${record.id}@${record.revision}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const causes = new Map<string, ProjectAlgebraStaleCause>();
    for (const ref of record.dependencies) {
      // validateProjectAlgebraRegistry has already resolved every exact revision and ruled out cycles.
      const history = byId.get(ref.objectId)!;
      const pinned = history.revisions[ref.revision - 1];
      const current = history.revisions[history.revisions.length - 1];
      if (pinned.contentHash !== current.contentHash) {
        const cause = { objectId: ref.objectId, pinnedRevision: ref.revision, currentRevision: current.revision };
        causes.set(`${cause.objectId}@${cause.pinnedRevision}:${cause.currentRevision}`, cause);
      } else {
        for (const cause of causesFor(pinned)) {
          causes.set(`${cause.objectId}@${cause.pinnedRevision}:${cause.currentRevision}`, cause);
        }
      }
    }
    const result = Object.freeze([...causes.values()].sort((a, b) => a.objectId.localeCompare(b.objectId)
      || a.pinnedRevision - b.pinnedRevision || a.currentRevision - b.currentRevision).map((cause) => Object.freeze(cause)));
    memo.set(key, result);
    return result;
  };
  return Object.freeze(entries.map((entry) => {
    const latest = entry.revisions[entry.revisions.length - 1];
    const causes = causesFor(latest);
    return Object.freeze({ objectId: entry.id, revision: latest.revision, archived: entry.archived,
      status: causes.length ? "stale" as const : "fresh" as const, causes,
      directDependencies: latest.dependencies,
      directDependents: Object.freeze([...(dependents.get(entry.id) ?? [])].sort()) });
  }));
};
