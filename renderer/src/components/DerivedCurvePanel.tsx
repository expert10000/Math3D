import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DerivedCurveWorkspace,
  previewDerivedCurve,
  type AnyCurve,
  type DerivedCurve,
  type DerivedCurveOperation,
  type DerivedCurvePreview,
  type DerivedCurveRecord,
} from "@math3d/core";

const OPERATIONS: ReadonlyArray<{ value: DerivedCurveOperation; label: string }> = [
  { value: "offset", label: "Offset / parallel" }, { value: "evolute", label: "Evolute" },
  { value: "involute", label: "Involute" }, { value: "normal", label: "Planar normal" },
  { value: "tangent-indicatrix", label: "Tangent indicatrix" }, { value: "curvature-indicatrix", label: "Curvature indicatrix" },
  { value: "projection-plane", label: "Project to plane" }, { value: "projection-surface", label: "Project to Surface" },
  { value: "transform", label: "Transform" }, { value: "trim", label: "Trim" },
  { value: "reverse", label: "Reverse" }, { value: "split", label: "Split" },
  { value: "reparameterize", label: "Reparameterize" },
];

export type DerivedCurvePanelProps = {
  sourceCurve: AnyCurve | null; sourceId: string; sourceRevision: number;
  onPreviewCurve?: (curve: DerivedCurve | null) => void; onOpenSource?: () => void;
};

export const DerivedCurvePanel: React.FC<DerivedCurvePanelProps> = ({ sourceCurve, sourceId, sourceRevision, onPreviewCurve, onOpenSource }) => {
  const workspaceRef = useRef(new DerivedCurveWorkspace());
  const [operation, setOperation] = useState<DerivedCurveOperation>("offset");
  const [distance, setDistance] = useState(0.25);
  const [parameter, setParameter] = useState(0.5);
  const [tolerance, setTolerance] = useState(1e-5);
  const [preview, setPreview] = useState<DerivedCurvePreview | null>(null);
  const [records, setRecords] = useState<DerivedCurveRecord[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(0);

  useEffect(() => {
    if (!sourceCurve) return;
    workspaceRef.current.registerSource({ curve: sourceCurve, curveId: sourceId, revision: sourceRevision });
    setRecords(workspaceRef.current.list());
  }, [sourceCurve, sourceId, sourceRevision]);

  const normalizedParameter = useMemo(() => sourceCurve
    ? sourceCurve.domain.tMin + Math.min(1, Math.max(0, parameter)) * (sourceCurve.domain.tMax - sourceCurve.domain.tMin)
    : parameter, [parameter, sourceCurve]);

  const buildPreview = () => {
    if (!sourceCurve) return;
    const next = previewDerivedCurve({
      id: `derived-${operation}-${sourceId}`, name: `${operation} of ${sourceCurve.name}`, operation,
      sources: [{ curve: sourceCurve, curveId: sourceId, revision: sourceRevision }],
      parameters: {
        distance, tolerance, parameter: normalizedParameter, interval: [sourceCurve.domain.tMin, normalizedParameter],
        targetDomain: [0, 1], surfaceId: "active-surface",
        plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      },
    });
    setPreview(next); setSelectedBranch(0); onPreviewCurve?.(next.branches[0] ?? null);
  };

  const commit = () => {
    if (!preview || preview.status === "error" || preview.status === "capability-required") return;
    workspaceRef.current.commit(preview); setRecords(workspaceRef.current.list());
  };
  const mutateRecord = (id: string, action: "freeze" | "detach" | "regenerate" | "delete") => {
    const workspace = workspaceRef.current;
    if (action === "delete") workspace.delete(id); else if (action === "freeze") workspace.freeze(id);
    else if (action === "detach") workspace.detach(id); else workspace.regenerate(id);
    setRecords(workspace.list());
  };

  return <div data-testid="curve-derived-workflow" style={{ display: "grid", gap: 8, fontSize: 11 }}>
    <label>Operation<select data-testid="curve-derived-operation" value={operation} onChange={(event) => { setOperation(event.target.value as DerivedCurveOperation); setPreview(null); onPreviewCurve?.(null); }} style={{ width: "100%", marginTop: 4 }}>{OPERATIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
    <div data-testid="curve-derived-source" style={{ border: "1px solid #d6deea", borderRadius: 7, padding: 7, background: "#fff" }}>Source: <strong>{sourceId}</strong> · revision {sourceRevision} · {sourceCurve?.dimension ?? "-"}D</div>
    {(operation === "offset" || operation === "involute") && <label>Distance / start offset<input data-testid="curve-derived-distance" type="number" value={distance} step={0.05} onChange={(event) => setDistance(Number(event.target.value))} style={{ width: "100%", marginTop: 4 }} /></label>}
    {(operation === "split" || operation === "trim") && <label>Normalized parameter<input data-testid="curve-derived-parameter" type="range" min={0.01} max={0.99} step={0.01} value={parameter} onChange={(event) => setParameter(Number(event.target.value))} style={{ width: "100%" }} /></label>}
    <label>Tolerance<input data-testid="curve-derived-tolerance" type="number" min={1e-9} step={1e-5} value={tolerance} onChange={(event) => setTolerance(Math.max(1e-9, Number(event.target.value)))} style={{ width: "100%", marginTop: 4 }} /></label>
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}><button data-testid="curve-derived-preview" type="button" onClick={buildPreview} disabled={!sourceCurve}>Preview</button><button data-testid="curve-derived-commit" type="button" onClick={commit} disabled={!preview || preview.status === "error" || preview.status === "capability-required"}>Commit curve</button></div>
    {preview && <div data-testid="curve-derived-preview-result" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 7, padding: 7, display: "grid", gap: 4 }}>
      <strong>{preview.status} · {preview.branches.length} branch{preview.branches.length === 1 ? "" : "es"}</strong>
      {preview.branches.length > 1 && <div style={{ display: "flex", gap: 4 }}>{preview.branches.map((branch, index) => <button key={branch.id} type="button" aria-pressed={selectedBranch === index} onClick={() => { setSelectedBranch(index); onPreviewCurve?.(branch); }}>Branch {index + 1}</button>)}</div>}
      {preview.warnings.map((warning, index) => <div key={`${warning.code}-${index}`} style={{ color: "#92400e" }}>{warning.code}: {warning.message}</div>)}
      {preview.branches[selectedBranch] && <div>Correspondence: {preview.branches[selectedBranch].derived.correspondenceId}</div>}
    </div>}
    <div data-testid="curve-derived-records" style={{ display: "grid", gap: 5 }}><strong>Committed dependencies ({records.length})</strong>{records.map((record) => <div key={record.id} style={{ border: "1px solid #d6deea", borderRadius: 7, padding: 7, background: "#fff", display: "grid", gap: 4 }}>
      <div><strong>{record.request.operation}</strong> · revision {record.revision} · {record.state}</div><div>{record.result.branches.length} branches · source {record.request.sources.map((entry) => `${entry.curveId}@${entry.revision}`).join(", ")}</div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}><button type="button" onClick={() => mutateRecord(record.id, "freeze")}>Freeze</button><button type="button" onClick={() => mutateRecord(record.id, "detach")}>Detach</button><button type="button" onClick={() => mutateRecord(record.id, "regenerate")}>Regenerate</button><button type="button" onClick={onOpenSource}>Open source</button><button type="button" onClick={() => mutateRecord(record.id, "delete")}>Delete</button></div>
    </div>)}</div>
  </div>;
};
