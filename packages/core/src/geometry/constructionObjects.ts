import type { Vec3 } from "../math";
import type { Line3, Point3 } from "../sceneObjects";

export type Circle3 = {
  center: Point3;
  radius: number;
  normal: Vec3;
};

export type DerivedConstructionObjectType =
  | "midpoint"
  | "line"
  | "line-through-objects"
  | "parallel"
  | "parallel-line-through-object"
  | "perpendicular"
  | "perpendicular-line-through-object"
  | "circle"
  | "circle-center-through-object"
  | "angle-bisector"
  | "tangent"
  | "tangent-to-circle-at-object"
  | "normal"
  | "normal-to-object-at-object";

export type DerivedConstructionObjectDefinition = {
  id: string;
  type: DerivedConstructionObjectType;
  name?: string;
  sourceObjectIds?: string[];
  sourceConstructionId?: string | null;
  radius?: number;
  planeNormal?: Vec3;
  circleNormal?: Vec3;
  visible?: boolean;
  createdAt?: number;
};

export type ConstructionRelationshipType =
  | "parallel"
  | "perpendicular"
  | "equal-length"
  | "equal-radius"
  | "coincident"
  | "concentric"
  | "tangent";

export type ConstructionRelationshipDefinition = {
  id: string;
  type: ConstructionRelationshipType;
  sourceId: string;
  targetId: string;
  enabled?: boolean;
  createdAt?: number;
};

export type DerivedConstructionValue =
  | { kind: "point"; point: Point3 }
  | { kind: "line"; line: Line3 }
  | { kind: "circle"; circle: Circle3 };

export type DerivedConstructionEvaluationStatus = "valid" | "broken-source" | "invalid";

export type DerivedConstructionEvaluation = {
  definition: DerivedConstructionObjectDefinition;
  status: DerivedConstructionEvaluationStatus;
  message: string | null;
  value: DerivedConstructionValue | null;
};

export type DerivedConstructionEvaluationResult = {
  byId: Map<string, DerivedConstructionEvaluation>;
  evaluations: DerivedConstructionEvaluation[];
  errors: string[];
  dependencyGraph: DerivedConstructionDependencyGraph;
};

export type ConstructionSourcePointMap = Record<string, Point3> | Map<string, Point3>;

export type DerivedConstructionDependencyEdge = {
  sourceId: string;
  sourceKind: "source-point" | "construction";
  targetId: string;
  targetKind: "construction";
};

export type DerivedConstructionDependencyGraph = {
  sourcePointIds: string[];
  constructionIds: string[];
  edges: DerivedConstructionDependencyEdge[];
  dependenciesById: Map<string, string[]>;
  sourcePointDependenciesById: Map<string, string[]>;
  constructionDependenciesById: Map<string, string[]>;
  dependentsById: Map<string, string[]>;
  constructionDependentsById: Map<string, string[]>;
  topologicalConstructionIds: string[];
  cyclicConstructionIds: string[];
};

const EPS = 1e-12;
const DEFAULT_NORMAL: Vec3 = { x: 0, y: 0, z: 1 };

const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scaleVec3 = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const crossVec3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const lengthVec3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const distanceVec3 = (a: Vec3, b: Vec3): number => lengthVec3(subVec3(a, b));

const normalizeVec3 = (v: Vec3): Vec3 | null => {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
  const len = lengthVec3(v);
  if (!Number.isFinite(len) || len <= EPS) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const getSourcePoint = (sources: ConstructionSourcePointMap, id: string | undefined): Point3 | null => {
  if (!id) return null;
  return sources instanceof Map ? sources.get(id) ?? null : sources[id] ?? null;
};

const lineFromPointDir = (origin: Point3, direction: Vec3): Line3 | null => {
  const dir = normalizeVec3(direction);
  return dir ? { origin, direction: dir } : null;
};

const perpendicularDirection = (direction: Vec3, planeNormal: Vec3 | undefined): Vec3 | null => {
  const baseNormal = normalizeVec3(planeNormal ?? DEFAULT_NORMAL) ?? DEFAULT_NORMAL;
  const inPlane = normalizeVec3(crossVec3(baseNormal, direction));
  if (inPlane) return inPlane;
  const xy = normalizeVec3({ x: -direction.y, y: direction.x, z: 0 });
  if (xy) return xy;
  return normalizeVec3(crossVec3(direction, { x: 1, y: 0, z: 0 }));
};

const circleFromCenterRadius = (
  center: Point3,
  radius: number,
  normal: Vec3 | undefined
): Circle3 | null => {
  const n = normalizeVec3(normal ?? DEFAULT_NORMAL) ?? DEFAULT_NORMAL;
  if (!Number.isFinite(radius) || radius <= EPS) return null;
  return { center, radius, normal: n };
};

const makeInvalid = (
  definition: DerivedConstructionObjectDefinition,
  status: DerivedConstructionEvaluationStatus,
  message: string
): DerivedConstructionEvaluation => ({
  definition,
  status,
  message,
  value: null,
});

const makeValid = (
  definition: DerivedConstructionObjectDefinition,
  value: DerivedConstructionValue,
  message: string | null = null
): DerivedConstructionEvaluation => ({
  definition,
  status: "valid",
  message,
  value,
});

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

export const buildDerivedConstructionDependencyGraph = (
  definitions: DerivedConstructionObjectDefinition[],
  relationships: ConstructionRelationshipDefinition[] = []
): DerivedConstructionDependencyGraph => {
  const constructionIds = definitions.map((definition) => definition.id);
  const constructionIdSet = new Set(constructionIds);
  const sourcePointIds = new Set<string>();
  const edges: DerivedConstructionDependencyEdge[] = [];
  const dependenciesById = new Map<string, string[]>();
  const sourcePointDependenciesById = new Map<string, string[]>();
  const constructionDependenciesById = new Map<string, string[]>();
  const dependentsById = new Map<string, string[]>();
  const constructionDependentsById = new Map<string, string[]>();

  const addDependency = (
    targetId: string,
    sourceId: string,
    sourceKind: "source-point" | "construction"
  ) => {
    dependenciesById.set(targetId, uniqueStrings([...(dependenciesById.get(targetId) ?? []), sourceId]));
    if (sourceKind === "source-point") {
      sourcePointIds.add(sourceId);
      sourcePointDependenciesById.set(
        targetId,
        uniqueStrings([...(sourcePointDependenciesById.get(targetId) ?? []), sourceId])
      );
    } else {
      constructionDependenciesById.set(
        targetId,
        uniqueStrings([...(constructionDependenciesById.get(targetId) ?? []), sourceId])
      );
      constructionDependentsById.set(
        sourceId,
        uniqueStrings([...(constructionDependentsById.get(sourceId) ?? []), targetId])
      );
    }
    dependentsById.set(sourceId, uniqueStrings([...(dependentsById.get(sourceId) ?? []), targetId]));
    edges.push({ sourceId, sourceKind, targetId, targetKind: "construction" });
  };

  for (const definition of definitions) {
    dependenciesById.set(definition.id, []);
    sourcePointDependenciesById.set(definition.id, []);
    constructionDependenciesById.set(definition.id, []);
  }

  for (const definition of definitions) {
    for (const sourceId of definition.sourceObjectIds ?? []) {
      addDependency(definition.id, sourceId, constructionIdSet.has(sourceId) ? "construction" : "source-point");
    }
    if (definition.sourceConstructionId) {
      addDependency(definition.id, definition.sourceConstructionId, "construction");
    }
  }

  for (const relationship of relationships) {
    if (relationship.enabled === false) continue;
    if (!constructionIdSet.has(relationship.targetId)) continue;
    addDependency(
      relationship.targetId,
      relationship.sourceId,
      constructionIdSet.has(relationship.sourceId) ? "construction" : "source-point"
    );
  }

  const indegree = new Map<string, number>();
  for (const id of constructionIds) indegree.set(id, 0);
  for (const [id, dependencies] of constructionDependenciesById) {
    indegree.set(id, dependencies.filter((dependencyId) => constructionIdSet.has(dependencyId)).length);
  }
  const queue = constructionIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const topologicalConstructionIds: string[] = [];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    topologicalConstructionIds.push(id);
    for (const dependentId of constructionDependentsById.get(id) ?? []) {
      if (!constructionIdSet.has(dependentId)) continue;
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) queue.push(dependentId);
    }
  }
  const sortedSet = new Set(topologicalConstructionIds);
  const cyclicConstructionIds = constructionIds.filter((id) => !sortedSet.has(id));

  return {
    sourcePointIds: Array.from(sourcePointIds),
    constructionIds,
    edges,
    dependenciesById,
    sourcePointDependenciesById,
    constructionDependenciesById,
    dependentsById,
    constructionDependentsById,
    topologicalConstructionIds,
    cyclicConstructionIds,
  };
};

export const getAffectedDerivedConstructionIds = (
  graph: DerivedConstructionDependencyGraph,
  changedSourceIds: Iterable<string>
): string[] => {
  const affected = new Set<string>();
  const queue = Array.from(changedSourceIds);
  for (let i = 0; i < queue.length; i += 1) {
    const sourceId = queue[i];
    for (const dependentId of graph.dependentsById.get(sourceId) ?? []) {
      if (affected.has(dependentId)) continue;
      affected.add(dependentId);
      queue.push(dependentId);
    }
  }
  const order = [...graph.topologicalConstructionIds, ...graph.cyclicConstructionIds];
  return order.filter((id) => affected.has(id));
};

export const evaluateDerivedConstructionObjects = (
  definitions: DerivedConstructionObjectDefinition[],
  sourcePoints: ConstructionSourcePointMap,
  relationships: ConstructionRelationshipDefinition[] = []
): DerivedConstructionEvaluationResult => {
  const byId = new Map<string, DerivedConstructionEvaluation>();
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition] as const));
  const dependencyGraph = buildDerivedConstructionDependencyGraph(definitions, relationships);
  const cyclicConstructionIds = new Set(dependencyGraph.cyclicConstructionIds);
  const stateById = new Map<string, "visiting" | "done">();
  const relationshipOrder = [...relationships]
    .filter((relationship) => relationship.enabled !== false)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const relationshipsByTargetId = new Map<string, ConstructionRelationshipDefinition[]>();
  for (const relationship of relationshipOrder) {
    relationshipsByTargetId.set(relationship.targetId, [
      ...(relationshipsByTargetId.get(relationship.targetId) ?? []),
      relationship,
    ]);
  }

  const publish = (evaluation: DerivedConstructionEvaluation) => {
    byId.set(evaluation.definition.id, evaluation);
    stateById.set(evaluation.definition.id, "done");
    return evaluation;
  };

  const getLine = (id: string | null | undefined): Line3 | null => {
    if (!id) return null;
    evaluateOne(id);
    const value = byId.get(id)?.value;
    return value?.kind === "line" ? value.line : null;
  };
  const getCircle = (id: string | null | undefined): Circle3 | null => {
    if (!id) return null;
    evaluateOne(id);
    const value = byId.get(id)?.value;
    return value?.kind === "circle" ? value.circle : null;
  };
  const getPoint = (id: string | null | undefined): Point3 | null => {
    if (!id) return null;
    const sourcePoint = getSourcePoint(sourcePoints, id);
    if (sourcePoint) return sourcePoint;
    evaluateOne(id);
    const value = byId.get(id)?.value;
    return value?.kind === "point" ? value.point : null;
  };
  const getValue = (id: string | null | undefined): DerivedConstructionValue | null => {
    if (!id) return null;
    const sourcePoint = getSourcePoint(sourcePoints, id);
    if (sourcePoint) return { kind: "point", point: sourcePoint };
    evaluateOne(id);
    return byId.get(id)?.value ?? null;
  };

  const applyRelationship = (
    targetDefinition: DerivedConstructionObjectDefinition,
    current: DerivedConstructionValue,
    relationship: ConstructionRelationshipDefinition
  ): { value: DerivedConstructionValue; warning: string | null } => {
    const sourceValue = getValue(relationship.sourceId);
    if (!sourceValue) {
      return { value: current, warning: `Relationship '${relationship.id}' has an unavailable source.` };
    }

    if (relationship.type === "parallel") {
      if (sourceValue.kind !== "line" || current.kind !== "line") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two lines.` };
      }
      return {
        value: { kind: "line", line: { ...current.line, direction: sourceValue.line.direction } },
        warning: null,
      };
    }

    if (relationship.type === "perpendicular") {
      if (sourceValue.kind !== "line" || current.kind !== "line") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two lines.` };
      }
      const direction = perpendicularDirection(sourceValue.line.direction, targetDefinition.planeNormal);
      if (!direction) {
        return { value: current, warning: `Relationship '${relationship.id}' could not resolve a perpendicular direction.` };
      }
      return { value: { kind: "line", line: { ...current.line, direction } }, warning: null };
    }

    if (relationship.type === "equal-length") {
      if (sourceValue.kind !== "line" || current.kind !== "line") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two lines.` };
      }
      if (!Number.isFinite(sourceValue.line.length ?? NaN) || Number(sourceValue.line.length) <= EPS) {
        return { value: current, warning: `Relationship '${relationship.id}' source line has no finite length.` };
      }
      return {
        value: { kind: "line", line: { ...current.line, length: Number(sourceValue.line.length) } },
        warning: null,
      };
    }

    if (relationship.type === "equal-radius") {
      if (sourceValue.kind !== "circle" || current.kind !== "circle") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two circles.` };
      }
      return {
        value: { kind: "circle", circle: { ...current.circle, radius: sourceValue.circle.radius } },
        warning: null,
      };
    }

    if (relationship.type === "coincident") {
      if (sourceValue.kind !== "point" || current.kind !== "point") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two points.` };
      }
      return {
        value: { kind: "point", point: { ...sourceValue.point, label: current.point.label } },
        warning: null,
      };
    }

    if (relationship.type === "concentric") {
      if (sourceValue.kind !== "circle" || current.kind !== "circle") {
        return { value: current, warning: `Relationship '${relationship.id}' needs two circles.` };
      }
      return {
        value: { kind: "circle", circle: { ...current.circle, center: { ...sourceValue.circle.center } } },
        warning: null,
      };
    }

    if (sourceValue.kind !== "circle") {
      return { value: current, warning: `Relationship '${relationship.id}' needs a source circle.` };
    }
    if (current.kind === "line") {
      const radialRaw = subVec3(current.line.origin, sourceValue.circle.center);
      const radialProjected = subVec3(radialRaw, scaleVec3(sourceValue.circle.normal, dotVec3(radialRaw, sourceValue.circle.normal)));
      const radial = normalizeVec3(radialProjected);
      const direction = radial ? normalizeVec3(crossVec3(sourceValue.circle.normal, radial)) : null;
      if (!radial || !direction) {
        return { value: current, warning: `Relationship '${relationship.id}' tangent point is degenerate.` };
      }
      return {
        value: {
          kind: "line",
          line: {
            ...current.line,
            origin: addVec3(sourceValue.circle.center, scaleVec3(radial, sourceValue.circle.radius)),
            direction,
          },
        },
        warning: null,
      };
    }
    if (current.kind === "circle") {
      const radial = normalizeVec3(subVec3(current.circle.center, sourceValue.circle.center));
      if (!radial) {
        return { value: current, warning: `Relationship '${relationship.id}' tangent circles need distinct centers.` };
      }
      const distance = sourceValue.circle.radius + current.circle.radius;
      return {
        value: {
          kind: "circle",
          circle: {
            ...current.circle,
            center: addVec3(sourceValue.circle.center, scaleVec3(radial, distance)),
          },
        },
        warning: null,
      };
    }
    return { value: current, warning: `Relationship '${relationship.id}' needs a line or circle target.` };
  };

  const applyTargetRelationships = (
    definition: DerivedConstructionObjectDefinition,
    evaluation: DerivedConstructionEvaluation
  ): DerivedConstructionEvaluation => {
    if (evaluation.status !== "valid" || !evaluation.value) return evaluation;
    const targetRelationships = relationshipsByTargetId.get(definition.id) ?? [];
    if (!targetRelationships.length) return evaluation;
    let value = evaluation.value;
    const warnings: string[] = [];
    for (const relationship of targetRelationships) {
      const next = applyRelationship(definition, value, relationship);
      value = next.value;
      if (next.warning) warnings.push(next.warning);
    }
    return makeValid(
      definition,
      value,
      warnings.length ? warnings.join(" ") : evaluation.message
    );
  };

  function evaluateOne(id: string): DerivedConstructionEvaluation | null {
    if (stateById.get(id) === "done") return byId.get(id) ?? null;
    if (stateById.get(id) === "visiting") return null;
    const definition = definitionById.get(id);
    if (!definition) return null;
    if (cyclicConstructionIds.has(id)) {
      return publish(makeInvalid(definition, "invalid", "Construction dependency cycle detected."));
    }
    stateById.set(id, "visiting");
    const ids = definition.sourceObjectIds ?? [];
    const source = (index: number) => getPoint(ids[index]);
    const missingSource = ids.find((id) => !getPoint(id));
    if (missingSource) {
      const status = definitionById.has(missingSource) ? "invalid" : "broken-source";
      return publish(makeInvalid(definition, status, `Missing source point '${missingSource}'.`));
    }

    switch (definition.type) {
      case "midpoint": {
        const a = source(0);
        const b = source(1);
        if (!a || !b) {
          return publish(makeInvalid(definition, "broken-source", "Midpoint needs two source points."));
        }
        const point: Point3 = {
          x: (a.x + b.x) * 0.5,
          y: (a.y + b.y) * 0.5,
          z: (a.z + b.z) * 0.5,
          label: definition.name,
        };
        return publish(applyTargetRelationships(definition, makeValid(definition, { kind: "point", point })));
      }
      case "line":
      case "line-through-objects": {
        const a = source(0);
        const b = source(1);
        const direction = a && b ? normalizeVec3(subVec3(b, a)) : null;
        if (!a || !b || !direction) {
          return publish(makeInvalid(definition, "invalid", "Line needs two distinct source points."));
        }
        const origin: Point3 = {
          x: (a.x + b.x) * 0.5,
          y: (a.y + b.y) * 0.5,
          z: (a.z + b.z) * 0.5,
          label: definition.name,
        };
        return publish(applyTargetRelationships(definition, makeValid(definition, {
          kind: "line",
          line: { origin, direction, length: distanceVec3(a, b) },
        })));
      }
      case "parallel":
      case "parallel-line-through-object": {
        const through = source(0);
        const line = getLine(definition.sourceConstructionId);
        if (!through || !line) {
          return publish(makeInvalid(definition, "invalid", "Parallel line needs a source line and through point."));
        }
        return publish(applyTargetRelationships(definition, makeValid(definition, {
          kind: "line",
          line: { origin: through, direction: line.direction, length: line.length },
        })));
      }
      case "perpendicular":
      case "perpendicular-line-through-object": {
        const through = source(0);
        const line = getLine(definition.sourceConstructionId);
        const direction = line ? perpendicularDirection(line.direction, definition.planeNormal) : null;
        if (!through || !line || !direction) {
          return publish(makeInvalid(definition, "invalid", "Perpendicular line needs a source line and through point."));
        }
        return publish(applyTargetRelationships(definition, makeValid(definition, {
          kind: "line",
          line: { origin: through, direction, length: line.length },
        })));
      }
      case "circle":
      case "circle-center-through-object": {
        const center = source(0);
        const through = source(1);
        const radius = definition.radius ?? (center && through ? distanceVec3(center, through) : NaN);
        const circle = center ? circleFromCenterRadius(center, radius, definition.circleNormal) : null;
        if (!center || !circle) {
          return publish(makeInvalid(definition, "invalid", "Circle needs a center and positive radius."));
        }
        return publish(applyTargetRelationships(definition, makeValid(definition, { kind: "circle", circle })));
      }
      case "angle-bisector": {
        const a = source(0);
        const vertex = source(1);
        const c = source(2);
        const av = a && vertex ? normalizeVec3(subVec3(a, vertex)) : null;
        const cv = c && vertex ? normalizeVec3(subVec3(c, vertex)) : null;
        const direction = av && cv ? normalizeVec3(addVec3(av, cv)) ?? perpendicularDirection(av, definition.planeNormal) : null;
        const line = vertex && direction ? lineFromPointDir(vertex, direction) : null;
        if (!a || !vertex || !c || !line) {
          return publish(makeInvalid(definition, "invalid", "Angle bisector needs three non-degenerate source points."));
        }
        return publish(applyTargetRelationships(definition, makeValid(definition, { kind: "line", line })));
      }
      case "tangent":
      case "tangent-to-circle-at-object": {
        const circle = getCircle(definition.sourceConstructionId);
        const p = source(0);
        if (!circle || !p) {
          return publish(makeInvalid(definition, "invalid", "Tangent needs a source circle and point."));
        }
        const radialRaw = subVec3(p, circle.center);
        const radialProjected = subVec3(radialRaw, scaleVec3(circle.normal, dotVec3(radialRaw, circle.normal)));
        const radial = normalizeVec3(radialProjected);
        const direction = radial ? normalizeVec3(crossVec3(circle.normal, radial)) : null;
        if (!radial || !direction) {
          return publish(makeInvalid(definition, "invalid", "Tangent point cannot coincide with the circle center."));
        }
        const tangentPoint = addVec3(circle.center, scaleVec3(radial, circle.radius));
        return publish(applyTargetRelationships(definition, makeValid(definition, {
          kind: "line",
          line: { origin: tangentPoint, direction },
        })));
      }
      case "normal":
      case "normal-to-object-at-object": {
        const objectPoint = source(0);
        const through = source(1);
        const direction = objectPoint && through ? normalizeVec3(subVec3(through, objectPoint)) : null;
        if (!objectPoint || !through || !direction) {
          return publish(makeInvalid(definition, "invalid", "Normal needs a source object and through point."));
        }
        return publish(applyTargetRelationships(definition, makeValid(definition, {
          kind: "line",
          line: { origin: through, direction },
        })));
      }
      default:
        return publish(makeInvalid(definition, "invalid", "Unsupported construction type."));
    }
  }

  for (const definition of definitions) {
    evaluateOne(definition.id);
  }

  const evaluations = definitions.flatMap((definition) => {
    const evaluation = byId.get(definition.id);
    return evaluation ? [evaluation] : [];
  });
  const errors = evaluations.flatMap((evaluation) =>
    evaluation.status !== "valid" && evaluation.message
      ? [`[${evaluation.definition.id}] ${evaluation.message}`]
      : []
  );

  return { byId, evaluations, errors, dependencyGraph };
};
