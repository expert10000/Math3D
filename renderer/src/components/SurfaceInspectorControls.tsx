import type { SurfacesRightPanelProps } from "../surfacePanels";
import type { ProbeInfo } from "./SurfaceViewer";
import type { PrincipalCurvatureScalars } from "../math/principalCurvature";

/** Shared by the normal Surfaces Inspector and saved Surface documents. */
export type SurfaceViewControlsProps = Pick<SurfacesRightPanelProps,
  "lightPreset" | "onChangeLightPreset" | "materialRoughness" | "onSetMaterialRoughness" |
  "materialMetalness" | "onSetMaterialMetalness" | "materialOpacity" | "onSetMaterialOpacity" |
  "showWireframe" | "onToggleWireframe"> & { wireframeTestId?: string };

export function SurfaceViewControls(props: SurfaceViewControlsProps) {
  return <div data-testid="surface-view-controls" style={{ fontSize: 11, display: "grid", gap: 7 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <strong>Light</strong>
      {(["studio", "soft", "contrast", "neutral", "warm"] as const).map(preset => <button key={preset} type="button"
        onClick={() => props.onChangeLightPreset(preset)} aria-pressed={props.lightPreset === preset}
        style={{ border: `1px solid ${props.lightPreset === preset ? "#0a66c2" : "#ddd"}`, borderRadius: 999, background: props.lightPreset === preset ? "#e6f0ff" : "#fff", padding: "4px 8px" }}>{preset}</button>)}
    </div>
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input data-testid={props.wireframeTestId} type="checkbox" checked={props.showWireframe} onChange={props.onToggleWireframe} />Wireframe</label>
    <label style={{ display: "grid", gap: 4 }}>Roughness: {props.materialRoughness.toFixed(2)}<input aria-label="Roughness" type="range" min={0} max={1} step={0.01} value={props.materialRoughness} onChange={event => props.onSetMaterialRoughness(Number(event.target.value))} /></label>
    <label style={{ display: "grid", gap: 4 }}>Metalness: {props.materialMetalness.toFixed(2)}<input aria-label="Metalness" type="range" min={0} max={1} step={0.01} value={props.materialMetalness} onChange={event => props.onSetMaterialMetalness(Number(event.target.value))} /></label>
    <label style={{ display: "grid", gap: 4 }}>Opacity: {props.materialOpacity.toFixed(2)}<input aria-label="Opacity" type="range" min={0.1} max={1} step={0.01} value={props.materialOpacity} onChange={event => props.onSetMaterialOpacity(Number(event.target.value))} /></label>
  </div>;
}

export type SurfaceOverlayControlsProps = Pick<SurfacesRightPanelProps,
  "showPlanes" | "onTogglePlanes" | "showPrincipalDirections" | "onTogglePrincipalDirections" |
  "showPrincipalLines" | "onTogglePrincipalLines" | "showCurvatureLines" | "onToggleCurvatureLines"> &
  Partial<Pick<SurfacesRightPanelProps, "showGaussMap" | "onToggleGaussMap" | "showContours" | "onToggleContours" | "contourCount" | "onSetContourCount">>;

export function SurfaceOverlayControls(props: SurfaceOverlayControlsProps) {
  return <div data-testid="surface-overlay-controls" style={{ display: "grid", gap: 6, fontSize: 11 }}>
    {props.onToggleGaussMap && <label><input type="checkbox" checked={props.showGaussMap} onChange={props.onToggleGaussMap} /> Gauss map</label>}
    {props.onToggleContours && <label><input type="checkbox" checked={props.showContours} onChange={props.onToggleContours} /> Slice/contours</label>}
    {props.showContours && props.onSetContourCount && <label style={{ display: "grid", gap: 4 }}>Contour count: {props.contourCount}<input type="range" min={2} max={48} step={1} value={props.contourCount} onChange={event => props.onSetContourCount?.(Number(event.target.value))} /></label>}
    <label><input type="checkbox" checked={props.showPlanes} onChange={props.onTogglePlanes} /> Coordinate/slice planes</label>
    <label><input type="checkbox" checked={props.showPrincipalDirections} onChange={props.onTogglePrincipalDirections} /> Principal directions</label>
    <label><input type="checkbox" checked={props.showPrincipalLines} onChange={props.onTogglePrincipalLines} /> Principal lines</label>
    <label><input type="checkbox" checked={props.showCurvatureLines} onChange={props.onToggleCurvatureLines} /> Curvature overlays</label>
  </div>;
}

export function SurfaceProbeResult({ probeInfo, curvature, probeEnabled }: { probeInfo: ProbeInfo | null;
  curvature: Partial<Pick<PrincipalCurvatureScalars, "K" | "H" | "k1" | "k2">> | null; probeEnabled: boolean }) {
  const fmt = (value: number | undefined) => value != null && Number.isFinite(value) ? value.toPrecision(6) : "n/a";
  const vector = (value: ProbeInfo["point"]) => `(${fmt(value.x)}, ${fmt(value.y)}, ${fmt(value.z)})`;
  return <div data-testid="surface-probe-values" style={{ fontSize: 11, display: "grid", gap: 6 }}>
    {probeInfo ? <>
      <div><strong>p =</strong> {vector(probeInfo.point)}</div><div><strong>n =</strong> {vector(probeInfo.normal)}</div>
      {probeInfo.uv && <div><strong>u, v =</strong> ({fmt(probeInfo.uv.u)}, {fmt(probeInfo.uv.v)})</div>}
      {(["K", "H", "k1", "k2"] as const).map(field => <div key={field} data-testid={`surface-probe-${field}`} data-value={curvature?.[field]}><strong>{field} =</strong> {fmt(curvature?.[field])}</div>)}
      {!probeEnabled && <div>Probe mode is currently off.</div>}
    </> : <><div>No point selected.</div><div>Use Probe mode to inspect local values.</div></>}
  </div>;
}
