import React, { useMemo, useState } from "react";
import { uiStyles as styles } from "../uiStyles";
import {
  DEFAULT_TOPOLOGY_PRESET_ID,
  TOPOLOGY_PRESET_BY_ID,
  TOPOLOGY_PRESETS,
  buildQuotientPipeline,
  cloneFundamentalDiagram,
  type FundamentalDiagram,
  type FundamentalDiagramEdge,
  type QuotientBuildResult,
  type Vec3,
} from "../topology";

type TopologyView = "diagram" | "quotient" | "realization" | "animation";
type TopologyBuildMode = "preset" | "editor";

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

export const TopologyScreen: React.FC = () => {
  const [buildMode, setBuildMode] = useState<TopologyBuildMode>("preset");
  const [presetId, setPresetId] = useState(DEFAULT_TOPOLOGY_PRESET_ID);
  const [diagram, setDiagram] = useState<FundamentalDiagram>(() => initialDiagram());
  const [buildResult, setBuildResult] = useState<QuotientBuildResult>(() => buildQuotientPipeline(initialDiagram()));
  const [builtSignature, setBuiltSignature] = useState(() => JSON.stringify(initialDiagram()));
  const [activeView, setActiveView] = useState<TopologyView>("diagram");
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [animationStep, setAnimationStep] = useState(0);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(initialDiagram(), null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const diagramSignature = useMemo(() => JSON.stringify(diagram), [diagram]);
  const buildStale = diagramSignature !== builtSignature;
  const edgeById = useMemo(() => edgeByIdMap(diagram), [diagram]);
  const highlightEdges = useMemo(() => edgePeerSet(diagram, hoverEdgeId), [diagram, hoverEdgeId]);

  const setDiagramAndDraft = (next: FundamentalDiagram) => {
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
    setActiveView("diagram");
    setAnimationStep(0);
    setJsonError(null);
  };

  const ensureBuilt = () => {
    if (!buildStale) return buildResult;
    const nextResult = buildQuotientPipeline(diagram);
    setBuildResult(nextResult);
    setBuiltSignature(diagramSignature);
    return nextResult;
  };

  const handleBuild = () => {
    ensureBuilt();
    setActiveView("quotient");
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
        <svg
          width="100%"
          viewBox="0 0 520 360"
          style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}
          onMouseLeave={() => setHoverEdgeId(null)}
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
                  strokeWidth={highlighted ? 3 : 2}
                  markerEnd="url(#edgeArrow)"
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
                <circle cx={point.x} cy={point.y} r={5} fill="#0f172a" />
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
        </div>
      </div>
    );
  };

  const renderQuotientView = () => {
    const quotient = ensureBuilt().quotient;
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
      </div>
    );
  };

  const renderRealizationView = () => {
    const result = ensureBuilt();
    const realization = result.realizations[0];
    const seamEdgeIds = new Set(realization.seams.map((entry) => entry.edgeId));

    return (
      <div style={{ display: "grid", gap: 8 }}>
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
                {singularity && <circle cx={pos.x} cy={pos.y} r={8.2} fill="none" stroke={realization.style.singularityColor} strokeWidth={1.8} />}
                <text x={pos.x + 7} y={pos.y - 8} style={{ fontSize: 10, fill: "#0f172a", fontWeight: 700 }}>
                  {vertexId}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ fontSize: 11, color: "#475569", display: "grid", gap: 3 }}>
          <div>
            Realization is independent from quotient data and can be replaced by alternate embeddings for the same quotient complex.
          </div>
          <div>
            Seams: {realization.seams.length} | singular markers: {realization.singularityMarkers.length}
          </div>
        </div>
      </div>
    );
  };

  const renderAnimationView = () => {
    const result = ensureBuilt();
    const realization = result.realizations[0];
    const stepLabels = [
      "Start with flat fundamental diagram",
      "Fold first identification class",
      "Fold second identification class",
      "Apply final identification",
      "Arrive at quotient placement",
    ] as const;
    const t = animationStep / 4;
    const orderedEdgeClasses = [...result.edgeClasses].sort((left, right) => right.sourceIds.length - left.sourceIds.length);
    const foldedSourceEdges = new Set<string>(orderedEdgeClasses.slice(0, Math.max(0, animationStep)).flatMap((entry) => entry.sourceIds));

    const projectedStart: Record<string, { x: number; y: number }> = {};
    const projectedTarget: Record<string, { x: number; y: number }> = {};
    for (const vertex of diagram.vertices) projectedStart[vertex.id] = diagPoint(vertex.x, vertex.y);
    for (const vertexId of Object.keys(result.vertexClassBySource)) {
      const classId = result.vertexClassBySource[vertexId];
      const pos = realization.vertexPositions[classId] ?? [0, 0, 0];
      projectedTarget[vertexId] = isoProject(pos);
    }

    const blended = (vertexId: string) => {
      const start = projectedStart[vertexId] ?? { x: 260, y: 180 };
      const target = projectedTarget[vertexId] ?? start;
      return { x: start.x * (1 - t) + target.x * t, y: start.y * (1 - t) + target.y * t };
    };

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={animationStep}
            onChange={(event) => setAnimationStep(Number(event.target.value))}
            style={{ flex: 1 }}
          />
          <strong style={{ fontSize: 12 }}>Step {animationStep}/4</strong>
        </div>
        <div style={{ fontSize: 12, color: "#334155" }}>{stepLabels[animationStep]}</div>

        <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
          {diagram.edges.map((edge) => {
            const from = blended(edge.from);
            const to = blended(edge.to);
            const folded = foldedSourceEdges.has(edge.id);
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            return (
              <g key={`anim-edge-${edge.id}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={folded ? "#0a66c2" : "#64748b"}
                  strokeWidth={folded ? 2.8 : 1.6}
                />
                <text x={mid.x + 5} y={mid.y - 5} style={{ fontSize: 10, fill: folded ? "#0a66c2" : "#64748b" }}>
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
                          setDiagram(parsed);
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
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
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
