import { useState } from "react";
import { sageGaloisCovers, type SageGaloisResult, type SageGaloisSubgroup } from "@math3d/core";

type Props = { result: SageGaloisResult };
type Position = { x: number; y: number };
const WIDTH = 400;
const gap = 72;

/** Two linked Hasse diagrams: subgroup containment and the reversed fixed-field inclusion. */
export default function SageGaloisViewer({ result }: Props) {
  const [selectedId, setSelectedId] = useState(result.subgroups[0]?.id ?? "");
  const selected = result.subgroups.find((item) => item.id === selectedId) ?? result.subgroups[0];
  const covers = sageGaloisCovers(result);
  const positions = (field: boolean): Map<string, Position> => {
    const levels = [...new Set(result.subgroups.map((item) => item.order))].sort((a, b) => field ? a - b : b - a);
    const map = new Map<string, Position>();
    levels.forEach((order, level) => {
      const peers = result.subgroups.filter((item) => item.order === order);
      peers.forEach((item, index) => map.set(item.id, {
        x: 28 + ((index + 1) * (WIDTH - 56)) / (peers.length + 1), y: 32 + level * gap,
      }));
    });
    return map;
  };
  const height = 64 + ([...new Set(result.subgroups.map((item) => item.order))].length - 1) * gap;
  const renderLattice = (field: boolean) => {
    const map = positions(field);
    return <svg role="group" aria-label={field ? "Intermediate field inclusion lattice" : "Subgroup inclusion lattice"}
      width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} style={{ maxWidth: "100%" }}>
      {covers.map((cover) => {
        const from = map.get(cover.lower)!, to = map.get(cover.upper)!;
        return <line key={`${cover.lower}-${cover.upper}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={cover.lower === selected.id || cover.upper === selected.id ? "#2456a6" : "#a8bfd8"}
          strokeWidth={cover.lower === selected.id || cover.upper === selected.id ? 2.5 : 1.5} />;
      })}
      {result.subgroups.map((item) => {
        const point = map.get(item.id)!;
        return <g key={item.id} role="button" tabIndex={0}
          data-testid={`${field ? "galois-field" : "galois-subgroup"}-${item.id}`}
          aria-label={`${field ? "Fixed field" : "Subgroup"} ${item.id}, ${field ? `degree ${item.fixedField.degree}` : `order ${item.order}`}`}
          aria-pressed={selected.id === item.id}
          onClick={() => setSelectedId(item.id)} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); }
          }} style={{ cursor: "pointer" }}>
          <circle cx={point.x} cy={point.y} r={21} fill={selected.id === item.id ? "#dbeafe" : "#fff"}
            stroke={selected.id === item.id ? "#1d4ed8" : "#6f93b8"} strokeWidth={selected.id === item.id ? 2.5 : 1.5} />
          <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#17365d">
            {field ? `E${item.id.slice(1)}` : item.id}</text>
        </g>;
      })}
    </svg>;
  };
  return <section data-testid="cas-galois-viewer" aria-label="Galois correspondence" style={{ display: "grid", gap: 8,
    border: "1px solid #c7d9ed", borderRadius: 8, padding: 10, marginTop: 10, background: "#f8fbff" }}>
    <strong>Galois correspondence · complete {result.subgroups.length} subgroups</strong>
    <div style={{ fontSize: 11, color: "#526477" }}>Select a subgroup or field. Each matched pair highlights together; inclusion reverses between the diagrams.</div>
    <div style={{ overflowX: "auto" }}><div style={{ display: "grid", gridTemplateColumns: "400px 400px", gap: 12, width: 812 }}>
      <div><strong>Subgroups of Gal(L/QQ)</strong>{renderLattice(false)}</div>
      <div><strong>Intermediate fields in L/QQ</strong>{renderLattice(true)}</div>
    </div></div>
    {selected && <dl data-testid="cas-galois-selection" className="sage-structure-facts">
      <dt>Subgroup</dt><dd>{selected.id} · order {selected.order} · members [{selected.members.join(", ")}]</dd>
      <dt>Fixed field</dt><dd>E{selected.id.slice(1)} = L^{selected.id} · [E{selected.id.slice(1)}:QQ] = {selected.fixedField.degree}</dd>
      <dt>Degree law</dt><dd>{selected.order} × {selected.fixedField.degree} = {result.group.order}</dd>
      <dt>Normal / Galois over QQ</dt><dd>{selected.normal ? "Yes" : "No"}</dd>
      <dt>Field polynomial</dt><dd>{selected.fixedField.polynomial ?? "QQ"}</dd>
      {selected.fixedField.generatorImage && <><dt>Generator image in L</dt><dd>{selected.fixedField.generatorImage}</dd></>}
      <dt>Embedding relation</dt><dd>{selected.fixedField.relationVerified ? "Verified by Sage" : "Unverified"}</dd>
    </dl>}
  </section>;
}
