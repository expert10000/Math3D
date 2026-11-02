import React, { useEffect, useMemo, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import type { SavedMeshResultTrend } from "../projects/projectSavedMeshResultTrend";
import { compareSavedMeshTrendPoints, resolveSavedMeshTrendPoint,
  type SavedMeshTrendComparison, type SavedMeshTrendTarget } from "../projects/projectSavedMeshTrendPoint";

export function MeshTrendPinControls({ project, study, selectedResultId, readResource, onCompare, prefix }: {
  project: Math3DProject; study: SavedMeshResultTrend; selectedResultId: string | null;
  readResource: ProjectResourceReader; onCompare: (selection: SavedMeshTrendComparison) => void;
  prefix: "project-mesh-trend" | "workbook-mesh-trend";
}) {
  const [a, setA] = useState<SavedMeshTrendTarget | null>(null);
  const [b, setB] = useState<SavedMeshTrendTarget | null>(null);
  const [message, setMessage] = useState("");
  const studyKey = useMemo(() => JSON.stringify([study.projectId, study.sourceDocumentId, study.operation,
    study.algorithm, study.algorithmVersion, study.metricPath, study.rows.map(row => [row.resultId, row.resultHash, row.sourceHash])]), [study]);
  useEffect(() => { setA(null); setB(null); setMessage(""); }, [studyKey]);
  const pin = (slot: "A" | "B") => {
    try {
      if (!selectedResultId) throw new TypeError("Select a recorded trend point.");
      const target = resolveSavedMeshTrendPoint(project, study, selectedResultId, readResource);
      if (slot === "A") setA(target); else setB(target);
      setMessage(`${slot} pinned to exact saved result ${target.resultId}.`);
    } catch (error) { setMessage(`Pin refused: ${(error as Error).message}`); }
  };
  const compare = () => {
    try {
      if (!a || !b) throw new TypeError("Pin two saved trend points first.");
      const selection = { study, a, b };
      compareSavedMeshTrendPoints(project, selection, readResource);
      onCompare(selection);
      setMessage("");
    } catch (error) { setMessage(`Comparison refused: ${(error as Error).message}`); }
  };
  return <div data-testid={`${prefix}-pins`} style={{ display: "grid", gap: 8, border: "1px solid #94a3b8", borderRadius: 8, padding: 10 }}>
    <strong>Compare two recorded points</strong>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" data-testid={`${prefix}-pin-a`} disabled={!selectedResultId} onClick={() => pin("A")}>Pin selected as A</button>
      <button type="button" data-testid={`${prefix}-pin-b`} disabled={!selectedResultId} onClick={() => pin("B")}>Pin selected as B</button>
      <button type="button" data-testid={`${prefix}-compare`} disabled={!a || !b || a.resultId === b.resultId} onClick={compare}>Compare pinned results</button>
    </div>
    <div data-testid={`${prefix}-pin-status`} style={{ overflowWrap: "anywhere" }}>
      <span>A: {a ? `r${a.revision} · ${a.resultId} · ${a.resultHash}` : "not pinned"}</span><br />
      <span>B: {b ? `r${b.revision} · ${b.resultId} · ${b.resultHash}` : "not pinned"}</span>
    </div>
    {message && <small role={message.includes("refused") ? "alert" : "status"}>{message}</small>}
  </div>;
}
