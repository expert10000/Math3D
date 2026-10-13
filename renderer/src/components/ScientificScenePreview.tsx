import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GeometryViewer } from "./GeometryViewer";
import { buildScientificHeightMesh, type OpenedScientificHeightSurface } from "../scientificScene/heightSurface";

export type ScientificSceneOpenResponse = { ok: true; scene: OpenedScientificHeightSurface } |
  { ok: false; canceled: true } | { ok: false; canceled: false; error: string };
type Sample = { fingerprint: string; sceneId: string; datasetId: string; sampleIndex: number; sampleId: string;
  grid: [number, number]; coordinates: [number, number]; coordinateUnits: [string, string];
  value: number; valueUnit: string };

export function ScientificScenePreview({ opened, onClose }: { opened: OpenedScientificHeightSurface; onClose: () => void }) {
  const mesh = useMemo(() => buildScientificHeightMesh(opened), [opened]);
  const dataset = opened.manifest.datasets.find(item => item.id === opened.datasetId)!;
  const coordinate = opened.manifest.coordinates.find(item => item.id === dataset.coordinateSystem)!;
  const [selection, setSelection] = useState<Sample | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setSelection(null); setError(""); setBusy(false);
    return () => { generation.current++; }; }, [opened.fingerprint]);
  const select = async (sampleIndex: number) => {
    const current = ++generation.current;
    setBusy(true); setError(""); setSelection(null);
    try {
      if (!window.scientificScenes?.sample) throw new Error("Desktop scientific sample verifier unavailable");
      const sample = await window.scientificScenes.sample({ fingerprint: opened.fingerprint,
        datasetId: opened.datasetId, sampleIndex });
      if (current === generation.current && sample.fingerprint === opened.fingerprint) setSelection(sample);
    } catch (reason) {
      if (current === generation.current) setError(`Selection refused: ${String((reason as Error)?.message ?? reason)}`);
    } finally { if (current === generation.current) setBusy(false); }
  };
  const pick = (info: { point: { x: number; y: number; z: number }; faceIndex?: number }) => {
    const face = info.faceIndex;
    if (!Number.isSafeInteger(face) || face! < 0 || face! * 3 + 2 >= mesh.indices!.length) return;
    const candidates = Array.from(mesh.indices!.slice(face! * 3, face! * 3 + 3));
    const sample = candidates.reduce((best, index) => {
      const distance = (node: number) => Math.hypot(mesh.positions[3 * node] - info.point.x,
        mesh.positions[3 * node + 1] - info.point.y, mesh.positions[3 * node + 2] - info.point.z);
      return distance(index) < distance(best) ? index : best;
    });
    void select(sample);
  };
  const selectedPoint = selection ? { x: selection.coordinates[0], y: selection.coordinates[1], z: selection.value } : null;
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Verified scientific scene" data-testid="scientific-scene-preview"
    style={{ position: "fixed", inset: 0, zIndex: 2903, background: "rgba(15,23,42,.7)", display: "grid", placeItems: "center", padding: 20 }}>
    <div style={{ width: "min(1200px, 96vw)", height: "min(790px, 94vh)", background: "var(--panel-strong, #fff)",
      color: "var(--text, #172033)", borderRadius: 12, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" }}>
      <header style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", gap: 12,
        borderBottom: "1px solid var(--border, #cbd5e1)" }}>
        <div><strong>{opened.manifest.title}</strong><div style={{ fontSize: 12 }}>Verified scientific-scene/v1 bytes · {opened.sourceKind === "bundled" ? "bundled example" : "external producer (untrusted)"} · read-only</div></div>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)" }}>
        <div style={{ minHeight: 0 }}><GeometryViewer scene={{ points: [], segments: [], triangles: [] }}
          meshOverrides={[mesh]} showPlanes={false} pickEnabled onPick={pick} onPickMiss={() => setSelection(null)}
          highlightPointSets={selectedPoint ? [{ points: [selectedPoint], color: 0xffbc45, size: 2 }] : null}
          cameraOverride={{ position: { x: 8, y: 8, z: 6 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } }} /></div>
        <aside style={{ padding: 16, overflow: "auto", borderLeft: "1px solid var(--border, #cbd5e1)", fontSize: 12, lineHeight: 1.5 }}>
          <h3 style={{ marginTop: 0 }}>Source and data</h3>
          <div>Producer: {opened.manifest.source.producer}</div>
          <div>Source: {opened.manifest.source.sourceId} · {opened.manifest.source.sourceSchema}</div>
          <div>Dataset: <code>{dataset.id}</code> · {dataset.shape.join(" × ")} samples</div>
          <div>Quantity: {dataset.quantity.name} ({dataset.quantity.unit})</div>
          <div>Axes: {coordinate.axes.map(axis => `${axis.name} (${axis.unit})`).join(", ")}</div>
          <div>Encoding: f64le · {dataset.order}</div>
          <div>Manifest SHA-256: <code style={{ overflowWrap: "anywhere" }}>{opened.fingerprint}</code></div>
          <p>Hashes verify the selected bytes, not producer identity or scientific validity.</p>
          <p>The surface is a display mesh from supplied samples; no formula is executed in Math3D.</p>
          <button type="button" disabled={busy} onClick={() => void select(Math.floor(dataset.shape[0] / 2) * dataset.shape[1] + Math.floor(dataset.shape[1] / 2))}>
            Inspect center sample</button>
          <p>Click the surface to inspect its nearest stored grid sample. The source is re-verified for each selection.</p>
          {busy && <p role="status">Verifying source sample…</p>}
          {error && <p role="alert">{error}</p>}
          {selection && <div data-testid="scientific-sample-selection"><h3>Selected source sample</h3>
            <div>{selection.sceneId}/{selection.datasetId} · index {selection.sampleIndex} · grid [{selection.grid.join(", ")}]</div>
            <div>Stable sample ID: <code>{selection.sampleId}</code></div>
            <div>{coordinate.axes[0].name} = {selection.coordinates[0].toPrecision(8)} {selection.coordinateUnits[0]}</div>
            <div>{coordinate.axes[1].name} = {selection.coordinates[1].toPrecision(8)} {selection.coordinateUnits[1]}</div>
            <div>{dataset.quantity.symbol ?? dataset.id} = {selection.value.toPrecision(8)} {selection.valueUnit}</div>
          </div>}
        </aside>
      </div>
    </div>
  </div>, document.body);
}
