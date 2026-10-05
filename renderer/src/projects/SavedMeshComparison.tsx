import React, { useMemo, useRef, useState } from "react";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";
import { SavedMeshStudyView, type SavedMeshStudyViewHandle } from "./SavedMeshStudyView";
import { savedMeshCurvatureReport, CURVATURE_MAP_COLOURS, type CurvatureMapField } from "./savedMeshExploration";
import { compareSavedMeshStudies, savedStudyComparisonReport, savedStudyComparisonCsv, studyInteriorStatistics } from "./savedStudyComparison";
import { downloadStudyBlob, studyComparisonImage } from "./studyComparisonExport";

const number = (value: number | null) => value === null ? "unavailable" : value.toPrecision(6);
export const SavedMeshComparison = ({ choices, initialLeft, readMesh }: { choices: readonly SavedMeshChoice[]; initialLeft: string; readMesh: (id: string) => SurfaceMeshData }) => {
  const [open, setOpen] = useState(false), [leftId, setLeftId] = useState(initialLeft), [rightId, setRightId] = useState(choices.find(choice => choice.id !== initialLeft)?.id ?? ""), [field, setField] = useState<CurvatureMapField>("K");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const leftView = useRef<SavedMeshStudyViewHandle>(null), rightView = useRef<SavedMeshStudyViewHandle>(null);
  const leftChoice = choices.find(choice => choice.id === leftId), rightChoice = choices.find(choice => choice.id === rightId);
  const snapshots = useMemo(() => {
    try {
      if (!open || !leftChoice || !rightChoice) return { left: null, right: null, error: "" };
      const snapshot = (choice: SavedMeshChoice) => { const mesh = readMesh(choice.id); return { choice, mesh, report: savedMeshCurvatureReport(mesh) }; };
      return { left: snapshot(leftChoice), right: snapshot(rightChoice), error: "" };
    } catch (failure) { return { left: null, right: null, error: (failure as Error).message }; }
  }, [open, leftChoice?.id, leftChoice?.revision, leftChoice?.structuralHash, rightChoice?.id, rightChoice?.revision, rightChoice?.structuralHash, readMesh, choices]);
  const result = useMemo(() => {
    try { return { comparison: snapshots.left && snapshots.right ? compareSavedMeshStudies(snapshots.left, snapshots.right, field) : null, error: snapshots.error }; }
    catch (failure) { return { comparison: null, error: (failure as Error).message }; }
  }, [snapshots, field]);
  const comparison = result.comparison;
  const exportStudy = async (kind: "png" | "json" | "csv") => {
    try {
      if (!comparison) throw new TypeError("Choose a compatible pair of saved Meshes first.");
      setBusy(true); setError("");
      const blob = kind === "png" ? await studyComparisonImage(comparison, [leftView.current!.captureImage(), rightView.current!.captureImage()]) :
        new Blob([kind === "json" ? JSON.stringify(savedStudyComparisonReport(comparison), null, 2) : savedStudyComparisonCsv(comparison)], { type: kind === "json" ? "application/json" : "text/csv;charset=utf-8" });
      downloadStudyBlob(blob, `math3d-study-comparison-${field}.${kind}`); setMessage(`Comparison ${kind.toUpperCase()} download started.`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  return <details className="saved-mesh-visual-study" data-testid="project-study-comparison" open={open} onToggle={event => setOpen(event.currentTarget.open)} style={{ maxWidth: 1400, margin: "12px 0" }}>
    <summary>Compare saved studies</summary>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["A", "B"] as const).map((side, i) => <label key={side} style={{ maxWidth: "100%" }}>Study {side} <select style={{ maxWidth: "100%" }} data-testid={`project-comparison-${i ? "right" : "left"}`} value={i ? rightId : leftId} onChange={event => { (i ? setRightId : setLeftId)(event.target.value); setError(""); setMessage(""); }}>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.title}{choice.current ? "" : " · historical"}</option>)}</select></label>)}
      <label>Field <select data-testid="project-comparison-field" value={field} onChange={event => { setField(event.target.value as CurvatureMapField); setMessage(""); }}><option value="K">Gaussian K</option><option value="H">Mean H</option></select></label>
    </div>
    {comparison && <>
      <div data-testid="project-comparison-scale" data-limit={comparison.limit} data-field={field}>
        <div style={{ height: 12, maxWidth: 500, background: `linear-gradient(to right, ${CURVATURE_MAP_COLOURS.negative}, ${CURVATURE_MAP_COLOURS.zero}, ${CURVATURE_MAP_COLOURS.positive})` }} />
        Shared scale: {number(-comparison.limit)} · 0 · {number(comparison.limit)} · length units: {comparison.units}
      </div>
      <small>Grey excludes boundary/invalid estimates. K: inverse length squared. H: inverse length; input winding for open Meshes, outward orientation for closed Meshes. Compare sampling distributions; averages are not pointwise error or proof of convergence/minimality.</small>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, margin: "8px 0" }}>
        {[comparison.left, comparison.right].map((snapshot, i) => {
          const stats = studyInteriorStatistics(snapshot);
          return <article key={i} data-testid={`project-comparison-view-${i ? "right" : "left"}`} data-source-id={snapshot.choice.id} data-scale-limit={comparison.limit} style={{ minWidth: 0 }}>
            <strong>{i ? "B" : "A"} · {snapshot.choice.title}</strong>
            <div>Mesh r{snapshot.choice.revision}{snapshot.choice.sourceRevision !== undefined ? ` · Surface r${snapshot.choice.sourceRevision}` : ""} · {snapshot.choice.current ? "current" : "historical"} · {snapshot.choice.samplingSize ? `${snapshot.choice.samplingSize} samples/axis` : "source-defined/legacy sampling"}</div>
            <div>{stats.count} interior vertices · {stats.excluded} excluded</div>
            <div>Average K: {number(stats.averageK)} · average H: {number(stats.averageH)}</div>
            <div>Mean |H|: {number(stats.averageAbsH)} · max |H|: {number(stats.maxAbsH)}</div>
            <SavedMeshStudyView ref={i ? rightView : leftView} mesh={snapshot.mesh} colors={snapshot.map.colors} />
          </article>;
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-testid="project-comparison-export-png" disabled={busy} onClick={() => void exportStudy("png")}>Export comparison PNG</button>
        <button data-testid="project-comparison-export-json" disabled={busy} onClick={() => void exportStudy("json")}>Export measurements JSON</button>
        <button data-testid="project-comparison-export-csv" disabled={busy} onClick={() => void exportStudy("csv")}>Export vertex CSV</button>
      </div>
      <small>Exports record both Mesh generations and the shared scale. JSON also retains source lineage, sampling, conventions, warnings and saved results. Projects → Save project preserves the Meshes/results; comparison selection is temporary.</small>
    </>}
    {(result.error || error) && <div role="alert">{error || result.error}</div>}
    {message && <div role="status" data-testid="project-comparison-message">{message}</div>}
  </details>;
};
