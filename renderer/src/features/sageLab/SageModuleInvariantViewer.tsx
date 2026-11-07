import type { SageModuleInvariantResult } from "@math3d/core";

/** The summands are read from verified, revision-pinned Smith evidence. */
export default function SageModuleInvariantViewer({ result }: { result: SageModuleInvariantResult }) {
  const summands = [...Array.from({ length: result.freeRank }, (_, index) => ({
    label: "ZZ", detail: `Free generator ${index + 1}`, kind: "free" })),
  ...result.torsionOrders.map((order, index) => ({ label: `ZZ/${order}ZZ`,
    detail: `Torsion invariant factor ${index + 1}`, kind: "torsion" }))];
  return <section data-testid="cas-module-invariant-viewer" aria-label="ZZ module invariant factors"
    style={{ display: "grid", gap: 8, marginTop: 12 }}>
    <strong>Module decomposition over ZZ</strong>
    <div role="list" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {summands.length ? summands.map((item, index) => <div role="listitem" key={`${item.kind}-${index}`}
        style={{ border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px",
          background: item.kind === "free" ? "#eff6ff" : "#f5f3ff" }}>
        <strong>{item.label}</strong><div style={{ fontSize: 11, color: "#475569" }}>{item.detail}</div>
      </div>) : <div role="listitem">0 · the zero module</div>}
    </div>
    <div style={{ fontSize: 11, color: "#475569" }}>
      {result.smith ? `Verified Smith diagonal: ${result.smith.diagonal.join(", ")}. ` : "No relations. "}
      Free rank {result.freeRank}; {result.torsionOrders.length} nontrivial torsion factor{result.torsionOrders.length === 1 ? "" : "s"}.
    </div>
  </section>;
}
