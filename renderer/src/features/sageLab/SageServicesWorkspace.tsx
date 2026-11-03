import { useEffect, useState, type ReactNode } from "react";
import { ScientificServicesPanel } from "../scientificServices/ScientificServicesPanel";
import type { ScientificServiceContext } from "../scientificServices/operationCatalog";
import SageRuntimeInspector from "../computeCenter/SageRuntimeInspector";
import { SageSymbolicAnalysisCard } from "./SageSymbolicAnalysisCard";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";
import "./sageStructures.css";

export type SageStructuresSlot = {
  projectId: string | null;
  projectTitle: string | null;
  selectionKey: string | null;
  explorer: ReactNode;
  dossier: ReactNode;
  inspector: ReactNode;
  operations?: ReactNode;
};

export type SageServicesWorkspaceProps = {
  record: SymbolicResultRecord | null;
  onResult: (record: SymbolicResultRecord) => void;
  onSaveWorkbook: (record: SymbolicResultRecord) => void;
  onOpenWorkbook: () => void;
  onOpenComputeRuntimes: () => void;
  onClose: () => void;
  structures?: SageStructuresSlot;
};

type Props = SageServicesWorkspaceProps & {
  context: Extract<ScientificServiceContext, "cas" | "number_theory">;
  title: string;
  description: string;
  testId: string;
  onOpenConsole?: () => void;
};

const button = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70", padding: "6px 10px", cursor: "pointer", fontSize: 12 } as const;

/** Shared workspace surface over the Sage catalog, result cards, and runtime registry. */
export default function SageServicesWorkspace({ context, title, description, testId, record, onResult,
  onSaveWorkbook, onOpenWorkbook, onOpenConsole, onOpenComputeRuntimes, onClose, structures }: Props) {
  const [leftTab, setLeftTab] = useState<"structures" | "operations">(structures?.projectId ? "structures" : "operations");
  const [rightTab, setRightTab] = useState<"results" | "structure" | "runtimes">(structures?.projectId ? "structure" : "results");
  useEffect(() => {
    if (!structures) return;
    setLeftTab(structures.projectId ? "structures" : "operations");
    setRightTab(structures.projectId ? "structure" : "results");
  }, [structures?.projectId]);
  useEffect(() => { if (structures?.selectionKey) setRightTab("structure"); }, [structures?.selectionKey]);
  return <main data-testid={testId} aria-label={`${title} workspace`}
    style={{ position: "fixed", inset: 0, zIndex: 2100, background: "#f3f7fc", color: "#172b4d", display: "flex", flexDirection: "column", overflow: "auto" }}>
    <header style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #cbd5e1", background: "#fff" }}>
      <div>
        <div style={{ fontSize: 11, color: "#64748b" }}>MATH3D / Scientific workspaces</div>
        <h1 style={{ fontSize: 22, margin: "3px 0" }}>{title}</h1>
        <div style={{ fontSize: 12, color: "#526477" }}>{description}</div>
        {structures?.projectTitle && <div style={{ fontSize: 12, color: "#183b70", marginTop: 4 }}>Project: {structures.projectTitle}</div>}
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {onOpenConsole && <button type="button" style={button} onClick={onOpenConsole}>Open trusted Sage Console</button>}
        <button type="button" style={button} onClick={onOpenWorkbook}>Open Workbook</button>
        <button type="button" style={button} onClick={onClose}>Back to workspace</button>
      </div>
    </header>
    <div style={{ padding: "12px 20px", fontSize: 12, color: "#526477" }}>
      Services use bounded operations. Sage code runs only after explicit trust in the local Console or a Workbook code cell.
    </div>
    <div className={`sage-workspace-grid${structures ? " sage-workspace-grid-structures" : ""}`}>
      <section aria-label={`${title} ${structures ? "Tools" : "Services"}`} className="sage-workspace-card">
        {structures ? <nav aria-label="CAS / Algebra sections" className="sage-workspace-tabs">
          <button type="button" style={button} aria-pressed={leftTab === "structures"} onClick={() => setLeftTab("structures")}>Structures</button>
          <button type="button" style={button} aria-pressed={leftTab === "operations"} onClick={() => setLeftTab("operations")}>Operations</button>
          <button type="button" style={button} disabled title="Recipes are planned after the object builder" aria-label="Recipes (planned)" >Recipes</button>
        </nav> : <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Services</h2>}
        {leftTab === "structures" && structures ? structures.explorer : <>
          {structures?.operations}
          <ScientificServicesPanel context={context} onResult={(result) => { onResult(result); setRightTab("results"); }} onOpenRuntimes={onOpenComputeRuntimes} />
        </>}
      </section>
      {structures && <section aria-label="CAS / Algebra structure dossier" className="sage-workspace-card" data-testid="cas-structure-dossier">
        {structures.dossier}
      </section>}
      <section aria-label={`${title} Inspector`} className="sage-workspace-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Inspector</h2>
          <nav aria-label={`${title} Inspector sections`} style={{ display: "flex", gap: 6 }}>
            <button type="button" style={button} aria-pressed={rightTab === "results"} onClick={() => setRightTab("results")}>Results</button>
            {structures && <button type="button" style={button} aria-pressed={rightTab === "structure"} onClick={() => setRightTab("structure")}>Structure</button>}
            <button type="button" style={button} aria-pressed={rightTab === "runtimes"} onClick={() => setRightTab("runtimes")}>Runtimes</button>
          </nav>
        </div>
        {rightTab === "results" ? record
          ? <SageSymbolicAnalysisCard record={record} sourceStatus="unlinked" onSaveWorkbook={() => onSaveWorkbook(record)} />
          : <div role="status" data-testid={`${context}-empty-result`} style={{ color: "#64748b", fontSize: 12 }}>Run a Sage operation to inspect its exact result, warnings, and diagnostics.</div>
          : rightTab === "structure" ? structures?.inspector
          : <div data-testid={`${context}-runtime-view`} style={{ display: "grid", gap: 10 }}>
              <SageRuntimeInspector />
              <button type="button" style={{ ...button, justifySelf: "start" }} onClick={onOpenComputeRuntimes}>Open Compute → Runtimes</button>
            </div>}
      </section>
    </div>
  </main>;
}
