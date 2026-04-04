import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "../uiStyles";
import {
  DEFAULT_TOPOLOGY_PRESET_ID,
  TOPOLOGY_PRESET_BY_ID,
  TOPOLOGY_DOCUMENT_EXTENSION,
  TOPOLOGY_PRESETS,
  TopologyRealization3DView,
  buildQuotientPipeline,
  cloneFundamentalDiagram,
  createTopologyDocument,
  type FundamentalDiagram,
  type FundamentalDiagramEdge,
  type QuotientBuildResult,
  type TopologyDocumentView,
  type Vec3,
  isTopologyDocument,
} from "../topology";

type TopologyView = TopologyDocumentView;
type TopologyBuildMode = "preset" | "editor";
type DiagramToolMode = "select" | "addVertex" | "addEdge";

const initialDiagram = () => {
  const preset = TOPOLOGY_PRESET_BY_ID.get(DEFAULT_TOPOLOGY_PRESET_ID) ?? TOPOLOGY_PRESETS[0];
  if (!preset) {
    return {
      id: "topology/empty",
      name: "Empty diagram",
      vertices: [],
      edges: [],
      faces: [],
      edgeOrientations: {},
      edgeLabels: {},
      edgePairings: {},
      vertexLabels: {},
      faceBoundaryWords: {},
      metadata: { description: "No topology presets found." },
    } satisfies FundamentalDiagram;
  }
  return preset.buildDiagram();
};

const diagPoint = (x: number, y: number) => ({ x: 250 + x * 155, y: 180 - y * 145 });
const isoProject = (point: Vec3) => ({ x: 260 + point[0] * 78 + point[2] * 34, y: 180 - point[1] * 72 + point[2] * 16 });

const parsePairings = (raw: string): string[] =>
  [...new Set(raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0))];

const cloneAndPatch = (diagram: FundamentalDiagram, patch: (next: FundamentalDiagram) => void): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  patch(next);
  return next;
};

const edgePeerSet = (diagram: FundamentalDiagram, edgeId: string | null): Set<string> => {
  if (!edgeId) return new Set<string>();
  const peers = new Set<string>([edgeId]);
  const byLabel = diagram.edgeLabels[edgeId]?.trim() ?? "";
  for (const peer of diagram.edgePairings[edgeId] ?? []) peers.add(peer);
  if (byLabel) {
    for (const edge of diagram.edges) {
      if ((diagram.edgeLabels[edge.id] ?? "").trim() === byLabel) peers.add(edge.id);
    }
  }
  return peers;
};

const edgeByIdMap = (diagram: FundamentalDiagram): Map<string, FundamentalDiagramEdge> =>
  new Map(diagram.edges.map((edge) => [edge.id, edge]));

const nextId = (prefix: string, existingIds: string[]): string => {
  let n = 0;
  const idSet = new Set(existingIds);
  while (idSet.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
};

const regenerateBoundaryWords = (diagram: FundamentalDiagram) => {
  for (const face of diagram.faces) {
    diagram.faceBoundaryWords[face.id] = face.boundary
      .map((entry) => `${diagram.edgeLabels[entry.edgeId] || entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`)
      .join(" ");
  }
};

class SmallDsu {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) {
      this.add(id);
      return id;
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

export const TopologyScreen: React.FC = () => {
  const [buildMode, setBuildMode] = useState<TopologyBuildMode>("preset");
  const [toolMode, setToolMode] = useState<DiagramToolMode>("select");
  const [presetId, setPresetId] = useState(DEFAULT_TOPOLOGY_PRESET_ID);
  const [diagram, setDiagram] = useState<FundamentalDiagram>(() => initialDiagram());
  const [buildResult, setBuildResult] = useState<QuotientBuildResult>(() => buildQuotientPipeline(initialDiagram()));
  const [builtSignature, setBuiltSignature] = useState(() => JSON.stringify(initialDiagram()));
  const [activeView, setActiveView] = useState<TopologyView>("diagram");
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingEdgeStartId, setPendingEdgeStartId] = useState<string | null>(null);
  const [appendCreatedEdgesToBoundary, setAppendCreatedEdgesToBoundary] = useState(true);
  const [activeRealizationId, setActiveRealizationId] = useState<string | null>(null);
  const [realizationRenderMode, setRealizationRenderMode] = useState<"scene3d" | "projected2d">("scene3d");
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(initialDiagram(), null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingVertexIdRef = useRef<string | null>(null);

  const diagramSignature = useMemo(() => JSON.stringify(diagram), [diagram]);
  const buildStale = diagramSignature !== builtSignature;
  const edgeById = useMemo(() => edgeByIdMap(diagram), [diagram]);
  const highlightEdges = useMemo(() => edgePeerSet(diagram, hoverEdgeId), [diagram, hoverEdgeId]);
  const timelineOperations = useMemo(
    () =>
      buildResult.orientationRelations.map((relation, index) => ({
        id: `op-${index}`,
        label: `${relation.edgeA} ~ ${relation.edgeB} (${relation.relation})`,
        relation,
      })),
    [buildResult.orientationRelations]
  );
  const timelineMax = timelineOperations.length + 1;

  const setDiagramAndDraft = (next: FundamentalDiagram) => {
    regenerateBoundaryWords(next);
    setDiagram(next);
    setJsonDraft(JSON.stringify(next, null, 2));
  };

  const applyPreset = (nextPresetId: string) => {
    const preset = TOPOLOGY_PRESET_BY_ID.get(nextPresetId);
    if (!preset) return;
    const nextDiagram = preset.buildDiagram();
    const nextResult = buildQuotientPipeline(nextDiagram);
    setBuildMode("preset");
    setPresetId(nextPresetId);
    setDiagramAndDraft(nextDiagram);
    setBuildResult(nextResult);
    setBuiltSignature(JSON.stringify(nextDiagram));
    setActiveRealizationId(nextResult.realizations[0]?.id ?? null);
    setActiveView("diagram");
    setTimelinePosition(0);
    setTimelinePlaying(false);
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
    setPendingEdgeStartId(null);
    setDocStatus(`Loaded preset '${preset.label}'.`);
    setDocError(null);
    setJsonError(null);
  };

  const ensureBuilt = () => {
    if (!buildStale) return buildResult;
    const nextResult = buildQuotientPipeline(diagram);
    setBuildResult(nextResult);
    setBuiltSignature(diagramSignature);
    if (!nextResult.realizations.some((entry) => entry.id === activeRealizationId)) {
      setActiveRealizationId(nextResult.realizations[0]?.id ?? null);
    }
    return nextResult;
  };

  const handleBuild = () => {
    ensureBuilt();
    setActiveView("quotient");
  };

  const toDiagramCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;
    const viewX = 520 * normX;
    const viewY = 360 * normY;
    return {
      x: (viewX - 250) / 155,
      y: (180 - viewY) / 145,
    };
  };

  const handleVertexDown = (event: React.PointerEvent<SVGCircleElement>, vertexId: string) => {
    if (toolMode !== "select") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingVertexIdRef.current = vertexId;
    setSelectedVertexId(vertexId);
    setSelectedEdgeId(null);
  };

  const handleSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (event) => {
    const draggingId = draggingVertexIdRef.current;
    if (!draggingId) return;
    const p = toDiagramCoords(event.clientX, event.clientY);
    if (!p) return;
    setDiagramAndDraft(
      cloneAndPatch(diagram, (next) => {
        const vertex = next.vertices.find((entry) => entry.id === draggingId);
        if (!vertex) return;
        vertex.x = Math.max(-2.6, Math.min(2.6, p.x));
        vertex.y = Math.max(-2.0, Math.min(2.0, p.y));
      })
    );
  };

  const stopDragging = () => {
    draggingVertexIdRef.current = null;
  };

  const createEdge = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDiagramAndDraft(
      cloneAndPatch(diagram, (next) => {
        const edgeId = nextId("e", next.edges.map((edge) => edge.id));
        next.edges.push({ id: edgeId, from: fromId, to: toId });
        next.edgeLabels[edgeId] = "";
        next.edgeOrientations[edgeId] = 1;
        next.edgePairings[edgeId] = [];
        if (appendCreatedEdgesToBoundary && next.faces[0]) {
          next.faces[0].boundary.push({ edgeId, direction: 1 });
        }
      })
    );
  };

  const handleDiagramBackgroundClick: React.MouseEventHandler<SVGSVGElement> = (event) => {
    if (toolMode !== "addVertex") return;
    const p = toDiagramCoords(event.clientX, event.clientY);
    if (!p) return;
    setDiagramAndDraft(
      cloneAndPatch(diagram, (next) => {
        const vertexId = nextId("v", next.vertices.map((vertex) => vertex.id));
        next.vertices.push({ id: vertexId, x: p.x, y: p.y });
        next.vertexLabels[vertexId] = vertexId;
      })
    );
  };

  const handleVertexClick = (vertexId: string) => {
    if (toolMode === "addEdge") {
      if (!pendingEdgeStartId) {
        setPendingEdgeStartId(vertexId);
        return;
      }
      createEdge(pendingEdgeStartId, vertexId);
      setPendingEdgeStartId(null);
      return;
    }
    setSelectedVertexId(vertexId);
    setSelectedEdgeId(null);
  };

  const handleEdgeClick = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedVertexId(null);
  };

  const handleRemoveSelectedVertex = () => {
    if (!selectedVertexId) return;
    setDiagramAndDraft(
      cloneAndPatch(diagram, (next) => {
        const removedEdgeIds = new Set(
          next.edges.filter((edge) => edge.from === selectedVertexId || edge.to === selectedVertexId).map((edge) => edge.id)
        );
        next.vertices = next.vertices.filter((vertex) => vertex.id !== selectedVertexId);
        next.edges = next.edges.filter((edge) => !removedEdgeIds.has(edge.id));
        delete next.vertexLabels[selectedVertexId];
        for (const edgeId of removedEdgeIds) {
          delete next.edgeLabels[edgeId];
          delete next.edgeOrientations[edgeId];
          delete next.edgePairings[edgeId];
        }
        for (const edgeId of Object.keys(next.edgePairings)) {
          next.edgePairings[edgeId] = (next.edgePairings[edgeId] ?? []).filter((peer) => !removedEdgeIds.has(peer));
        }
        for (const face of next.faces) {
          face.boundary = face.boundary.filter((entry) => !removedEdgeIds.has(entry.edgeId));
        }
      })
    );
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
  };

  const handleRemoveSelectedEdge = () => {
    if (!selectedEdgeId) return;
    setDiagramAndDraft(
      cloneAndPatch(diagram, (next) => {
        next.edges = next.edges.filter((edge) => edge.id !== selectedEdgeId);
        delete next.edgeLabels[selectedEdgeId];
        delete next.edgeOrientations[selectedEdgeId];
        delete next.edgePairings[selectedEdgeId];
        for (const edgeId of Object.keys(next.edgePairings)) {
          next.edgePairings[edgeId] = (next.edgePairings[edgeId] ?? []).filter((peer) => peer !== selectedEdgeId);
        }
        for (const face of next.faces) {
          face.boundary = face.boundary.filter((entry) => entry.edgeId !== selectedEdgeId);
        }
      })
    );
    setSelectedEdgeId(null);
  };

  useEffect(() => {
    if (!timelinePlaying) return;
    const handle = window.setInterval(() => {
      setTimelinePosition((prev) => {
        const next = Math.min(timelineMax, prev + 1);
        if (next >= timelineMax) {
          setTimelinePlaying(false);
        }
        return next;
      });
    }, 900);
    return () => window.clearInterval(handle);
  }, [timelineMax, timelinePlaying]);

  const saveTopologyDocument = () => {
    const built = ensureBuilt();
    const doc = createTopologyDocument(diagram, {
      buildResult: built,
      activeView,
      activeRealizationId,
    });
    const text = JSON.stringify(doc, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const cleanName = (diagram.name || "topology")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "topology";
    anchor.href = url;
    anchor.download = `${cleanName}${TOPOLOGY_DOCUMENT_EXTENSION}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDocStatus(`Saved ${anchor.download}`);
    setDocError(null);
  };

  const loadTopologyDocument = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${TOPOLOGY_DOCUMENT_EXTENSION},.json,application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => {
        setDocError("Failed to read the selected file.");
        setDocStatus(null);
      };
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const raw = JSON.parse(text);
          if (isTopologyDocument(raw)) {
            const loadedDiagram = raw.payload.diagram;
            setDiagramAndDraft(loadedDiagram);
            setBuildMode("editor");
            if (raw.payload.cache?.buildResult) {
              setBuildResult(raw.payload.cache.buildResult);
              setBuiltSignature(JSON.stringify(loadedDiagram));
              setActiveView(raw.payload.cache.activeView ?? "diagram");
              setActiveRealizationId(raw.payload.cache.activeRealizationId ?? raw.payload.cache.buildResult.realizations[0]?.id ?? null);
            } else {
              const built = buildQuotientPipeline(loadedDiagram);
              setBuildResult(built);
              setBuiltSignature(JSON.stringify(loadedDiagram));
              setActiveView("diagram");
              setActiveRealizationId(built.realizations[0]?.id ?? null);
            }
            setTimelinePosition(0);
            setTimelinePlaying(false);
            setSelectedEdgeId(null);
            setSelectedVertexId(null);
            setPendingEdgeStartId(null);
            setPresetId(DEFAULT_TOPOLOGY_PRESET_ID);
            setDocStatus(`Loaded ${file.name}`);
            setDocError(null);
            return;
          }
          if (raw?.edges && raw?.vertices && raw?.faces) {
            const loadedDiagram = raw as FundamentalDiagram;
            setDiagramAndDraft(loadedDiagram);
            const built = buildQuotientPipeline(loadedDiagram);
            setBuildResult(built);
            setBuiltSignature(JSON.stringify(loadedDiagram));
            setBuildMode("editor");
            setActiveView("diagram");
            setActiveRealizationId(built.realizations[0]?.id ?? null);
            setTimelinePosition(0);
            setTimelinePlaying(false);
            setDocStatus(`Loaded diagram ${file.name}`);
            setDocError(null);
            return;
          }
          setDocError("Unsupported topology document format.");
          setDocStatus(null);
        } catch (error) {
          setDocError(`Failed to parse file: ${String((error as Error).message ?? error)}`);
          setDocStatus(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const renderDiagramView = () => {
    const face = diagram.faces[0];
    const polygonPoints =
      face?.boundary
        .map((entry) => {
          const edge = edgeById.get(entry.edgeId);
          if (!edge) return null;
          const vertexId = entry.direction > 0 ? edge.from : edge.to;
          const vertex = diagram.vertices.find((candidate) => candidate.id === vertexId);
          if (!vertex) return null;
          const point = diagPoint(vertex.x, vertex.y);
          return `${point.x},${point.y}`;
        })
        .filter((item): item is string => !!item) ?? [];

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>Geometry tools</span>
          {([
            ["select", "Select/Drag"],
            ["addVertex", "Add Vertex"],
            ["addEdge", "Add Edge"],
          ] as const).map(([id, label]) => (
            <button
              key={`diagram-tool-${id}`}
              type="button"
              onClick={() => {
                setToolMode(id);
                setPendingEdgeStartId(null);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid " + (toolMode === id ? "#0a66c2" : "#d1d5db"),
                background: toolMode === id ? "#e6f0ff" : "#fff",
                fontSize: 11,
                fontWeight: toolMode === id ? 700 : 600,
                padding: "4px 10px",
              }}
            >
              {label}
            </button>
          ))}
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={appendCreatedEdgesToBoundary}
              onChange={(event) => setAppendCreatedEdgesToBoundary(event.target.checked)}
            />
            append new edges to face boundary
          </label>
          <button type="button" onClick={handleRemoveSelectedVertex} disabled={!selectedVertexId}>
            Remove Vertex
          </button>
          <button type="button" onClick={handleRemoveSelectedEdge} disabled={!selectedEdgeId}>
            Remove Edge
          </button>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          viewBox="0 0 520 360"
          style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}
          onMouseLeave={() => setHoverEdgeId(null)}
          onPointerUp={stopDragging}
          onPointerLeave={stopDragging}
          onPointerCancel={stopDragging}
          onPointerMove={handleSvgPointerMove}
          onClick={handleDiagramBackgroundClick}
        >
          <defs>
            <marker id="edgeArrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3.5, 0 7" fill="#1e293b" />
            </marker>
          </defs>
          {polygonPoints.length >= 3 && (
            <polygon points={polygonPoints.join(" ")} fill="#f8fbff" stroke="#d1d9e5" strokeWidth={1.2} />
          )}

          {diagram.edges.map((edge) => {
            const from = diagram.vertices.find((vertex) => vertex.id === edge.from);
            const to = diagram.vertices.find((vertex) => vertex.id === edge.to);
            if (!from || !to) return null;
            const orientation = diagram.edgeOrientations[edge.id] ?? 1;
            const pointFrom = diagPoint(from.x, from.y);
            const pointTo = diagPoint(to.x, to.y);
            const arrowStart = orientation > 0 ? pointFrom : pointTo;
            const arrowEnd = orientation > 0 ? pointTo : pointFrom;
            const mid = { x: (pointFrom.x + pointTo.x) / 2, y: (pointFrom.y + pointTo.y) / 2 };
            const highlighted = highlightEdges.has(edge.id);
            return (
              <g key={`diagram-edge-${edge.id}`} onMouseEnter={() => setHoverEdgeId(edge.id)} style={{ cursor: "pointer" }}>
                <line
                  x1={arrowStart.x}
                  y1={arrowStart.y}
                  x2={arrowEnd.x}
                  y2={arrowEnd.y}
                  stroke={highlighted ? "#0a66c2" : "#334155"}
                  strokeWidth={selectedEdgeId === edge.id ? 3.4 : highlighted ? 3 : 2}
                  markerEnd="url(#edgeArrow)"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEdgeClick(edge.id);
                  }}
                />
                <text
                  x={mid.x}
                  y={mid.y - 7}
                  textAnchor="middle"
                  style={{
                    fontSize: 11,
                    fontWeight: highlighted ? 700 : 600,
                    fill: highlighted ? "#0a66c2" : "#1f2937",
                  }}
                >
                  {diagram.edgeLabels[edge.id] || edge.id}
                </text>
                <text x={mid.x} y={mid.y + 8} textAnchor="middle" style={{ fontSize: 9, fill: "#64748b" }}>
                  {edge.id}
                </text>
              </g>
            );
          })}

          {diagram.vertices.map((vertex) => {
            const point = diagPoint(vertex.x, vertex.y);
            const label = diagram.vertexLabels[vertex.id] || vertex.id;
            return (
              <g key={`diagram-vertex-${vertex.id}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={selectedVertexId === vertex.id ? 7 : 5}
                  fill={selectedVertexId === vertex.id ? "#0a66c2" : "#0f172a"}
                  style={{ cursor: toolMode === "addEdge" || toolMode === "select" ? "pointer" : "crosshair" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    handleVertexDown(event, vertex.id);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVertexClick(vertex.id);
                  }}
                />
                <text x={point.x + 8} y={point.y - 8} style={{ fontSize: 11, fill: "#0f172a", fontWeight: 600 }}>
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ fontSize: 11, color: "#475569", display: "grid", gap: 3 }}>
          <div>
            Hover edge to highlight pairing class. Current face word:{" "}
            <strong>{diagram.faceBoundaryWords[diagram.faces[0]?.id ?? ""] || "(none)"}</strong>
          </div>
          {hoverEdgeId && (
            <div>
              Selected edge: <strong>{hoverEdgeId}</strong> - peers:{" "}
              {Array.from(highlightEdges).sort((a, b) => a.localeCompare(b)).join(", ")}
            </div>
          )}
          {toolMode === "addEdge" && (
            <div>
              Add-edge mode: {pendingEdgeStartId ? `choose end vertex (start ${pendingEdgeStartId})` : "choose start vertex"}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuotientView = () => {
    const result = ensureBuilt();
    const quotient = result.quotient;
    const positions: Record<string, { x: number; y: number }> = {};
    const count = quotient.vertices.length;
    quotient.vertices.forEach((vertex, index) => {
      if (count <= 1) {
        positions[vertex.id] = { x: 260, y: 180 };
        return;
      }
      const angle = (Math.PI * 2 * index) / count;
      positions[vertex.id] = { x: 260 + 130 * Math.cos(angle), y: 180 + 112 * Math.sin(angle) };
    });

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
          {quotient.edges.map((edge, index) => {
            const from = positions[edge.endpointVertexIds[0]];
            const to = positions[edge.endpointVertexIds[1]];
            if (!from || !to) return null;
            if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
              const radius = 22 + index * 7;
              const path = `M ${from.x} ${from.y - radius} C ${from.x + radius} ${from.y - radius - 24} ${from.x - radius} ${from.y - radius - 24} ${from.x} ${from.y - radius}`;
              return (
                <g key={`q-edge-loop-${edge.id}`}>
                  <path d={path} fill="none" stroke="#0f172a" strokeWidth={2} />
                  <text x={from.x + radius + 4} y={from.y - radius - 10} style={{ fontSize: 10, fill: "#0f172a" }}>
                    {edge.label}
                  </text>
                </g>
              );
            }
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            return (
              <g key={`q-edge-${edge.id}`}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#0f172a" strokeWidth={2.2} />
                <text x={mid.x + 6} y={mid.y - 6} style={{ fontSize: 10, fill: "#0f172a" }}>
                  {edge.label}
                </text>
              </g>
            );
          })}
          {quotient.vertices.map((vertex) => {
            const point = positions[vertex.id];
            if (!point) return null;
            return (
              <g key={`q-vertex-${vertex.id}`}>
                <circle cx={point.x} cy={point.y} r={7} fill="#0a66c2" />
                <text x={point.x + 10} y={point.y - 10} style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}>
                  {vertex.id}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Equivalence classes</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              {buildResult.vertexClasses.map((entry) => (
                <div key={`v-class-${entry.id}`}>
                  <strong>{entry.id}</strong>: {entry.sourceIds.join(" = ")}
                </div>
              ))}
              {buildResult.edgeClasses.map((entry) => (
                <div key={`e-class-${entry.id}`}>
                  <strong>{entry.id}</strong>: {entry.sourceIds.join(" = ")}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Face attachments</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              {buildResult.quotient.faces.map((face) => {
                const attachment = buildResult.quotient.attachmentMap[face.attachmentId];
                return (
                  <div key={`attachment-${face.id}`}>
                    <strong>{face.id}</strong>: {attachment?.boundaryWord || "(missing)"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>CW Inspector: incidence</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Vertex {"->"} incident edges</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
              {quotient.vertices.map((vertex) => (
                <div key={`inc-v-${vertex.id}`}>
                  <strong>{vertex.id}</strong>: {(quotient.incidences.vertexToEdges[vertex.id] ?? []).join(", ") || "(none)"}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Edge {"->"} attached faces</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
              {quotient.edges.map((edge) => (
                <div key={`inc-e-${edge.id}`}>
                  <strong>{edge.id}</strong>: {(quotient.incidences.edgeToFaces[edge.id] ?? []).join(", ") || "(none)"}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>CW Inspector: boundary & orientation</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Cell boundary data</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 120, overflowY: "auto" }}>
              {quotient.cellBoundaries.map((boundary) => (
                <div key={`boundary-${boundary.faceId}`}>
                  <strong>{boundary.faceId}</strong>:{" "}
                  {boundary.edgeWalk.map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" ")}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Orientation matches/reversals</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 120, overflowY: "auto" }}>
              {result.orientationRelations.length === 0 && <div>(none)</div>}
              {result.orientationRelations.map((relation, index) => (
                <div key={`orientation-${relation.edgeA}-${relation.edgeB}-${index}`}>
                  {relation.edgeA} ~ {relation.edgeB}: <strong>{relation.relation}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRealizationView = () => {
    const result = ensureBuilt();
    const realization =
      result.realizations.find((entry) => entry.id === activeRealizationId) ??
      result.realizations[0];
    if (!realization) return <div style={{ fontSize: 12 }}>No realization available.</div>;
    const seamEdgeIds = new Set(realization.seams.map((entry) => entry.edgeId));
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>Render mode</span>
          <button
            type="button"
            onClick={() => setRealizationRenderMode("scene3d")}
            style={{
              borderRadius: 999,
              border: "1px solid " + (realizationRenderMode === "scene3d" ? "#0a66c2" : "#d1d5db"),
              background: realizationRenderMode === "scene3d" ? "#e6f0ff" : "#fff",
              fontSize: 11,
              fontWeight: realizationRenderMode === "scene3d" ? 700 : 600,
              padding: "4px 10px",
            }}
          >
            3D scene
          </button>
          <button
            type="button"
            onClick={() => setRealizationRenderMode("projected2d")}
            style={{
              borderRadius: 999,
              border: "1px solid " + (realizationRenderMode === "projected2d" ? "#0a66c2" : "#d1d5db"),
              background: realizationRenderMode === "projected2d" ? "#e6f0ff" : "#fff",
              fontSize: 11,
              fontWeight: realizationRenderMode === "projected2d" ? 700 : 600,
              padding: "4px 10px",
            }}
          >
            projected 2D
          </button>
        </div>

        {realizationRenderMode === "scene3d" ? (
          <TopologyRealization3DView realization={realization} height={390} />
        ) : (
          <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
            {realization.faceRealizationMesh.flatMap((mesh) =>
              mesh.triangles.map((triangle, index) => {
                const a = isoProject(mesh.vertices[triangle[0]]);
                const b = isoProject(mesh.vertices[triangle[1]]);
                const c = isoProject(mesh.vertices[triangle[2]]);
                const points = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;
                return (
                  <polygon
                    key={`face-tri-${mesh.faceId}-${index}`}
                    points={points}
                    fill={realization.style.faceFill}
                    opacity={0.55}
                    stroke="#93c5fd"
                    strokeWidth={0.6}
                  />
                );
              })
            )}

            {Object.entries(realization.edgeCurves).map(([edgeId, points]) => {
              if (points.length < 2) return null;
              const polyline = points.map((point) => isoProject(point)).map((point) => `${point.x},${point.y}`).join(" ");
              const seam = seamEdgeIds.has(edgeId);
              return (
                <polyline
                  key={`real-edge-${edgeId}`}
                  points={polyline}
                  fill="none"
                  stroke={seam ? realization.style.seamStroke : realization.style.edgeStroke}
                  strokeWidth={seam ? 2.8 : 1.9}
                  strokeDasharray={seam ? "6 3" : undefined}
                />
              );
            })}

            {Object.entries(realization.vertexPositions).map(([vertexId, point]) => {
              const pos = isoProject(point);
              const singularity = realization.singularityMarkers.find((entry) => entry.vertexId === vertexId);
              return (
                <g key={`real-vertex-${vertexId}`}>
                  <circle cx={pos.x} cy={pos.y} r={4.8} fill="#0f172a" />
                  {singularity && (
                    <circle cx={pos.x} cy={pos.y} r={8.2} fill="none" stroke={realization.style.singularityColor} strokeWidth={1.8} />
                  )}
                  <text x={pos.x + 7} y={pos.y - 8} style={{ fontSize: 10, fill: "#0f172a", fontWeight: 700 }}>
                    {vertexId}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <div style={{ fontSize: 11, color: "#475569", display: "grid", gap: 3 }}>
          <div>
            Realization is independent from quotient data and can be replaced by alternate embeddings for the same quotient complex.
          </div>
          <div>
            Seams: {realization.seams.length} | singular markers: {realization.singularityMarkers.length}
          </div>
          <div>
            The 3D scene supports self-intersections/non-manifold adjacency and explicit seam overlays.
          </div>
        </div>
      </div>
    );
  };

  const renderAnimationView = () => {
    const result = ensureBuilt();
    const realization =
      result.realizations.find((entry) => entry.id === activeRealizationId) ??
      result.realizations[0];
    if (!realization) return <div style={{ fontSize: 12 }}>No realization available.</div>;
    const edgeById = new Map(result.subdividedDiagram.edges.map((edge) => [edge.id, edge]));
    const sourceVertices = diagram.vertices.map((vertex) => vertex.id);
    const projectedStart: Record<string, { x: number; y: number }> = {};
    const projectedFinal: Record<string, { x: number; y: number }> = {};
    for (const vertex of diagram.vertices) {
      projectedStart[vertex.id] = diagPoint(vertex.x, vertex.y);
      const qVertexId = result.vertexClassBySource[vertex.id];
      const qPos = qVertexId ? realization.vertexPositions[qVertexId] : null;
      projectedFinal[vertex.id] = qPos ? isoProject(qPos) : diagPoint(vertex.x, vertex.y);
    }

    const partialTargetFor = (opCount: number): Record<string, { x: number; y: number }> => {
      const dsu = new SmallDsu();
      for (const vertexId of sourceVertices) dsu.add(vertexId);
      for (let index = 0; index < Math.min(opCount, timelineOperations.length); index += 1) {
        const op = timelineOperations[index];
        const edgeA = edgeById.get(op.relation.edgeA);
        const edgeB = edgeById.get(op.relation.edgeB);
        if (!edgeA || !edgeB) continue;
        if (op.relation.relation === "match") {
          dsu.union(edgeA.from, edgeB.from);
          dsu.union(edgeA.to, edgeB.to);
        } else {
          dsu.union(edgeA.from, edgeB.to);
          dsu.union(edgeA.to, edgeB.from);
        }
      }
      const groups = new Map<string, string[]>();
      for (const vertexId of sourceVertices) {
        const root = dsu.find(vertexId);
        const group = groups.get(root);
        if (group) group.push(vertexId);
        else groups.set(root, [vertexId]);
      }
      const out: Record<string, { x: number; y: number }> = {};
      for (const members of groups.values()) {
        const centroid = members.reduce(
          (acc, id) => ({ x: acc.x + (projectedFinal[id]?.x ?? 0), y: acc.y + (projectedFinal[id]?.y ?? 0) }),
          { x: 0, y: 0 }
        );
        const c = { x: centroid.x / members.length, y: centroid.y / members.length };
        for (const id of members) out[id] = c;
      }
      return out;
    };

    const baseIndex = Math.floor(Math.max(0, Math.min(timelineMax, timelinePosition)));
    const localT = Math.max(0, Math.min(1, timelinePosition - baseIndex));
    const targetsA = partialTargetFor(Math.min(timelineOperations.length, baseIndex));
    const targetsB = partialTargetFor(Math.min(timelineOperations.length, baseIndex + 1));
    const currentOp = baseIndex < timelineOperations.length ? timelineOperations[baseIndex] : null;
    const activePairEdges = new Set(
      currentOp ? [currentOp.relation.edgeA, currentOp.relation.edgeB] : []
    );

    const blended = (vertexId: string) => {
      const start = projectedStart[vertexId] ?? { x: 260, y: 180 };
      const targetA = targetsA[vertexId] ?? start;
      const targetB = targetsB[vertexId] ?? targetA;
      const target = {
        x: targetA.x * (1 - localT) + targetB.x * localT,
        y: targetA.y * (1 - localT) + targetB.y * localT,
      };
      return {
        x: start.x * 0.35 + target.x * 0.65,
        y: start.y * 0.35 + target.y * 0.65,
      };
    };

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setTimelinePlaying((v) => !v)}
            disabled={timelineOperations.length === 0}
          >
            {timelinePlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition((v) => Math.max(0, Math.floor(v) - 1));
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition((v) => Math.min(timelineMax, Math.floor(v) + 1));
            }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition(0);
            }}
          >
            Reset
          </button>
          <input
            type="range"
            min={0}
            max={timelineMax}
            step={0.01}
            value={timelinePosition}
            onChange={(event) => {
              setTimelinePlaying(false);
              setTimelinePosition(Number(event.target.value));
            }}
            style={{ flex: 1 }}
          />
          <strong style={{ fontSize: 12 }}>
            Step {Math.min(timelineMax, Math.floor(timelinePosition))}/{timelineMax}
          </strong>
        </div>
        <div style={{ fontSize: 12, color: "#334155" }}>
          {currentOp
            ? `Operation ${baseIndex + 1}: identify ${currentOp.relation.edgeA} with ${currentOp.relation.edgeB} (${currentOp.relation.relation})`
            : baseIndex <= 0
              ? "Start with flat fundamental diagram."
              : "All pair operations complete; settle on quotient placement."}
        </div>

        <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
          {diagram.edges.map((edge) => {
            const from = blended(edge.from);
            const to = blended(edge.to);
            const activePair = activePairEdges.has(edge.id);
            const completed = timelineOperations.some((operation, index) => index < baseIndex && (operation.relation.edgeA === edge.id || operation.relation.edgeB === edge.id));
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            return (
              <g key={`anim-edge-${edge.id}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={activePair ? "#b91c1c" : completed ? "#0a66c2" : "#64748b"}
                  strokeWidth={activePair ? 3.2 : completed ? 2.5 : 1.6}
                  strokeDasharray={activePair ? "6 3" : undefined}
                />
                <text x={mid.x + 5} y={mid.y - 5} style={{ fontSize: 10, fill: activePair ? "#b91c1c" : completed ? "#0a66c2" : "#64748b" }}>
                  {diagram.edgeLabels[edge.id] || edge.id}
                </text>
              </g>
            );
          })}

          {diagram.vertices.map((vertex) => {
            const point = blended(vertex.id);
            return (
              <g key={`anim-vertex-${vertex.id}`}>
                <circle cx={point.x} cy={point.y} r={4.8} fill="#0f172a" />
                <text x={point.x + 7} y={point.y - 7} style={{ fontSize: 10, fill: "#0f172a" }}>
                  {diagram.vertexLabels[vertex.id] || vertex.id}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 4, maxHeight: 170, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>Timeline operations</div>
          <div style={{ fontSize: 10, color: "#475569" }}>Per-pair identification sequence with scrub/play/pause.</div>
          {timelineOperations.map((operation, index) => {
            const active = index === baseIndex;
            const done = index < baseIndex;
            return (
              <div
                key={`timeline-op-${operation.id}`}
                style={{
                  border: "1px solid " + (active ? "#fda4af" : done ? "#bfdbfe" : "#e2e8f0"),
                  borderRadius: 6,
                  background: active ? "#fff1f2" : done ? "#eff6ff" : "#f8fafc",
                  padding: "4px 6px",
                  fontSize: 10,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setTimelinePlaying(false);
                  setTimelinePosition(index);
                }}
              >
                {index + 1}. {operation.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCenterView = () => {
    if (activeView === "diagram") return renderDiagramView();
    if (activeView === "quotient") return renderQuotientView();
    if (activeView === "realization") return renderRealizationView();
    return renderAnimationView();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", alignItems: "stretch", gap: 10 }}>
      <div style={{ ...styles.panelLeft, width: 340, display: "grid", gap: 10 }}>
        <section>
          <h2 style={styles.h2}>Topology Module</h2>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
            Pipeline: Fundamental Diagram - Subdivision/Triangulation - Equivalence - Quotient Complex - Realization - Render.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setBuildMode("preset")} style={{ fontWeight: buildMode === "preset" ? 700 : 500 }}>
              Preset mode
            </button>
            <button type="button" onClick={() => setBuildMode("editor")} style={{ fontWeight: buildMode === "editor" ? 700 : 500 }}>
              Editor mode
            </button>
          </div>
          {buildMode === "preset" && (
            <div style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto", paddingRight: 2 }}>
              {TOPOLOGY_PRESETS.map((preset) => {
                const selected = preset.id === presetId;
                return (
                  <button
                    key={`topology-preset-${preset.id}`}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    style={{
                      textAlign: "left",
                      border: "1px solid " + (selected ? "#0a66c2" : "#dbe4f0"),
                      borderRadius: 8,
                      background: selected ? "#e6f0ff" : "#fff",
                      padding: "7px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{preset.summary}</div>
                  </button>
                );
              })}
            </div>
          )}
          {buildMode === "editor" && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Edge editor</div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #dbe4f0", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fbff" }}>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Edge</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Label</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Arrow</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Pairings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagram.edges.map((edge) => (
                      <tr key={`edge-row-${edge.id}`}>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>{edge.id}</td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <input
                            type="text"
                            value={diagram.edgeLabels[edge.id] ?? ""}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgeLabels[edge.id] = event.target.value;
                                })
                              )
                            }
                            style={{ width: 48, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <select
                            value={diagram.edgeOrientations[edge.id] ?? 1}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgeOrientations[edge.id] = Number(event.target.value) >= 0 ? 1 : -1;
                                })
                              )
                            }
                            style={{ width: 64, fontSize: 11 }}
                          >
                            <option value={1}>{`->`}</option>
                            <option value={-1}>{`<-`}</option>
                          </select>
                        </td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <input
                            type="text"
                            value={(diagram.edgePairings[edge.id] ?? []).join(",")}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgePairings[edge.id] = parsePairings(event.target.value);
                                })
                              )
                            }
                            style={{ width: "100%", fontSize: 11 }}
                            placeholder="e1,e2"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontSize: 11 }}>Raw JSON editor</summary>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <textarea
                    value={jsonDraft}
                    onChange={(event) => setJsonDraft(event.target.value)}
                    rows={12}
                    style={{ width: "100%", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(jsonDraft) as FundamentalDiagram;
                          setDiagramAndDraft(parsed);
                          setJsonError(null);
                        } catch (error) {
                          setJsonError(String((error as Error).message ?? error));
                        }
                      }}
                    >
                      Apply JSON
                    </button>
                    <button type="button" onClick={() => setJsonDraft(JSON.stringify(diagram, null, 2))}>
                      Reset draft
                    </button>
                  </div>
                  {jsonError && <div style={{ color: "#b42318", fontSize: 11 }}>{jsonError}</div>}
                </div>
              </details>
            </div>
          )}
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" onClick={handleBuild}>
              Build Quotient
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("quotient");
              }}
            >
              Show Skeleton
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("realization");
              }}
            >
              Show Realization
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("animation");
              }}
            >
              Animate Identification
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: buildStale ? "#b45309" : "#475569" }}>
            {buildStale ? "Diagram changed. Rebuild to refresh quotient + realization." : "Quotient is up to date."}
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>Topology document</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" onClick={saveTopologyDocument}>
              Save .math3d-topology
            </button>
            <button type="button" onClick={loadTopologyDocument}>
              Load .math3d-topology
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#475569" }}>
            Stores diagram + quotient cache + realization choices.
          </div>
          {docStatus && <div style={{ fontSize: 10, color: "#166534" }}>{docStatus}</div>}
          {docError && <div style={{ fontSize: 10, color: "#b42318" }}>{docError}</div>}
        </section>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([
            ["diagram", "Diagram View"],
            ["quotient", "Quotient Structure View"],
            ["realization", "Realization View"],
            ["animation", "Animation View"],
          ] as const).map(([id, label]) => (
            <button
              key={`topology-view-${id}`}
              type="button"
              onClick={() => {
                if (id !== "diagram") ensureBuilt();
                setActiveView(id);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid " + (activeView === id ? "#0a66c2" : "#d1d5db"),
                background: activeView === id ? "#e6f0ff" : "#fff",
                fontWeight: activeView === id ? 700 : 600,
                fontSize: 11,
                padding: "5px 10px",
              }}
            >
              {label}
            </button>
          ))}
          <label style={{ marginLeft: "auto", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
            Realization
            <select
              value={activeRealizationId ?? buildResult.realizations[0]?.id ?? ""}
              onChange={(event) => setActiveRealizationId(event.target.value)}
              style={{ fontSize: 11 }}
            >
              {buildResult.realizations.map((realization) => (
                <option key={`realization-option-${realization.id}`} value={realization.id}>
                  {realization.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#f8fbff", padding: 10, overflow: "auto" }}>
          {renderCenterView()}
        </div>
      </div>

      <div style={{ ...styles.panelLeft, width: 330, display: "grid", gap: 10 }}>
        <section>
          <h2 style={styles.h2}>Topology Objects</h2>
          <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
            <div>
              <strong>Fundamental Diagram</strong>
            </div>
            <div>
              vertices {diagram.vertices.length}, edges {diagram.edges.length}, faces {diagram.faces.length}
            </div>
            <div>
              <strong>Subdivision stage</strong>
            </div>
            <div>
              {buildResult.subdivision.applied
                ? `triangulated faces ${buildResult.subdivision.triangulatedFaceIds.length}, created edges ${buildResult.subdivision.createdEdgeIds.length}`
                : "no triangulation needed"}
            </div>
            <div>
              <strong>Quotient Complex</strong>
            </div>
            <div>
              vertices {buildResult.quotient.vertices.length}, edges {buildResult.quotient.edges.length}, faces{" "}
              {buildResult.quotient.faces.length}
            </div>
            <div>
              <strong>Realizations</strong>
            </div>
            <div>{buildResult.realizations.length} realization choice(s) loaded</div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <h2 style={styles.h2}>Pipeline</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {buildResult.pipeline.map((stage) => (
              <div
                key={`stage-${stage.id}`}
                style={{
                  border: "1px solid " + (stage.status === "warning" ? "#fde68a" : "#dbe4f0"),
                  borderRadius: 8,
                  background: stage.status === "warning" ? "#fffbeb" : "#fff",
                  padding: "6px 8px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {stage.label} [{stage.status}]
                </div>
                <div style={{ fontSize: 10, color: "#475569" }}>{stage.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <h2 style={styles.h2}>Warnings & Invariants</h2>
          <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
            {buildResult.quotient.invariants && (
              <>
                <div>Euler characteristic: {buildResult.quotient.invariants.eulerCharacteristic}</div>
                <div>Connected components: {buildResult.quotient.invariants.connectedComponents}</div>
                <div>Non-manifold edges: {buildResult.quotient.invariants.nonManifoldEdgeCount}</div>
              </>
            )}
            <div style={{ marginTop: 4, fontWeight: 700 }}>Warnings ({buildResult.warnings.length})</div>
            {buildResult.warnings.length === 0 ? (
              <div style={{ color: "#166534" }}>No warnings.</div>
            ) : (
              <div style={{ display: "grid", gap: 5, maxHeight: 220, overflowY: "auto" }}>
                {buildResult.warnings.map((warning, index) => (
                  <div
                    key={`warning-${warning.code}-${index}`}
                    style={{
                      border: "1px solid " + (warning.level === "error" ? "#fecaca" : warning.level === "warning" ? "#fde68a" : "#dbe4f0"),
                      borderRadius: 7,
                      background: warning.level === "error" ? "#fff1f2" : warning.level === "warning" ? "#fffbeb" : "#f8fafc",
                      padding: "5px 6px",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700 }}>
                      {warning.level.toUpperCase()} - {warning.code}
                    </div>
                    <div style={{ fontSize: 10 }}>{warning.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TopologyScreen;
