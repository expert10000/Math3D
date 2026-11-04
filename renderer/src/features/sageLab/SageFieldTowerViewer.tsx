import { buildProjectFieldTower, type AlgebraObjectRef, type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject; selected: AlgebraObjectRef | null; onSelect: (ref: AlgebraObjectRef) => void };
const key = (ref: AlgebraObjectRef) => `${ref.objectId}@${ref.revision}`;

/** Pinned, accessible field-inclusion diagram; every edge comes from a validated constructor. */
export default function SageFieldTowerViewer({ project, selected, onSelect }: Props) {
  const tower = buildProjectFieldTower(project);
  if (!tower.edges.length) return null;
  const selectedKey = selected ? key(selected) : null;
  const levels = [2, 1, 0] as const;
  return <section data-testid="cas-field-tower" aria-label="Field tower diagram"
    style={{ border: "1px solid #c6d8ec", borderRadius: 9, padding: 10, background: "#f8fbff", display: "grid", gap: 8 }}>
    <div><strong>Field tower</strong><div style={{ color: "#526477", fontSize: 11 }}>
      Exact pinned inclusions · select a field to inspect its definition</div></div>
    <div role="group" aria-label="Field extension levels" style={{ display: "grid", gap: 2 }}>
      {levels.map((depth) => {
        const nodes = tower.nodes.filter((node) => node.depth === depth);
        if (!nodes.length) return null;
        return <div key={depth} style={{ display: "grid", justifyItems: "center", gap: 5 }}>
          <div style={{ fontSize: 10, color: "#526477" }}>Absolute degree {depth === 2 ? 4 : depth === 1 ? 2 : 1}</div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7 }}>
            {nodes.map((node) => <button key={key(node.ref)} type="button"
              data-testid={`field-tower-node-${node.ref.objectId}-${node.ref.revision}`} aria-current={key(node.ref) === selectedKey}
              onClick={() => onSelect(node.ref)}
              style={{ border: key(node.ref) === selectedKey
                ? "2px solid #2563eb" : "1px solid #a8c3dd", borderRadius: 7, background: "#fff",
                color: "#183b70", padding: "6px 10px", minWidth: 88, cursor: "pointer" }}>
              <strong>{node.label}</strong> <span>@{node.ref.revision}</span>
              <div style={{ fontSize: 10 }}>[{node.label}:QQ] = {node.absoluteDegree} · {node.status}</div>
            </button>)}
          </div>
          {depth > 0 && <div aria-hidden="true" style={{ fontSize: 20, color: "#4878a8", lineHeight: 1 }}>↓</div>}
        </div>;
      })}
    </div>
    <div style={{ display: "grid", gap: 5 }}>
      {tower.edges.map((edge) => {
        const base = tower.nodes.find((item) => key(item.ref) === key(edge.base))!;
        const extension = tower.nodes.find((item) => key(item.ref) === key(edge.extension))!;
        return <div key={key(edge.extension)} data-testid="field-tower-edge"
          style={{ borderTop: "1px solid #dbe2ea", paddingTop: 5, fontSize: 11 }}>
          <strong>{base.label}@{base.ref.revision} ↪ {extension.label}@{extension.ref.revision}</strong>
          <div>Inclusion: {edge.embedding} · [{extension.label}:{base.label}] = {edge.relativeDegree}</div>
          <div>Coordinates: [{edge.basisCoordinates.join(", ")}] · {edge.degreeProduct}</div>
          {edge.composedInclusion && <div>Composed inclusion: {
            tower.nodes.find((item) => key(item.ref) === key(edge.composedInclusion!.source))?.label
          }@{edge.composedInclusion.source.revision} ↪ {base.label}@{base.ref.revision} ↪ {
            extension.label}@{extension.ref.revision}; {edge.composedInclusion.embedding}</div>}
          <div>{edge.verifiedBy}: {edge.relationChecks.join("; ")}</div>
        </div>;
      })}
    </div>
  </section>;
}
