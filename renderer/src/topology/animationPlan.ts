import type { OrientationRelation } from "./types";

export type TopologyAnimationPlan = {
  order: string[];
  groups: Record<string, string>;
};

export type PlannedOrientationOperation = {
  id: string;
  index: number;
  label: string;
  relation: OrientationRelation;
  groupId: string;
};

export type PlannedOrientationStep = {
  id: string;
  groupId: string;
  label: string;
  operations: PlannedOrientationOperation[];
};

const opIdForIndex = (index: number): string => `op-${index}`;

export const createDefaultAnimationPlan = (relations: OrientationRelation[]): TopologyAnimationPlan => ({
  order: relations.map((_relation, index) => opIdForIndex(index)),
  groups: {},
});

export const normalizeAnimationPlan = (
  relations: OrientationRelation[],
  plan: TopologyAnimationPlan | null | undefined
): TopologyAnimationPlan => {
  const defaultPlan = createDefaultAnimationPlan(relations);
  if (!plan) return defaultPlan;
  const validIds = new Set(defaultPlan.order);
  const ordered = [...new Set((plan.order ?? []).filter((id) => validIds.has(id)))];
  for (const id of defaultPlan.order) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  const groups: Record<string, string> = {};
  for (const id of ordered) {
    const raw = String(plan.groups?.[id] ?? "").trim();
    if (raw) groups[id] = raw;
  }
  return { order: ordered, groups };
};

export const buildPlannedOperations = (
  relations: OrientationRelation[],
  plan: TopologyAnimationPlan | null | undefined
): PlannedOrientationOperation[] => {
  const normalized = normalizeAnimationPlan(relations, plan);
  const relationById = new Map(normalized.order.map((id) => [id, Number(id.replace("op-", ""))]));
  return normalized.order
    .map((id) => {
      const relationIndex = relationById.get(id);
      if (!Number.isFinite(relationIndex)) return null;
      const relation = relations[relationIndex!];
      if (!relation) return null;
      const groupId = normalized.groups[id] || id;
      return {
        id,
        index: relationIndex!,
        label: `${relation.edgeA} ~ ${relation.edgeB} (${relation.relation})`,
        relation,
        groupId,
      } satisfies PlannedOrientationOperation;
    })
    .filter((entry): entry is PlannedOrientationOperation => !!entry);
};

export const buildPlannedSteps = (
  relations: OrientationRelation[],
  plan: TopologyAnimationPlan | null | undefined
): PlannedOrientationStep[] => {
  const operations = buildPlannedOperations(relations, plan);
  const groups = new Map<string, PlannedOrientationOperation[]>();
  const groupOrder: string[] = [];
  for (const operation of operations) {
    if (!groups.has(operation.groupId)) {
      groups.set(operation.groupId, []);
      groupOrder.push(operation.groupId);
    }
    groups.get(operation.groupId)!.push(operation);
  }
  return groupOrder.map((groupId, index) => ({
    id: `step-${index}`,
    groupId,
    label: groupId,
    operations: groups.get(groupId) ?? [],
  }));
};

export const moveOperationInPlan = (
  relations: OrientationRelation[],
  plan: TopologyAnimationPlan | null | undefined,
  operationId: string,
  direction: -1 | 1
): TopologyAnimationPlan => {
  const normalized = normalizeAnimationPlan(relations, plan);
  const currentIndex = normalized.order.indexOf(operationId);
  if (currentIndex < 0) return normalized;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= normalized.order.length) return normalized;
  const nextOrder = [...normalized.order];
  const temp = nextOrder[targetIndex];
  nextOrder[targetIndex] = nextOrder[currentIndex];
  nextOrder[currentIndex] = temp;
  return { ...normalized, order: nextOrder };
};

export const setOperationGroupInPlan = (
  relations: OrientationRelation[],
  plan: TopologyAnimationPlan | null | undefined,
  operationId: string,
  nextGroupId: string
): TopologyAnimationPlan => {
  const normalized = normalizeAnimationPlan(relations, plan);
  if (!normalized.order.includes(operationId)) return normalized;
  const trimmed = nextGroupId.trim();
  const nextGroups = { ...normalized.groups };
  if (trimmed.length === 0) {
    delete nextGroups[operationId];
  } else {
    nextGroups[operationId] = trimmed;
  }
  return { ...normalized, groups: nextGroups };
};
