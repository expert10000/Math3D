import {
  createConstructionGraph,
  getAffectedConstructionGraphNodeIds,
  type ConstructionGraph,
  type ConstructionGraphEdge,
  type ConstructionGraphNode,
} from "@math3d/core";

export type ConstructionGraphTransactionKind =
  | "create-object"
  | "edit-parameter"
  | "set-expression"
  | "execute-script"
  | "add-claim"
  | "graph-update";

export type ConstructionGraphTransactionSource =
  | "create"
  | "definition"
  | "script"
  | "claims"
  | "history"
  | "geometry";

export type ConstructionGraphNodeChange = {
  nodeId: string;
  before?: ConstructionGraphNode;
  after?: ConstructionGraphNode;
};

export type ConstructionGraphEdgeChange = {
  edgeId: string;
  before?: ConstructionGraphEdge;
  after?: ConstructionGraphEdge;
};

export type ConstructionGraphTransaction = {
  id: string;
  kind: ConstructionGraphTransactionKind;
  label: string;
  timestamp: number;
  sourceView: ConstructionGraphTransactionSource;
  changedNodeIds: string[];
  affectedNodeIds: string[];
  nodeChanges: ConstructionGraphNodeChange[];
  edgeChanges: ConstructionGraphEdgeChange[];
  beforeValues?: Record<string, unknown>;
  afterValues?: Record<string, unknown>;
};

export type ConstructionGraphTransactionHistory = {
  past: ConstructionGraphTransaction[];
  future: ConstructionGraphTransaction[];
};

export const isConstructionGraphTransaction = (value: unknown): value is ConstructionGraphTransaction => {
  if (!value || typeof value !== "object") return false;
  const transaction = value as Partial<ConstructionGraphTransaction>;
  return (
    typeof transaction.id === "string" &&
    typeof transaction.kind === "string" &&
    typeof transaction.label === "string" &&
    typeof transaction.timestamp === "number" &&
    typeof transaction.sourceView === "string" &&
    Array.isArray(transaction.changedNodeIds) &&
    Array.isArray(transaction.affectedNodeIds) &&
    Array.isArray(transaction.nodeChanges) &&
    Array.isArray(transaction.edgeChanges)
  );
};

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const createConstructionGraphTransactionHistory = (
  transactions: ConstructionGraphTransaction[] = []
): ConstructionGraphTransactionHistory => ({
  past: transactions,
  future: [],
});

export const createConstructionGraphTransaction = (
  before: ConstructionGraph,
  after: ConstructionGraph,
  metadata: {
    kind: ConstructionGraphTransactionKind;
    label: string;
    sourceView: ConstructionGraphTransactionSource;
    beforeValues?: Record<string, unknown>;
    afterValues?: Record<string, unknown>;
    timestamp?: number;
    id?: string;
  }
): ConstructionGraphTransaction | null => {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node] as const));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node] as const));
  const nodeIds = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
  const nodeChanges: ConstructionGraphNodeChange[] = [];
  for (const nodeId of nodeIds) {
    const previous = beforeNodes.get(nodeId);
    const next = afterNodes.get(nodeId);
    if (!equal(previous, next)) nodeChanges.push({ nodeId, before: previous, after: next });
  }

  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge] as const));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge] as const));
  const edgeIds = new Set([...beforeEdges.keys(), ...afterEdges.keys()]);
  const edgeChanges: ConstructionGraphEdgeChange[] = [];
  for (const edgeId of edgeIds) {
    const previous = beforeEdges.get(edgeId);
    const next = afterEdges.get(edgeId);
    if (!equal(previous, next)) edgeChanges.push({ edgeId, before: previous, after: next });
  }
  if (!nodeChanges.length && !edgeChanges.length) return null;

  const changedNodeIds = nodeChanges.map((change) => change.nodeId);
  const changedNodeIdSet = new Set(changedNodeIds);
  const changedRootNodeIds = changedNodeIds.filter(
    (nodeId) =>
      !after.edges.some(
        (edge) => edge.targetId === nodeId && changedNodeIdSet.has(edge.sourceId)
      )
  );
  const affectedNodeIds = getAffectedConstructionGraphNodeIds(after, changedRootNodeIds);
  const timestamp = metadata.timestamp ?? Date.now();
  return {
    id: metadata.id ?? `transaction:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    kind: metadata.kind,
    label: metadata.label,
    timestamp,
    sourceView: metadata.sourceView,
    changedNodeIds,
    affectedNodeIds,
    nodeChanges,
    edgeChanges,
    beforeValues: metadata.beforeValues,
    afterValues: metadata.afterValues,
  };
};

export const applyConstructionGraphTransaction = (
  graph: ConstructionGraph,
  transaction: ConstructionGraphTransaction,
  direction: "forward" | "backward"
): ConstructionGraph => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge] as const));
  for (const change of transaction.nodeChanges) {
    const value = direction === "forward" ? change.after : change.before;
    if (value) nodes.set(change.nodeId, value);
    else nodes.delete(change.nodeId);
  }
  for (const change of transaction.edgeChanges) {
    const value = direction === "forward" ? change.after : change.before;
    if (value) edges.set(change.edgeId, value);
    else edges.delete(change.edgeId);
  }
  return createConstructionGraph(Array.from(nodes.values()), Array.from(edges.values()));
};

export const commitConstructionGraphTransaction = (
  history: ConstructionGraphTransactionHistory,
  transaction: ConstructionGraphTransaction,
  limit = 100
): ConstructionGraphTransactionHistory => ({
  past: [...history.past, transaction].slice(-limit),
  future: [],
});

export const undoConstructionGraphTransaction = (
  graph: ConstructionGraph,
  history: ConstructionGraphTransactionHistory
): { graph: ConstructionGraph; history: ConstructionGraphTransactionHistory; transaction?: ConstructionGraphTransaction } => {
  const transaction = history.past.at(-1);
  if (!transaction) return { graph, history };
  return {
    graph: applyConstructionGraphTransaction(graph, transaction, "backward"),
    history: { past: history.past.slice(0, -1), future: [transaction, ...history.future] },
    transaction,
  };
};

export const redoConstructionGraphTransaction = (
  graph: ConstructionGraph,
  history: ConstructionGraphTransactionHistory
): { graph: ConstructionGraph; history: ConstructionGraphTransactionHistory; transaction?: ConstructionGraphTransaction } => {
  const transaction = history.future[0];
  if (!transaction) return { graph, history };
  return {
    graph: applyConstructionGraphTransaction(graph, transaction, "forward"),
    history: { past: [...history.past, transaction], future: history.future.slice(1) },
    transaction,
  };
};
