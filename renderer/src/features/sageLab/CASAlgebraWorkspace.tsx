import { useState } from "react";
import { ScientificServicesPanel } from "../scientificServices/ScientificServicesPanel";
import SageRuntimeInspector from "../computeCenter/SageRuntimeInspector";
import { SageSymbolicAnalysisCard } from "./SageSymbolicAnalysisCard";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";

type Props = {
  record: SymbolicResultRecord | null;
  onResult: (record: SymbolicResultRecord) => void;
  onSaveWorkbook: (record: SymbolicResultRecord) => void;
  onOpenWorkbook: () => void;
  onOpenConsole: () => void;
  onOpenComputeRuntimes: () => void;
  onClose: () => void;
};

const button = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70", padding: "6px 10px", cursor: "pointer" } as const;

/** A workspace surface over the existing Sage catalog, result cards, and runtime registry. */
export default function CASAlgebraWorkspace({ record, onResult, onSaveWorkbook, onOpenWorkbook,
  onOpenConsole, onOpenComputeRuntimes, onClose }: Props) {
  const [rightTab, setRightTab] = useState<"inspector" | "runtimes">("inspector");
  return <main data-testid="cas-algebra-workspace" aria-label="CAS / Algebra workspace"
    style={{ position: "fixed", inset: 0, zIndex: 2100, background: "#f3f7fc", color: "#172b4d", display: "flex", flexDirection: "column", overflow: "auto" }}>
    <header style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #cbd5e1", background: "#fff" }}>
      <div>
        <div style={{ fontSize: 11, color: "#64748b" }}>MATH3D / Scientific workspaces</div>
        <h1 style={{ fontSize: 22, margin: "3px 0" }}>CAS / Algebra</h1>
        <div style={{ fontSize: 12, color: "#526477" }}>Exact symbolic, polynomial, matrix, algebraic geometry, and number theory operations.</div>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button type="button" style={button} onClick={onOpenConsole}>Open trusted Sage Console</button>
        <button type="button" style={button} onClick={onOpenWorkbook}>Open Workbook</button>
        <button type="button" style={button} onClick={onClose}>Back to workspace</button>
      </div>
    </header>
    <div style={{ padding: "12px 20px", fontSize: 12, color: "#526477" }}>
      Services use bounded operations. Sage code runs only after explicit trust in the local Console or a Workbook code cell.
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14, padding: "0 20px 20px", alignItems: "start" }}>
      <section aria-label="CAS Services" style={{ minWidth: 0, padding: 14, border: "1px solid #dbe2ea", borderRadius: 10, background: "#fff" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Services</h2>
        <ScientificServicesPanel context="cas" onResult={(result) => { onResult(result); setRightTab("inspector"); }} onOpenRuntimes={onOpenComputeRuntimes} />
      </section>
      <section aria-label="CAS Inspector" style={{ minWidth: 0, padding: 14, border: "1px solid #dbe2ea", borderRadius: 10, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Inspector</h2>
          <nav aria-label="CAS Inspector sections" style={{ display: "flex", gap: 6 }}>
            <button type="button" style={button} aria-pressed={rightTab === "inspector"} onClick={() => setRightTab("inspector")}>Results</button>
            <button type="button" style={button} aria-pressed={rightTab === "runtimes"} onClick={() => setRightTab("runtimes")}>Runtimes</button>
          </nav>
        </div>
        {rightTab === "inspector" ? record
          ? <SageSymbolicAnalysisCard record={record} sourceStatus="unlinked" onSaveWorkbook={() => onSaveWorkbook(record)} />
          : <div role="status" data-testid="cas-empty-result" style={{ color: "#64748b", fontSize: 12 }}>Run a Sage operation to inspect its exact result, warnings, and diagnostics.</div>
          : <div data-testid="cas-runtime-view" style={{ display: "grid", gap: 10 }}>
              <SageRuntimeInspector />
              <button type="button" style={{ ...button, justifySelf: "start" }} onClick={onOpenComputeRuntimes}>Open Compute → Runtimes</button>
            </div>}
      </section>
    </div>
  </main>;
}
