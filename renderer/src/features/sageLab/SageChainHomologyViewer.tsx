import type { SageChainHomologyResult } from "@math3d/core";

export default function SageChainHomologyViewer({ result }: { result: SageChainHomologyResult }) {
  const notation = (freeRank: number, torsion: readonly string[]) => {
    const factors = [...Array.from({ length: freeRank }, () => "ZZ"),
      ...torsion.map((order) => `ZZ/${order}ZZ`)];
    return factors.length ? factors.join(" ⊕ ") : "0";
  };
  return <section data-testid="cas-chain-homology-viewer" aria-label="Exact ZZ chain homology"
    style={{ display: "grid", gap: 9, marginTop: 12 }}>
    <strong>Pinned chain complex</strong>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span>ZZ^{result.dimensions[2]} (C₂)</span><span>→ d₂ →</span>
      <span>ZZ^{result.dimensions[1]} (C₁)</span><span>→ d₁ →</span>
      <span>ZZ^{result.dimensions[0]} (C₀)</span>
    </div>
    <div role="list" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {result.groups.map((group) => <div role="listitem" key={group.degree}
        style={{ border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px", background: "#f8fafc" }}>
        <strong>H{group.degree} = {notation(group.freeRank, group.torsionOrders)}</strong>
        <div style={{ fontSize: 11, color: "#475569" }}>Free rank {group.freeRank}; torsion {group.torsionOrders.length
          ? group.torsionOrders.join(", ") : "none"}</div>
      </div>)}
    </div>
    <small>d₁d₂ = 0; Smith transformations and the kernel-basis inverse are checked exactly.</small>
  </section>;
}
