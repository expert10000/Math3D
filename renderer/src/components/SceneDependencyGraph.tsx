import React, { useMemo, useState } from "react";
import { layoutDependencyDag } from "../geometry/dependencyDagLayout";

export type SceneDependencyGraphNode = {
  id: string;
  label: string;
  kind: string;
  status: string;
};

export type SceneDependencyGraphEdge = {
  sourceId: string;
  targetId: string;
  relation: string;
};

type Props = {
  nodes: SceneDependencyGraphNode[];
  edges: SceneDependencyGraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const nodeMeta = (kind: string) => {
  if (kind.includes("point")) return { icon: "●", color: "#1d4ed8", fill: "#eff6ff", border: "#60a5fa" };
  if (kind === "parameter") return { icon: "◧", color: "#b45309", fill: "#fffbeb", border: "#f59e0b" };
  if (kind.includes("line")) return { icon: "▬", color: "#15803d", fill: "#f0fdf4", border: "#4ade80" };
  if (kind.includes("plane")) return { icon: "▭", color: "#6d28d9", fill: "#f5f3ff", border: "#a78bfa" };
  if (kind === "analysis") return { icon: "∑", color: "#be123c", fill: "#fff1f2", border: "#fb7185" };
  if (kind === "measurement") return { icon: "📏", color: "#475569", fill: "#f8fafc", border: "#94a3b8" };
  if (kind === "scene-root") return { icon: "◇", color: "#0f172a", fill: "#f1f5f9", border: "#64748b" };
  return { icon: "◆", color: "#1e3a8a", fill: "#eef2ff", border: "#818cf8" };
};

export const SceneDependencyGraph: React.FC<Props> = ({ nodes, edges, selectedId, onSelect }) => {
  const [zoom, setZoom] = useState(1);
  const visibleEdges = useMemo(() => edges.filter((edge) => edge.relation !== "contains"), [edges]);
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    visibleEdges.forEach((edge) => {
      ids.add(edge.sourceId);
      ids.add(edge.targetId);
    });
    nodes.filter((node) => node.kind === "geometry-object").forEach((node) => ids.add(node.id));
    return ids;
  }, [nodes, visibleEdges]);
  const visibleNodes = useMemo(() => nodes.filter((node) => connectedNodeIds.has(node.id)), [connectedNodeIds, nodes]);
  const layout = useMemo(
    () => layoutDependencyDag(visibleNodes, visibleEdges),
    [visibleEdges, visibleNodes]
  );

  return (
    <div
      data-testid="geometry-scene-dependency-workspace"
      style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", background: "#f8fafc" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid #cbd5e1", background: "#fff" }}>
        <strong style={{ color: "#0f172a" }}>Scene Graph</strong>
        <span style={{ color: "#64748b", fontSize: 11 }}>{visibleNodes.length} nodes · {visibleEdges.length} dependencies · automatic DAG layout</span>
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Zoom out dependency graph" onClick={() => setZoom((value) => Math.max(0.45, value - 0.15))}>−</button>
        <button type="button" onClick={() => setZoom(1)} style={{ minWidth: 52 }}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in dependency graph" onClick={() => setZoom((value) => Math.min(2, value + 0.15))}>+</button>
      </div>
      <div style={{ minHeight: 0, overflow: "auto", padding: 12 }}>
        {visibleNodes.length ? (
          <svg
            data-testid="geometry-scene-dependency-graph"
            role="img"
            aria-label="Scene dependency graph"
            width={layout.width * zoom}
            height={layout.height * zoom}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            style={{ display: "block", margin: "0 auto", background: "#fff", border: "1px solid #dbe2ea", borderRadius: 10 }}
          >
            <defs>
              <marker id="scene-dependency-arrow" viewBox="0 0 7 7" refX="6" refY="3.5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#94a3b8" />
              </marker>
            </defs>
            {visibleEdges.map((edge, index) => {
              const source = layout.positions.get(edge.sourceId);
              const target = layout.positions.get(edge.targetId);
              if (!source || !target) return null;
              const sourceX = source.x + source.width / 2;
              const sourceY = source.y + source.height;
              const targetX = target.x + target.width / 2;
              const targetY = target.y;
              const midY = sourceY + (targetY - sourceY) / 2;
              return (
                <path
                  key={`${edge.sourceId}-${edge.targetId}-${edge.relation}-${index}`}
                  d={`M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                  markerEnd="url(#scene-dependency-arrow)"
                >
                  <title>{edge.relation}</title>
                </path>
              );
            })}
            {visibleNodes.map((node) => {
              const position = layout.positions.get(node.id);
              if (!position) return null;
              const meta = nodeMeta(node.kind);
              const selected = node.id === selectedId;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={node.label}
                  data-node-id={node.id}
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(node.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={position.x}
                    y={position.y}
                    width={position.width}
                    height={position.height}
                    rx="8"
                    fill={selected ? "#dbeafe" : meta.fill}
                    stroke={selected ? "#2563eb" : meta.border}
                    strokeWidth={selected ? 2.5 : 1.3}
                  />
                  <text x={position.x + 11} y={position.y + 20} fill={meta.color} fontSize="11" fontWeight="800">
                    {meta.icon} {node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}
                  </text>
                  <text x={position.x + 11} y={position.y + 36} fill="#64748b" fontSize="8.5" fontWeight="700">
                    {node.kind.replaceAll("-", " ")} · {node.status}
                  </text>
                  <title>{node.label}</title>
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>Create or construct connected geometry to populate the scene graph.</div>
        )}
      </div>
    </div>
  );
};
