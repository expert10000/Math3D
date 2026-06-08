import type { GeometryLiveValidityKind } from "./liveValidityStatus";

export type ConstructionDependencyTreeStatus =
  | "valid"
  | "updating"
  | "stale"
  | "broken-source"
  | "ambiguous-target"
  | "frozen";

export type ConstructionDependencyTreeInputNode = {
  id: string;
  label: string;
  kind: string;
  status: ConstructionDependencyTreeStatus;
  liveValidityKind?: GeometryLiveValidityKind;
};

export type ConstructionDependencyTreeInputEdge = {
  sourceId: string;
  targetId: string;
  relation: string;
};

export type ConstructionDependencyTreeNode = ConstructionDependencyTreeInputNode & {
  children: ConstructionDependencyTreeNode[];
};

export type ConstructionDependencyUpdateStep = {
  id: string;
  label: string;
  kind: string;
  status: ConstructionDependencyTreeStatus;
  action: "changed" | "updated";
};

const cloneTreeNode = (node: ConstructionDependencyTreeInputNode): ConstructionDependencyTreeNode => ({
  ...node,
  children: [],
});

const wouldCreateCycle = (parentById: Map<string, string>, childId: string, parentId: string): boolean => {
  let current: string | undefined = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === childId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentById.get(current);
  }
  return false;
};

export const buildConstructionDependencyTree = (
  nodes: ConstructionDependencyTreeInputNode[],
  edges: ConstructionDependencyTreeInputEdge[],
  rootId: string
): ConstructionDependencyTreeNode | null => {
  const root = nodes.find((node) => node.id === rootId) ?? null;
  if (!root) return null;

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentById = new Map<string, string>();
  const dependencyEdgesByTargetId = new Map<string, ConstructionDependencyTreeInputEdge[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    if (edge.relation === "contains") continue;
    dependencyEdgesByTargetId.set(edge.targetId, [...(dependencyEdgesByTargetId.get(edge.targetId) ?? []), edge]);
  }
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    if (edge.targetId === rootId) continue;
    if (parentById.has(edge.targetId)) continue;
    if (edge.relation !== "contains" && (dependencyEdgesByTargetId.get(edge.targetId)?.length ?? 0) > 1) continue;
    if (wouldCreateCycle(parentById, edge.targetId, edge.sourceId)) continue;
    parentById.set(edge.targetId, edge.sourceId);
  }

  const treeById = new Map(nodes.map((node) => [node.id, cloneTreeNode(node)] as const));
  const treeRoot = treeById.get(rootId) ?? null;
  if (!treeRoot) return null;

  for (const node of nodes) {
    if (node.id === rootId) continue;
    const child = treeById.get(node.id);
    if (!child) continue;
    const parent = treeById.get(parentById.get(node.id) ?? rootId) ?? treeRoot;
    parent.children.push(child);
  }
  return treeRoot;
};

export const getConstructionDependencyUpdateChain = (
  nodes: ConstructionDependencyTreeInputNode[],
  edges: ConstructionDependencyTreeInputEdge[],
  changedNodeId: string
): ConstructionDependencyUpdateStep[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const changed = nodeById.get(changedNodeId);
  if (!changed) return [];

  const dependentsById = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.id, 0);
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    dependentsById.set(edge.sourceId, [...(dependentsById.get(edge.sourceId) ?? []), edge.targetId]);
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
  }

  const affected = new Set<string>();
  const queue = [changedNodeId];
  for (let i = 0; i < queue.length; i += 1) {
    for (const dependentId of dependentsById.get(queue[i]) ?? []) {
      if (affected.has(dependentId)) continue;
      affected.add(dependentId);
      queue.push(dependentId);
    }
  }

  const topoQueue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const topoOrder: string[] = [];
  for (let i = 0; i < topoQueue.length; i += 1) {
    const id = topoQueue[i];
    topoOrder.push(id);
    for (const dependentId of dependentsById.get(id) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) topoQueue.push(dependentId);
    }
  }

  const orderedAffected = topoOrder.filter((id) => affected.has(id));
  for (const id of affected) {
    if (!orderedAffected.includes(id)) orderedAffected.push(id);
  }

  return [
    { id: changed.id, label: changed.label, kind: changed.kind, status: changed.status, action: "changed" },
    ...orderedAffected.flatMap((id) => {
      const node = nodeById.get(id);
      return node
        ? [{ id: node.id, label: node.label, kind: node.kind, status: node.status, action: "updated" as const }]
        : [];
    }),
  ];
};
