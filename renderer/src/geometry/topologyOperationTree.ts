import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  applyGeometryTopologyEditDefinition,
  describeGeometryTopologyEditDefinition,
  resolveGeometryTopologyEditDefinitionTarget,
  type GeometryTopologyEditDefinition,
} from "./topologyEditDefinition";

export type GeometryTopologyOperationTreeInputNode = {
  readonly id: string;
  readonly label: string;
  readonly at: number;
  readonly definition: GeometryTopologyEditDefinition | null | undefined;
  readonly sourceMesh: SurfaceMeshData | null | undefined;
  readonly enabled?: boolean;
  readonly order?: number | null;
};

export type GeometryTopologyOperationTreeNode = {
  readonly id: string;
  readonly label: string;
  readonly at: number;
  readonly definition: GeometryTopologyEditDefinition;
  readonly sourceMesh: SurfaceMeshData;
  readonly operationLabel: string;
  readonly targetLabel: string;
  readonly paramsLabel: string;
  readonly sourceRevisionLabel: string;
  readonly replayStatusLabel: string;
  readonly enabled: boolean;
  readonly order: number;
};

export type GeometryTopologyOperationTree = {
  readonly sourceLabel: string;
  readonly resultLabel: string;
  readonly nodes: GeometryTopologyOperationTreeNode[];
};

export type GeometryTopologyOperationTreeReplayResult =
  | {
      readonly ok: true;
      readonly mesh: SurfaceMeshData;
      readonly appliedNodeIds: string[];
      readonly skippedNodeIds: string[];
      readonly startNodeId: string;
    }
  | { readonly ok: false; readonly reason: string; readonly nodeId?: string | null };

export function reorderGeometryTopologyOperationTreeNodeIds(
  orderedNodeIds: readonly string[],
  nodeId: string,
  direction: "up" | "down"
): string[] {
  const next = orderedNodeIds.slice();
  const index = next.indexOf(nodeId);
  if (index < 0) return next;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  const current = next[index];
  next[index] = next[targetIndex];
  next[targetIndex] = current;
  return next;
}

const cloneSurfaceMeshForReplay = (mesh: SurfaceMeshData, labelOverride?: string): SurfaceMeshData => ({
  label: labelOverride ?? mesh.label,
  positions: Float32Array.from(mesh.positions),
  indices: mesh.indices ? Uint32Array.from(mesh.indices) : null,
  normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
  uvs: mesh.uvs ? Float32Array.from(mesh.uvs) : null,
  source: mesh.source,
  adjacency: mesh.adjacency ? mesh.adjacency.map((row) => row.slice()) : null,
  meanEdgeLength: mesh.meanEdgeLength ?? null,
  validation: mesh.validation
    ? {
        ...mesh.validation,
        errors: [...mesh.validation.errors],
        warnings: [...mesh.validation.warnings],
        stats: { ...mesh.validation.stats },
      }
    : null,
});

export function buildGeometryTopologyOperationTree(
  inputNodes: readonly GeometryTopologyOperationTreeInputNode[],
  resultLabel = "Result"
): GeometryTopologyOperationTree {
  const nodes = inputNodes
    .filter((node): node is GeometryTopologyOperationTreeInputNode & {
      readonly definition: GeometryTopologyEditDefinition;
      readonly sourceMesh: SurfaceMeshData;
    } => !!node.definition && !!node.sourceMesh)
    .slice()
    .sort((a, b) => {
      const orderA = Number.isFinite(a.order) ? Number(a.order) : null;
      const orderB = Number.isFinite(b.order) ? Number(b.order) : null;
      if (orderA != null && orderB != null && orderA !== orderB) return orderA - orderB;
      if (orderA != null && orderB == null) return -1;
      if (orderA == null && orderB != null) return 1;
      return a.at - b.at;
    })
    .map((node, index): GeometryTopologyOperationTreeNode => {
      const description = describeGeometryTopologyEditDefinition(node.definition, true);
      return {
        id: node.id,
        label: node.label,
        at: node.at,
        definition: node.definition,
        sourceMesh: node.sourceMesh,
        operationLabel: node.definition.operation,
        targetLabel: node.definition.target.label,
        paramsLabel: node.definition.paramsLabel,
        sourceRevisionLabel: description.sourceRevisionLabel,
        replayStatusLabel: description.replayStatusLabel,
        enabled: node.enabled ?? true,
        order: Number.isFinite(node.order) ? Number(node.order) : index,
      };
    });

  return {
    sourceLabel: nodes[0]?.definition.sourceObjectVersion.label ?? "Source mesh",
    resultLabel,
    nodes,
  };
}

export function replayGeometryTopologyOperationTreeFromNode(
  tree: GeometryTopologyOperationTree,
  startNodeId: string
): GeometryTopologyOperationTreeReplayResult {
  const startIndex = tree.nodes.findIndex((node) => node.id === startNodeId);
  if (startIndex < 0) return { ok: false, reason: "Operation tree node not found.", nodeId: startNodeId };
  const startNode = tree.nodes[startIndex];
  let mesh = cloneSurfaceMeshForReplay(startNode.sourceMesh, startNode.sourceMesh.label ?? "Geometry source");
  const appliedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];
  for (const node of tree.nodes.slice(startIndex)) {
    if (!node.enabled) {
      skippedNodeIds.push(node.id);
      continue;
    }
    const resolved = resolveGeometryTopologyEditDefinitionTarget(mesh, node.definition);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: `Replay blocked at ${node.label}: ${resolved.reason}`,
        nodeId: node.id,
      };
    }
    mesh = applyGeometryTopologyEditDefinition(mesh, node.definition);
    appliedNodeIds.push(node.id);
  }
  return { ok: true, mesh, appliedNodeIds, skippedNodeIds, startNodeId };
}
