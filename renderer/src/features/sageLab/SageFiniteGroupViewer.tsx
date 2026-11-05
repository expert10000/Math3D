import { useMemo, useState } from "react";
import { buildSageFiniteGroupScene, canonicalJsonStringify, sageFiniteGroupSceneToSvg,
  sageGroupSceneAvailability, type Math3DProject, type ProjectAlgebraEvidence,
  type SageFiniteGroupResult, type SageFiniteGroupSceneKind } from "@math3d/core";

type Props = { project: Math3DProject; evidence: ProjectAlgebraEvidence };
const colors = ["#2563eb", "#dc2626", "#059669", "#9333ea"];
const button = { border: "1px solid #aac5e2", borderRadius: 6, background: "#fff", padding: "5px 8px",
  color: "#17365d", cursor: "pointer", fontSize: 11 } as const;
const download = (name: string, body: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Interactive views share the exact checked nodes and edges used by the standalone exports. */
export default function SageFiniteGroupViewer({ project, evidence }: Props) {
  const [kind, setKind] = useState<SageFiniteGroupSceneKind>("cayley");
  const [selectedId, setSelectedId] = useState("g0");
  const result = evidence.result as SageFiniteGroupResult;
  const subgroupReason = sageGroupSceneAvailability(result, "subgroup");
  const sceneState = useMemo(() => {
    try { return { scene: buildSageFiniteGroupScene(project, evidence, kind), error: null }; }
    catch (error) { return { scene: null, error: String((error as Error).message ?? error) }; }
  }, [project, evidence, kind]);
  const scene = sceneState.scene;
  const selected = scene?.nodes.find((node) => node.id === selectedId) ?? scene?.nodes[0];
  const byId = new Map(scene?.nodes.map((node) => [node.id, node]) ?? []);
  const generators = (evidence.request.params.definition as
    { generators?: readonly (string | { name: string })[] } | undefined)?.generators;
  const changeKind = (next: SageFiniteGroupSceneKind) => { setKind(next); setSelectedId(next === "cayley" ? "g0" : "H0"); };
  const exportScene = (format: "json" | "svg") => {
    if (!scene) return;
    const stem = `math3d-${kind}-group-${evidence.request.target.revision}`;
    download(`${stem}.${format}`, format === "json" ? canonicalJsonStringify(scene) : sageFiniteGroupSceneToSvg(scene),
      format === "json" ? "application/json" : "image/svg+xml");
  };
  return <section data-testid="cas-group-viewer" aria-label="Finite group diagrams" style={{ display: "grid", gap: 8,
    border: "1px solid #c7d9ed", borderRadius: 8, padding: 10, marginTop: 10, background: "#f8fbff" }}>
    <strong>Finite group scenes · {result.order} elements · {result.subgroups.length} subgroups</strong>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button type="button" style={button} aria-pressed={kind === "cayley"} onClick={() => changeKind("cayley")}>Cayley graph</button>
      <button type="button" style={button} aria-pressed={kind === "subgroup"} disabled={!!subgroupReason}
        title={subgroupReason ?? undefined} onClick={() => changeKind("subgroup")}>Subgroup graph</button>
      <button type="button" style={button} disabled={!scene} onClick={() => exportScene("svg")}>Export SVG</button>
      <button type="button" style={button} disabled={!scene} onClick={() => exportScene("json")}>Export scene JSON</button>
    </div>
    {subgroupReason && <div role="status" data-testid="cas-group-subgroup-limit" style={{ color: "#9a3412", fontSize: 11 }}>
      {subgroupReason} The exact subgroup result remains available in the Inspector.</div>}
    {sceneState.error && <div role="status" style={{ color: "#9a3412" }}>{sceneState.error}</div>}
    {scene && <>
      <div style={{ fontSize: 11, color: "#526477" }}>{kind === "cayley"
        ? "Arrow g → g·s for each named saved generator. Select an element to inspect its exact image permutation."
        : "An edge joins subgroups only when no saved subgroup lies strictly between them. Blue nodes are normal."}</div>
      {scene.width > 600 && <div style={{ fontSize: 11, color: "#526477" }}>Scroll horizontally to inspect every subgroup.</div>}
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6 }}>
        <svg data-testid={`cas-group-${kind}-scene`} role="group" aria-label={kind === "cayley" ? "Cayley graph" : "Subgroup inclusion graph"}
          width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}
          style={{ display: "block", width: scene.width <= 600 ? "100%" : scene.width,
            height: "auto", maxWidth: scene.width <= 600 ? scene.width : undefined }}>
          <defs>{colors.map((color, index) => <marker key={color} id={`ui-group-arrow-${index}`} markerWidth="7" markerHeight="7"
            refX="16" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill={color} /></marker>)}</defs>
          {scene.edges.map((edge, index) => {
            const from = byId.get(edge.from)!, to = byId.get(edge.to)!;
            const active = selected?.id === edge.from || selected?.id === edge.to;
            const color = edge.generatorIndex === null ? (active ? "#2563eb" : "#a8bfd8")
              : colors[edge.generatorIndex % colors.length];
            if (kind === "subgroup") return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={color} strokeWidth={active ? 2.5 : 1.5} />;
            const generatorIndex = edge.generatorIndex!;
            const bend = (generatorIndex - ((generators?.length ?? 1) - 1) / 2) * 11;
            const mx = (from.x + to.x) / 2 + bend * (to.y - from.y) / 200;
            const my = (from.y + to.y) / 2 - bend * (to.x - from.x) / 200;
            const d = from.id === to.id
              ? `M${from.x - 16},${from.y - 11} C${from.x - 50},${from.y - 48} ${from.x + 50},${from.y - 48} ${from.x + 16},${from.y - 11}`
              : `M${from.x},${from.y} Q${mx.toFixed(1)},${my.toFixed(1)} ${to.x},${to.y}`;
            return <path key={index} d={d} fill="none" stroke={color} strokeWidth={active ? 2.5 : 1.5}
              markerEnd={`url(#ui-group-arrow-${generatorIndex % colors.length})`} />;
          })}
          {scene.nodes.map((node) => <g key={node.id} role="button" tabIndex={0}
            data-testid={`cas-group-node-${node.id}`} aria-label={kind === "cayley"
              ? `Element ${node.label}, permutation ${result.elements[Number(node.id.slice(1))].join(", ")}`
              : `Subgroup ${node.label}, order ${node.order}, ${node.normal ? "normal" : "not normal"}`}
            aria-pressed={selected?.id === node.id} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(node.id); }
            }} style={{ cursor: "pointer" }}>
            <circle cx={node.x} cy={node.y} r={kind === "cayley" ? 17 : 21}
              fill={selected?.id === node.id ? "#dbeafe" : node.normal ? "#eff6ff" : "#fff7ed"}
              stroke={selected?.id === node.id ? "#1d4ed8" : node.normal ? "#6f93b8" : "#c56b24"}
              strokeWidth={selected?.id === node.id ? 2.5 : 1.5} />
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#17365d">{node.label}</text>
          </g>)}
        </svg>
      </div>
      {kind === "cayley" && <div data-testid="cas-group-generator-legend" style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
        {generators?.map((generator, index) => <span key={index} style={{ color: colors[index % colors.length] }}>
          ● {typeof generator === "string" ? generator : generator.name}</span>)}</div>}
      {selected && <dl data-testid="cas-group-selection" className="sage-structure-facts">
        {kind === "cayley" ? <><dt>Element</dt><dd>{selected.label} · index {selected.members[0]}</dd>
          <dt>Exact permutation</dt><dd>[{result.elements[selected.members[0]].join(", ")}]</dd></> :
          <><dt>Subgroup</dt><dd>{selected.label} · order {selected.order}</dd>
            <dt>Members</dt><dd>[{selected.members.join(", ")}]</dd>
            <dt>Normal</dt><dd>{selected.normal ? "Yes" : "No"}</dd></>}
      </dl>}
      <div data-testid="cas-group-provenance" style={{ fontSize: 10, color: "#526477", overflowWrap: "anywhere" }}>
        Pinned group {evidence.request.target.objectId}@{evidence.request.target.revision} · definition {evidence.targetHash} ·
        evidence {evidence.id} · result {evidence.resultHash} · Sage {evidence.runtime.version} / GAP {result.gapVersion} ·
        {scene.layout}
      </div>
    </>}
  </section>;
}
