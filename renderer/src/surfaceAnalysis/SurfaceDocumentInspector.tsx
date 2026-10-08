import { lazy, Suspense, useState } from "react";
import type { SurfaceDocument } from "@math3d/core";
import { SharedInspectorShell, type SharedInspectorCategory } from "../components/SharedInspectorShell";
import { SurfaceViewControls, SurfaceOverlayControls, SurfaceProbeResult, type SurfaceViewControlsProps } from "../components/SurfaceInspectorControls";
import type { ProbeInfo } from "../components/SurfaceViewer";
import type { PrincipalCurvatureScalars } from "../math/principalCurvature";
import type { SurfaceDocumentView } from "./surfaceDocumentView";
import type { SurfaceDocumentBinding } from "../workspace/surfaceDocumentBinding";

const ParamDomainPreview = lazy(() => import("../surfacePanels").then(module => ({ default: module.ParamDomainPreview })));

export function SurfaceDocumentInspector({ document, title, binding, view, onView, viewControls, probeEnabled, onToggleProbe,
  probeInfo, curvature, onPickDomainUV, onResetCamera, provenance, measurement, history, onUndo, onRedo, children }:
  { document: SurfaceDocument; title: string; binding: SurfaceDocumentBinding; view: SurfaceDocumentView;
    onView: (value: Partial<SurfaceDocumentView>) => void; viewControls: SurfaceViewControlsProps;
    probeEnabled: boolean; onToggleProbe: () => void; probeInfo: ProbeInfo | null; curvature: PrincipalCurvatureScalars | null;
    onPickDomainUV: (uv: { u: number; v: number }) => void; onResetCamera: () => void;
    provenance: React.ReactNode; measurement: React.ReactNode; history: { undoDepth: number; redoDepth: number };
    onUndo: () => void; onRedo: () => void; children?: React.ReactNode }) {
  const [category, setCategory] = useState<SharedInspectorCategory>("summary");
  const familyLabel = document.source.definition.familyId === "graph2d.revolution" ? "Revolution of a Graph profile" : "Extrusion of a Graph profile";
  const result = <SurfaceProbeResult probeInfo={probeInfo} curvature={curvature} probeEnabled={probeEnabled} />;
  const section = (title: string, content: React.ReactNode) => <section style={{ border: "1px solid #e1e9f2", borderRadius: 10, padding: 10, marginBottom: 10 }}><strong style={{ display: "block", marginBottom: 8 }}>{title}</strong>{content}</section>;
  return <div data-testid="document-surface-inspector" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} style={{ padding: 10 }}>
    <SharedInspectorShell activeCategory={category} onCategoryChange={setCategory}
      summary={<><strong>{title}</strong><div>{familyLabel}</div><div>Revision {document.identity.revision}</div></>}>
      {category === "summary" && <>
        {section("View", <><SurfaceViewControls {...viewControls} /><button type="button" onClick={onResetCamera}>Reset camera</button></>)}
        {section("Tessellation", <label style={{ display: "grid", gap: 5 }}>Resolution
          <input aria-label="Surface resolution" data-testid="document-surface-resolution" type="number" min={8} max={220} step={1} value={view.resolution}
            onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) onView({ resolution: Math.max(8, Math.min(220, Math.round(value))) }); }} />
        </label>)}
        {section("Selected surface point", result)}
        {measurement}{children}
      </>}
      {category === "selection" && <>
        {section("Probe", <>
          <label><input data-testid="document-surface-probe-toggle" type="checkbox" checked={probeEnabled} onChange={onToggleProbe} /> Surface probe</label>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{(["showProbeNormal", "showProbeTangentPlane", "showProbeTangents"] as const).map((key, index) =>
            <label key={key}><input type="checkbox" checked={view[key]} onChange={event => onView({ [key]: event.target.checked })} /> {["Normal", "Tangent plane", "Tangent vectors"][index]}</label>)}</div>
        </>)}
        {section("Point pick", <Suspense fallback={<p>Loading Surface parameter picker…</p>}>
          <div data-testid="document-surface-domain-picker"><ParamDomainPreview width={260} height={220} {...binding.domain} picked={probeInfo?.uv ?? null} onPick={onPickDomainUV} /></div>
          <p style={{ fontSize: 11 }}>Pick (u,v) to inspect this saved Surface.</p>
        </Suspense>)}
        {section("Selected surface point", result)}
      </>}
      {category === "geometry" && <>
        {section("Definition", <><div>{familyLabel}</div>
          {Object.entries(document.source.definition.expressions ?? {}).map(([axis, expression]) => <div key={axis} style={{ font: "12px Consolas, monospace", marginTop: 5 }}>{axis}(u) = {expression}</div>)}
          <div>Domain: u ∈ [{binding.domain.uMin}, {binding.domain.uMax}], v ∈ [{binding.domain.vMin}, {binding.domain.vMax}]</div>
          <p style={{ fontSize: 11 }}>u follows the profile; v covers the construction from start to end.</p>
          <p style={{ fontSize: 11 }}>Edit the profile, captured variables and construction in Source/Object.</p></>)}
        {measurement}
      </>}
      {category === "analysis" && <>
        {section("Analysis", <SurfaceOverlayControls showPlanes={view.showPlanes} onTogglePlanes={() => onView({ showPlanes: !view.showPlanes })}
          showPrincipalDirections={view.showPrincipalDirections} onTogglePrincipalDirections={() => onView({ showPrincipalDirections: !view.showPrincipalDirections })}
          showPrincipalLines={view.showPrincipalLines} onTogglePrincipalLines={() => onView({ showPrincipalLines: !view.showPrincipalLines })}
          showCurvatureLines={view.showCurvatureLines} onToggleCurvatureLines={() => onView({ showCurvatureLines: !view.showCurvatureLines })} />)}
        {section("Local differential geometry", result)}{children}
      </>}
      {category === "diagnostics" && section("Probe diagnostics", <>
        {probeInfo ? <div>Normal length: {Math.hypot(probeInfo.normal.x, probeInfo.normal.y, probeInfo.normal.z).toPrecision(6)}</div> : <p>Select a Surface point for local diagnostics.</p>}
        {curvature && <div>{Object.values(curvature).every(value => typeof value !== "number" || Number.isFinite(value)) ? "Finite local curvature values." : "Non-finite local curvature: inspect the selected parameter point."}</div>}
        <div>Periodic seam: {binding.wrapV ? "v" : "none"}</div>
      </>)}
      {category === "provenance" && section("Saved Surface", <><div>{document.identity.id} · r{document.identity.revision}</div><div style={{ fontSize: 11 }}>{document.identity.structuralHash}</div><div>Source documents: {document.source.definition.sourceIds?.join(", ") || "none"}</div></>)}
      {category === "history" && section("Document commands", <><p>Undo: {history.undoDepth} · Redo: {history.redoDepth}</p>
        <button disabled={!history.undoDepth} onClick={onUndo}>Undo Surface edit</button><button disabled={!history.redoDepth} onClick={onRedo}>Redo Surface edit</button></>)}
    </SharedInspectorShell>
    {provenance}
  </div>;
}
