import {
  createDocumentRelationIndex,
  evaluateDocumentRelationStatus,
  immutableCanonicalJsonClone,
  isScientificSourceGeneration,
  matchesScientificSourceGeneration,
  normalizeDocumentRelation,
  structuralHash,
  type CanonicalJsonValue,
  type DocumentRelation,
  type DocumentRelationId,
  type DocumentRelationSourceResolver,
  type DocumentRelationStatus,
  type DocumentRelationTarget,
  type ScientificSourceGeneration,
} from "@math3d/core";
import type { InMemoryArtifactRegistry } from "./artifactRegistry";

export const DEPENDENCY_GRAPH_SCHEMA_VERSION = 1 as const;
export const DEPENDENCY_GRAPH_EVENT_TYPES = ["relation.registered", "dependency.invalidated"] as const;

export type DependencyGraphEventType = (typeof DEPENDENCY_GRAPH_EVENT_TYPES)[number];
export type DependencyFreshness = "current" | "stale" | "broken" | "unavailable";

export type DependencyInvalidationReport = Readonly<{
  schemaVersion: typeof DEPENDENCY_GRAPH_SCHEMA_VERSION;
  invalidationId: `dependency-invalidation:${string}`;
  currentSource: ScientificSourceGeneration;
  affectedRelationIds: readonly DocumentRelationId[];
  newlyStaleRelationIds: readonly DocumentRelationId[];
  affectedTargets: readonly DocumentRelationTarget[];
  affectedDocumentGenerations: readonly ScientificSourceGeneration[];
  affectedResultIds: readonly string[];
  affectedArtifactIds: readonly string[];
  invalidatedArtifactIds: readonly string[];
  topologicalRelationOrder: readonly DocumentRelationId[];
  changed: boolean;
}>;

export type DependencyGraphEvent = Readonly<{
  schemaVersion: typeof DEPENDENCY_GRAPH_SCHEMA_VERSION;
  sequence: number;
  type: DependencyGraphEventType;
  relationId?: DocumentRelationId;
  report?: DependencyInvalidationReport;
}>;

export type DependencyGraphResolution<T> = Readonly<{
  value: T;
  freshness: DependencyFreshness;
  current: boolean;
}>;

export type DependencyGraphOptions = Readonly<{
  resolveSource: DocumentRelationSourceResolver;
  relations?: readonly DocumentRelation[];
  artifactRegistry?: InMemoryArtifactRegistry;
}>;

export type DependencyGraphListener = (event: DependencyGraphEvent) => void;

const generationKey = (source: ScientificSourceGeneration): string =>
  `${source.documentId}@${source.revision}:${source.structuralHash}:${source.generation}`;

const targetKey = (target: DocumentRelationTarget): string => {
  if (target.type === "document") return `document:${generationKey(target.generation)}`;
  if (target.type === "result") return `result:${target.resultType}:${target.resultId}`;
  return `artifact:${target.artifactKind}:${target.artifactId}:${target.role}`;
};

const frozenClone = <T>(value: T): T => {
  const clone = immutableCanonicalJsonClone(value as CanonicalJsonValue) as T;
  const freeze = (entry: unknown): void => {
    if (!entry || typeof entry !== "object" || Object.isFrozen(entry)) return;
    Object.freeze(entry);
    for (const child of Object.values(entry as Record<string, unknown>)) freeze(child);
  };
  freeze(clone);
  return clone;
};

const mergeFreshness = (left: DependencyFreshness, right: DependencyFreshness): DependencyFreshness => {
  const rank: Record<DependencyFreshness, number> = { current: 0, stale: 1, unavailable: 2, broken: 3 };
  return rank[right] > rank[left] ? right : left;
};

const relationDeclaredFreshness = (status: DocumentRelationStatus): DependencyFreshness => status;

export class InMemoryDependencyGraph {
  readonly #resolveSource: DocumentRelationSourceResolver;
  readonly #artifactRegistry?: InMemoryArtifactRegistry;
  readonly #relations = new Map<DocumentRelationId, DocumentRelation>();
  readonly #staleRelations = new Set<DocumentRelationId>();
  readonly #staleTargets = new Set<string>();
  readonly #listeners = new Map<number, DependencyGraphListener>();
  #nextListenerId = 1;
  #eventSequence = 0;
  #emitting = false;

  constructor(options: DependencyGraphOptions) {
    this.#resolveSource = options.resolveSource;
    this.#artifactRegistry = options.artifactRegistry;
    for (const relation of options.relations ?? []) this.register(relation);
  }

  subscribe(listener: DependencyGraphListener): () => void {
    const id = this.#nextListenerId++;
    this.#listeners.set(id, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(id);
    };
  }

  register(value: DocumentRelation): DocumentRelation {
    this.#assertMutationAllowed();
    const normalized = normalizeDocumentRelation(value);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    const relation = normalized.value;
    const existing = this.#relations.get(relation.relationId);
    if (existing) return existing;
    const candidate = [...this.#relations.values(), relation];
    createDocumentRelationIndex(candidate);
    this.#relations.set(relation.relationId, relation);
    if (this.#relationFreshness(relation, new Set()) !== "current") {
      this.#staleRelations.add(relation.relationId);
      this.#staleTargets.add(targetKey(relation.target));
    }
    this.#emit({ type: "relation.registered", relationId: relation.relationId });
    return relation;
  }

  relations(): readonly DocumentRelation[] {
    return Object.freeze([...this.#relations.values()].sort((left, right) => left.relationId.localeCompare(right.relationId)));
  }

  currentRelations(): readonly DocumentRelation[] {
    return Object.freeze(this.relations().filter((relation) => this.relationStatus(relation.relationId) === "current"));
  }

  relationStatus(relationId: DocumentRelationId): DependencyFreshness | null {
    const relation = this.#relations.get(relationId);
    if (!relation) return null;
    return this.#relationFreshness(relation, new Set());
  }

  resolveRelation(relationId: DocumentRelationId): DependencyGraphResolution<DocumentRelation> | null {
    const relation = this.#relations.get(relationId);
    const freshness = this.relationStatus(relationId);
    return relation && freshness
      ? Object.freeze({ value: relation, freshness, current: freshness === "current" })
      : null;
  }

  targetStatus(target: DocumentRelationTarget): DependencyFreshness | null {
    const key = targetKey(target);
    const incoming = this.relations().filter((relation) => targetKey(relation.target) === key);
    if (!incoming.length) return null;
    let freshness: DependencyFreshness = this.#staleTargets.has(key) ? "stale" : "current";
    for (const relation of incoming) freshness = mergeFreshness(freshness, this.relationStatus(relation.relationId) ?? "unavailable");
    return freshness;
  }

  resolveTarget(target: DocumentRelationTarget): DependencyGraphResolution<DocumentRelationTarget> | null {
    const freshness = this.targetStatus(target);
    return freshness
      ? Object.freeze({ value: frozenClone(target), freshness, current: freshness === "current" })
      : null;
  }

  invalidateDocumentSource(currentSource: ScientificSourceGeneration): DependencyInvalidationReport {
    this.#assertMutationAllowed();
    if (!isScientificSourceGeneration(currentSource)) {
      throw new TypeError("Dependency invalidation requires an exact scientific source generation.");
    }
    const resolved = this.#resolveSource(currentSource.documentId);
    if (!resolved || !matchesScientificSourceGeneration(resolved, currentSource)) {
      throw new TypeError("Dependency invalidation source is not the current document generation.");
    }
    const roots = this.relations().filter((relation) => relation.sources.some((source) =>
      source.documentId === currentSource.documentId && !matchesScientificSourceGeneration(source, currentSource)
    ));
    const bySourceGeneration = new Map<string, DocumentRelation[]>();
    for (const relation of this.relations()) {
      for (const source of relation.sources) {
        const key = generationKey(source);
        const entries = bySourceGeneration.get(key) ?? [];
        entries.push(relation);
        bySourceGeneration.set(key, entries);
      }
    }
    for (const entries of bySourceGeneration.values()) entries.sort((left, right) => left.relationId.localeCompare(right.relationId));

    const affected = new Map<DocumentRelationId, DocumentRelation>();
    const visit = (relation: DocumentRelation): void => {
      if (affected.has(relation.relationId)) return;
      affected.set(relation.relationId, relation);
      if (relation.target.type !== "document") return;
      for (const child of bySourceGeneration.get(generationKey(relation.target.generation)) ?? []) visit(child);
    };
    for (const relation of roots.sort((left, right) => left.relationId.localeCompare(right.relationId))) visit(relation);

    const affectedRelations = [...affected.values()];
    const affectedIds = affectedRelations.map((relation) => relation.relationId).sort();
    const newlyStale = affectedIds.filter((relationId) => !this.#staleRelations.has(relationId));
    for (const relation of affectedRelations) {
      this.#staleRelations.add(relation.relationId);
      this.#staleTargets.add(targetKey(relation.target));
    }
    const targets = [...new Map(affectedRelations.map((relation) => [targetKey(relation.target), relation.target])).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, target]) => target);
    const documentGenerations = targets.filter((target): target is Extract<DocumentRelationTarget, { type: "document" }> => target.type === "document").map((target) => target.generation);
    const resultIds = targets.filter((target): target is Extract<DocumentRelationTarget, { type: "result" }> => target.type === "result").map((target) => target.resultId).sort();
    const relatedArtifactIds = targets.filter((target): target is Extract<DocumentRelationTarget, { type: "artifact" }> => target.type === "artifact").map((target) => target.artifactId).sort();
    const directArtifactIds = this.#artifactRegistry?.invalidateDocumentSource(currentSource) ?? Object.freeze([] as string[]);
    const downstreamArtifactIds = this.#artifactRegistry?.invalidateArtifacts(relatedArtifactIds) ?? Object.freeze([] as string[]);
    const artifactIds = [...new Set([...relatedArtifactIds, ...directArtifactIds])].sort();
    const invalidatedArtifactIds = [...new Set([...directArtifactIds, ...downstreamArtifactIds])].sort();
    const topologicalOrder = this.#topologicalOrder(affectedRelations);
    const identity = structuralHash({
      currentSource,
      affectedRelationIds: affectedIds,
      affectedTargets: targets,
    } as CanonicalJsonValue).slice("sha256:".length);
    const report = frozenClone({
      schemaVersion: DEPENDENCY_GRAPH_SCHEMA_VERSION,
      invalidationId: `dependency-invalidation:${identity}` as const,
      currentSource,
      affectedRelationIds: affectedIds,
      newlyStaleRelationIds: newlyStale,
      affectedTargets: targets,
      affectedDocumentGenerations: documentGenerations,
      affectedResultIds: resultIds,
      affectedArtifactIds: artifactIds,
      invalidatedArtifactIds,
      topologicalRelationOrder: topologicalOrder,
      changed: newlyStale.length > 0 || invalidatedArtifactIds.length > 0,
    });
    if (report.changed) this.#emit({ type: "dependency.invalidated", report });
    return report;
  }

  #liveRelationFreshness(relation: DocumentRelation): DependencyFreshness {
    return relationDeclaredFreshness(evaluateDocumentRelationStatus(relation, this.#resolveSource));
  }

  #relationFreshness(relation: DocumentRelation, visiting: Set<DocumentRelationId>): DependencyFreshness {
    if (this.#staleRelations.has(relation.relationId)) return "stale";
    const direct = this.#liveRelationFreshness(relation);
    if (direct !== "current") return direct;
    if (visiting.has(relation.relationId)) return "broken";
    const nextVisiting = new Set(visiting).add(relation.relationId);
    let freshness: DependencyFreshness = "current";
    for (const source of relation.sources) {
      const sourceTargetKey = targetKey({ type: "document", generation: source });
      if (this.#staleTargets.has(sourceTargetKey)) freshness = mergeFreshness(freshness, "stale");
      for (const parent of this.#relations.values()) {
        if (targetKey(parent.target) !== sourceTargetKey) continue;
        freshness = mergeFreshness(freshness, this.#relationFreshness(parent, nextVisiting));
      }
    }
    return freshness;
  }

  #topologicalOrder(relations: readonly DocumentRelation[]): readonly DocumentRelationId[] {
    const selected = new Map(relations.map((relation) => [relation.relationId, relation]));
    const indegree = new Map<DocumentRelationId, number>([...selected.keys()].map((id) => [id, 0]));
    const children = new Map<DocumentRelationId, DocumentRelationId[]>();
    const producersByDocument = new Map<string, DocumentRelationId[]>();
    for (const relation of relations) {
      if (relation.target.type !== "document") continue;
      const key = generationKey(relation.target.generation);
      const ids = producersByDocument.get(key) ?? [];
      ids.push(relation.relationId);
      producersByDocument.set(key, ids);
    }
    for (const relation of relations) {
      for (const source of relation.sources) {
        for (const parentId of producersByDocument.get(generationKey(source)) ?? []) {
          if (parentId === relation.relationId) continue;
          const ids = children.get(parentId) ?? [];
          if (!ids.includes(relation.relationId)) {
            ids.push(relation.relationId);
            children.set(parentId, ids);
            indegree.set(relation.relationId, (indegree.get(relation.relationId) ?? 0) + 1);
          }
        }
      }
    }
    const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
    const ordered: DocumentRelationId[] = [];
    while (ready.length) {
      const id = ready.shift()!;
      ordered.push(id);
      for (const child of (children.get(id) ?? []).sort()) {
        const degree = (indegree.get(child) ?? 1) - 1;
        indegree.set(child, degree);
        if (degree === 0) {
          ready.push(child);
          ready.sort();
        }
      }
    }
    if (ordered.length !== selected.size) throw new TypeError("Dependency graph contains a quarantined cycle.");
    return Object.freeze(ordered);
  }

  #emit(event: Omit<DependencyGraphEvent, "schemaVersion" | "sequence">): void {
    this.#eventSequence += 1;
    const completed = frozenClone({ schemaVersion: DEPENDENCY_GRAPH_SCHEMA_VERSION, sequence: this.#eventSequence, ...event });
    this.#emitting = true;
    try {
      for (const listener of [...this.#listeners.values()]) {
        try { listener(completed); } catch { /* completed lifecycle facts cannot be rolled back by observers */ }
      }
    } finally {
      this.#emitting = false;
    }
  }

  #assertMutationAllowed(): void {
    if (this.#emitting) throw new TypeError("Dependency graph mutation is not allowed during event delivery.");
  }
}

export const createInMemoryDependencyGraph = (options: DependencyGraphOptions): InMemoryDependencyGraph =>
  new InMemoryDependencyGraph(options);
