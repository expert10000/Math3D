import { SurfaceViewControls, SurfaceOverlayControls, SurfaceProbeResult } from "./components/SurfaceInspectorControls";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "./uiStyles";
import { PlanePlot, type PlanePlotHandle } from "./components/PlanePlot";
import { RiemannSpherePlot, type SphereGuide as RiemannSphereGuide, type SphereLine as RiemannSphereLine, type SpherePoint as RiemannSpherePoint } from "./components/RiemannSpherePlot";
import { SelectionStatsPanel } from "./components/SelectionStatsPanel";
import { DiskStatsPanel } from "./components/DiskStatsPanel";
import { UnifiedSelectionInspector } from "./components/UnifiedSelectionInspector";
import { SharedInspectorShell } from "./components/SharedInspectorShell";
import { MeshOperationsPanel, type MeshBooleanOperation, type MeshBooleanStrategy, type MeshOperationHistoryEntry, type MeshOperationPresetId, type MeshOperationSavedPresetSummary, type MeshOperationUiId, type MeshOperationResultSummary } from "./components/MeshOperationsPanel";
import { ActiveSelectionCard, type ActiveSelectionCardAction, type ActiveSelectionCardProps } from "./components/ActiveSelectionCard";
import { formatContextEntityLabel } from "./selection/contextualSelectionModel";
import { buildContextualSelectionState } from "./selection/contextualSelectionState";
import { type SelectionResult, type UnifiedSelectionSet } from "./selection/unifiedSelection";
import { type SelectionHistoryEntry } from "./selection/selectionHistory";
import { type SurfaceId, type ColorMode, type SurfacePerformanceSnapshot, type ProbeInfo, type MeshInteractionQualityMode } from "./components/SurfaceViewer";
import { VolumeSliceHistogram } from "./components/VolumeSliceHistogram";
import { type ParamSurfaceId } from "./components/ParamSurfaceViewer";
import { type ColorPalette } from "./components/colorPalette";
import type { GaussColorMode } from "./components/gaussMapUtils";
import { type SelectionMetricKey, type SelectionStats } from "./math/selection/selectionStats";
import { type ComplexMapInputMode, type ComplexMapSweepSpec } from "./math/complexMapSweep";
import { type MeshDocument } from "@math3d/core";
import { type CurvatureData } from "./math/surfaceInvariants";
import type { PrincipalCurvatureScalars } from "./math/principalCurvature";
import { type WeierstrassDriftResult } from "./math/weierstrass";
import { type SurfaceQueryChartCoord } from "./math/surfaceQuery";
import { formatSurfaceMeshSource, type SurfaceMeshSource, type SurfaceMeshPreset } from "./mesh/surfaceMesh";
import { bevelEdge, collapseEdge, splitEdge, type EdgeCollapseMode, type FaceSubdivideMode } from "./mesh/meshEditOps";
import { type MeshEdgeSelectionResult, type MeshEdgeSelectionTool } from "./mesh/edgeSelection";
import { type MeshTopologyInspectorDetails, type MeshTopologyListRow } from "./mesh/topologyInspector";
import { type MeshAnalysisComputationRecord, type MeshDiagnosticsAnalysisPayload } from "./mesh/analysisResultStore";
import { type MeshEntityScientificFields } from "./mesh/meshEntityScientificFields";
import { getMeshHealthBlockers } from "./mesh/meshHealth";
import { type MeshDifferentialGeometrySummary } from "./mesh/meshDifferentialGeometry";
import { SURFACE_FEATURE_CLASSES, SURFACE_FEATURE_LABELS, type SurfaceFeatureClass, type SurfaceFeatureExtractionResult } from "./mesh/surfaceFeatureExtraction";
import { type MeshActiveAnalysisResultSummary } from "./mesh/activeAnalysisResult";
import { buildMeshBenchmarkVerificationRows, meshBenchmarkVerificationPasses, type MeshBenchmarkVerificationRow } from "./mesh/meshBenchmarkVerification";
import { type MeshQualityReport, type MeshQualityReportPhase } from "./mesh/meshQualityReport";
import type { DatasetKind, VolumeDataset } from "./scene/datasets";
import { VOLUME_PRESETS, type VolumePreset, type VolumePresetId, type VolumePresetParams } from "./scene/volume/volumePresets";
import { type SliceAxis, type VolumeSliceHover, type VolumeSliceReport } from "./scene/volume/sliceVolume";
import { samplingToBounds, type VolumeAllocationPlan, type VolumeBoundaryMode, type VolumeInterpolation, type VolumeNonFiniteReport, type VolumeSampling, type VolumeSamplingCentering } from "./scene/volume/volumeSampling";
import { VECTOR_PRESETS, type VectorPresetId } from "./scene/volume/vectorPresets";
import { type VolumeJobLifecycle } from "./volume";
import { getDefaultRotationalProfileExpressions, supportsGeneralRotationalProfile, type RotationalProfileMode } from "./math/rotationalSurface";
import { DEFAULT_BEZIER_CONTROL_GRID_TEXT, DEFAULT_BSPLINE_CONTROL_GRID_TEXT, DEFAULT_BSPLINE_DEGREE_U, DEFAULT_BSPLINE_DEGREE_V, DEFAULT_BSPLINE_KNOT_U_TEXT, DEFAULT_BSPLINE_KNOT_V_TEXT, DEFAULT_NURBS_CONTROL_GRID_TEXT, DEFAULT_NURBS_DEGREE_U, DEFAULT_NURBS_DEGREE_V, DEFAULT_NURBS_KNOT_U_TEXT, DEFAULT_NURBS_KNOT_V_TEXT, DEFAULT_NURBS_WEIGHTS_TEXT, isSplinePatchSurfaceId } from "./math/splineSurface";
import { type SurfaceViewerKind, type BBox3, type MeshPromotionTraceState, type MeshBenchmarkModel, type SurfaceMeshAssetPreset, type SurfaceMeshTopologySavedPreset, type SurfaceMeshTopologyHistoryEntry, type SurfaceMeshTopologyPickMode, type UnifiedSelectionKindFilterState, type UnifiedSelectionTopologyFilterMode, type SurfaceMeshTopologyOperation, type ImplicitBakeBounds, type MeshOperationLastValidation, type GenerateSurfaceStatus, type CgalHealthState, type Vec3, type ComplexMapLine, type ComplexPreimageMode, type ComplexDistortionMode, type ComplexMapProbe, type ComplexMapProbePin, type ParamDomain, type ChartMode, type GeodesicPathMethod, type GeodesicPathSourceMode, type GeodesicPathEndpoint, type GeodesicHeatEndpoint, type GeodesicDiskCenter, type SurfaceInspectMetrics, type AnalysisFocusedSection, MESH_BENCHMARK_CATEGORY_ORDER, MESH_BENCHMARK_CATEGORY_LABELS, findSurfaceMeshTopologyDemoPresetByOperation, SURFACE_MESH_TOPOLOGY_DEMO_PRESETS, SURFACES_EQ_META, PARAM_SURFACES_META, isGraphSurface, isImplicitSurface, type SurfacesLeftTab, detectPrincipalAxisDirection, vNormalize, vScale, normalizeParamDomain, WEIERSTRASS_DEFAULTS, colorModesForSurfaceViewer, DEFAULT_VOLUME_PRESET_ID, COMPLEX_GRID_COLORS, cardStyle, pill, formatBenchmarkBytes, pillRow, COMPLEX_MAP_CUSTOM_ID, COMPLEX_MAP_PRESETS, estimateTargetEdgeFromBudget, clampNumber, SURFACE_MESH_TOPOLOGY_PICK_MODES, SURFACE_MESH_TOPOLOGY_OPERATION_OPTIONS, fmt, fmt3, COLOR_MODE_LABELS, IMPLICIT_EXPR_PRESETS, DEFAULT_ROTATIONAL_PROFILE_POINTS_TEXT, ROTATIONAL_AXIS_DIRECTIONS, vDot, vSub, vCross, type MeshWorkspaceInspectorSummary, type InspectorPanelTab, type SurfaceWorkflowStepId, type SurfaceWorkflowStepState, type MeshPerfBenchmarkId, type MeshPipelineProfileRun, type MeshDebugMonitorState, type MeshBenchmarkPerformanceSuiteState, type DeferredSurfaceSampleSetInfo, type MeshBenchmarkVerificationContext, type GeometryProbeSelectionMode, type GeometryProbeSelectionDetails, type MeshAnalyzeProbeHistoryEntry, type GraphDomain, type ImplicitDomain, type GraphDomainPreset, type ParamDomainPreset, type ImplicitDomainPreset, getParamDomainPreviewBounds, normalizeGraphDomain, getDefaultGraphSpan, normalizeImplicitDomain, getDefaultImplicitDomain, getEditableImplicitCustomExpr, MESH_PERF_BENCHMARK_PRESETS, serializeMeshPipelineProfileRun, serializeMeshDebugMonitorState, buildTangentBasis } from "./surfacePanelShared";

export type ComplexMapMarkerData = {
  thresholds: { critical: number; zero: number; pole: number };
  critical: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
  zero: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
  pole: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
};

export type ComplexMapDistortionField = {
  values: Float32Array;
  nx: number;
  ny: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  min: number;
  max: number;
};

export type ComplexMapDistortionProbe = {
  u: number;
  v: number;
  detAbs: number;
  ratio: number;
  conformalErr: number;
};

export const WEIERSTRASS_META = {
  label: "Weierstrass",
  formula: "X(z) = Re integral Phi(z) dz",
  note: "Minimal surface from Weierstrass data g(z), phi(z).",
};

export type WeierstrassDiagnosticsSuccess = Extract<WeierstrassDriftResult, { drift: number }>;

export function isWeierstrassDiagnosticsSuccess(
  diag: WeierstrassDriftResult | null
): diag is WeierstrassDiagnosticsSuccess {
  return !!diag && "drift" in diag && "driftVec" in diag && "okLevel" in diag;
}

export type SurfacesInspectPanelProps = {
  viewerKind: SurfaceViewerKind;
  inspectEnabled: boolean;
  onToggleInspectEnabled: () => void;
  onClearInspect: () => void;
  inspectIdx: number | null;
  inspectPos: { x: number; y: number; z: number } | null;
  inspectNormal: { x: number; y: number; z: number } | null;
  inspectMetrics: SurfaceInspectMetrics | null;
  geometryProbeSelectionMode: GeometryProbeSelectionMode;
  geometryProbeSelectionDetails: GeometryProbeSelectionDetails | null;
  geometryProbeHoverSelectionDetails: GeometryProbeSelectionDetails | null;
  probeInfo: ProbeInfo | null;
  probeCurv: CurvatureData | null;
  paramProbeCurv: PrincipalCurvatureScalars | null;
  graphDomain: GraphDomain;
  paramDomain: ParamDomain;
  onPickDomainXY: (xy: { x: number; y: number }) => void;
  onPickDomainUV: (uv: { u: number; v: number }) => void;
  probeEnabled: boolean;
  onToggleProbe: () => void;
  showProbeNormal: boolean;
  onToggleProbeNormal: () => void;
  showProbeTangentPlane: boolean;
  onToggleProbeTangentPlane: () => void;
  showProbeTangents: boolean;
  onToggleProbeTangents: () => void;
};

export const SurfacesInspectPanel: React.FC<SurfacesInspectPanelProps> = ({
  viewerKind,
  inspectEnabled,
  onToggleInspectEnabled,
  onClearInspect,
  inspectIdx,
  inspectPos,
  inspectNormal,
  inspectMetrics,
  probeInfo,
  probeCurv,
  paramProbeCurv,
  graphDomain,
  paramDomain,
  onPickDomainXY,
  onPickDomainUV,
  probeEnabled,
  onToggleProbe,
  showProbeNormal,
  onToggleProbeNormal,
  showProbeTangentPlane,
  onToggleProbeTangentPlane,
  showProbeTangents,
  onToggleProbeTangents,
  geometryProbeSelectionMode = "object",
  geometryProbeSelectionDetails = null,
  geometryProbeHoverSelectionDetails = null,
}) => {
  const [navigatorMode, setNavigatorMode] = useState<"click" | "hover">("click");
  const [navigatorDrag, setNavigatorDrag] = useState(false);
  const [syncWith3DPick, setSyncWith3DPick] = useState(true);

  const isGraphViewer = viewerKind === "graph";
  const isParamViewer = viewerKind === "param" || viewerKind === "weierstrass";
  const showDomainNavigator = isGraphViewer || isParamViewer;

  const activePoint = probeInfo?.point ?? inspectPos;
  const activeNormal = probeInfo?.normal ?? inspectNormal;
  const fittedPrincipalBasis =
    inspectMetrics?.directionValid && inspectMetrics.d1 && inspectMetrics.d2
      ? {
          t1: { x: inspectMetrics.d1[0], y: inspectMetrics.d1[1], z: inspectMetrics.d1[2] },
          t2: { x: inspectMetrics.d2[0], y: inspectMetrics.d2[1], z: inspectMetrics.d2[2] },
        }
      : null;
  const tangentBasis = fittedPrincipalBasis ?? (activeNormal ? buildTangentBasis(activeNormal) : null);
  const chartXY = probeInfo?.xy ?? (probeInfo?.point ? { x: probeInfo.point.x, y: probeInfo.point.z } : null);
  const chartUV = probeInfo?.uv ?? null;

  const curvature =
    isGraphViewer && probeCurv
      ? { K: probeCurv.K, H: probeCurv.H, k1: probeCurv.k1, k2: probeCurv.k2 }
      : isParamViewer && paramProbeCurv
        ? { K: paramProbeCurv.K, H: paramProbeCurv.H, k1: paramProbeCurv.k1, k2: paramProbeCurv.k2 }
        : inspectMetrics;

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Inspect controls</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
          <input type="checkbox" checked={inspectEnabled} onChange={onToggleInspectEnabled} />
          Inspect mode (pick points)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
          <input type="checkbox" checked={probeEnabled} onChange={onToggleProbe} />
          Probe mode
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
          <input type="checkbox" checked={showProbeNormal} onChange={onToggleProbeNormal} />
          Normal arrow
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
          <input type="checkbox" checked={showProbeTangentPlane} onChange={onToggleProbeTangentPlane} />
          Tangent plane
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <input type="checkbox" checked={showProbeTangents} onChange={onToggleProbeTangents} />
          Tangent directions
        </label>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={onClearInspect}>
            Clear inspect
          </button>
        </div>
      </div>

      <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Pick info</div>
        {activePoint && activeNormal ? (
          <div data-testid="mesh-selection-local-science" style={{ fontSize: 11, display: "grid", gridTemplateColumns: "88px 1fr", gap: "4px 8px" }}>
            {inspectIdx != null && (
              <>
                <div style={{ color: "#556" }}>Index</div>
                <div>{inspectIdx}</div>
              </>
            )}
            <div style={{ color: "#556" }}>3D point</div>
            <div>{fmt3(activePoint)}</div>
            {isGraphViewer && chartXY && (
              <>
                <div style={{ color: "#556" }}>(x, y)</div>
                <div>({fmt(chartXY.x)}, {fmt(chartXY.y)})</div>
              </>
            )}
            {isParamViewer && chartUV && (
              <>
                <div style={{ color: "#556" }}>(u, v)</div>
                <div>({fmt(chartUV.u)}, {fmt(chartUV.v)})</div>
              </>
            )}
            <div style={{ color: "#556" }}>Normal</div>
            <div data-testid="mesh-selection-local-normal">{fmt3(activeNormal)}</div>
            {tangentBasis && (
              <>
                <div style={{ color: "#556" }}>{fittedPrincipalBasis ? "Principal direction 1" : "Tangent direction 1"}</div>
                <div data-testid="mesh-selection-local-direction-d1">{fmt3(tangentBasis.t1)}</div>
                <div style={{ color: "#556" }}>{fittedPrincipalBasis ? "Principal direction 2" : "Tangent direction 2"}</div>
                <div data-testid="mesh-selection-local-direction-d2">{fmt3(tangentBasis.t2)}</div>
              </>
            )}
            {curvature?.K != null && (
              <>
                <div style={{ color: "#556" }}>K</div>
                <div data-testid="mesh-selection-local-K">{fmt(curvature.K)}</div>
              </>
            )}
            {curvature?.H != null && (
              <>
                <div style={{ color: "#556" }}>H</div>
                <div data-testid="mesh-selection-local-H">{fmt(curvature.H)}</div>
              </>
            )}
            {curvature?.k1 != null && (
              <>
                <div style={{ color: "#556" }}>k1</div>
                <div data-testid="mesh-selection-local-k1">{fmt(curvature.k1)}</div>
              </>
            )}
            {curvature?.k2 != null && (
              <>
                <div style={{ color: "#556" }}>k2</div>
                <div data-testid="mesh-selection-local-k2">{fmt(curvature.k2)}</div>
              </>
            )}
            {inspectMetrics?.shapeIndex != null && (
              <>
                <div style={{ color: "#556" }}>Shape index</div>
                <div data-testid="mesh-selection-local-shape-index">{fmt(inspectMetrics.shapeIndex)}</div>
              </>
            )}
            {inspectMetrics?.curvedness != null && (
              <>
                <div style={{ color: "#556" }}>Curvedness</div>
                <div data-testid="mesh-selection-local-curvedness">{fmt(inspectMetrics.curvedness)}</div>
              </>
            )}
            {!!inspectMetrics?.warnings?.length && (
              <>
                <div style={{ color: "#9a3412" }}>Warnings</div>
                <div data-testid="mesh-selection-local-curvature-warnings" style={{ color: "#9a3412" }}>
                  {inspectMetrics.warnings.join(" ")}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {inspectEnabled || probeEnabled
              ? "Click the surface (or use the navigator) to inspect a point."
              : "Enable Inspect mode or Probe mode to start."}
          </div>
        )}
      </div>

      {geometryProbeSelectionMode && (
        <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Geometry probe (entity)</div>
          <div style={{ fontSize: 11, display: "grid", gridTemplateColumns: "112px 1fr", gap: "4px 8px" }}>
            <div style={{ color: "#556" }}>Selection mode</div>
            <div>{geometryProbeSelectionMode}</div>

            <div style={{ color: "#556" }}>Clicked entity</div>
            <div>
              {geometryProbeSelectionDetails
                ? `${geometryProbeSelectionDetails.mode}${
                    geometryProbeSelectionDetails.faceIndex != null ? ` · face #${geometryProbeSelectionDetails.faceIndex}` : ""
                  }${
                    geometryProbeSelectionDetails.edgeVertexPair
                      ? ` · edge [${geometryProbeSelectionDetails.edgeVertexPair[0]}, ${geometryProbeSelectionDetails.edgeVertexPair[1]}]`
                      : ""
                  }${
                    geometryProbeSelectionDetails.vertexIndex != null
                      ? ` · vertex #${geometryProbeSelectionDetails.vertexIndex}`
                      : ""
                  }`
                : "none"}
            </div>

            <div style={{ color: "#556" }}>Hovered entity</div>
            <div>
              {geometryProbeHoverSelectionDetails
                ? `${geometryProbeHoverSelectionDetails.mode}${
                    geometryProbeHoverSelectionDetails.faceIndex != null ? ` · face #${geometryProbeHoverSelectionDetails.faceIndex}` : ""
                  }${
                    geometryProbeHoverSelectionDetails.edgeVertexPair
                      ? ` · edge [${geometryProbeHoverSelectionDetails.edgeVertexPair[0]}, ${geometryProbeHoverSelectionDetails.edgeVertexPair[1]}]`
                      : ""
                  }${
                    geometryProbeHoverSelectionDetails.vertexIndex != null
                      ? ` · vertex #${geometryProbeHoverSelectionDetails.vertexIndex}`
                      : ""
                  }`
                : "none"}
            </div>

            <div style={{ color: "#556" }}>Coordinate</div>
            <div>
              {geometryProbeSelectionDetails
                ? `(${fmt(geometryProbeSelectionDetails.point.x)}, ${fmt(geometryProbeSelectionDetails.point.y)}, ${fmt(geometryProbeSelectionDetails.point.z)})`
                : "none"}
            </div>

            <div style={{ color: "#556" }}>Hover coordinate</div>
            <div>
              {geometryProbeHoverSelectionDetails
                ? `(${fmt(geometryProbeHoverSelectionDetails.point.x)}, ${fmt(geometryProbeHoverSelectionDetails.point.y)}, ${fmt(geometryProbeHoverSelectionDetails.point.z)})`
                : "none"}
            </div>

            <div style={{ color: "#556" }}>Normal</div>
            <div>
              {geometryProbeSelectionDetails
                ? `(${fmt(geometryProbeSelectionDetails.normal.x)}, ${fmt(geometryProbeSelectionDetails.normal.y)}, ${fmt(geometryProbeSelectionDetails.normal.z)})`
                : "none"}
            </div>

            <div style={{ color: "#556" }}>Face area</div>
            <div>
              {geometryProbeSelectionDetails?.faceArea != null && Number.isFinite(geometryProbeSelectionDetails.faceArea)
                ? fmt(geometryProbeSelectionDetails.faceArea)
                : "n/a"}
            </div>

            <div style={{ color: "#556" }}>Edge length</div>
            <div>
              {geometryProbeSelectionDetails?.edgeLength != null && Number.isFinite(geometryProbeSelectionDetails.edgeLength)
                ? fmt(geometryProbeSelectionDetails.edgeLength)
                : "n/a"}
            </div>

            <div style={{ color: "#556" }}>Vertex info</div>
            <div>
              {geometryProbeSelectionDetails?.vertexIndex != null
                ? `vertex #${geometryProbeSelectionDetails.vertexIndex}`
                : "n/a"}
            </div>
          </div>
        </div>
      )}

      {showDomainNavigator && (
        <>
          <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Domain navigator</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setNavigatorMode("click")}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid " + (navigatorMode === "click" ? "#0a66c2" : "#d0d5dd"),
                  background: navigatorMode === "click" ? "#e6f0ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Click mode
              </button>
              <button
                type="button"
                onClick={() => setNavigatorMode("hover")}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid " + (navigatorMode === "hover" ? "#0a66c2" : "#d0d5dd"),
                  background: navigatorMode === "hover" ? "#e6f0ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Hover mode
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={syncWith3DPick}
                onChange={(e) => setSyncWith3DPick(e.target.checked)}
              />
              Sync with 3D pick
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={navigatorDrag}
                onChange={(e) => setNavigatorDrag(e.target.checked)}
              />
              Drag to move point
            </label>
            {isGraphViewer ? (
              <>
                <XYDomainPreview
                  width={250}
                  height={190}
                  xSpan={graphDomain.xSpan}
                  ySpan={graphDomain.ySpan}
                  onPick={onPickDomainXY}
                  picked={syncWith3DPick && navigatorMode === "click" ? chartXY : null}
                  mode={navigatorMode}
                  dragToPick={navigatorDrag}
                />
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  Click/hover in the rectangle to sample z = f(x,y) on the surface.
                </div>
              </>
            ) : (
              <>
                <ParamDomainPreview
                  width={250}
                  height={190}
                  uMin={paramDomain.uMin}
                  uMax={paramDomain.uMax}
                  vMin={paramDomain.vMin}
                  vMax={paramDomain.vMax}
                  onPick={onPickDomainUV}
                  picked={syncWith3DPick && navigatorMode === "click" ? chartUV : null}
                  mode={navigatorMode}
                  dragToPick={navigatorDrag}
                />
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  Click/hover in the rectangle to sample σ(u,v) on the surface.
                </div>
              </>
            )}
          </div>

          <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Coordinate readout</div>
            <div style={{ fontSize: 11, display: "grid", gridTemplateColumns: "88px 1fr", gap: "4px 8px" }}>
              {isGraphViewer && (
                <>
                  <div style={{ color: "#556" }}>(x, y)</div>
                  <div>{chartXY ? `(${fmt(chartXY.x)}, ${fmt(chartXY.y)})` : "n/a"}</div>
                </>
              )}
              {isParamViewer && (
                <>
                  <div style={{ color: "#556" }}>(u, v)</div>
                  <div>{chartUV ? `(${fmt(chartUV.u)}, ${fmt(chartUV.v)})` : "n/a"}</div>
                </>
              )}
              <div style={{ color: "#556" }}>3D point</div>
              <div>{activePoint ? fmt3(activePoint) : "n/a"}</div>
              {isGraphViewer && (
                <>
                  <div style={{ color: "#556" }}>f(x, y)</div>
                  <div>{activePoint ? fmt(activePoint.y) : "n/a"}</div>
                </>
              )}
              {isParamViewer && (
                <>
                  <div style={{ color: "#556" }}>height y</div>
                  <div>{activePoint ? fmt(activePoint.y) : "n/a"}</div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export type SurfacesLeftPanelProps = {
  showInternalTabs?: boolean;
  hideViewControls?: boolean;
  initialLeftTab?: "controls" | "scene" | "object" | "view" | "analysis" | "theory";
  viewerKind: SurfaceViewerKind;
  surfaceId: SurfaceId;
  paramId: ParamSurfaceId;
  datasetKind: DatasetKind;
  volumeDatasetOverride: VolumeDataset | null;
  volumeDistanceBusy: boolean;
  volumeDistanceError: string | null;
  volumeDistanceSigned: boolean;
  volumeDistanceAutoBounds: boolean;
  onBuildDistanceVolume: () => void;
  onClearVolumeOverride: () => void;
  volumePresetId: VolumePresetId;
  volumePreset: VolumePreset;
  volumeDims: [number, number, number];
  volumeParams: VolumePresetParams;
  volumeCustomExpr: string;
  volumeCustomError: string | null;
  volumeSeedAxis: SliceAxis;
  volumeSeedIndex: number;
  volumeSeedIndexMax: number;
  volumeCrosshairWorld: [number, number, number] | null;
  volumeCrosshairIndex: [number, number, number];
  volumeCrosshairValue: number | null;
  volumeCrosshairGradMag: number | null;
  volumeViewMode: "slices" | "3d";
  volumeLayout: "quad" | "slices" | "3d" | "xy" | "xz" | "yz";
  volumeFocusedPane: "xy" | "xz" | "yz" | "3d" | null;
  volumeSpatialPlaneVisibility: Record<SliceAxis, boolean>;
  volumeClipToCrop: boolean;
  volumeOpacity: number;
  volumeVectorPresetId: VectorPresetId;
  volumeVectorPresetLabel: string;
  volumeShowStreamlines: boolean;
  volumeStreamSeedGrid: number;
  volumeStreamlineStepSize: number;
  volumeStreamlineStepRange: { min: number; max: number; step: number };
  volumeStreamlineMaxSteps: number;
  volumeStreamlineMaxLength: number;
  volumeSampling: VolumeSampling;
  volumeSamplingSpacing: [number, number, number];
  volumeAllocationPlan: VolumeAllocationPlan;
  volumeSamplingDirty: boolean;
  volumeSamplingStatus: string;
  volumeCentering: VolumeSamplingCentering;
  volumeInterpolation: VolumeInterpolation;
  volumeBoundaryMode: VolumeBoundaryMode;
  volumeIsotropicSpacing: boolean;
  volumeTargetSpacing: [number, number, number];
  volumeNonFiniteReport: VolumeNonFiniteReport;
  volumeShowCropBox: boolean;
  volumeCropGizmoEnabled: boolean;
  volumeCropGizmoMode: "move" | "scale";
  volumeContourEnabled: boolean;
  volumeContourCount: number;
  volumeWindowMode: "auto" | "minmax";
  volumeSliceReport: VolumeSliceReport | null;
  volumeSliceHover: VolumeSliceHover | null;
  volumeShowIsosurface: boolean;
  volumeIsoValue: number;
  volumeIsoRange: { min: number; max: number; step: number };
  volumeIsoSmooth: boolean;
  volumeIsoSmoothIterations: number;
  volumeIsosurfaceLifecycle: VolumeJobLifecycle | "idle";
  onChangeVolumePresetId: (id: VolumePresetId) => void;
  onChangeVolumeDim: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeDimensionPreset: (value: 32 | 64 | 128 | 256) => void;
  onChangeVolumeCentering: (centering: VolumeSamplingCentering) => void;
  onChangeVolumeInterpolation: (interpolation: VolumeInterpolation) => void;
  onChangeVolumeBoundaryMode: (mode: VolumeBoundaryMode) => void;
  onToggleVolumeIsotropicSpacing: (enabled: boolean) => void;
  onChangeVolumeTargetSpacing: (axisIndex: 0 | 1 | 2, value: number) => void;
  onResampleVolumeToSpacing: () => void;
  onRestoreOriginalVolumeGrid: () => void;
  onChangeVolumeSamplingCenter: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeSamplingExtent: (axisIndex: 0 | 1 | 2, value: number) => void;
  onResetVolumeSampling: () => void;
  volumeProjectManaged: boolean;
  onRebuildVolumeSampling: () => void;
  onToggleVolumeCropBox: (v: boolean) => void;
  onToggleVolumeCropGizmo: (v: boolean) => void;
  onChangeVolumeCropGizmoMode: (mode: "move" | "scale") => void;
  onToggleVolumeContour: (v: boolean) => void;
  onChangeVolumeContourCount: (v: number) => void;
  onChangeVolumeWindowMode: (mode: "auto" | "minmax") => void;
  onToggleVolumeIsosurface: (v: boolean) => void;
  onChangeVolumeIsoValue: (v: number) => void;
  onToggleVolumeIsoSmooth: (v: boolean) => void;
  onChangeVolumeIsoSmoothIterations: (v: number) => void;
  onApplyVolumeIsosurface: () => void;
  onCancelVolumeIsosurface: () => void;
  onChangeVolumeParam: (id: string, value: number) => void;
  onChangeVolumeCustomExpr: (value: string) => void;
  onChangeVolumeCrosshairIndex: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeSeedAxis: (axis: SliceAxis) => void;
  onChangeVolumeSeedIndex: (value: number) => void;
  onChangeVolumeViewMode: (mode: "slices" | "3d") => void;
  onChangeVolumeLayout: (layout: "quad" | "slices" | "3d" | "xy" | "xz" | "yz") => void;
  onToggleVolumeSpatialPlane: (axis: SliceAxis, visible: boolean) => void;
  onToggleVolumeClipToCrop: (enabled: boolean) => void;
  onToggleVolumePaneFocus: (pane: "xy" | "xz" | "yz" | "3d") => void;
  onVolumeCameraCommand: (kind: "fit-volume" | "fit-mesh" | "fit-crop" | "reset") => void;
  onChangeVolumeOpacity: (value: number) => void;
  onChangeVolumeVectorPreset: (id: VectorPresetId) => void;
  onToggleVolumeStreamlines: (v: boolean) => void;
  onChangeVolumeStreamSeedGrid: (v: number) => void;
  onChangeVolumeStreamlineStepSize: (v: number) => void;
  onResetVolumeStreamlineStep: () => void;
  onChangeVolumeStreamlineMaxSteps: (v: number) => void;
  surfaceMeshLabel: string;
  surfaceMeshStats: { vertCount: number; triCount: number } | null;
  surfaceMeshBounds: BBox3 | null;
  surfaceMeshSource: SurfaceMeshSource | null;
  meshPromotionTrace: MeshPromotionTraceState | null;
  meshPromotionHasIndependentEdits: boolean;
  meshPromotionStatus: string | null;
  surfaceMeshImportBusy: boolean;
  surfaceMeshImportError: string | null;
  surfaceMeshBenchmarkBrowserOpen: boolean;
  surfaceMeshBenchmarkModels: MeshBenchmarkModel[];
  surfaceMeshBenchmarkError: string | null;
  surfaceMeshMergeVertices: boolean;
  surfaceMeshPresets: SurfaceMeshPreset[];
  surfaceMeshAssetPresets: SurfaceMeshAssetPreset[];
  surfaceMeshTopologySavedPresets: SurfaceMeshTopologySavedPreset[];
  surfaceMeshExportable: boolean;
  surfaceMeshExportBusy: boolean;
  surfaceMeshExportError: string | null;
  surfaceMeshWeldTolerance: number;
  surfaceMeshWeldBusy: boolean;
  surfaceMeshWeldError: string | null;
  surfaceMeshSubdivideIterations: number;
  surfaceMeshNormalizeDiag: number;
  surfaceMeshOpsError: string | null;
  surfaceMeshTopologyFaceIndex: number;
  surfaceMeshTopologyEdgeA: number;
  surfaceMeshTopologyEdgeB: number;
  surfaceMeshTopologyVertexIndex: number;
  surfaceMeshTopologyPickMode: SurfaceMeshTopologyPickMode;
  surfaceMeshTopologySubdivideMode: FaceSubdivideMode;
  surfaceMeshTopologySplitRatio: number;
  surfaceMeshTopologyCollapseMode: EdgeCollapseMode;
  surfaceMeshTopologyBevelAmount: number;
  surfaceMeshTopologyFieldValidation: {
    faceValid: boolean;
    faceLabel: string;
    edgeValid: boolean;
    edgeLabel: string;
    vertexValid: boolean;
    vertexLabel: string;
    effectiveEdgeA: number;
    effectiveEdgeB: number;
    edgeFallbackActive: boolean;
  };
  surfaceMeshTopologyPreview: {
    ghost: string | null;
    faceSubdivide: string | null;
    splitEdge: string | null;
    collapseEdge: string | null;
    bevelEdge: string | null;
  };
  surfaceMeshTopologyPickSummary: string | null;
  surfaceMeshTopologySelectionCleared: boolean;
  surfaceMeshTopologyStatus: string | null;
  surfaceMeshEdgeSelection: MeshEdgeSelectionResult | null;
  unifiedSelectionKindFilters: UnifiedSelectionKindFilterState;
  unifiedSelectionTopologyFilter: UnifiedSelectionTopologyFilterMode;
  unifiedSelectionFilterLabel: string;
  unifiedSelectionFilterStatus: string | null;
  meshUnifiedInspectorSelection: SelectionResult | null;
  meshMultiSelectionSet: UnifiedSelectionSet;
  meshUnifiedInspectorMaterialInfo: string | null;
  meshUnifiedInspectorCreaseInfo: string | null;
  onExportSurfaceMeshObj: () => void;
  onExportSurfaceMeshPly: () => void;
  onExportSurfaceMeshGlb: () => void;
  onChangeSurfaceMeshWeldTolerance: (v: number) => void;
  onWeldSurfaceMesh: () => void;
  onTriangulateSurfaceMesh: () => void;
  onRecomputeSurfaceMeshNormals: () => void;
  onChangeSurfaceMeshSubdivideIterations: (v: number) => void;
  onSubdivideSurfaceMesh: () => void;
  onCenterSurfaceMesh: () => void;
  onChangeSurfaceMeshNormalizeDiag: (v: number) => void;
  onNormalizeSurfaceMeshScale: () => void;
  onChangeSurfaceMeshTopologyFaceIndex: (v: number) => void;
  onChangeSurfaceMeshTopologyEdgeA: (v: number) => void;
  onChangeSurfaceMeshTopologyEdgeB: (v: number) => void;
  onChangeSurfaceMeshTopologyVertexIndex: (v: number) => void;
  onChangeSurfaceMeshTopologyPickMode: (mode: SurfaceMeshTopologyPickMode) => void;
  onToggleUnifiedSelectionKindFilter: (mode: SurfaceMeshTopologyPickMode) => void;
  onChangeUnifiedSelectionTopologyFilter: (mode: UnifiedSelectionTopologyFilterMode) => void;
  onChangeSurfaceMeshTopologySubdivideMode: (mode: FaceSubdivideMode) => void;
  onChangeSurfaceMeshTopologySplitRatio: (v: number) => void;
  onChangeSurfaceMeshTopologyCollapseMode: (mode: EdgeCollapseMode) => void;
  onChangeSurfaceMeshTopologyBevelAmount: (v: number) => void;
  surfaceMeshTopologyPreviewOperation: SurfaceMeshTopologyOperation;
  onChangeSurfaceMeshTopologyPreviewOperation: (operation: SurfaceMeshTopologyOperation) => void;
  onUseSurfaceMeshTopologyPick: () => void;
  onSurfaceMeshFaceSubdivide: () => void;
  onSurfaceMeshSplitEdge: () => void;
  onSurfaceMeshCollapseEdge: () => void;
  onSurfaceMeshBevelEdge: () => void;
  onSelectSurfaceMeshEdgeSet: (tool: MeshEdgeSelectionTool) => void;
  onApplySurfaceMeshTopologySelectedPreview: () => void;
  onClearSurfaceMeshTopologySelection: () => void;
  surfaceMeshTopologySaveName: string;
  onChangeSurfaceMeshTopologySaveName: (value: string) => void;
  onSaveSurfaceMeshTopologyEditedPreset: () => void;
  implicitBakeResolution: number;
  implicitBakeBounds: ImplicitBakeBounds;
  implicitBakeBusy: boolean;
  implicitBakePhase: "idle" | "sampling" | "marching";
  implicitBakeProgress: number;
  implicitBakeError: string | null;
  implicitBakeCacheHit: boolean;
  onChangeImplicitBakeResolution: (v: number) => void;
  onChangeImplicitBakeBounds: (d: ImplicitBakeBounds) => void;
  onBakeImplicit: () => void;
  onUseImplicitBakeDomain: () => void;
  onResetImplicitBakeBounds: () => void;
  onToggleSurfaceMeshMergeVertices: (v: boolean) => void;
  onToggleSurfaceMeshBenchmarkBrowser: (open: boolean) => void;
  onGenerateSurfaceMeshPreset: (id: string) => void;
  onGenerateSurfaceMeshAssetPreset: (id: string) => void;
  onLoadSurfaceMeshBenchmarkModel: (id: string) => void;
  onApplySurfaceMeshTopologyDemoPreset: (id: string) => void;
  onApplySurfaceMeshTopologySavedPreset: (id: string) => void;
  onRunSurfaceMeshTopologyDemoPreset: (id: string) => void;
  onRunSurfaceMeshTopologyFullRoundTripDemoPreset: (id: string) => void;
  onLoadSurfaceMeshFile: (files: FileList | File[] | null) => void;
  onConvertToMesh: () => void;
  onConvertToMeshObject: () => void;
  onOpenMeshPromotionSourceGeometryObject: () => void;
  onOpenPromotedMeshObject: () => void;
  onCompareMeshPromotionWithSource: () => void;
  onRefreshMeshPromotionFromSource: () => void;
  onToggleMeshPromotionFreeze: () => void;
  onToggleVolumeDistanceSigned: (v: boolean) => void;
  onToggleVolumeDistanceAutoBounds: (v: boolean) => void;
  meshLastOperation: MeshOperationResultSummary | null;
  meshOperationLastValidation: MeshOperationLastValidation | null;
  meshOperationAvailable: boolean;
  pythonWorkerAvailable: boolean;
  pythonWorkerStatusMessage: string | null;
  pythonWorkerLogPath: string | null;
  meshOperationBusy: boolean;
  meshOperationError: string | null;
  meshOperationCleanComputeNormals: boolean;
  onChangeMeshOperationCleanComputeNormals: (v: boolean) => void;
  onMeshOperationValidate: () => void | Promise<void>;
  meshOperationRepairOrientFaces: boolean;
  onChangeMeshOperationRepairOrientFaces: (v: boolean) => void;
  meshOperationRepairRemoveDegenerateFaces: boolean;
  onChangeMeshOperationRepairRemoveDegenerateFaces: (v: boolean) => void;
  meshOperationRepairRemoveDuplicateFaces: boolean;
  onChangeMeshOperationRepairRemoveDuplicateFaces: (v: boolean) => void;
  meshOperationRepairCompactVertices: boolean;
  onChangeMeshOperationRepairCompactVertices: (v: boolean) => void;
  meshOperationRepairFillSmallHoles: boolean;
  onChangeMeshOperationRepairFillSmallHoles: (v: boolean) => void;
  meshOperationRepairMaxHoleEdges: number;
  onChangeMeshOperationRepairMaxHoleEdges: (v: number) => void;
  onMeshOperationRepair: () => void | Promise<void>;
  onMeshOperationRepairValidate: () => void | Promise<void>;
  meshOperationRemeshTargetEdgeLength: number;
  onChangeMeshOperationRemeshTargetEdgeLength: (v: number) => void;
  meshOperationRemeshIterations: number;
  onChangeMeshOperationRemeshIterations: (v: number) => void;
  meshOperationRemeshPreserveSharpEdges: boolean;
  onChangeMeshOperationRemeshPreserveSharpEdges: (v: boolean) => void;
  onMeshOperationRemesh: () => void | Promise<void>;
  meshOperationDecimateReduction: number;
  onChangeMeshOperationDecimateReduction: (v: number) => void;
  meshOperationDecimateTargetFaces: number;
  onChangeMeshOperationDecimateTargetFaces: (v: number) => void;
  meshOperationUseTargetFaces: boolean;
  onToggleMeshOperationUseTargetFaces: (v: boolean) => void;
  meshOperationSmoothIterations: number;
  onChangeMeshOperationSmoothIterations: (v: number) => void;
  meshOperationSmoothPassband: number;
  onChangeMeshOperationSmoothPassband: (v: number) => void;
  onMeshOperationCleanNormals: () => void;
  onMeshOperationDecimate: () => void;
  onMeshOperationSmooth: () => void;
  meshOperationBooleanOperation: MeshBooleanOperation;
  onChangeMeshOperationBooleanOperation: (op: MeshBooleanOperation) => void;
  meshOperationBooleanStrategy: MeshBooleanStrategy;
  onChangeMeshOperationBooleanStrategy: (strategy: MeshBooleanStrategy) => void;
  meshOperationBooleanOperandObjectId: string | null;
  onChangeMeshOperationBooleanOperandObjectId: (id: string | null) => void;
  meshOperationBooleanOperandOptions: Array<{ id: string; name: string }>;
  meshOperationBooleanCurveRadius: number;
  onChangeMeshOperationBooleanCurveRadius: (v: number) => void;
  meshOperationBooleanStatus: string | null;
  onRunMeshOperationBoolean: () => void | Promise<void>;
  onPrepareMeshOperationBooleanDemo: () => void;
  onSwapMeshOperationBooleanOperands: () => void;
  meshOperationOutputMode: "replace" | "derived";
  onChangeMeshOperationOutputMode: (mode: "replace" | "derived") => void;
  generateSurfaceStatus: GenerateSurfaceStatus;
  meshOperationPreviewBusy: boolean;
  meshOperationPreviewError: string | null;
  meshOperationPreviewTargetFaces: number;
  meshOperationPreviewUseDecimate: boolean;
  onChangeMeshOperationPreviewTargetFaces: (v: number) => void;
  onChangeMeshOperationPreviewUseDecimate: (v: boolean) => void;
  onRunMeshOperationPreview: () => void;
  onOpenImplicitSpherePreset: () => void;
  cgalHealthState: CgalHealthState | null;
  cgalBusy: boolean;
  cgalError: string | null;
  cgalTargetEdge: number;
  onChangeCgalTargetEdge: (v: number) => void;
  cgalAutoTargetEdge: boolean;
  onChangeCgalAutoTargetEdge: (v: boolean) => void;
  cgalPadFrac: number;
  onChangeCgalPadFrac: (v: number) => void;
  cgalTriBudgetEnabled: boolean;
  onChangeCgalTriBudgetEnabled: (v: boolean) => void;
  cgalTriBudget: number;
  onChangeCgalTriBudget: (v: number) => void;
  cgalAutoEdge: number;
  cgalTriBudgetEdge: number;
  cgalRadiusBound: number;
  onChangeCgalRadiusBound: (v: number) => void;
  cgalMinTrisEnabled: boolean;
  onChangeCgalMinTrisEnabled: (v: boolean) => void;
  cgalMinTris: number;
  onChangeCgalMinTris: (v: number) => void;
  cgalDomainDiag: number;
  cgalEffectiveEdge: number;
  cgalEstimatedTris: number;
  cgalTooHeavy: boolean;
  cgalVerbose: boolean;
  onChangeCgalVerbose: (v: boolean) => void;
  cgalPreflightSamples: number;
  onChangeCgalPreflightSamples: (v: number) => void;
  onRunCgalMesh: () => void;
  onUseMeshOperationResultAsBooleanA: () => void | Promise<void>;
  onUseMeshOperationResultAsBooleanB: () => void | Promise<void>;
  onStopCgalWorker: () => void;
  cgalMeshInfo: { vertexCount: number; triCount: number } | null;
  meshOperationFocusedOperation: MeshOperationUiId | null;
  meshOperationFocusedOperationToken: number;
  meshOperationHistory: MeshOperationHistoryEntry[];
  meshOperationSavedPresets: MeshOperationSavedPresetSummary[];
  onRestoreMeshOperationHistoryEntry: (entryId: string) => void;
  onUndoLatestMeshOperation: () => void;
  canUndoLatestMeshOperation: boolean;
  onApplyMeshOperationPreset: (presetId: MeshOperationPresetId) => void | Promise<void>;
  onApplyMeshOperationSavedPreset: (presetId: string) => void | Promise<void>;
  onSaveMeshOperationPreset: () => void;
  canSaveMeshOperationPreset: boolean;

  graphExpr: string;
  implicitExpr: string;
  onChangeGraphExpr: (s: string) => void;
  onChangeImplicitExpr: (s: string) => void;
  canEditGraphAsCustom: boolean;
  onEditGraphAsCustom: () => void;
  canEditImplicitAsCustom: boolean;
  onEditImplicitAsCustom: () => void;

  paramXExpr: string;
  paramYExpr: string;
  paramZExpr: string;
  bezierControlGridText: string;
  bSplineControlGridText: string;
  bSplineDegreeU: number;
  bSplineDegreeV: number;
  bSplineKnotUText: string;
  bSplineKnotVText: string;
  nurbsControlGridText: string;
  nurbsDegreeU: number;
  nurbsDegreeV: number;
  nurbsKnotUText: string;
  nurbsKnotVText: string;
  nurbsWeightsText: string;
  rotationalProfileMode: RotationalProfileMode;
  rotationalProfileRExpr: string;
  rotationalProfileZExpr: string;
  rotationalProfilePointsText: string;
  rotationalAxisOrigin: Vec3;
  rotationalAxisDirection: Vec3;
  rmfRibbonTwistEnabled: boolean;
  rmfRibbonTwistTurns: number;
  complexMapSpec: ComplexMapSweepSpec;
  complexMapPresetId: string;
  complexMapError: string | null;
  complexMapLive: boolean;
  onToggleComplexMapLive: (v: boolean) => void;
  complexMapLine: ComplexMapLine;
  complexMapZExtent: number;
  complexMapWExtent: number;
  complexMapLineWPolylines: [number, number][][] | null;
  complexMapIsolineWPolylinesU: [number, number][][] | null;
  complexMapIsolineWPolylinesV: [number, number][][] | null;
  complexMapIsolineZLinesU: [number, number][][] | null;
  complexMapIsolineZLinesV: [number, number][][] | null;
  complexMapGridThickness: number;
  complexMapGridOpacity: number;
  complexMapGridShowSurface: boolean;
  complexMapMarkerData: ComplexMapMarkerData | null;
  complexMapShowCritical: boolean;
  complexMapShowZeros: boolean;
  complexMapShowPoles: boolean;
  complexMapMarkersZ: boolean;
  complexMapMarkersW: boolean;
  complexMapMarkers3d: boolean;
  complexMapMarkerMax: number;
  complexMapCriticalRel: number;
  complexMapZeroRel: number;
  complexMapPoleRel: number;
  setComplexMapShowCritical: (v: boolean) => void;
  setComplexMapShowZeros: (v: boolean) => void;
  setComplexMapShowPoles: (v: boolean) => void;
  setComplexMapMarkersZ: (v: boolean) => void;
  setComplexMapMarkersW: (v: boolean) => void;
  setComplexMapMarkers3d: (v: boolean) => void;
  setComplexMapMarkerMax: (v: number) => void;
  setComplexMapCriticalRel: (v: number) => void;
  setComplexMapZeroRel: (v: number) => void;
  setComplexMapPoleRel: (v: number) => void;
  complexPreimageMode: ComplexPreimageMode;
  complexPreimageValue: number;
  complexPreimageSnap: boolean;
  complexPreimagePolylines: [number, number][][] | null;
  complexPreimageWShape: [number, number][][] | null;
  setComplexPreimageMode: (m: ComplexPreimageMode) => void;
  setComplexPreimageValue: (v: number) => void;
  setComplexPreimageSnap: (v: boolean) => void;
  complexDistortionMode: ComplexDistortionMode;
  complexDistortionShowZ: boolean;
  complexDistortionShowSurface: boolean;
  complexDistortionScale: "linear" | "log";
  complexMapGridData: ComplexMapGridPanelData | null;
  complexMapDistortionField: ComplexMapDistortionField | null;
  complexMapDistortionProbe: ComplexMapDistortionProbe | null;
  complexMapProbe: ComplexMapProbe | null;
  complexMapProbePins: ComplexMapProbePin[];
  setComplexDistortionMode: (m: ComplexDistortionMode) => void;
  setComplexDistortionShowZ: (v: boolean) => void;
  setComplexDistortionShowSurface: (v: boolean) => void;
  setComplexDistortionScale: (v: "linear" | "log") => void;
  setComplexMapGridThickness: (v: number) => void;
  setComplexMapGridOpacity: (v: number) => void;
  setComplexMapGridShowSurface: (v: boolean) => void;
  complexMapShowSphere: boolean;
  onToggleComplexMapShowSphere: (v: boolean) => void;
  complexMapSphereStacked: boolean;
  onToggleComplexMapSphereStacked: (v: boolean) => void;
  complexMapSphereLines: RiemannSphereLine[] | null;
  complexMapSpherePoints: RiemannSpherePoint[] | null;
  complexMapSphereGuides: RiemannSphereGuide[] | null;
  onPinComplexMapProbe: () => void;
  onClearComplexMapProbe: () => void;
  onClearComplexMapProbePins: () => void;
  onRecallComplexMapProbe: (pin: ComplexMapProbePin) => void;
  onRemoveComplexMapProbePin: (id: string) => void;
  wPlaneDomainColor: boolean;
  wPlaneShowRings: boolean;
  wPlaneShowRays: boolean;
  onChangeWPlaneDomainColor: (v: boolean) => void;
  onChangeWPlaneShowRings: (v: boolean) => void;
  onChangeWPlaneShowRays: (v: boolean) => void;
  onChangeParamXExpr: (s: string) => void;
  onChangeParamYExpr: (s: string) => void;
  onChangeParamZExpr: (s: string) => void;
  canEditParamAsCustom: boolean;
  onEditParamAsCustom: () => void;
  onChangeBezierControlGridText: (s: string) => void;
  onChangeBSplineControlGridText: (s: string) => void;
  onChangeBSplineDegreeU: (n: number) => void;
  onChangeBSplineDegreeV: (n: number) => void;
  onChangeBSplineKnotUText: (s: string) => void;
  onChangeBSplineKnotVText: (s: string) => void;
  onChangeNurbsControlGridText: (s: string) => void;
  onChangeNurbsDegreeU: (n: number) => void;
  onChangeNurbsDegreeV: (n: number) => void;
  onChangeNurbsKnotUText: (s: string) => void;
  onChangeNurbsKnotVText: (s: string) => void;
  onChangeNurbsWeightsText: (s: string) => void;
  onChangeRotationalProfileMode: (mode: RotationalProfileMode) => void;
  onChangeRotationalProfileRExpr: (s: string) => void;
  onChangeRotationalProfileZExpr: (s: string) => void;
  onChangeRotationalProfilePointsText: (s: string) => void;
  onChangeRotationalAxisOrigin: (v: Vec3) => void;
  onChangeRotationalAxisDirection: (v: Vec3) => void;
  onChangeRmfRibbonTwistEnabled: (v: boolean) => void;
  onChangeRmfRibbonTwistTurns: (v: number) => void;
  onChangeComplexMapSpec: (patch: Partial<ComplexMapSweepSpec>) => void;
  onChangeComplexMapPreset: (id: string) => void;
  onBuildComplexMapSweep: () => void;
  onPickComplexMapLine: (line: ComplexMapLine) => void;
  onSetComplexMapProbeFromUV: (u: number, v: number, source: ComplexMapProbe["source"]) => void;
  onSetComplexMapProbeFromW: (pt: { re: number; im: number }) => void;
  weierstrassGExpr: string;
  weierstrassPhiExpr: string;
  onChangeWeierstrassGExpr: (s: string) => void;
  onChangeWeierstrassPhiExpr: (s: string) => void;
  weierstrassDomain: ParamDomain;
  onChangeWeierstrassDomain: (d: ParamDomain) => void;
  weierstrassResolution: number;
  onChangeWeierstrassResolution: (v: number) => void;
  weierstrassRecenter: boolean;
  onToggleWeierstrassRecenter: () => void;
  onResetWeierstrass: () => void;
  weierstrassError: string | null;

  showWireframe: boolean;
  onToggleWireframe: () => void;
  showChartGrid: boolean;
  onToggleChartGrid: () => void;
  chartGridDensity: number;
  onChangeChartGridDensity: (value: number) => void;
  chartMode: ChartMode;
  onChangeChartMode: (mode: ChartMode) => void;
  chartCoordinateReadoutEnabled: boolean;
  onToggleChartCoordinateReadout: () => void;
  chartCoordinateReadout: SurfaceQueryChartCoord | null;
  showPlanes: boolean;
  onTogglePlanes: () => void;
  lightPreset: "studio" | "soft" | "contrast" | "neutral" | "warm";
  onChangeLightPreset: (p: "studio" | "soft" | "contrast" | "neutral" | "warm") => void;
  materialRoughness: number;
  onSetMaterialRoughness: (v: number) => void;
  materialMetalness: number;
  onSetMaterialMetalness: (v: number) => void;
  materialOpacity: number;
  onSetMaterialOpacity: (v: number) => void;
  graphResolution: number;
  onSetGraphResolution: (v: number) => void;
  implicitResolution: number;
  onSetImplicitResolution: (v: number) => void;
  paramResolution: number;
  onSetParamResolution: (v: number) => void;

  colorMode: ColorMode;
  onChangeColorMode: (m: ColorMode) => void;
  colorPalette: ColorPalette;
  onChangeColorPalette: (p: ColorPalette) => void;
  implicitOverlay: "none" | "normals" | "curvature";
  onChangeImplicitOverlay: (m: "none" | "normals" | "curvature") => void;

  probeEnabled: boolean;
  onToggleProbe: () => void;
  showProbeNormal: boolean;
  onToggleProbeNormal: () => void;
  showProbeTangentPlane: boolean;
  onToggleProbeTangentPlane: () => void;
  showProbeTangents: boolean;
  onToggleProbeTangents: () => void;
  showPrincipalDirections: boolean;
  onTogglePrincipalDirections: () => void;
  showPrincipalNormalPlanes: boolean;
  onTogglePrincipalNormalPlanes: () => void;
  showPrincipalLines: boolean;
  onTogglePrincipalLines: () => void;
  showPrincipalGlyphs: boolean;
  onTogglePrincipalGlyphs: () => void;
  principalGlyphDensity: number;
  onChangePrincipalGlyphDensity: (value: number) => void;
  principalGlyphLength: number;
  onChangePrincipalGlyphLength: (value: number) => void;
  principalGlyphMode: "both" | "d1";
  onChangePrincipalGlyphMode: (mode: "both" | "d1") => void;
  calculusScalarOptions: Array<{ value: string; label: string }>;
  calculusScalarSource: string;
  onChangeCalculusScalarSource: (value: string) => void;
  calculusCustomScalarExpr: string;
  onChangeCalculusCustomScalarExpr: (value: string) => void;
  calculusCustomVectorExpr: string;
  onChangeCalculusCustomVectorExpr: (value: string) => void;
  calculusVectorOptions: Array<{ value: string; label: string }>;
  calculusVectorSource: string;
  onChangeCalculusVectorSource: (value: string) => void;
  calculusActiveVectorField: string;
  onChangeCalculusActiveVectorField: (value: string) => void;
  calculusVectorOverlayEnabled: boolean;
  onToggleCalculusVectorOverlay: () => void;
  calculusVectorDensity: number;
  onChangeCalculusVectorDensity: (value: number) => void;
  calculusVectorScale: number;
  onChangeCalculusVectorScale: (value: number) => void;
  calculusHeatmapEnabled: boolean;
  onClearCalculusHeatmap: () => void;
  onRunCalculusGradient: () => void;
  onRunCalculusLaplacian: () => void;
  onRunCalculusDivergence: () => void;
  onRunCalculusCurl: () => void;
  calculusStatus: string | null;
  calculusError: string | null;
  showCurvatureLines: boolean;
  onToggleCurvatureLines: () => void;
  surfaceFeatureResult: SurfaceFeatureExtractionResult | null;
  surfaceFeatureClass: SurfaceFeatureClass;
  onChangeSurfaceFeatureClass: (featureClass: SurfaceFeatureClass) => void;
  surfaceFeatureOverlayVisible: boolean;
  onToggleSurfaceFeatureOverlay: () => void;
  surfaceFeatureShowEdges: boolean;
  onToggleSurfaceFeatureEdges: () => void;
  surfaceFeatureCurvatureThreshold: number;
  onChangeSurfaceFeatureCurvatureThreshold: (value: number) => void;
  surfaceFeatureGaussianTolerance: number;
  onChangeSurfaceFeatureGaussianTolerance: (value: number) => void;
  surfaceFeatureUmbilicTolerance: number;
  onChangeSurfaceFeatureUmbilicTolerance: (value: number) => void;
  surfaceFeatureUncertaintyBand: number;
  onChangeSurfaceFeatureUncertaintyBand: (value: number) => void;
  surfaceFeatureSharpAngle: number;
  onChangeSurfaceFeatureSharpAngle: (value: number) => void;
  surfaceFeatureCacheHit: boolean;
  surfaceFeatureComputeTimeMs: number | null;
  surfaceFeatureSelectionAvailable: boolean;
  onSelectSurfaceFeatureMembers: () => void;
  curvatureLineField: "d1" | "d2";
  onChangeCurvatureLineField: (field: "d1" | "d2") => void;
  curvatureSeedSource: "global" | "selection";
  onChangeCurvatureSeedSource: (source: "global" | "selection") => void;
  curvatureSeedDensity: number;
  onChangeCurvatureSeedDensity: (value: number) => void;
  curvatureStepSize: number;
  onChangeCurvatureStepSize: (value: number) => void;
  curvatureMaxSteps: number;
  onChangeCurvatureMaxSteps: (value: number) => void;
  curvatureMaxLines: number;
  onChangeCurvatureMaxLines: (value: number) => void;
  onRebuildCurvatureLines: () => void;
  showRidges: boolean;
  onToggleRidges: () => void;
  showValleys: boolean;
  onToggleValleys: () => void;
  ridgeValleySelectionOnly: boolean;
  onToggleRidgeValleySelectionOnly: () => void;
  ridgeValleyMagMin: number;
  onChangeRidgeValleyMagMin: (value: number) => void;
  ridgeValleyContrast: number;
  onChangeRidgeValleyContrast: (value: number) => void;
  ridgeValleyMinCos: number;
  onChangeRidgeValleyMinCos: (value: number) => void;
  ridgeValleySegmentScale: number;
  onChangeRidgeValleySegmentScale: (value: number) => void;
  ridgeValleySampleMode: "high" | "medium" | "low";
  onChangeRidgeValleySampleMode: (value: "high" | "medium" | "low") => void;
  ridgeValleyStitch: boolean;
  onToggleRidgeValleyStitch: () => void;
  ridgeValleyDecimate: number;
  onChangeRidgeValleyDecimate: (value: number) => void;
  ridgeValleyMaxCurves: number;
  onChangeRidgeValleyMaxCurves: (value: number) => void;
  ridgeValleyMinConf: number;
  onChangeRidgeValleyMinConf: (value: number) => void;
  showBoundingBox: boolean;
  onToggleBoundingBox: () => void;
  weierstrassDiagnostics: WeierstrassDriftResult | null;
  weierstrassPathDisagreement: { avg: number; max: number } | null;
  weierstrassDiagnosticError: string | null;
  showDriftArrow: boolean;
  onToggleDriftArrow: () => void;
  onRecomputeDiagnostics: () => void;
  showGaussMap: boolean;
  gaussColorMode: GaussColorMode;
  onChangeGaussColorMode: (mode: GaussColorMode) => void;
  gaussPointsCount: number;
  onResetCamera: () => void;

  probeInfo: ProbeInfo | null;
  probeCurv: CurvatureData | null;
  paramProbeCurv: PrincipalCurvatureScalars | null;
  selectRegionEnabled: boolean;
  onToggleSelectRegion: () => void;
  selectionMode: "euclidean" | "geodesic";
  onChangeSelectionMode: (mode: "euclidean" | "geodesic") => void;
  selectionRadius: number;
  onSetSelectionRadius: (value: number) => void;
  selectionUseUV: boolean;
  selectionHasUV: boolean;
  onToggleSelectionUseUV: () => void;
  zoomToRegion: boolean;
  onToggleZoomToRegion: () => void;
  onZoomNow: () => void;
  onClearSelection: () => void;
  selectionMaskCount: number;
  selectionOverlayVisible: boolean;
  onToggleSelectionOverlayVisible: () => void;
  selectionOverlayOnTop: boolean;
  onToggleSelectionOverlayOnTop: () => void;
  selectionSphereVisible: boolean;
  onToggleSelectionSphereVisible: () => void;
  geodesicPathEnabled: boolean;
  onToggleGeodesicPathEnabled: () => void;
  onClearGeodesicPath: () => void;
  geodesicPathMethod: GeodesicPathMethod;
  onChangeGeodesicPathMethod: (method: GeodesicPathMethod) => void;
  geodesicPathSourceMode: GeodesicPathSourceMode;
  onChangeGeodesicPathSourceMode: (mode: GeodesicPathSourceMode) => void;
  geodesicPathBusy: boolean;
  geodesicPathStart: GeodesicPathEndpoint | null;
  geodesicPathEnd: GeodesicPathEndpoint | null;
  geodesicPathLength: number | null;
  geodesicPathMessage: string | null;
  geodesicPathConstrain: boolean;
  onToggleGeodesicPathConstrain: () => void;
  geodesicPathSmooth: boolean;
  onToggleGeodesicPathSmooth: () => void;
  geodesicPathDebug: boolean;
  geodesicPathDebugInfo: string | null;
  onToggleGeodesicPathDebug: () => void;
  geodesicHeatEnabled: boolean;
  geodesicHeatAvailable: boolean;
  geodesicHeatBusy: boolean;
  geodesicHeatStart: GeodesicHeatEndpoint | null;
  geodesicHeatEnd: GeodesicHeatEndpoint | null;
  geodesicHeatLength: number | null;
  geodesicHeatMessage: string | null;
  geodesicHeatShowHeatmap: boolean;
  geodesicHeatUseContinuous: boolean;
  geodesicHeatUnavailableReason: string;
  geodesicHeatHeatmapAllowed: boolean;
  geodesicHeatHeatmapReason: string;
  onToggleGeodesicHeatEnabled: () => void;
  onToggleGeodesicHeatShowHeatmap: () => void;
  onToggleGeodesicHeatUseContinuous: () => void;
  onRunGeodesicHeat: () => void;
  onClearGeodesicHeat: () => void;
  geodesicDiskEnabled: boolean;
  geodesicDiskAvailable: boolean;
  geodesicDiskBusy: boolean;
  geodesicDiskPickMode: boolean;
  geodesicDiskCenter: GeodesicDiskCenter | null;
  geodesicDiskRadius: number;
  geodesicDiskAutoUpdate: boolean;
  geodesicDiskShowBoundary: boolean;
  geodesicDiskMethod: "heat" | "dijkstra";
  geodesicDiskUnavailableReason: string;
  geodesicDiskMessage: string | null;
  geodesicDiskStats: { area: number; perimeter: number; vertexCount: number; triangleCount: number; phi: { min: number; max: number; mean: number } } | null;
  geodesicDiskSelectionStats: SelectionStats;
  onToggleGeodesicDiskEnabled: () => void;
  onPickGeodesicDiskCenter: () => void;
  onChangeGeodesicDiskRadius: (value: number) => void;
  onApplyGeodesicDiskRadius: () => void;
  onToggleGeodesicDiskAutoUpdate: () => void;
  onToggleGeodesicDiskShowBoundary: () => void;
  onChangeGeodesicDiskMethod: (method: "heat" | "dijkstra") => void;
  onRecomputeGeodesicDisk: () => void;
  onClearGeodesicDisk: () => void;
  inspectEnabled: boolean;
  onToggleInspectEnabled: () => void;
  onClearInspect: () => void;
  inspectIdx: number | null;
  inspectPos: { x: number; y: number; z: number } | null;
  inspectNormal: { x: number; y: number; z: number } | null;
  inspectMetrics: SurfaceInspectMetrics | null;

  // contours (graph surfaces)
  showContours: boolean;
  onToggleContours: () => void;
  contourCount: number;
  onSetContourCount: (n: number) => void;

  commandInput: string;
  onChangeCommandInput: (v: string) => void;
  onRunCommand: (cmd: string) => void;
  commandHistory: { cmd: string; out: string }[];
  selectionStats: SelectionStats;
  availableSelectionMetrics: SelectionMetricKey[];
  selectedMetric: SelectionMetricKey;
  onChangeSelectedMetric: (metric: SelectionMetricKey) => void;
  onRefreshSelectionStats: () => void;
  meshQualityReport: MeshQualityReport | null;
  meshQualityError: string | null;
  meshQualityBusy: boolean;
  meshQualityProgress: number;
  meshQualityPhase: MeshQualityReportPhase | "idle";
  meshQualityCacheHit: boolean;
  meshQualityHighAspectThreshold: number;
  onChangeMeshQualityHighAspectThreshold: (value: number) => void;
  meshQualityMaxListedDefects: number;
  onChangeMeshQualityMaxListedDefects: (value: number) => void;
  meshQualityShowDegenerateFaces: boolean;
  onToggleMeshQualityShowDegenerateFaces: () => void;
  meshQualityShowHighAspectFaces: boolean;
  onToggleMeshQualityShowHighAspectFaces: () => void;
  meshQualityShowNonManifoldEdges: boolean;
  onToggleMeshQualityShowNonManifoldEdges: () => void;
  onCancelMeshQualityCompute: () => void;
  meshQualityExportStatus: string | null;
  onExportMeshQualityReportJson: () => void;
  onExportMeshQualityReportCsv: () => void;
  onChangeAnalysisFocusedSection?: (section: AnalysisFocusedSection) => void;

};

export type DifferentialGeometryAnalysisMode = "auto" | "fast-preview" | "robust-mesh" | "analytic";

export type DifferentialGeometryPrecheckMode = "run" | "auto";

export type DifferentialGeometrySmoothing = "none" | "light" | "medium";

export type DifferentialGeometryBinaryToggle = "off" | "on";

export type ComplexMapGridPanelData = {
  nu: number;
  nv: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  re: Float32Array;
  im: Float32Array;
  wMag: Float32Array;
  valid: Uint8Array;
};

export const SurfacesLeftPanel: React.FC<SurfacesLeftPanelProps> = ({
  showInternalTabs = true,
  hideViewControls = false,
  initialLeftTab,
  viewerKind,
  surfaceId,
  paramId,
  datasetKind,
  volumeDatasetOverride,
  volumeDistanceBusy,
  volumeDistanceError,
  volumeDistanceSigned,
  volumeDistanceAutoBounds,
  onBuildDistanceVolume,
  onClearVolumeOverride,
  volumePresetId,
  volumePreset,
  volumeDims,
  volumeParams,
  volumeCustomExpr,
  volumeCustomError,
  volumeSeedAxis,
  volumeSeedIndex,
  volumeSeedIndexMax,
  volumeCrosshairWorld,
  volumeCrosshairIndex,
  volumeCrosshairValue,
  volumeCrosshairGradMag,
  volumeViewMode,
  volumeLayout,
  volumeFocusedPane,
  volumeSpatialPlaneVisibility,
  volumeClipToCrop,
  volumeOpacity,
  volumeVectorPresetId,
  volumeVectorPresetLabel,
  volumeShowStreamlines,
  volumeStreamSeedGrid,
  volumeStreamlineStepSize,
  volumeStreamlineStepRange,
  volumeStreamlineMaxSteps,
  volumeStreamlineMaxLength,
  volumeSampling,
  volumeSamplingSpacing,
  volumeAllocationPlan,
  volumeSamplingDirty,
  volumeSamplingStatus,
  volumeCentering,
  volumeInterpolation,
  volumeBoundaryMode,
  volumeIsotropicSpacing,
  volumeTargetSpacing,
  volumeNonFiniteReport,
  volumeShowCropBox,
  volumeCropGizmoEnabled,
  volumeCropGizmoMode,
  volumeContourEnabled,
  volumeContourCount,
  volumeWindowMode,
  volumeSliceReport,
  volumeSliceHover,
  volumeShowIsosurface,
  volumeIsoValue,
  volumeIsoRange,
  volumeIsoSmooth,
  volumeIsoSmoothIterations,
  volumeIsosurfaceLifecycle,
  onChangeVolumePresetId,
  onChangeVolumeDim,
  onChangeVolumeDimensionPreset,
  onChangeVolumeCentering,
  onChangeVolumeInterpolation,
  onChangeVolumeBoundaryMode,
  onToggleVolumeIsotropicSpacing,
  onChangeVolumeTargetSpacing,
  onResampleVolumeToSpacing,
  onRestoreOriginalVolumeGrid,
  onChangeVolumeSamplingCenter,
  onChangeVolumeSamplingExtent,
  onResetVolumeSampling,
  volumeProjectManaged,
  onRebuildVolumeSampling,
  onToggleVolumeCropBox,
  onToggleVolumeCropGizmo,
  onChangeVolumeCropGizmoMode,
  onToggleVolumeContour,
  onChangeVolumeContourCount,
  onChangeVolumeWindowMode,
  onToggleVolumeIsosurface,
  onChangeVolumeIsoValue,
  onToggleVolumeIsoSmooth,
  onChangeVolumeIsoSmoothIterations,
  onApplyVolumeIsosurface,
  onCancelVolumeIsosurface,
  onChangeVolumeParam,
  onChangeVolumeCustomExpr,
  onChangeVolumeCrosshairIndex,
  onChangeVolumeSeedAxis,
  onChangeVolumeSeedIndex,
  onChangeVolumeViewMode,
  onChangeVolumeLayout,
  onToggleVolumeSpatialPlane,
  onToggleVolumeClipToCrop,
  onToggleVolumePaneFocus,
  onVolumeCameraCommand,
  onChangeVolumeOpacity,
  onChangeVolumeVectorPreset,
  onToggleVolumeStreamlines,
  onChangeVolumeStreamSeedGrid,
  onChangeVolumeStreamlineStepSize,
  onResetVolumeStreamlineStep,
  onChangeVolumeStreamlineMaxSteps,
  surfaceMeshLabel,
  surfaceMeshStats,
  surfaceMeshBounds,
  surfaceMeshSource,
  meshPromotionTrace,
  meshPromotionHasIndependentEdits,
  meshPromotionStatus,
  surfaceMeshImportBusy,
  surfaceMeshImportError,
  surfaceMeshBenchmarkBrowserOpen,
  surfaceMeshBenchmarkModels,
  surfaceMeshBenchmarkError,
  surfaceMeshMergeVertices,
  surfaceMeshPresets,
  surfaceMeshAssetPresets,
  surfaceMeshTopologySavedPresets,
  surfaceMeshExportable,
  surfaceMeshExportBusy,
  surfaceMeshExportError,
  surfaceMeshWeldTolerance,
  surfaceMeshWeldBusy,
  surfaceMeshWeldError,
  surfaceMeshSubdivideIterations,
  surfaceMeshNormalizeDiag,
  surfaceMeshOpsError,
  surfaceMeshTopologyFaceIndex,
  surfaceMeshTopologyEdgeA,
  surfaceMeshTopologyEdgeB,
  surfaceMeshTopologyVertexIndex,
  surfaceMeshTopologyPickMode,
  surfaceMeshTopologySubdivideMode,
  surfaceMeshTopologySplitRatio,
  surfaceMeshTopologyCollapseMode,
  surfaceMeshTopologyBevelAmount,
  surfaceMeshTopologyFieldValidation,
  surfaceMeshTopologyPreview,
  surfaceMeshTopologyPickSummary,
  surfaceMeshTopologySelectionCleared,
  surfaceMeshTopologyStatus,
  surfaceMeshEdgeSelection,
  unifiedSelectionKindFilters,
  unifiedSelectionTopologyFilter,
  unifiedSelectionFilterLabel,
  unifiedSelectionFilterStatus,
  meshUnifiedInspectorSelection,
  meshMultiSelectionSet,
  meshUnifiedInspectorMaterialInfo,
  meshUnifiedInspectorCreaseInfo,
  onExportSurfaceMeshObj,
  onExportSurfaceMeshPly,
  onExportSurfaceMeshGlb,
  onChangeSurfaceMeshWeldTolerance,
  onWeldSurfaceMesh,
  onTriangulateSurfaceMesh,
  onRecomputeSurfaceMeshNormals,
  onChangeSurfaceMeshSubdivideIterations,
  onSubdivideSurfaceMesh,
  onCenterSurfaceMesh,
  onChangeSurfaceMeshNormalizeDiag,
  onNormalizeSurfaceMeshScale,
  onChangeSurfaceMeshTopologyFaceIndex,
  onChangeSurfaceMeshTopologyEdgeA,
  onChangeSurfaceMeshTopologyEdgeB,
  onChangeSurfaceMeshTopologyVertexIndex,
  onChangeSurfaceMeshTopologyPickMode,
  onToggleUnifiedSelectionKindFilter,
  onChangeUnifiedSelectionTopologyFilter,
  onChangeSurfaceMeshTopologySubdivideMode,
  onChangeSurfaceMeshTopologySplitRatio,
  onChangeSurfaceMeshTopologyCollapseMode,
  onChangeSurfaceMeshTopologyBevelAmount,
  surfaceMeshTopologyPreviewOperation,
  onChangeSurfaceMeshTopologyPreviewOperation,
  onUseSurfaceMeshTopologyPick,
  onSurfaceMeshFaceSubdivide,
  onSurfaceMeshSplitEdge,
  onSurfaceMeshCollapseEdge,
  onSurfaceMeshBevelEdge,
  onSelectSurfaceMeshEdgeSet,
  onApplySurfaceMeshTopologySelectedPreview,
  onClearSurfaceMeshTopologySelection,
  surfaceMeshTopologySaveName,
  onChangeSurfaceMeshTopologySaveName,
  onSaveSurfaceMeshTopologyEditedPreset,
  implicitBakeResolution,
  implicitBakeBounds,
  implicitBakeBusy,
  implicitBakePhase,
  implicitBakeProgress,
  implicitBakeError,
  implicitBakeCacheHit,
  onChangeImplicitBakeResolution,
  onChangeImplicitBakeBounds,
  onBakeImplicit,
  onUseImplicitBakeDomain,
  onResetImplicitBakeBounds,
  onToggleSurfaceMeshMergeVertices,
  onToggleSurfaceMeshBenchmarkBrowser,
  onGenerateSurfaceMeshPreset,
  onGenerateSurfaceMeshAssetPreset,
  onLoadSurfaceMeshBenchmarkModel,
  onApplySurfaceMeshTopologyDemoPreset,
  onApplySurfaceMeshTopologySavedPreset,
  onRunSurfaceMeshTopologyDemoPreset,
  onRunSurfaceMeshTopologyFullRoundTripDemoPreset,
  onLoadSurfaceMeshFile,
  onConvertToMesh,
  onConvertToMeshObject,
  onOpenMeshPromotionSourceGeometryObject,
  onOpenPromotedMeshObject,
  onCompareMeshPromotionWithSource,
  onRefreshMeshPromotionFromSource,
  onToggleMeshPromotionFreeze,
  onToggleVolumeDistanceSigned,
  onToggleVolumeDistanceAutoBounds,
  meshLastOperation,
  meshOperationLastValidation,
  meshOperationFocusedOperation,
  meshOperationFocusedOperationToken,
  meshOperationHistory,
  meshOperationSavedPresets,
  onRestoreMeshOperationHistoryEntry,
  onUndoLatestMeshOperation,
  canUndoLatestMeshOperation,
  onApplyMeshOperationPreset,
  onApplyMeshOperationSavedPreset,
  onSaveMeshOperationPreset,
  canSaveMeshOperationPreset,
  meshOperationAvailable,
  pythonWorkerAvailable,
  pythonWorkerStatusMessage,
  pythonWorkerLogPath,
  meshOperationBusy,
  meshOperationError,
  meshOperationCleanComputeNormals,
  onChangeMeshOperationCleanComputeNormals,
  onMeshOperationValidate,
  meshOperationRepairOrientFaces,
  onChangeMeshOperationRepairOrientFaces,
  meshOperationRepairRemoveDegenerateFaces,
  onChangeMeshOperationRepairRemoveDegenerateFaces,
  meshOperationRepairRemoveDuplicateFaces,
  onChangeMeshOperationRepairRemoveDuplicateFaces,
  meshOperationRepairCompactVertices,
  onChangeMeshOperationRepairCompactVertices,
  meshOperationRepairFillSmallHoles,
  onChangeMeshOperationRepairFillSmallHoles,
  meshOperationRepairMaxHoleEdges,
  onChangeMeshOperationRepairMaxHoleEdges,
  onMeshOperationRepair,
  onMeshOperationRepairValidate,
  meshOperationRemeshTargetEdgeLength,
  onChangeMeshOperationRemeshTargetEdgeLength,
  meshOperationRemeshIterations,
  onChangeMeshOperationRemeshIterations,
  meshOperationRemeshPreserveSharpEdges,
  onChangeMeshOperationRemeshPreserveSharpEdges,
  onMeshOperationRemesh,
  meshOperationDecimateReduction,
  onChangeMeshOperationDecimateReduction,
  meshOperationDecimateTargetFaces,
  onChangeMeshOperationDecimateTargetFaces,
  meshOperationUseTargetFaces,
  onToggleMeshOperationUseTargetFaces,
  meshOperationSmoothIterations,
  onChangeMeshOperationSmoothIterations,
  meshOperationSmoothPassband,
  onChangeMeshOperationSmoothPassband,
  onMeshOperationCleanNormals,
  onMeshOperationDecimate,
  onMeshOperationSmooth,
  meshOperationBooleanOperation,
  onChangeMeshOperationBooleanOperation,
  meshOperationBooleanStrategy,
  onChangeMeshOperationBooleanStrategy,
  meshOperationBooleanOperandObjectId,
  onChangeMeshOperationBooleanOperandObjectId,
  meshOperationBooleanOperandOptions,
  meshOperationBooleanCurveRadius,
  onChangeMeshOperationBooleanCurveRadius,
  meshOperationBooleanStatus,
  onRunMeshOperationBoolean,
  onPrepareMeshOperationBooleanDemo,
  onSwapMeshOperationBooleanOperands,
  meshOperationOutputMode,
  onChangeMeshOperationOutputMode,
  generateSurfaceStatus,
  meshOperationPreviewBusy,
  meshOperationPreviewError,
  meshOperationPreviewTargetFaces,
  meshOperationPreviewUseDecimate,
  onChangeMeshOperationPreviewTargetFaces,
  onChangeMeshOperationPreviewUseDecimate,
  onRunMeshOperationPreview,
  onOpenImplicitSpherePreset,
  cgalHealthState,
  cgalBusy,
  cgalError,
  cgalTargetEdge,
  onChangeCgalTargetEdge,
  cgalAutoTargetEdge,
  onChangeCgalAutoTargetEdge,
  cgalPadFrac,
  onChangeCgalPadFrac,
  cgalTriBudgetEnabled,
  onChangeCgalTriBudgetEnabled,
  cgalTriBudget,
  onChangeCgalTriBudget,
  cgalAutoEdge,
  cgalTriBudgetEdge,
  cgalRadiusBound,
  onChangeCgalRadiusBound,
  cgalMinTrisEnabled,
  onChangeCgalMinTrisEnabled,
  cgalMinTris,
  onChangeCgalMinTris,
  cgalDomainDiag,
  cgalEffectiveEdge,
  cgalEstimatedTris,
  cgalTooHeavy,
  cgalVerbose,
  onChangeCgalVerbose,
  cgalPreflightSamples,
  onChangeCgalPreflightSamples,
  onRunCgalMesh,
  onUseMeshOperationResultAsBooleanA,
  onUseMeshOperationResultAsBooleanB,
  onStopCgalWorker,
  cgalMeshInfo,
  graphExpr,
  implicitExpr,
onChangeGraphExpr,
onChangeImplicitExpr,
  canEditGraphAsCustom,
  onEditGraphAsCustom,
  canEditImplicitAsCustom,
  onEditImplicitAsCustom,
  paramXExpr,
  paramYExpr,
  paramZExpr,
  bezierControlGridText,
  bSplineControlGridText,
  bSplineDegreeU,
  bSplineDegreeV,
  bSplineKnotUText,
  bSplineKnotVText,
  nurbsControlGridText,
  nurbsDegreeU,
  nurbsDegreeV,
  nurbsKnotUText,
  nurbsKnotVText,
  nurbsWeightsText,
  rotationalProfileMode,
  rotationalProfileRExpr,
  rotationalProfileZExpr,
  rotationalProfilePointsText,
  rotationalAxisOrigin,
  rotationalAxisDirection,
  rmfRibbonTwistEnabled,
  rmfRibbonTwistTurns,
  complexMapSpec,
  complexMapPresetId,
  complexMapError,
  complexMapLive,
  onToggleComplexMapLive,
  complexMapLine,
  complexMapZExtent,
  complexMapWExtent,
  complexMapLineWPolylines,
  complexMapIsolineWPolylinesU,
  complexMapIsolineWPolylinesV,
  complexMapIsolineZLinesU,
  complexMapIsolineZLinesV,
  complexMapGridThickness,
  complexMapGridOpacity,
  complexMapGridShowSurface,
  complexMapMarkerData,
  complexMapShowCritical,
  complexMapShowZeros,
  complexMapShowPoles,
  complexMapMarkersZ,
  complexMapMarkersW,
  complexMapMarkers3d,
  complexMapMarkerMax,
  complexMapCriticalRel,
  complexMapZeroRel,
  complexMapPoleRel,
  setComplexMapShowCritical,
  setComplexMapShowZeros,
  setComplexMapShowPoles,
  setComplexMapMarkersZ,
  setComplexMapMarkersW,
  setComplexMapMarkers3d,
  setComplexMapMarkerMax,
  setComplexMapCriticalRel,
  setComplexMapZeroRel,
  setComplexMapPoleRel,
  complexPreimageMode,
  complexPreimageValue,
  complexPreimageSnap,
  complexPreimagePolylines,
  complexPreimageWShape,
  setComplexPreimageMode,
  setComplexPreimageValue,
  setComplexPreimageSnap,
  complexDistortionMode,
  complexDistortionShowZ,
  complexDistortionShowSurface,
  complexDistortionScale,
  complexMapGridData,
  complexMapDistortionField,
  complexMapDistortionProbe,
  complexMapProbe,
  complexMapProbePins,
  setComplexDistortionMode,
  setComplexDistortionShowZ,
  setComplexDistortionShowSurface,
  setComplexDistortionScale,
  setComplexMapGridThickness,
  setComplexMapGridOpacity,
  setComplexMapGridShowSurface,
  complexMapShowSphere,
  onToggleComplexMapShowSphere,
  complexMapSphereStacked,
  onToggleComplexMapSphereStacked,
  complexMapSphereLines,
  complexMapSpherePoints,
  complexMapSphereGuides,
  onPinComplexMapProbe,
  onClearComplexMapProbe,
  onClearComplexMapProbePins,
  onRecallComplexMapProbe,
  onRemoveComplexMapProbePin,
  wPlaneDomainColor,
  wPlaneShowRings,
  wPlaneShowRays,
  onChangeWPlaneDomainColor,
  onChangeWPlaneShowRings,
  onChangeWPlaneShowRays,
  onChangeParamXExpr,
  onChangeParamYExpr,
  onChangeParamZExpr,
  canEditParamAsCustom,
  onEditParamAsCustom,
  onChangeBezierControlGridText,
  onChangeBSplineControlGridText,
  onChangeBSplineDegreeU,
  onChangeBSplineDegreeV,
  onChangeBSplineKnotUText,
  onChangeBSplineKnotVText,
  onChangeNurbsControlGridText,
  onChangeNurbsDegreeU,
  onChangeNurbsDegreeV,
  onChangeNurbsKnotUText,
  onChangeNurbsKnotVText,
  onChangeNurbsWeightsText,
  onChangeRotationalProfileMode,
  onChangeRotationalProfileRExpr,
  onChangeRotationalProfileZExpr,
  onChangeRotationalProfilePointsText,
  onChangeRotationalAxisOrigin,
  onChangeRotationalAxisDirection,
  onChangeRmfRibbonTwistEnabled,
  onChangeRmfRibbonTwistTurns,
  onChangeComplexMapSpec,
  onChangeComplexMapPreset,
  onBuildComplexMapSweep,
  onPickComplexMapLine,
  onSetComplexMapProbeFromUV,
  onSetComplexMapProbeFromW,
  weierstrassGExpr,
  weierstrassPhiExpr,
  onChangeWeierstrassGExpr,
  onChangeWeierstrassPhiExpr,
  weierstrassDomain,
  onChangeWeierstrassDomain,
  weierstrassResolution,
  onChangeWeierstrassResolution,
  weierstrassRecenter,
  onToggleWeierstrassRecenter,
  onResetWeierstrass,
  weierstrassError,
  showChartGrid,
  onToggleChartGrid,
  chartGridDensity,
  onChangeChartGridDensity,
  chartMode,
  onChangeChartMode,
  chartCoordinateReadoutEnabled,
  onToggleChartCoordinateReadout,
  chartCoordinateReadout,
  lightPreset,
  onChangeLightPreset,
  materialRoughness,
  onSetMaterialRoughness,
  materialMetalness,
  onSetMaterialMetalness,
  materialOpacity,
  onSetMaterialOpacity,
  graphResolution,
  onSetGraphResolution,
  implicitResolution,
  onSetImplicitResolution,
  paramResolution,
  onSetParamResolution,
  colorMode,
  onChangeColorMode,
  colorPalette,
  onChangeColorPalette,
  implicitOverlay,
  onChangeImplicitOverlay,
  probeEnabled,
  onToggleProbe,
  showPrincipalDirections,
  onTogglePrincipalDirections,
  showPrincipalNormalPlanes,
  onTogglePrincipalNormalPlanes,
  showPrincipalLines,
  onTogglePrincipalLines,
  showPrincipalGlyphs,
  onTogglePrincipalGlyphs,
  principalGlyphDensity,
  onChangePrincipalGlyphDensity,
  principalGlyphLength,
  onChangePrincipalGlyphLength,
  principalGlyphMode,
  onChangePrincipalGlyphMode,
  calculusScalarOptions,
  calculusScalarSource,
  onChangeCalculusScalarSource,
  calculusCustomScalarExpr,
  onChangeCalculusCustomScalarExpr,
  calculusCustomVectorExpr,
  onChangeCalculusCustomVectorExpr,
  calculusVectorOptions,
  calculusVectorSource,
  onChangeCalculusVectorSource,
  calculusActiveVectorField,
  onChangeCalculusActiveVectorField,
  calculusVectorOverlayEnabled,
  onToggleCalculusVectorOverlay,
  calculusVectorDensity,
  onChangeCalculusVectorDensity,
  calculusVectorScale,
  onChangeCalculusVectorScale,
  calculusHeatmapEnabled,
  onClearCalculusHeatmap,
  onRunCalculusGradient,
  onRunCalculusLaplacian,
  onRunCalculusDivergence,
  onRunCalculusCurl,
  calculusStatus,
  calculusError,
  showCurvatureLines,
  onToggleCurvatureLines,
  surfaceFeatureResult,
  surfaceFeatureClass,
  onChangeSurfaceFeatureClass,
  surfaceFeatureOverlayVisible,
  onToggleSurfaceFeatureOverlay,
  surfaceFeatureShowEdges,
  onToggleSurfaceFeatureEdges,
  surfaceFeatureCurvatureThreshold,
  onChangeSurfaceFeatureCurvatureThreshold,
  surfaceFeatureGaussianTolerance,
  onChangeSurfaceFeatureGaussianTolerance,
  surfaceFeatureUmbilicTolerance,
  onChangeSurfaceFeatureUmbilicTolerance,
  surfaceFeatureUncertaintyBand,
  onChangeSurfaceFeatureUncertaintyBand,
  surfaceFeatureSharpAngle,
  onChangeSurfaceFeatureSharpAngle,
  surfaceFeatureCacheHit,
  surfaceFeatureComputeTimeMs,
  surfaceFeatureSelectionAvailable,
  onSelectSurfaceFeatureMembers,
  curvatureLineField,
  onChangeCurvatureLineField,
  curvatureSeedSource,
  onChangeCurvatureSeedSource,
  curvatureSeedDensity,
  onChangeCurvatureSeedDensity,
  curvatureStepSize,
  onChangeCurvatureStepSize,
  curvatureMaxSteps,
  onChangeCurvatureMaxSteps,
  curvatureMaxLines,
  onChangeCurvatureMaxLines,
  onRebuildCurvatureLines,
  showRidges,
  onToggleRidges,
  showValleys,
  onToggleValleys,
  ridgeValleySelectionOnly,
  onToggleRidgeValleySelectionOnly,
  ridgeValleyMagMin,
  onChangeRidgeValleyMagMin,
  ridgeValleyContrast,
  onChangeRidgeValleyContrast,
  ridgeValleyMinCos,
  onChangeRidgeValleyMinCos,
  ridgeValleySegmentScale,
  onChangeRidgeValleySegmentScale,
  ridgeValleySampleMode,
  onChangeRidgeValleySampleMode,
  ridgeValleyStitch,
  onToggleRidgeValleyStitch,
  ridgeValleyDecimate,
  onChangeRidgeValleyDecimate,
  ridgeValleyMaxCurves,
  onChangeRidgeValleyMaxCurves,
  ridgeValleyMinConf,
  onChangeRidgeValleyMinConf,
  showGaussMap,
  gaussColorMode,
  onChangeGaussColorMode,
  gaussPointsCount,
  onResetCamera,
  probeInfo,
  probeCurv,
  paramProbeCurv,
  selectRegionEnabled,
  onToggleSelectRegion,
  selectionMode,
  onChangeSelectionMode,
  selectionRadius,
  onSetSelectionRadius,
  selectionUseUV,
  selectionHasUV,
  onToggleSelectionUseUV,
  zoomToRegion,
  onToggleZoomToRegion,
  onZoomNow,
  onClearSelection,
  selectionMaskCount,
  selectionOverlayVisible,
  onToggleSelectionOverlayVisible,
  selectionOverlayOnTop,
  onToggleSelectionOverlayOnTop,
  selectionSphereVisible,
  onToggleSelectionSphereVisible,
  geodesicPathEnabled,
  onToggleGeodesicPathEnabled,
  onClearGeodesicPath,
  geodesicPathMethod,
  onChangeGeodesicPathMethod,
  geodesicPathSourceMode,
  onChangeGeodesicPathSourceMode,
  geodesicPathBusy,
  geodesicPathStart,
  geodesicPathEnd,
  geodesicPathLength,
  geodesicPathMessage,
  geodesicPathConstrain,
  onToggleGeodesicPathConstrain,
  geodesicPathSmooth,
  onToggleGeodesicPathSmooth,
  geodesicPathDebug,
  geodesicPathDebugInfo,
  onToggleGeodesicPathDebug,
  geodesicHeatEnabled,
  geodesicHeatAvailable,
  geodesicHeatBusy,
  geodesicHeatStart,
  geodesicHeatEnd,
  geodesicHeatLength,
  geodesicHeatMessage,
  geodesicHeatShowHeatmap,
  geodesicHeatUseContinuous,
  geodesicHeatUnavailableReason,
  geodesicHeatHeatmapAllowed,
  geodesicHeatHeatmapReason,
  onToggleGeodesicHeatEnabled,
  onToggleGeodesicHeatShowHeatmap,
  onToggleGeodesicHeatUseContinuous,
  onRunGeodesicHeat,
  onClearGeodesicHeat,
  geodesicDiskEnabled,
  geodesicDiskAvailable,
  geodesicDiskBusy,
  geodesicDiskPickMode,
  geodesicDiskCenter,
  geodesicDiskRadius,
  geodesicDiskAutoUpdate,
  geodesicDiskShowBoundary,
  geodesicDiskMethod,
  geodesicDiskUnavailableReason,
  geodesicDiskMessage,
  geodesicDiskStats,
  geodesicDiskSelectionStats,
  onToggleGeodesicDiskEnabled,
  onPickGeodesicDiskCenter,
  onChangeGeodesicDiskRadius,
  onApplyGeodesicDiskRadius,
  onToggleGeodesicDiskAutoUpdate,
  onToggleGeodesicDiskShowBoundary,
  onChangeGeodesicDiskMethod,
  onRecomputeGeodesicDisk,
  onClearGeodesicDisk,
  inspectEnabled,
  onToggleInspectEnabled,
  onClearInspect,
  inspectIdx,
  inspectPos,
  inspectNormal,
  inspectMetrics,
  showContours,
  onToggleContours,
  contourCount,
  onSetContourCount,
  commandInput,
  onChangeCommandInput,
  onRunCommand,
  commandHistory,
  selectionStats,
  availableSelectionMetrics,
  selectedMetric,
  onChangeSelectedMetric,
  onRefreshSelectionStats,
  meshQualityReport,
  meshQualityError,
  meshQualityBusy,
  meshQualityProgress,
  meshQualityPhase,
  meshQualityCacheHit,
  meshQualityHighAspectThreshold,
  onChangeMeshQualityHighAspectThreshold,
  meshQualityMaxListedDefects,
  onChangeMeshQualityMaxListedDefects,
  meshQualityShowDegenerateFaces,
  onToggleMeshQualityShowDegenerateFaces,
  meshQualityShowHighAspectFaces,
  onToggleMeshQualityShowHighAspectFaces,
  meshQualityShowNonManifoldEdges,
  onToggleMeshQualityShowNonManifoldEdges,
  onCancelMeshQualityCompute,
  meshQualityExportStatus,
  onExportMeshQualityReportJson,
  onExportMeshQualityReportCsv,
  onChangeAnalysisFocusedSection,
  weierstrassDiagnostics,
  weierstrassPathDisagreement,
  weierstrassDiagnosticError,
  showDriftArrow,
  onToggleDriftArrow,
  onRecomputeDiagnostics,
}) => {
  const meshReady = !!surfaceMeshStats;
  const surfaceMeshBenchmarkModelsByCategory = useMemo(
    () =>
      MESH_BENCHMARK_CATEGORY_ORDER.map((category) => ({
        category,
        label: MESH_BENCHMARK_CATEGORY_LABELS[category],
        models: surfaceMeshBenchmarkModels.filter((model) => model.category === category),
      })).filter((group) => group.models.length > 0),
    [surfaceMeshBenchmarkModels]
  );
  const surfaceMeshBenchmarkAvailable = surfaceMeshBenchmarkModelsByCategory.length > 0;
  const maxSurfaceMeshTopologyFaceIndex = Math.max(0, (surfaceMeshStats?.triCount ?? 1) - 1);
  const maxSurfaceMeshTopologyVertexIndex = Math.max(0, (surfaceMeshStats?.vertCount ?? 1) - 1);
  const selectedSurfaceMeshTopologyFaceId = Math.max(0, Math.round(surfaceMeshTopologyFaceIndex || 0));
  const selectedSurfaceMeshTopologyEdgeId = `${Math.max(
    0,
    Math.round(surfaceMeshTopologyFieldValidation.effectiveEdgeA || 0)
  )}-${Math.max(0, Math.round(surfaceMeshTopologyFieldValidation.effectiveEdgeB || 0))}`;
  const selectedSurfaceMeshTopologyVertexId = Math.max(0, Math.round(surfaceMeshTopologyVertexIndex || 0));
  const selectedSurfaceMeshTopologyFaceLabel = formatContextEntityLabel("face", selectedSurfaceMeshTopologyFaceId);
  const selectedSurfaceMeshTopologyEdgeLabel = `${formatContextEntityLabel("edge", selectedSurfaceMeshTopologyEdgeId)}${
    surfaceMeshTopologyFieldValidation.edgeFallbackActive ? " (from face)" : ""
  }`;
  const selectedSurfaceMeshTopologyVertexLabel = formatContextEntityLabel("vertex", selectedSurfaceMeshTopologyVertexId);
  const meshContextSelectionState = buildContextualSelectionState({
    workspace: "mesh",
    pickMode: surfaceMeshTopologyPickMode,
    objectLabel: surfaceMeshLabel,
    objectReady: meshReady,
    objectEmptyState: "Load a mesh to enable object actions",
    selectionCleared: surfaceMeshTopologySelectionCleared,
    entities: {
      face: {
        id: selectedSurfaceMeshTopologyFaceId,
        valid: surfaceMeshTopologyFieldValidation.faceValid,
      },
      edge: {
        id: selectedSurfaceMeshTopologyEdgeId,
        valid: surfaceMeshTopologyFieldValidation.edgeValid,
        labelSuffix: surfaceMeshTopologyFieldValidation.edgeFallbackActive ? " (from face)" : "",
      },
      vertex: {
        id: selectedSurfaceMeshTopologyVertexId,
        valid: surfaceMeshTopologyFieldValidation.vertexValid,
      },
    },
  });
  const meshActiveSelectionCardType = meshContextSelectionState.activeCardType;
  const meshActiveSelectionCardActions = meshContextSelectionState.actions;
  const meshActiveSelectionCardId = meshContextSelectionState.cardId;
  const meshActiveSelectionCardEmptyState = meshContextSelectionState.emptyState;
  const surfaceMeshTopologyFaceGuidedPreset = findSurfaceMeshTopologyDemoPresetByOperation("Face Subdivide");
  const surfaceMeshTopologySplitGuidedPreset = findSurfaceMeshTopologyDemoPresetByOperation("Split Edge");
  const surfaceMeshTopologyCollapseGuidedPreset = findSurfaceMeshTopologyDemoPresetByOperation("Collapse Edge");
  const surfaceMeshTopologyBevelGuidedPreset = findSurfaceMeshTopologyDemoPresetByOperation("Bevel Edge");
  const implicitBakePercent = Math.max(0, Math.min(100, Math.round(implicitBakeProgress * 100)));
  const meshQualityPercent = Math.max(0, Math.min(100, Math.round(meshQualityProgress * 100)));
  const meshQualityPhaseLabel =
    meshQualityPhase === "faces"
      ? "Scanning faces"
      : meshQualityPhase === "edges"
      ? "Scanning edges"
      : meshQualityPhase === "finalize"
      ? "Finalizing report"
      : "Idle";
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];
  const geodesicSmoothEnabled = viewerKind === "param" || viewerKind === "weierstrass";

  const isVolume = datasetKind === "volume";
  const isWeierstrass = viewerKind === "weierstrass";
  const isMeshViewer = viewerKind === "mesh" || viewerKind === "complex";
  const isEqViewer = viewerKind === "implicit" || viewerKind === "graph";
  const meshMeta = {
    label: surfaceMeshLabel,
    formula: "Triangle surface mesh",
    note: "Imported or generated triangle mesh.",
  };
  const distanceSigned = volumeDatasetOverride?.distanceSigned;
  const volumeMeta = volumeDatasetOverride
    ? {
        label: volumeDatasetOverride.label ?? "Volume: Distance field",
        formula: distanceSigned ? "Signed distance field d(p, S)" : "Unsigned distance field |d(p, S)|",
        note: volumeDatasetOverride.note ?? "Distance field sampled on a voxel grid.",
      }
    : {
        label: `Volume: ${volumePreset.label}`,
        formula: volumePresetId === "custom" ? (volumeCustomExpr.trim() || volumePreset.formula) : volumePreset.formula,
        note: volumePreset.note ?? "Scalar field on a voxel grid.",
      };
  const activeMeta = isVolume
    ? volumeMeta
    : isMeshViewer
      ? meshMeta
      : isWeierstrass
        ? WEIERSTRASS_META
        : isEqViewer
          ? eqMeta
          : paramMeta;
  const diagStatusColors: Record<"good" | "warn" | "bad", string> = {
    good: "#1f894f",
    warn: "#e2a700",
    bad: "#d9302f",
  };
  const diagSuccess = isWeierstrassDiagnosticsSuccess(weierstrassDiagnostics)
    ? weierstrassDiagnostics
    : null;
  const diagStatusLabel = diagSuccess
    ? diagSuccess.okLevel
    : weierstrassDiagnosticError
    ? "unavailable"
    : "pending";
  const diagStatusColor = diagSuccess ? diagStatusColors[diagSuccess.okLevel] : "#9e9e9e";
  const fmtVal = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : String(v));
  const cgalReady = cgalHealthState?.ok === true;
  const cgalStatusText = !cgalHealthState
    ? "checking..."
    : cgalHealthState.ok
      ? `available${cgalHealthState.version ? ` · v${cgalHealthState.version}` : ""}`
      : "unavailable";
  const cgalStatusColor = cgalHealthState ? (cgalHealthState.ok ? "#1f894f" : "#b42318") : "#777";
  const cgalDisabled = cgalBusy || cgalHealthState?.ok !== true;
  const cgalStopDisabled = !cgalBusy && cgalHealthState?.ok !== true;
  const cgalTargetEdgeLocked = cgalDisabled || cgalAutoTargetEdge || cgalTriBudgetEnabled;
  const meshOperationPreviewDisabled = meshOperationPreviewBusy || cgalBusy;
  const meshOperationPreviewResolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));
  const [implicitMeshingQuality, setImplicitMeshingQuality] = useState<"preview" | "standard" | "robust">("standard");
  const implicitMeshingUsesPreview = implicitMeshingQuality === "preview";
  const implicitMeshingEngineLabel =
    implicitMeshingQuality === "preview" ? "Preview" : implicitMeshingQuality === "robust" ? "Robust" : "Standard";
  const implicitMeshingBackendLabel = implicitMeshingUsesPreview ? "VTK preview" : "CGAL robust";
  const implicitMeshingBusy = implicitMeshingUsesPreview ? meshOperationPreviewBusy : cgalBusy;
  const implicitMeshingDisabled = implicitMeshingUsesPreview ? meshOperationPreviewDisabled : cgalDisabled;
  const runImplicitMeshingStrategy = useCallback(() => {
    if (implicitMeshingUsesPreview) {
      return onRunMeshOperationPreview();
    }
    return onRunCgalMesh();
  }, [implicitMeshingUsesPreview, onRunCgalMesh, onRunMeshOperationPreview]);
  const generateStateLabel = meshOperationPreviewBusy ? "running" : generateSurfaceStatus.state;
  const generateStatusText = meshOperationPreviewBusy ? "generate running..." : generateSurfaceStatus.message;
  const generateStatusColor =
    generateStateLabel === "success" ? "#1f894f" : generateStateLabel === "error" ? "#b42318" : "#556";
  const fmtTriEstimate = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return `${Math.round(value)}`;
  };
  const volumeBounds = samplingToBounds(volumeSampling);

  const modeLabel =
    isVolume
      ? "volume grid (voxels)"
      : viewerKind === "implicit"
        ? "implicit surface  f(x,y,z) = 0"
        : viewerKind === "graph"
          ? "graph (explicit)  z = f(x,y)"
      : viewerKind === "weierstrass"
        ? "Weierstrass minimal surface  X(z) = Re integral Phi(z) dz"
        : viewerKind === "complex"
          ? "complex map surface  w(u,v) = Re + i Im"
          : viewerKind === "mesh"
            ? "surface mesh (triangles)"
            : "parametric surface  σ(u,v)";

  const isGraphCustom = viewerKind === "graph" && surfaceId === "graph_custom";
  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isParamCustom = viewerKind === "param" && paramId === "custom";
  const isSplinePatchParam = viewerKind === "param" && isSplinePatchSurfaceId(paramId);
  const isBezierPatchParam = viewerKind === "param" && paramId === "bezierSurface";
  const isBSplinePatchParam = viewerKind === "param" && paramId === "bSplineSurface";
  const isNurbsPatchParam = viewerKind === "param" && paramId === "nurbsSurface";
  const isRmfRibbonParam = viewerKind === "param" && paramId === "ribbonRMF";
  const isGeneralRotationalParam = viewerKind === "param" && supportsGeneralRotationalProfile(paramId);
  const rotationalDefaults = isGeneralRotationalParam ? getDefaultRotationalProfileExpressions(paramId) : null;
  const isGraphAny = viewerKind === "graph" && isGraphSurface(surfaceId);
  const isImplicitAny = viewerKind === "implicit" && isImplicitSurface(surfaceId);
  const implicitExprTrimmed = (implicitExpr ?? "").trim();
  const normalizeLeftTab = useCallback((value: SurfacesLeftTab | undefined): SurfacesLeftTab => {
    if (!value) return "scene";
    return value === "controls" ? "scene" : value;
  }, []);
  const [leftTab, setLeftTab] = useState<SurfacesLeftTab>(() => normalizeLeftTab(initialLeftTab));
  const meshFileInputRef = useRef<HTMLInputElement | null>(null);
  const meshQuickFileInputRef = useRef<HTMLInputElement | null>(null);
  const [meshToolsTab, setMeshToolsTab] = useState<"surface_mesh" | "operations" | "volume">("surface_mesh");
  useEffect(() => {
    if (surfaceMeshBenchmarkBrowserOpen) setMeshToolsTab("surface_mesh");
  }, [surfaceMeshBenchmarkBrowserOpen]);
  const zPlaneRef = useRef<PlanePlotHandle | null>(null);
  const wPlaneRef = useRef<PlanePlotHandle | null>(null);
  const scalarRePlaneRef = useRef<PlanePlotHandle | null>(null);
  const scalarImPlaneRef = useRef<PlanePlotHandle | null>(null);
  const scalarAbsPlaneRef = useRef<PlanePlotHandle | null>(null);
  const scalarArgPlaneRef = useRef<PlanePlotHandle | null>(null);
  const [complexShowScalarDomains, setComplexShowScalarDomains] = useState(true);
  const [complexLineMode, setComplexLineMode] = useState<"vertical" | "horizontal">("vertical");
  const [complexToolMode, setComplexToolMode] = useState<"line" | "probe" | "preimage">("line");
  const [differentialMode, setDifferentialMode] = useState<DifferentialGeometryAnalysisMode>("auto");
  const [differentialUiMode, setDifferentialUiMode] = useState<"basic" | "advanced">("basic");
  const [differentialPrecheck, setDifferentialPrecheck] = useState<DifferentialGeometryPrecheckMode>("auto");
  const [differentialMeanCurvature, setDifferentialMeanCurvature] = useState(true);
  const [differentialGaussianCurvature, setDifferentialGaussianCurvature] = useState(true);
  const [differentialPrincipalCurvatureK1, setDifferentialPrincipalCurvatureK1] = useState(false);
  const [differentialPrincipalCurvatureK2, setDifferentialPrincipalCurvatureK2] = useState(false);
  const [differentialShapeIndex, setDifferentialShapeIndex] = useState(false);
  const [differentialCurvedness, setDifferentialCurvedness] = useState(false);
  const [differentialNormals, setDifferentialNormals] = useState(true);
  const [differentialDirectionD1, setDifferentialDirectionD1] = useState(true);
  const [differentialDirectionD2, setDifferentialDirectionD2] = useState(true);
  const [differentialAsymptoticDirections, setDifferentialAsymptoticDirections] = useState(false);
  const [differentialSmoothing, setDifferentialSmoothing] = useState<DifferentialGeometrySmoothing>("none");
  const [differentialRemeshBeforeAnalysis, setDifferentialRemeshBeforeAnalysis] =
    useState<DifferentialGeometryBinaryToggle>("off");
  const [differentialNormalizeScale, setDifferentialNormalizeScale] = useState<DifferentialGeometryBinaryToggle>("off");
  const [differentialClampOutliers, setDifferentialClampOutliers] = useState<DifferentialGeometryBinaryToggle>("off");
  const [differentialSaveDerivedResult, setDifferentialSaveDerivedResult] = useState(false);
  const [differentialExportScalarFields, setDifferentialExportScalarFields] = useState(false);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const patchVecAxis = (base: Vec3, axis: keyof Vec3, raw: number): Vec3 => ({
    ...base,
    [axis]: Number.isFinite(raw) ? raw : base[axis],
  });
  const rotationalPrincipalAxis = detectPrincipalAxisDirection(rotationalAxisDirection);
  const safeWeierstrassDomain = normalizeParamDomain(weierstrassDomain, WEIERSTRASS_DEFAULTS.domain);
  const complexMapIsRiemann = complexMapSpec.mapMode === "riemann";
  const complexMapInputModeUi: ComplexMapInputMode = complexMapSpec.inputMode === "fz" ? "fz" : "reim";
  const complexMapFunctionExprUi = complexMapSpec.fExpr ?? "";
  const complexMapSheetCount = complexMapIsRiemann ? Math.max(2, Math.round(complexMapSpec.sheetCount)) : 1;
  const complexMapSheetIndex = Math.min(
    Math.max(0, Math.round(complexMapSpec.sheetIndex)),
    Math.max(0, complexMapSheetCount - 1)
  );
  const complexMapBranchCutDeg = (complexMapSpec.branchCutAngle * 180) / Math.PI;
  const colorModes: ColorMode[] = colorModesForSurfaceViewer(viewerKind, surfaceMeshLabel);
  const volumeParamDefs = volumePreset.params ?? [];
  const volumeShowCustom = volumePresetId === "custom";
  const volumePresetOptions = VOLUME_PRESETS.filter((preset) => preset.id !== "custom");
  const lastVolumePresetIdRef = useRef<VolumePresetId>(DEFAULT_VOLUME_PRESET_ID);
  useEffect(() => {
    if (!initialLeftTab) return;
    setLeftTab(normalizeLeftTab(initialLeftTab));
  }, [initialLeftTab, normalizeLeftTab]);
  const showSceneObjectControls = leftTab === "scene" || leftTab === "object" || leftTab === "controls";
  const showViewControls = leftTab === "view" || leftTab === "controls";
  const surfaceSectionTabs: Array<{ id: Exclude<SurfacesLeftTab, "controls">; label: string }> = [
    { id: "scene", label: "Scene" },
    { id: "object", label: "Object" },
    { id: "view", label: "View" },
    { id: "analysis", label: "Analysis" },
    { id: "theory", label: "Theory" },
  ];
  const surfaceSectionTabButton = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid " + (active ? "#0a66c2" : "#cfd8e3"),
    background: active ? "#e6f0ff" : "#fff",
    color: active ? "#0a66c2" : "#334155",
    fontWeight: active ? 700 : 600,
    fontSize: 11,
    cursor: "pointer",
    boxShadow: active ? "0 2px 10px rgba(10,102,194,0.18)" : "none",
    whiteSpace: "nowrap",
  });
  const analysisAccordionStyle: React.CSSProperties = {
    marginTop: 8,
    border: "1px solid #dbe4f0",
    borderRadius: 8,
    background: "#f8fbff",
    padding: "6px 8px",
  };
  const analysisAccordionSummaryStyle: React.CSSProperties = {
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  };
  const handleAnalysisSectionToggle = useCallback(
    (section: AnalysisFocusedSection, event: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (event.currentTarget.open) {
        onChangeAnalysisFocusedSection?.(section);
      }
    },
    [onChangeAnalysisFocusedSection]
  );
  const differentialObjectTypeLabel = isMeshViewer
    ? "mesh"
    : viewerKind === "implicit"
      ? "implicit surface"
      : "parametric surface";
  const differentialInputLabel = isMeshViewer
    ? surfaceMeshSource
      ? formatSurfaceMeshSource(surfaceMeshSource)
      : "detached mesh"
    : viewerKind === "implicit"
      ? "Fast preview mesh / robust mesh"
      : "analytic surface";
  const handleComputeDifferentialGeometry = useCallback(() => {
    onChangeAnalysisFocusedSection?.("differential-geometry");
    onRebuildCurvatureLines();
  }, [onChangeAnalysisFocusedSection, onRebuildCurvatureLines]);
  useEffect(() => {
    if (volumePresetId !== "custom") {
      lastVolumePresetIdRef.current = volumePresetId;
    }
  }, [volumePresetId]);
  useEffect(() => {
    if (viewerKind !== "complex") return;
    const shouldProbeBeOn = complexToolMode === "probe";
    if (probeEnabled !== shouldProbeBeOn) {
      onToggleProbe();
    }
  }, [viewerKind, complexToolMode, probeEnabled, onToggleProbe]);
  const volumeParamDecimals = (step: number) => {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    if (step >= 0.01) return 2;
    if (step >= 0.001) return 3;
    return 4;
  };
  const formatVolumeParam = (value: number, step: number) => value.toFixed(volumeParamDecimals(step));
  const volumeCustomExamples = [
    { id: "sphere", label: "Sphere", expr: "x^2 + y^2 + z^2 - 1" },
    { id: "ellipsoid", label: "Ellipsoid", expr: "x^2/1.6^2 + y^2/1.0^2 + z^2/0.7^2 - 1" },
    { id: "torus", label: "Torus", expr: "(x^2 + y^2 - 1.0)^2 + z^2 - 0.35^2" },
    { id: "gyroid", label: "Gyroid", expr: "sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)" },
    { id: "cos-surface", label: "Cos surface", expr: "cos(x) + cos(y) + cos(z) - 0.5" },
    { id: "metaballs", label: "Metaballs", expr: "exp(-4*((x+0.6)^2+y^2+z^2)) + exp(-4*((x-0.6)^2+y^2+z^2)) + exp(-4*(x^2+(y-0.6)^2+z^2)) - 0.7" },
    { id: "rounded-box", label: "Rounded box", expr: "abs(x)^4 + abs(y)^4 + abs(z)^4 - 1" },
    { id: "octahedron-like", label: "Octahedron-like", expr: "abs(x) + abs(y) + abs(z) - 1" },
    { id: "shell", label: "Shell", expr: "(sqrt(x^2+y^2+z^2)-1.0)^2 - 0.02" },
    { id: "double-cone", label: "Double cone", expr: "x^2 + y^2 - z^2" },
    { id: "saddle-implicit", label: "Saddle (implicit)", expr: "z - x^2 + y^2" },
  ];

  const handleZPlaneClick = useCallback(
    (pt: { re: number; im: number }, ev: MouseEvent) => {
      const baseAxis = complexLineMode === "vertical" ? "u" : "v";
      const axis = ev.shiftKey ? (baseAxis === "u" ? "v" : "u") : baseAxis;
      const uMin = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const uMax = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const vMin = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const vMax = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);
      if (complexToolMode === "line") {
        const value = axis === "u" ? clamp(pt.re, uMin, uMax) : clamp(pt.im, vMin, vMax);
        onPickComplexMapLine({ axis, value });
      }

      if (complexToolMode === "probe") {
        const u = clamp(pt.re, uMin, uMax);
        const v = clamp(pt.im, vMin, vMax);
        onSetComplexMapProbeFromUV(u, v, "z");
      }
    },
    [complexLineMode, complexMapSpec, complexToolMode, onPickComplexMapLine, onSetComplexMapProbeFromUV]
  );

  const snapPreimageValue = useCallback(
    (mode: ComplexPreimageMode, value: number) => {
      if (!complexPreimageSnap || mode === "none" || !Number.isFinite(value)) return value;
      if (mode === "arg") {
        const nice = [
          -Math.PI,
          -3 * Math.PI / 4,
          -2 * Math.PI / 3,
          -Math.PI / 2,
          -Math.PI / 3,
          -Math.PI / 4,
          -Math.PI / 6,
          0,
          Math.PI / 6,
          Math.PI / 4,
          Math.PI / 3,
          Math.PI / 2,
          2 * Math.PI / 3,
          3 * Math.PI / 4,
          Math.PI,
        ];
        let best = nice[0];
        let bestD = Infinity;
        for (const n of nice) {
          const d = Math.abs(value - n);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
        return best;
      }

      const base = [0, 0.5, 1, 2, 3, 4];
      const nice = mode === "abs" ? base : base.concat(base.slice(1).map((v) => -v));
      let best = nice[0];
      let bestD = Infinity;
      for (const n of nice) {
        const d = Math.abs(value - n);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },
    [complexPreimageSnap]
  );

  const applyPreimageValue = useCallback(
    (mode: ComplexPreimageMode, value: number) => {
      const next = snapPreimageValue(mode, value);
      if (Number.isFinite(next)) setComplexPreimageValue(next);
    },
    [snapPreimageValue]
  );

  const handleWPlaneClick = useCallback(
    (pt: { re: number; im: number }) => {
      if (complexToolMode === "preimage" && complexPreimageMode !== "none") {
        if (complexPreimageMode === "re") {
          applyPreimageValue(complexPreimageMode, clamp(pt.re, -complexMapWExtent, complexMapWExtent));
        } else if (complexPreimageMode === "im") {
          applyPreimageValue(complexPreimageMode, clamp(pt.im, -complexMapWExtent, complexMapWExtent));
        } else if (complexPreimageMode === "abs") {
          applyPreimageValue(
            complexPreimageMode,
            Math.max(0, Math.min(complexMapWExtent, Math.hypot(pt.re, pt.im)))
          );
        } else {
          applyPreimageValue(complexPreimageMode, Math.atan2(pt.im, pt.re));
        }
      }

      if (complexToolMode === "probe") {
        onSetComplexMapProbeFromW(pt);
      }
    },
    [applyPreimageValue, complexMapWExtent, complexPreimageMode, complexToolMode, onSetComplexMapProbeFromW]
  );

  const complexScalarDomainMaps = useMemo(() => {
    if (!complexMapGridData) return null;
    const { nu, nv, uMin, uMax, vMin, vMax, re, im, wMag, valid } = complexMapGridData;
    const total = nu * nv;
    if (!total) return null;

    const arg = new Float32Array(total);
    let reAbsMax = 0;
    let imAbsMax = 0;
    let absMax = 0;
    let hasFinite = false;

    for (let idx = 0; idx < total; idx++) {
      if (!valid[idx]) {
        arg[idx] = NaN;
        continue;
      }
      const rr = re[idx];
      const ii = im[idx];
      if (!Number.isFinite(rr) || !Number.isFinite(ii)) {
        arg[idx] = NaN;
        continue;
      }
      hasFinite = true;
      const rrAbs = Math.abs(rr);
      const iiAbs = Math.abs(ii);
      if (rrAbs > reAbsMax) reAbsMax = rrAbs;
      if (iiAbs > imAbsMax) imAbsMax = iiAbs;
      const mag = wMag[idx];
      if (Number.isFinite(mag) && mag > absMax) absMax = mag;
      arg[idx] = Math.atan2(ii, rr);
    }

    if (!hasFinite) return null;

    reAbsMax = Math.max(1e-6, reAbsMax);
    imAbsMax = Math.max(1e-6, imAbsMax);
    absMax = Math.max(1e-6, absMax);

    return {
      nu,
      nv,
      uMin,
      uMax,
      vMin,
      vMax,
      re,
      im,
      abs: wMag,
      arg,
      reMin: -reAbsMax,
      reMax: reAbsMax,
      imMin: -imAbsMax,
      imMax: imAbsMax,
      absMin: 0,
      absMax,
      argMin: -Math.PI,
      argMax: Math.PI,
    };
  }, [complexMapGridData]);

  useEffect(() => {
    zPlaneRef.current?.drawGrid(1);
    wPlaneRef.current?.drawGrid(1);

    if (complexDistortionShowZ && complexMapDistortionField) {
      zPlaneRef.current?.drawHeatmap({
        values: complexMapDistortionField.values,
        nx: complexMapDistortionField.nx,
        ny: complexMapDistortionField.ny,
        xMin: complexMapDistortionField.xMin,
        xMax: complexMapDistortionField.xMax,
        yMin: complexMapDistortionField.yMin,
        yMax: complexMapDistortionField.yMax,
        min: complexMapDistortionField.min,
        max: complexMapDistortionField.max,
        palette: colorPalette,
        opacity: 0.78,
      });
    }

    if (complexMapSpec.showIsolines) {
      const gridStyle = { width: complexMapGridThickness, opacity: complexMapGridOpacity };
      if (complexMapIsolineZLinesU?.length) {
        for (const line of complexMapIsolineZLinesU) {
          zPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.u, gridStyle);
        }
      }
      if (complexMapIsolineZLinesV?.length) {
        for (const line of complexMapIsolineZLinesV) {
          zPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.v, gridStyle);
        }
      }
      if (complexMapIsolineWPolylinesU?.length) {
        for (const line of complexMapIsolineWPolylinesU) {
          wPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.u, gridStyle);
        }
      }
      if (complexMapIsolineWPolylinesV?.length) {
        for (const line of complexMapIsolineWPolylinesV) {
          wPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.v, gridStyle);
        }
      }
    }

    if (complexPreimagePolylines?.length) {
      for (const line of complexPreimagePolylines) {
        zPlaneRef.current?.drawCurve(line, "#1b7f3a");
      }
    }

    if (complexPreimageWShape?.length) {
      for (const line of complexPreimageWShape) {
        wPlaneRef.current?.drawCurve(line, "#1b7f3a");
      }
    }

    if (complexMapLine) {
      const uMin = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const uMax = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const vMin = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const vMax = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);

      if (complexMapLine.axis === "u") {
        zPlaneRef.current?.drawCurve(
          [
            [complexMapLine.value, vMin],
            [complexMapLine.value, vMax],
          ],
          "#d14d00"
        );
      } else {
        zPlaneRef.current?.drawCurve(
          [
            [uMin, complexMapLine.value],
            [uMax, complexMapLine.value],
          ],
          "#d14d00"
        );
      }
    }

    if (complexMapLineWPolylines?.length) {
      for (const line of complexMapLineWPolylines) {
        wPlaneRef.current?.drawCurve(line, "#d14d00");
      }
    }

    if (complexMapMarkerData) {
      if (complexMapMarkersZ) {
        if (complexMapMarkerData.critical.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.critical.z, {
            color: "#d81b60",
            shape: "diamond",
            size: 4.2,
            layer: "crit-z",
          });
        }
        if (complexMapMarkerData.zero.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.zero.z, {
            color: "#2e7d32",
            shape: "circle",
            size: 4.0,
            layer: "zero-z",
          });
        }
        if (complexMapMarkerData.pole.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.pole.z, {
            color: "#f57c00",
            shape: "triangle",
            size: 4.6,
            layer: "pole-z",
          });
        }
      }

      if (complexMapMarkersW) {
        if (complexMapMarkerData.critical.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.critical.w, {
            color: "#d81b60",
            shape: "diamond",
            size: 4.2,
            layer: "crit-w",
          });
        }
        if (complexMapMarkerData.zero.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.zero.w, {
            color: "#2e7d32",
            shape: "circle",
            size: 4.0,
            layer: "zero-w",
          });
        }
        if (complexMapMarkerData.pole.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.pole.w, {
            color: "#f57c00",
            shape: "triangle",
            size: 4.6,
            layer: "pole-w",
          });
        }
      }
    }

    if (probeEnabled && complexMapProbe) {
      zPlaneRef.current?.drawPoints([[complexMapProbe.u, complexMapProbe.v]], {
        color: "#111",
        shape: "cross",
        size: 5.2,
        layer: "probe-z",
      });
      wPlaneRef.current?.drawPoints([[complexMapProbe.w.re, complexMapProbe.w.im]], {
        color: "#111",
        shape: "cross",
        size: 5.2,
        layer: "probe-w",
      });
    } else {
      zPlaneRef.current?.drawPoints([], { layer: "probe-z" });
      wPlaneRef.current?.drawPoints([], { layer: "probe-w" });
    }
  }, [
    complexMapLine,
    complexMapLineWPolylines,
    complexMapIsolineWPolylinesU,
    complexMapIsolineWPolylinesV,
    complexMapIsolineZLinesU,
    complexMapIsolineZLinesV,
    complexPreimagePolylines,
    complexPreimageWShape,
    complexMapMarkerData,
    complexMapMarkersZ,
    complexMapMarkersW,
    complexDistortionShowZ,
    complexMapDistortionField,
    colorPalette,
    complexMapSpec,
    complexMapGridOpacity,
    complexMapGridThickness,
    wPlaneDomainColor,
    wPlaneShowRings,
    wPlaneShowRays,
    probeEnabled,
    complexMapProbe,
  ]);

  useEffect(() => {
    scalarRePlaneRef.current?.drawGrid(1);
    scalarImPlaneRef.current?.drawGrid(1);
    scalarAbsPlaneRef.current?.drawGrid(1);
    scalarArgPlaneRef.current?.drawGrid(1);

    if (!complexShowScalarDomains || !complexScalarDomainMaps) return;

    const {
      nu,
      nv,
      uMin,
      uMax,
      vMin,
      vMax,
      re,
      im,
      abs,
      arg,
      reMin,
      reMax,
      imMin,
      imMax,
      absMin,
      absMax,
      argMin,
      argMax,
    } = complexScalarDomainMaps;

    scalarRePlaneRef.current?.drawHeatmap({
      values: re,
      nx: nu,
      ny: nv,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      min: reMin,
      max: reMax,
      palette: "blueRed",
      opacity: 0.86,
    });
    scalarImPlaneRef.current?.drawHeatmap({
      values: im,
      nx: nu,
      ny: nv,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      min: imMin,
      max: imMax,
      palette: "blueRed",
      opacity: 0.86,
    });
    scalarAbsPlaneRef.current?.drawHeatmap({
      values: abs,
      nx: nu,
      ny: nv,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      min: absMin,
      max: absMax,
      palette: "redYellow",
      opacity: 0.86,
    });
    scalarArgPlaneRef.current?.drawHeatmap({
      values: arg,
      nx: nu,
      ny: nv,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      min: argMin,
      max: argMax,
      palette: "rainbow",
      opacity: 0.86,
    });

    if (complexMapLine) {
      const u0 = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const u1 = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const v0 = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const v1 = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);
      const linePts: [number, number][] =
        complexMapLine.axis === "u"
          ? [
              [complexMapLine.value, v0],
              [complexMapLine.value, v1],
            ]
          : [
              [u0, complexMapLine.value],
              [u1, complexMapLine.value],
            ];
      scalarRePlaneRef.current?.drawCurve(linePts, "#111827", { width: 1.2, opacity: 0.9, layer: "scalar-line" });
      scalarImPlaneRef.current?.drawCurve(linePts, "#111827", { width: 1.2, opacity: 0.9, layer: "scalar-line" });
      scalarAbsPlaneRef.current?.drawCurve(linePts, "#111827", { width: 1.2, opacity: 0.9, layer: "scalar-line" });
      scalarArgPlaneRef.current?.drawCurve(linePts, "#111827", { width: 1.2, opacity: 0.9, layer: "scalar-line" });
    }

    if (probeEnabled && complexMapProbe) {
      const probePt: [number, number] = [complexMapProbe.u, complexMapProbe.v];
      const style = { color: "#111827", shape: "cross" as const, size: 4.6, layer: "scalar-probe" };
      scalarRePlaneRef.current?.drawPoints([probePt], style);
      scalarImPlaneRef.current?.drawPoints([probePt], style);
      scalarAbsPlaneRef.current?.drawPoints([probePt], style);
      scalarArgPlaneRef.current?.drawPoints([probePt], style);
    } else {
      scalarRePlaneRef.current?.drawPoints([], { layer: "scalar-probe" });
      scalarImPlaneRef.current?.drawPoints([], { layer: "scalar-probe" });
      scalarAbsPlaneRef.current?.drawPoints([], { layer: "scalar-probe" });
      scalarArgPlaneRef.current?.drawPoints([], { layer: "scalar-probe" });
    }
  }, [
    complexShowScalarDomains,
    complexScalarDomainMaps,
    complexMapLine,
    complexMapSpec.uMin,
    complexMapSpec.uMax,
    complexMapSpec.vMin,
    complexMapSpec.vMax,
    probeEnabled,
    complexMapProbe,
  ]);

  const wrapComplexAdvancedTools = (content: React.ReactNode) => {
    if (viewerKind !== "complex") return content;
    return (
      <details style={{ ...cardStyle, marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Mesh tools (advanced)</summary>
        <div style={{ marginTop: 8 }}>{content}</div>
      </details>
    );
  };

  return (
    <section>
      <h2 style={styles.h2}>{isVolume ? "Volume viewer (three.js)" : "Surface viewer (three.js)"}</h2>
      <p style={styles.hint}>
        Rotate with mouse, scroll to zoom. In <strong>probe mode</strong> click the surface to read point p and unit normal n.
      </p>

      {showInternalTabs && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            marginBottom: 10,
            padding: 8,
            borderRadius: 10,
            border: "1px solid #dbe4f0",
            background: "rgba(248, 251, 255, 0.96)",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Sections
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {surfaceSectionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                style={surfaceSectionTabButton(leftTab === tab.id)}
                aria-pressed={leftTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: leftTab !== "theory" ? "block" : "none" }}>
      <h3 style={styles.h3}>{activeMeta.label}</h3>
      <p style={styles.hint}>
        Mode: <strong>{modeLabel}</strong>
      </p>

      {showSceneObjectControls && (
      <>
      {datasetKind === "volume" && (
        <div style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Volume grid</div>
          {volumeDatasetOverride && (
            <div
              style={{
            marginBottom: 6,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                background: "#fff",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600 }}>Active: {volumeDatasetOverride.label ?? "Distance field"}</div>
              {volumeDatasetOverride.note && (
                <div style={{ marginTop: 4, opacity: 0.7 }}>{volumeDatasetOverride.note}</div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={onClearVolumeOverride} style={{ padding: "4px 8px" }}>
                  Use preset grid
                </button>
                <button
                  type="button"
                  onClick={onBuildDistanceVolume}
                  disabled={volumeDistanceBusy}
                  style={{ padding: "4px 8px" }}
                >
                  {volumeDistanceBusy ? "Rebuilding..." : "Rebuild distance field"}
                </button>
              </div>
              {volumeDistanceError && (
                <div style={{ marginTop: 6, color: "#b42318" }}>Error: {volumeDistanceError}</div>
              )}
            </div>
          )}
          {volumeProjectManaged && <p>Edit this saved document with Apply source above the viewport. Choose New or a gallery preset to create another document.</p>}
          <fieldset hidden={volumeProjectManaged} disabled={volumeProjectManaged} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }} aria-label="Volume dimension presets">
            {([32, 64, 128, 256] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onChangeVolumeDimensionPreset(size)}
                style={pill(volumeDims.every((dimension) => dimension === size))}
                aria-pressed={volumeDims.every((dimension) => dimension === size)}
              >
                {size}³
              </button>
            ))}
            <span style={{ ...pill(![32, 64, 128, 256].some((size) => volumeDims.every((dimension) => dimension === size))), cursor: "default" }}>
              Custom
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Dims (Nx, Ny, Nz)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[0]}
                  onChange={(e) => onChangeVolumeDim(0, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Nx"
                />
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[1]}
                  onChange={(e) => onChangeVolumeDim(1, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Ny"
                />
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[2]}
                  onChange={(e) => onChangeVolumeDim(2, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Nz"
                />
              </div>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8, marginTop: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 11 }}>
              Centering
              <select value={volumeCentering} onChange={(event) => onChangeVolumeCentering(event.target.value as VolumeSamplingCentering)}>
                <option value="point">Point centered</option>
                <option value="cell">Cell centered</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11 }}>
              Interpolation
              <select value={volumeInterpolation} onChange={(event) => onChangeVolumeInterpolation(event.target.value as VolumeInterpolation)}>
                <option value="nearest">Nearest</option>
                <option value="linear">Linear</option>
                <option value="cubic">Cubic</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11 }}>
              Boundary
              <select value={volumeBoundaryMode} onChange={(event) => onChangeVolumeBoundaryMode(event.target.value as VolumeBoundaryMode)}>
                <option value="clamp">Clamp</option>
                <option value="zero">Zero outside</option>
                <option value="mirror">Mirror</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={volumeIsotropicSpacing}
              onChange={(event) => onToggleVolumeIsotropicSpacing(event.target.checked)}
            />
            Lock isotropic spacing
          </label>

          <div
            data-testid="volume-allocation-plan"
            style={{
              marginTop: 10,
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${volumeAllocationPlan.warning === "blocked" ? "#f1a6a0" : volumeAllocationPlan.warning === "caution" ? "#f0c36d" : "#a7d7b4"}`,
              background: volumeAllocationPlan.warning === "blocked" ? "#fff1f0" : volumeAllocationPlan.warning === "caution" ? "#fff8e8" : "#f0fff4",
              fontSize: 10,
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700 }}>Allocation plan · {volumeAllocationPlan.warning}</div>
            <div>{volumeAllocationPlan.sampleCount.toLocaleString()} samples · {volumeAllocationPlan.scalarType} · {volumeAllocationPlan.components} component</div>
            <div>CPU {formatBenchmarkBytes(volumeAllocationPlan.cpuBytes)} · GPU {formatBenchmarkBytes(volumeAllocationPlan.gpuBytes)} · {volumeAllocationPlan.backend}</div>
            <div>{volumeAllocationPlan.message}</div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Sampling box</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
                <label
                  key={`center-${label}`}
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}
                >
                  <span>Center {label}</span>
                  <input
                    type="number"
                    value={volumeSampling.center[axisIndex]}
                    onChange={(e) => onChangeVolumeSamplingCenter(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 6 }}>
              {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
                <label
                  key={`extent-${label}`}
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}
                >
                  <span>Extent {label}</span>
                  <input
                    type="number"
                    min={0}
                    value={volumeSampling.extents[axisIndex]}
                    onChange={(e) => onChangeVolumeSamplingExtent(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={volumeShowCropBox}
                  onChange={(e) => onToggleVolumeCropBox(e.target.checked)}
                />
                Show crop box
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={volumeCropGizmoEnabled}
                  onChange={(e) => onToggleVolumeCropGizmo(e.target.checked)}
                />
                Crop gizmo
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => onChangeVolumeCropGizmoMode("move")}
                  style={pill(volumeCropGizmoMode === "move")}
                  disabled={!volumeCropGizmoEnabled}
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => onChangeVolumeCropGizmoMode("scale")}
                  style={pill(volumeCropGizmoMode === "scale")}
                  disabled={!volumeCropGizmoEnabled}
                >
                  Scale
                </button>
              </div>
              <button
                type="button"
                data-testid="volume-apply-sampling"
                onClick={onRebuildVolumeSampling}
                disabled={!volumeSamplingDirty || volumeAllocationPlan.warning === "blocked"}
                style={{ padding: "4px 8px", fontWeight: 700 }}
              >
                Apply sampling
              </button>
              <button
                type="button"
                onClick={onRebuildVolumeSampling}
                disabled={!volumeSamplingDirty || volumeAllocationPlan.warning === "blocked"}
                style={{ padding: "4px 8px" }}
              >
                Crop to current box
              </button>
              <button type="button" onClick={onResetVolumeSampling} style={{ padding: "4px 8px" }}>
                Reset bounds
              </button>
              <button type="button" onClick={onRestoreOriginalVolumeGrid} style={{ padding: "4px 8px" }}>
                Restore original grid
              </button>
            </div>
            <div style={{ fontSize: 10, opacity: 0.65, marginTop: 6 }}>
              Spacing: {fmtVal(volumeSamplingSpacing[0], 3)} × {fmtVal(volumeSamplingSpacing[1], 3)} ×{" "}
              {fmtVal(volumeSamplingSpacing[2], 3)} (world units)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginTop: 8 }}>
              {(["X", "Y", "Z"] as const).map((axis, axisIndex) => (
                <label key={`target-spacing-${axis}`} style={{ display: "grid", gap: 3, fontSize: 10 }}>
                  Target spacing {axis}
                  <input
                    aria-label={`Target spacing ${axis}`}
                    type="number"
                    min={1e-6}
                    step="any"
                    value={volumeTargetSpacing[axisIndex]}
                    onChange={(event) => onChangeVolumeTargetSpacing(axisIndex as 0 | 1 | 2, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <button type="button" onClick={onResampleVolumeToSpacing} style={{ padding: "4px 8px", marginTop: 6 }}>
              Resample to spacing
            </button>
            <div
              role="status"
              data-testid="volume-sampling-status"
              style={{ marginTop: 8, fontSize: 10, color: volumeSamplingStatus.startsWith("Rejected") || volumeSamplingStatus.startsWith("Resample failed") ? "#b42318" : volumeSamplingDirty ? "#8a5800" : "#146c2e" }}
            >
              {volumeSamplingDirty ? "Draft differs from applied grid. " : ""}{volumeSamplingStatus}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: volumeNonFiniteReport.nonFiniteCount ? "#b42318" : "#146c2e" }}>
              Finite samples: {volumeNonFiniteReport.finiteCount.toLocaleString()} · non-finite/missing: {volumeNonFiniteReport.nonFiniteCount.toLocaleString()}
              {volumeNonFiniteReport.nonFiniteIndexBounds
                ? ` · index bounds ${volumeNonFiniteReport.nonFiniteIndexBounds.min.join(",")} → ${volumeNonFiniteReport.nonFiniteIndexBounds.max.join(",")}`
                : ""}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Field</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  onChangeVolumePresetId(volumeShowCustom ? lastVolumePresetIdRef.current : volumePresetId)
                }
                style={pill(!volumeShowCustom)}
                aria-pressed={!volumeShowCustom}
              >
                Preset
              </button>
              <button
                type="button"
                onClick={() => onChangeVolumePresetId("custom")}
                style={pill(volumeShowCustom)}
                aria-pressed={volumeShowCustom}
              >
                Custom
              </button>
            </div>
          </div>

          {!volumeShowCustom && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Preset</div>
              <div style={pillRow}>
                {volumePresetOptions.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChangeVolumePresetId(preset.id)}
                    style={pill(volumePresetId === preset.id)}
                    aria-pressed={volumePresetId === preset.id}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!volumeShowCustom && volumeParamDefs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Parameters</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {volumeParamDefs.map((param) => {
                  const value = volumeParams[param.id] ?? param.defaultValue;
                  return (
                    <label
                      key={param.id}
                      style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 200 }}
                    >
                      <span>
                        {param.label} {formatVolumeParam(value, param.step)}
                      </span>
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={value}
                        onChange={(e) => onChangeVolumeParam(param.id, Number(e.target.value))}
                      />
                      <input
                        type="number"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={value}
                        onChange={(e) => onChangeVolumeParam(param.id, Number(e.target.value))}
                        style={{ width: 90 }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {volumeShowCustom && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Custom field</div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <span>F(x,y,z)</span>
                <input
                  type="text"
                  value={volumeCustomExpr}
                  onChange={(e) => onChangeVolumeCustomExpr(e.target.value)}
                  placeholder="e.g. x^2 + y^2 + z^2 - 1"
                  style={{ width: "100%", fontFamily: "monospace" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, marginTop: 8 }}>
                <span>Embedded examples</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const selected = volumeCustomExamples.find((ex) => ex.id === e.target.value);
                    if (selected) onChangeVolumeCustomExpr(selected.expr);
                    e.currentTarget.value = "";
                  }}
                  style={{ fontSize: 11, padding: "2px 4px", maxWidth: 320 }}
                >
                  <option value="">Pick an example...</option>
                  {volumeCustomExamples.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                Use x,y,z and functions like sin, cos, exp, log, sqrt, abs, min, max. Use sin(x) or sin x. You can type
                F=... and it will be accepted.
              </div>
              {volumeCustomError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#b00020" }}>Error: {volumeCustomError}</div>
              )}
            </div>
          )}

          </fieldset>
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Crosshair</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
              <label
                key={label}
                style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 90 }}
              >
                <span>{label} index</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, volumeSampling.dims[axisIndex] - 1)}
                  value={volumeCrosshairIndex[axisIndex]}
                  onChange={(e) => onChangeVolumeCrosshairIndex(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#566273", marginTop: 6 }}>
            {volumeCrosshairWorld
              ? `World: (${fmtVal(volumeCrosshairWorld[0], 3)}, ${fmtVal(volumeCrosshairWorld[1], 3)}, ${fmtVal(
                  volumeCrosshairWorld[2],
                  3
                )})`
              : "Click a slice to place the crosshair."}
          </div>
          {volumeCrosshairWorld && (
            <div style={{ fontSize: 11, color: "#566273", marginTop: 2 }}>
              F={fmtVal(volumeCrosshairValue ?? 0, 4)} · |∇F|={fmtVal(volumeCrosshairGradMag ?? 0, 4)}
            </div>
          )}

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>View</div>
          <div style={pillRow} data-testid="volume-layout-presets">
            {(["quad", "slices", "3d", "xy", "xz", "yz"] as const).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => onChangeVolumeLayout(layout)}
                style={pill(volumeLayout === layout && !volumeFocusedPane)}
                aria-pressed={volumeLayout === layout && !volumeFocusedPane}
              >
                {layout === "quad" ? "Quad" : layout === "slices" ? "Slices" : layout === "3d" ? "3D" : layout.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: 8, border: "1px solid #d8e2ef", borderRadius: 8, background: "#f8fbff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>3-D spatial context</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(["x", "y", "z"] as const).map((axis) => (
                <label key={`spatial-plane-${axis}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                  <input
                    type="checkbox"
                    checked={volumeSpatialPlaneVisibility[axis]}
                    onChange={(event) => onToggleVolumeSpatialPlane(axis, event.target.checked)}
                  />
                  {axis === "x" ? "YZ" : axis === "y" ? "XZ" : "XY"} plane
                </label>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                <input type="checkbox" checked={volumeClipToCrop} onChange={(event) => onToggleVolumeClipToCrop(event.target.checked)} />
                Clip to crop
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
              <button type="button" onClick={() => onVolumeCameraCommand("fit-mesh")} style={{ padding: "3px 7px", fontSize: 10 }}>Fit mesh</button>
              <button type="button" onClick={() => onVolumeCameraCommand("fit-volume")} style={{ padding: "3px 7px", fontSize: 10 }}>Fit volume</button>
              <button type="button" onClick={() => onVolumeCameraCommand("fit-crop")} style={{ padding: "3px 7px", fontSize: 10 }}>Fit crop</button>
              <button type="button" onClick={() => onVolumeCameraCommand("reset")} style={{ padding: "3px 7px", fontSize: 10 }}>Reset 3D camera</button>
            </div>
          </div>

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Volume slice</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 160 }}>
              <span>Opacity {volumeOpacity.toFixed(2)}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={volumeOpacity}
                onChange={(e) => onChangeVolumeOpacity(Number(e.target.value))}
                style={{ width: 160 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeContourEnabled}
                onChange={(e) => onToggleVolumeContour(e.target.checked)}
              />
              Contours
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Count</span>
              <input
                type="number"
                min={1}
                max={16}
                value={volumeContourCount}
                onChange={(e) =>
                  onChangeVolumeContourCount(Math.max(1, Math.min(16, Number(e.target.value))))
                }
                style={{ width: 70 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeWindowMode === "auto"}
                onChange={(e) => onChangeVolumeWindowMode(e.target.checked ? "auto" : "minmax")}
              />
              Auto window/level
            </label>
          </div>
          {volumeSliceReport && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              <VolumeSliceHistogram stats={volumeSliceReport} />
              <div style={{ fontSize: 10, color: "#566273" }}>
                <div>
                  min {fmtVal(volumeSliceReport.min)} · max {fmtVal(volumeSliceReport.max)}
                </div>
                <div>
                  window {fmtVal(volumeSliceReport.window.low)} → {fmtVal(volumeSliceReport.window.high)} (
                  {volumeSliceReport.window.mode})
                </div>
                <div>
                  mean {fmtVal(volumeSliceReport.mean)} · σ {fmtVal(volumeSliceReport.std)}
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            {volumeSliceHover
              ? `Hover: (${fmtVal(volumeSliceHover.world[0], 3)}, ${fmtVal(volumeSliceHover.world[1], 3)}, ${fmtVal(
                  volumeSliceHover.world[2],
                  3
                )})  F=${fmtVal(volumeSliceHover.value, 4)}  |∇F|=${fmtVal(volumeSliceHover.gradMag ?? 0, 4)}`
              : "Hover over a slice to read F(x,y,z)."}
          </div>
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Isosurface</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                data-testid="volume-show-isosurface"
                checked={volumeShowIsosurface}
                onChange={(e) => onToggleVolumeIsosurface(e.target.checked)}
              />
              Show
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 180 }}>
              <span>Iso {fmtVal(volumeIsoValue, 4)}</span>
              <input
                type="range"
                min={volumeIsoRange.min}
                max={volumeIsoRange.max}
                step={volumeIsoRange.step}
                value={volumeIsoValue}
                onChange={(e) => onChangeVolumeIsoValue(Number(e.target.value))}
                style={{ width: 180 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeIsoSmooth}
                onChange={(e) => onToggleVolumeIsoSmooth(e.target.checked)}
              />
              Smooth isosurface
            </label>
            {volumeIsoSmooth && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <span>Iterations {volumeIsoSmoothIterations}</span>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={1}
                  value={volumeIsoSmoothIterations}
                  onChange={(e) => onChangeVolumeIsoSmoothIterations(Number(e.target.value))}
                  style={{ width: 140 }}
                />
              </label>
            )}
            <button
              type="button"
              data-testid="volume-apply-isosurface"
              onClick={onApplyVolumeIsosurface}
              disabled={volumeIsosurfaceLifecycle === "running" || volumeIsosurfaceLifecycle === "progressive"}
            >
              Apply full isosurface
            </button>
            {(volumeIsosurfaceLifecycle === "queued" || volumeIsosurfaceLifecycle === "running" || volumeIsosurfaceLifecycle === "progressive") && (
              <button type="button" data-testid="volume-cancel-isosurface" onClick={onCancelVolumeIsosurface}>Cancel</button>
            )}
            <span data-testid="volume-isosurface-lifecycle" style={{ fontSize: 10, color: "#475569" }}>
              Live preview · full result {volumeIsosurfaceLifecycle}
            </span>
          </div>
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Streamlines</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeShowStreamlines}
                onChange={(e) => onToggleVolumeStreamlines(e.target.checked)}
              />
              Show
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seed plane</span>
              <div style={pillRow}>
                {(["x", "y", "z"] as const).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() => onChangeVolumeSeedAxis(axis)}
                    style={pill(volumeSeedAxis === axis)}
                    aria-pressed={volumeSeedAxis === axis}
                  >
                    {axis.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seed index</span>
              <input
                type="number"
                min={0}
                max={volumeSeedIndexMax}
                value={volumeSeedIndex}
                onChange={(e) => onChangeVolumeSeedIndex(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seeds per side</span>
              <input
                type="number"
                min={2}
                max={24}
                value={volumeStreamSeedGrid}
                onChange={(e) => onChangeVolumeStreamSeedGrid(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 180 }}>
              <span>Step size {fmtVal(volumeStreamlineStepSize, 4)}</span>
              <input
                type="range"
                min={volumeStreamlineStepRange.min}
                max={volumeStreamlineStepRange.max}
                step={volumeStreamlineStepRange.step}
                value={volumeStreamlineStepSize}
                onChange={(e) => onChangeVolumeStreamlineStepSize(Number(e.target.value))}
                style={{ width: 180 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Step (num)</span>
              <input
                type="number"
                min={volumeStreamlineStepRange.min}
                max={volumeStreamlineStepRange.max}
                step={volumeStreamlineStepRange.step}
                value={volumeStreamlineStepSize}
                onChange={(e) => onChangeVolumeStreamlineStepSize(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <button type="button" onClick={onResetVolumeStreamlineStep} style={{ padding: "3px 8px" }}>
              Auto step
            </button>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Max steps</span>
              <input
                type="number"
                min={50}
                max={5000}
                step={10}
                value={volumeStreamlineMaxSteps}
                onChange={(e) => onChangeVolumeStreamlineMaxSteps(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Field preset</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {VECTOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeVolumeVectorPreset(preset.id)}
                  style={pill(volumeVectorPresetId === preset.id)}
                  aria-pressed={volumeVectorPresetId === preset.id}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              Active field: {volumeVectorPresetLabel}. Step {fmtVal(volumeStreamlineStepSize, 3)}, max steps{" "}
              {volumeStreamlineMaxSteps}, max length {fmtVal(volumeStreamlineMaxLength, 2)}.
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            Source: {volumeDatasetOverride?.label ?? volumePreset.label} sampled on{" "}
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[0]}x
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[1]}x
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[2]}. Bounds: x in [
            {fmtVal(volumeBounds.min[0])}, {fmtVal(volumeBounds.max[0])}], y in [
            {fmtVal(volumeBounds.min[1])}, {fmtVal(volumeBounds.max[1])}], z in [{fmtVal(volumeBounds.min[2])},{" "}
            {fmtVal(volumeBounds.max[2])}].
          </div>
        </div>
      )}

      {viewerKind === "complex" && (
      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Complex Map Sweep (z→w)</div>
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {complexMapIsRiemann
            ? "Define p(z) and render the k-sheet surface w^k = p(z)."
            : "Map z = u + iv to w = f(z), then sweep or graph Re/Im as surfaces."}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Tool mode</div>
        <div style={pillRow}>
          {(
            [
              { id: "line", label: "Set line" },
              { id: "probe", label: "Probe" },
              { id: "preimage", label: "Preimage pick" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setComplexToolMode(mode.id)}
              style={pill(complexToolMode === mode.id)}
              aria-pressed={complexToolMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.72, marginTop: 6 }}>
          {complexToolMode === "line"
            ? "Click Z-plane to set a mapped line."
            : complexToolMode === "probe"
              ? "Click Z/W/3D to inspect one linked point."
              : "Click W-plane to set a preimage target."}
        </div>

        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Map</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Function parser</div>
        <div style={pillRow}>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ inputMode: "reim" })}
            style={pill(complexMapInputModeUi === "reim")}
            aria-pressed={complexMapInputModeUi === "reim"}
          >
            Re/Im components
          </button>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ inputMode: "fz" })}
            style={pill(complexMapInputModeUi === "fz")}
            aria-pressed={complexMapInputModeUi === "fz"}
          >
            Direct f(z)
          </button>
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0 }}>Mapping definition</div>
        {complexMapInputModeUi === "fz" ? (
          <>
            <label style={{ fontSize: 12 }}>{complexMapIsRiemann ? "p(z) =" : "f(z) ="}</label>
            <input
              type="text"
              value={complexMapFunctionExprUi}
              onChange={(e) => {
                onChangeComplexMapSpec({ fExpr: e.target.value, inputMode: "fz" });
                if (complexMapPresetId !== COMPLEX_MAP_CUSTOM_ID) onChangeComplexMapPreset(COMPLEX_MAP_CUSTOM_ID);
              }}
              style={{
                width: "100%",
                marginTop: 2,
                marginBottom: 8,
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </>
        ) : (
          <>
            <label style={{ fontSize: 12 }}>Re({complexMapIsRiemann ? "p" : "w"})(u,v) =</label>
            <input
              type="text"
              value={complexMapSpec.reExpr}
              onChange={(e) => {
                onChangeComplexMapSpec({ reExpr: e.target.value, inputMode: "reim" });
                if (complexMapPresetId !== COMPLEX_MAP_CUSTOM_ID) onChangeComplexMapPreset(COMPLEX_MAP_CUSTOM_ID);
              }}
              style={{
                width: "100%",
                marginTop: 2,
                marginBottom: 6,
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />

            <label style={{ fontSize: 12 }}>Im({complexMapIsRiemann ? "p" : "w"})(u,v) =</label>
            <input
              type="text"
              value={complexMapSpec.imExpr}
              onChange={(e) => {
                onChangeComplexMapSpec({ imExpr: e.target.value, inputMode: "reim" });
                if (complexMapPresetId !== COMPLEX_MAP_CUSTOM_ID) onChangeComplexMapPreset(COMPLEX_MAP_CUSTOM_ID);
              }}
              style={{
                width: "100%",
                marginTop: 2,
                marginBottom: 8,
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </>
        )}

        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Quick presets</div>
        <div style={{ ...pillRow, flexWrap: "wrap" }}>
          {[{ id: COMPLEX_MAP_CUSTOM_ID, label: "Custom" }, ...COMPLEX_MAP_PRESETS].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangeComplexMapPreset(p.id)}
              style={pill(complexMapPresetId === p.id)}
              aria-pressed={complexMapPresetId === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ ...styles.hint, marginTop: 6 }}>
          {complexMapInputModeUi === "fz"
            ? "Use z (plus optional u,v), i, and functions sin/cos/tan/exp/log/sqrt/abs. Constants: pi, e."
            : "Use u, v and functions like sin, cos, exp. Constants: pi, e."}
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Map mode</div>
        <div style={pillRow}>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ mapMode: "standard" })}
            style={pill(!complexMapIsRiemann)}
            aria-pressed={!complexMapIsRiemann}
          >
            Single-valued w = f(z)
          </button>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ mapMode: "riemann" })}
            style={pill(complexMapIsRiemann)}
            aria-pressed={complexMapIsRiemann}
          >
            Multi-sheet w^k = p(z)
          </button>
        </div>
        {complexMapIsRiemann && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 11 }}>
                Sheets k
                <input
                  type="number"
                  min={2}
                  max={12}
                  step={1}
                  value={complexMapSheetCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    onChangeComplexMapSpec({ sheetCount: clampInt(v, 2, 12) });
                  }}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 11 }}>
                Active sheet
                <input
                  type="number"
                  min={1}
                  max={complexMapSheetCount}
                  step={1}
                  value={complexMapSheetIndex + 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    onChangeComplexMapSpec({ sheetIndex: clampInt(v - 1, 0, complexMapSheetCount - 1) });
                  }}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => onChangeComplexMapSpec({ sheetMode: "all" })}
                style={pill(complexMapSpec.sheetMode === "all")}
                aria-pressed={complexMapSpec.sheetMode === "all"}
              >
                Render all sheets
              </button>
              <button
                type="button"
                onClick={() => onChangeComplexMapSpec({ sheetMode: "single" })}
                style={pill(complexMapSpec.sheetMode !== "all")}
                aria-pressed={complexMapSpec.sheetMode !== "all"}
              >
                Render active sheet only
              </button>
            </div>
            <label style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              <span>Branch cut angle (deg)</span>
              <input
                type="number"
                step={5}
                value={Number.isFinite(complexMapBranchCutDeg) ? complexMapBranchCutDeg.toFixed(1) : "0"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  onChangeComplexMapSpec({ branchCutAngle: (v * Math.PI) / 180 });
                }}
                style={{ width: "100%" }}
              />
            </label>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              The branch cut angle rotates the principal argument; zeros of p(z) are branch points for k&gt;1.
            </div>
          </>
        )}

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Domain & sampling</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 11 }}>
            u min
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.uMin}
              onChange={(e) => onChangeComplexMapSpec({ uMin: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            u max
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.uMax}
              onChange={(e) => onChangeComplexMapSpec({ uMax: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            v min
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.vMin}
              onChange={(e) => onChangeComplexMapSpec({ vMin: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            v max
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.vMax}
              onChange={(e) => onChangeComplexMapSpec({ vMax: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            nu
            <input
              type="number"
              min={2}
              max={400}
              step={1}
              value={complexMapSpec.nu}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeComplexMapSpec({ nu: clampInt(v, 2, 400) });
              }}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            nv
            <input
              type="number"
              min={2}
              max={400}
              step={1}
              value={complexMapSpec.nv}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeComplexMapSpec({ nv: clampInt(v, 2, 400) });
              }}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Embedding</div>
        <div style={pillRow}>
          {(["v", "u"] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              onClick={() => onChangeComplexMapSpec({ sweepAxis: axis })}
              style={pill(complexMapSpec.sweepAxis === axis)}
              aria-pressed={complexMapSpec.sweepAxis === axis}
            >
              Sweep by {axis}
            </button>
          ))}
        </div>
          </div>
        </details>

        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>View / Output</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0, marginBottom: 4 }}>Output surface</div>
        <div style={pillRow}>
          {(
            [
              { id: "sweep", label: "Sweep (Re, Im)" },
              { id: "re", label: "Re surface" },
              { id: "im", label: "Im surface" },
              { id: "both", label: "Re + Im surfaces" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChangeComplexMapSpec({ outputMode: mode.id })}
              style={pill(complexMapSpec.outputMode === mode.id)}
              aria-pressed={complexMapSpec.outputMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          Re/Im surfaces use x = sweep axis, z = the other domain axis, height = Re/Im.
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Scaling & safety</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <span style={{ minWidth: 54 }}>w scale</span>
          <input
            type="number"
            step={0.1}
            value={complexMapSpec.wScale}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeComplexMapSpec({ wScale: v });
            }}
            style={{ width: 90 }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={complexMapSpec.clampAbs != null}
              onChange={(e) => onChangeComplexMapSpec({ clampAbs: e.target.checked ? 4 : null })}
            />
            Clamp |w|
          </label>
          <input
            type="number"
            step={0.1}
            min={0}
            value={complexMapSpec.clampAbs ?? 4}
            disabled={complexMapSpec.clampAbs == null}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeComplexMapSpec({ clampAbs: v });
            }}
            style={{ width: 80 }}
          />
        </div>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Mapped coordinate net (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={complexMapSpec.showIsolines}
                  onChange={(e) => onChangeComplexMapSpec({ showIsolines: e.target.checked })}
                />
                Show u/v grid
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: COMPLEX_GRID_COLORS.u }} />
                u-count
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={complexMapSpec.isolinesCountU}
                  disabled={!complexMapSpec.showIsolines}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeComplexMapSpec({ isolinesCountU: clampInt(v, 0, 120) });
                  }}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: COMPLEX_GRID_COLORS.v }} />
                v-count
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={complexMapSpec.isolinesCountV}
                  disabled={!complexMapSpec.showIsolines}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeComplexMapSpec({ isolinesCountV: clampInt(v, 0, 120) });
                  }}
                  style={{ width: 70 }}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                marginTop: 6,
                opacity: complexMapSpec.showIsolines ? 1 : 0.6,
                fontSize: 11,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Thickness {fmtVal(complexMapGridThickness, 2)}</span>
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.1}
                  value={complexMapGridThickness}
                  onChange={(e) => setComplexMapGridThickness(Number(e.target.value))}
                  disabled={!complexMapSpec.showIsolines}
                  style={{ width: 140 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Opacity {fmtVal(complexMapGridOpacity, 2)}</span>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={complexMapGridOpacity}
                  onChange={(e) => setComplexMapGridOpacity(Number(e.target.value))}
                  disabled={!complexMapSpec.showIsolines}
                  style={{ width: 140 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={complexMapGridShowSurface}
                  onChange={(e) => setComplexMapGridShowSurface(e.target.checked)}
                  disabled={!complexMapSpec.showIsolines}
                />
                Show on surface
              </label>
            </div>
            {complexMapSpec.outputMode !== "sweep" && (
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
                3D lines include mapped lines plus the Re/Im graph lines.
              </div>
            )}
          </div>
        </details>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Z/W planes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <button
            type="button"
            onClick={() => setComplexLineMode("vertical")}
            style={pill(complexLineMode === "vertical")}
            aria-pressed={complexLineMode === "vertical"}
            disabled={complexToolMode !== "line"}
          >
            Vertical line
          </button>
          <button
            type="button"
            onClick={() => setComplexLineMode("horizontal")}
            style={pill(complexLineMode === "horizontal")}
            aria-pressed={complexLineMode === "horizontal"}
            disabled={complexToolMode !== "line"}
          >
            Horizontal line
          </button>
          <button
            type="button"
            onClick={() => onPickComplexMapLine(null)}
            style={pill(!complexMapLine)}
            aria-pressed={!complexMapLine}
            disabled={complexToolMode !== "line"}
          >
            Clear line
          </button>
          <span style={{ fontSize: 11, opacity: 0.7, alignSelf: "center" }}>
            {complexToolMode === "line"
              ? "Click Z-plane to pick. Shift-click flips direction."
              : "Switch Tool mode to Set line to edit mapped lines."}
          </span>
        </div>
        <details style={{ marginBottom: 6 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>W-plane overlays (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneDomainColor}
                  onChange={(e) => onChangeWPlaneDomainColor(e.target.checked)}
                />
                W-plane domain coloring
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneShowRings}
                  onChange={(e) => onChangeWPlaneShowRings(e.target.checked)}
                  disabled={!wPlaneDomainColor}
                />
                |w| rings
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneShowRays}
                  onChange={(e) => onChangeWPlaneShowRays(e.target.checked)}
                  disabled={!wPlaneDomainColor}
                />
                arg(w) rays
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowSphere}
                  onChange={(e) => onToggleComplexMapShowSphere(e.target.checked)}
                />
                Riemann sphere view
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexShowScalarDomains}
                  onChange={(e) => setComplexShowScalarDomains(e.target.checked)}
                />
                Scalar maps: Re, Im, |f|, arg
              </label>
              {complexMapShowSphere && (
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={complexMapSphereStacked}
                    onChange={(e) => onToggleComplexMapSphereStacked(e.target.checked)}
                  />
                  Stack along sweep axis ({complexMapSpec.sweepAxis})
                </label>
              )}
            </div>
            {complexMapShowSphere && (
              <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>
                Riemann sphere is shown in the right-side panel next to the main 3D view.
              </div>
            )}
          </div>
        </details>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Z-plane</div>
            <PlanePlot
              id="svgZ"
              extent={complexMapZExtent}
              step={1}
              ref={zPlaneRef}
              style={{ height: 160 }}
              onClickPoint={complexToolMode === "preimage" ? undefined : handleZPlaneClick}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>W-plane</div>
            <PlanePlot
              id="svgW"
              extent={complexMapWExtent}
              step={1}
              ref={wPlaneRef}
              style={{ height: 160 }}
              onClickPoint={complexToolMode === "line" ? undefined : handleWPlaneClick}
              domainColoring={wPlaneDomainColor}
              domainRings={wPlaneShowRings}
              domainRays={wPlaneShowRays}
            />
          </div>
          {complexMapShowSphere && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Riemann sphere</div>
              <RiemannSpherePlot
                lines={complexMapSphereLines}
                points={complexMapSpherePoints}
                guideSpheres={complexMapSphereGuides}
                style={{ height: 180 }}
              />
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                w mapped by stereographic projection; poles collapse to the north pole.
              </div>
            </div>
          )}
          {complexShowScalarDomains && (
            <div style={{ marginTop: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Z-domain scalar maps</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 3 }}>Re(f)</div>
                  <PlanePlot
                    id="svgZScalarRe"
                    extent={complexMapZExtent}
                    step={1}
                    ref={scalarRePlaneRef}
                    style={{ height: 128 }}
                    showLabels={false}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 3 }}>Im(f)</div>
                  <PlanePlot
                    id="svgZScalarIm"
                    extent={complexMapZExtent}
                    step={1}
                    ref={scalarImPlaneRef}
                    style={{ height: 128 }}
                    showLabels={false}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 3 }}>|f|</div>
                  <PlanePlot
                    id="svgZScalarAbs"
                    extent={complexMapZExtent}
                    step={1}
                    ref={scalarAbsPlaneRef}
                    style={{ height: 128 }}
                    showLabels={false}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 3 }}>arg(f)</div>
                  <PlanePlot
                    id="svgZScalarArg"
                    extent={complexMapZExtent}
                    step={1}
                    ref={scalarArgPlaneRef}
                    style={{ height: 128 }}
                    showLabels={false}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                All four panels use the same z-domain; line/probe overlays stay synchronized.
              </div>
            </div>
          )}
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Preimage tool</div>
        <div style={pillRow}>
          {(
            [
              { id: "none", label: "Off" },
              { id: "re", label: "Re(w)=c" },
              { id: "im", label: "Im(w)=c" },
              { id: "abs", label: "|w|=r" },
              { id: "arg", label: "arg(w)=θ" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setComplexPreimageMode(mode.id)}
              style={pill(complexPreimageMode === mode.id)}
              aria-pressed={complexPreimageMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Value
            <input
              type="number"
              step={complexPreimageMode === "arg" ? 0.1 : 0.05}
              value={complexPreimageValue}
              disabled={complexPreimageMode === "none"}
              onChange={(e) => applyPreimageValue(complexPreimageMode, Number(e.target.value))}
              style={{ width: 90 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={complexPreimageSnap}
              onChange={(e) => setComplexPreimageSnap(e.target.checked)}
              disabled={complexPreimageMode === "none"}
            />
            Snap to nice values
          </label>
          {complexPreimageMode === "arg" && (
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              θ = {(complexPreimageValue * (180 / Math.PI)).toFixed(1)}°
            </span>
          )}
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {complexToolMode === "preimage" ? "Click W-plane to set." : "Switch Tool mode to Preimage pick to set."}
          </span>
        </div>
          </div>
        </details>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Analysis</summary>
          <div style={{ marginTop: 8 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Marker overlays (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowCritical}
                  onChange={(e) => setComplexMapShowCritical(e.target.checked)}
                />
                critical |detJ| ≤ {fmtVal(complexMapMarkerData?.thresholds.critical ?? 0, 4)}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowZeros}
                  onChange={(e) => setComplexMapShowZeros(e.target.checked)}
                />
                zeros |w| ≤ {fmtVal(complexMapMarkerData?.thresholds.zero ?? 0, 4)}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowPoles}
                  onChange={(e) => setComplexMapShowPoles(e.target.checked)}
                />
                poles |w| ≥ {fmtVal(complexMapMarkerData?.thresholds.pole ?? 0, 4)}
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                crit rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={complexMapCriticalRel}
                  onChange={(e) => setComplexMapCriticalRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                zero rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={complexMapZeroRel}
                  onChange={(e) => setComplexMapZeroRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                pole rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.02}
                  value={complexMapPoleRel}
                  onChange={(e) => setComplexMapPoleRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                max markers
                <input
                  type="number"
                  min={20}
                  max={2000}
                  step={10}
                  value={complexMapMarkerMax}
                  onChange={(e) => setComplexMapMarkerMax(clampInt(Number(e.target.value), 20, 2000))}
                  style={{ width: 80 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkersZ}
                  onChange={(e) => setComplexMapMarkersZ(e.target.checked)}
                />
                Z-plane markers
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkersW}
                  onChange={(e) => setComplexMapMarkersW(e.target.checked)}
                />
                W-plane markers
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkers3d}
                  onChange={(e) => setComplexMapMarkers3d(e.target.checked)}
                />
                3D markers
              </label>
            </div>
          </div>
        </details>

        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Distortion (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={pillRow}>
              {(
                [
                  { id: "none", label: "Off" },
                  { id: "area", label: "Area |detJ|" },
                  { id: "anisotropy", label: "σmax/σmin" },
                  { id: "conformal", label: "Conformal error" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setComplexDistortionMode(mode.id)}
                  style={pill(complexDistortionMode === mode.id)}
                  aria-pressed={complexDistortionMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Scale
                <button
                  type="button"
                  onClick={() => setComplexDistortionScale("linear")}
                  style={pill(complexDistortionScale === "linear")}
                  aria-pressed={complexDistortionScale === "linear"}
                  disabled={complexDistortionMode === "none"}
                >
                  Linear
                </button>
                <button
                  type="button"
                  onClick={() => setComplexDistortionScale("log")}
                  style={pill(complexDistortionScale === "log")}
                  aria-pressed={complexDistortionScale === "log"}
                  disabled={
                    complexDistortionMode === "none" ||
                    (complexDistortionMode !== "area" && complexDistortionMode !== "anisotropy")
                  }
                >
                  Log
                </button>
              </div>
              {complexDistortionMode === "conformal" && (
                <span style={{ opacity: 0.7 }}>Log scale only applies to |detJ| and σmax/σmin.</span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexDistortionShowZ}
                  onChange={(e) => setComplexDistortionShowZ(e.target.checked)}
                  disabled={complexDistortionMode === "none"}
                />
                Z-plane heatmap
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexDistortionShowSurface}
                  onChange={(e) => setComplexDistortionShowSurface(e.target.checked)}
                  disabled={complexDistortionMode === "none"}
                />
                Surface color
              </label>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              {complexMapDistortionProbe ? (
                <>
                  u={fmtVal(complexMapDistortionProbe.u, 3)} v={fmtVal(complexMapDistortionProbe.v, 3)} · |detJ|=
                  {fmtVal(complexMapDistortionProbe.detAbs, 4)} · σmax/σmin=
                  {fmtVal(complexMapDistortionProbe.ratio, 3)} · conf=
                  {fmtVal(complexMapDistortionProbe.conformalErr, 4)}
                  {complexDistortionScale === "log" &&
                    (complexDistortionMode === "area" || complexDistortionMode === "anisotropy") && (
                      <>
                        {" "}· log10(1+v)=
                        {complexDistortionMode === "area"
                          ? fmtVal(Math.log10(1 + Math.max(0, complexMapDistortionProbe.detAbs)), 4)
                          : fmtVal(Math.log10(1 + Math.max(0, complexMapDistortionProbe.ratio)), 4)}
                      </>
                    )}
                </>
              ) : (
                "Probe in Z/W/3D to read local distortion."
              )}
            </div>
          </div>
        </details>
          </div>
        </details>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Inspect</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0, marginBottom: 4 }}>Linked probe</div>
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {complexToolMode === "probe"
            ? "Probe mode is active. Click Z/W/3D to inspect."
            : "Switch Tool mode to Probe to inspect points."}
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, lineHeight: 1.4 }}>
          {complexMapProbe ? (
            <>
              u={fmtVal(complexMapProbe.u, 3)} v={fmtVal(complexMapProbe.v, 3)} · w=
              {fmtVal(complexMapProbe.w.re, 3)} + {fmtVal(complexMapProbe.w.im, 3)}i · |w|=
              {fmtVal(complexMapProbe.w.mag, 3)} · arg(w)={fmtVal(complexMapProbe.w.arg, 3)} (
              {fmtVal((complexMapProbe.w.arg * 180) / Math.PI, 1)}°)
              <br />
              local scale={fmtVal(complexMapProbe.localScale, 4)} · detJ={fmtVal(complexMapProbe.det, 4)}
            </>
          ) : (
            "Click the Z-plane, W-plane, or 3D surface to inspect a point."
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onPinComplexMapProbe} disabled={!complexMapProbe}>
            Pin probe
          </button>
          <button type="button" onClick={onClearComplexMapProbe} disabled={!complexMapProbe}>
            Clear
          </button>
          {complexMapProbePins.length > 0 && (
            <button type="button" onClick={onClearComplexMapProbePins}>
              Clear pins
            </button>
          )}
        </div>
        {complexMapProbePins.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {complexMapProbePins.map((pin) => (
              <div
                key={pin.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                  fontSize: 11,
                }}
              >
                <div style={{ flex: 1 }}>
                  u={fmtVal(pin.u, 3)} v={fmtVal(pin.v, 3)} · |w|={fmtVal(pin.w.mag, 3)} · detJ=
                  {fmtVal(pin.det, 3)}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onRecallComplexMapProbe(pin)}>
                    Use
                  </button>
                  <button type="button" onClick={() => onRemoveComplexMapProbePin(pin.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </details>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onBuildComplexMapSweep} style={{ padding: "4px 10px" }}>
            {complexMapSpec.outputMode === "both" ? "Build surfaces" : "Build surface"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={complexMapLive}
              onChange={(e) => onToggleComplexMapLive(e.target.checked)}
            />
            Live update
          </label>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {complexMapLive ? "Auto rebuild on edits." : "Rebuild after edits."}
          </span>
        </div>

        {complexMapError && (
          <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{complexMapError}</div>
        )}
      </div>
      )}

      {leftTab === "object" && wrapComplexAdvancedTools(
      <>
      <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setMeshToolsTab("surface_mesh")}
          style={pill(meshToolsTab === "surface_mesh")}
          aria-pressed={meshToolsTab === "surface_mesh"}
        >
          SurfaceMesh
        </button>
        <button
          type="button"
          onClick={() => setMeshToolsTab("operations")}
          style={pill(meshToolsTab === "operations")}
          aria-pressed={meshToolsTab === "operations"}
        >
          Mesh Operations
        </button>
        <button
          type="button"
          onClick={() => setMeshToolsTab("volume")}
          style={pill(meshToolsTab === "volume")}
          aria-pressed={meshToolsTab === "volume"}
        >
          Volume bridge
        </button>
      </div>
      {meshToolsTab === "surface_mesh" && (
      <div style={{ ...cardStyle, marginTop: 0 }}>
        <div
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            background: "#eff6ff",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Open mesh file</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => meshQuickFileInputRef.current?.click()}
              disabled={surfaceMeshImportBusy}
            >
              {surfaceMeshImportBusy ? "Loading..." : "Load STL/OBJ/PLY/GLTF"}
            </button>
            <button
              type="button"
              onClick={() => onToggleSurfaceMeshBenchmarkBrowser(!surfaceMeshBenchmarkBrowserOpen)}
              disabled={surfaceMeshImportBusy || !surfaceMeshBenchmarkAvailable}
            >
              Benchmark Model... [DEV]
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={surfaceMeshMergeVertices}
                onChange={(e) => onToggleSurfaceMeshMergeVertices(e.target.checked)}
              />
              merge vertices
            </label>
            <input
              ref={meshQuickFileInputRef}
              type="file"
              multiple
              accept=".stl,.obj,.ply,.gltf,.glb"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = e.currentTarget.files ?? null;
                onLoadSurfaceMeshFile(files);
                e.currentTarget.value = "";
              }}
            />
          </div>
          {surfaceMeshBenchmarkError && (
            <div style={{ fontSize: 11, color: "#b42318" }}>{surfaceMeshBenchmarkError}</div>
          )}
          {surfaceMeshBenchmarkBrowserOpen && surfaceMeshBenchmarkAvailable && (
            <div style={{ display: "grid", gap: 8, paddingTop: 4 }}>
              {surfaceMeshBenchmarkModelsByCategory.map((group) => (
                <div key={`mesh-benchmark-quick-group-${group.category}`}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{group.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {group.models.map((model) => (
                      <button
                        key={`mesh-benchmark-quick-${model.id}`}
                        type="button"
                        onClick={() => onLoadSurfaceMeshBenchmarkModel(model.id)}
                        disabled={surfaceMeshImportBusy}
                        title={model.relativePath}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#475467" }}>
            For GLTF with external resources, select the .gltf plus related .bin/textures together.
          </div>
        </div>
        <div style={{ marginTop: 0 }}>
        {viewerKind !== "mesh" ? (
          <>
            <button
              type="button"
              onClick={onConvertToMesh}
              disabled={!surfaceMeshExportable}
              style={{ padding: "4px 10px" }}
            >
              Promote to SurfaceMesh…
            </button>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {surfaceMeshExportable
                ? viewerKind === "complex"
                  ? "Promote the current complex-map surface into the SurfaceMesh viewer."
                  : "Promote the current surface into a SurfaceMesh dataset."
                : viewerKind === "implicit"
                  ? "Use Mesh Operations -> Implicit mesh first to promote an implicit surface."
                  : viewerKind === "complex"
                    ? "Build the complex map surface first."
                    : "SurfaceMesh promotion will enable once the surface is ready."}
            </div>
            {surfaceMeshImportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>
                {surfaceMeshImportError}
              </div>
            )}
            {viewerKind === "implicit" && (
              <details
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                }}
              >
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>
                  Advanced engines
                </summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <div
                  style={{
                    border: "1px solid #bfdbfe",
                    borderRadius: 7,
                    background: "#eff6ff",
                    padding: "6px 7px",
                    fontSize: 11,
                    display: "grid",
                    gap: 5,
                  }}
                >
                  <div>
                    Production mesh operations are in <strong>Mesh Operations</strong>. Use this advanced section only for direct backend diagnostics.
                  </div>
                  <button type="button" onClick={() => setMeshToolsTab("operations")} style={{ justifySelf: "start" }}>
                    Open Mesh Operations
                  </button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Generate</div>
                <div style={{ display: "grid", gap: 3, fontSize: 11 }}>
                  <div>
                    <strong>Source</strong>
                  </div>
                  <div>Object: {activeMeta.label}</div>
                  <div>Mode: implicit surface f(x,y,z)=0</div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 7,
                    fontSize: 11,
                    borderTop: "1px dashed #d5dbe5",
                    paddingTop: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Meshing</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    Quality
                    <select
                      value={implicitMeshingQuality}
                      onChange={(e) => {
                        const quality = e.target.value as "preview" | "standard" | "robust";
                        setImplicitMeshingQuality(quality);
                        if (quality === "standard") {
                          onChangeCgalAutoTargetEdge(true);
                          onChangeCgalTriBudgetEnabled(false);
                        }
                      }}
                    >
                      <option value="preview">Preview</option>
                      <option value="standard">Standard</option>
                      <option value="robust">Robust</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong>Method</strong>
                    <span>{implicitMeshingEngineLabel}</span>
                    {!implicitMeshingUsesPreview && (
                      <>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: cgalStatusColor,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: cgalStatusColor }}>{cgalStatusText}</span>
                      </>
                    )}
                  </div>
                  {implicitMeshingUsesPreview ? (
                    <>
                      <div>Resolution: {meshOperationPreviewResolution}^3</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={meshOperationPreviewUseDecimate}
                          disabled={meshOperationPreviewDisabled}
                          onChange={(e) => onChangeMeshOperationPreviewUseDecimate(e.target.checked)}
                        />
                        Triangle cap
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Cap
                        <input
                          type="number"
                          min={200}
                          max={500000}
                          step={100}
                          value={Math.min(500000, Math.max(200, Math.round(meshOperationPreviewTargetFaces)))}
                          disabled={!meshOperationPreviewUseDecimate || meshOperationPreviewDisabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeMeshOperationPreviewTargetFaces(Math.min(500000, Math.max(200, v)));
                          }}
                          style={{ width: 110 }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Target edge
                        <input
                          type="number"
                          min={0.0001}
                          step={0.01}
                          value={cgalTargetEdge}
                          disabled={cgalTargetEdgeLocked}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalTargetEdge(Math.max(0.0001, v));
                          }}
                          style={{ width: 90 }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={cgalAutoTargetEdge || implicitMeshingQuality === "standard"}
                            disabled={cgalDisabled || cgalTriBudgetEnabled || implicitMeshingQuality === "standard"}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              onChangeCgalAutoTargetEdge(checked);
                              if (checked) onChangeCgalTriBudgetEnabled(false);
                            }}
                          />
                          Auto
                        </label>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={cgalTriBudgetEnabled}
                          disabled={cgalDisabled}
                          onChange={(e) => onChangeCgalTriBudgetEnabled(e.target.checked)}
                        />
                        Triangle cap
                        <input
                          type="number"
                          min={200}
                          max={1000000}
                          step={200}
                          value={Math.min(1000000, Math.max(200, Math.round(cgalTriBudget)))}
                          disabled={cgalDisabled || !cgalTriBudgetEnabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalTriBudget(Math.min(1000000, Math.max(200, v)));
                          }}
                          style={{ width: 110 }}
                        />
                      </label>
                      <div style={{ color: cgalTooHeavy ? "#b42318" : "#556" }}>
                        Est. triangles ~{fmtTriEstimate(cgalEstimatedTris)} @ edge {fmtVal(cgalEffectiveEdge, 4)}
                      </div>
                      {cgalMeshInfo && (
                        <div style={{ color: "#556" }}>
                          Last robust mesh: {cgalMeshInfo.vertexCount.toLocaleString()} verts /{" "}
                          {cgalMeshInfo.triCount.toLocaleString()} tris
                        </div>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => void runImplicitMeshingStrategy()} disabled={implicitMeshingDisabled}>
                    {implicitMeshingBusy ? "Generating..." : "Generate mesh"}
                  </button>
                  <div style={{ color: generateStatusColor }}>Status: {generateStatusText}</div>
                  {meshOperationPreviewError && <div style={{ color: "#b42318" }}>{meshOperationPreviewError}</div>}
                  {cgalError && <div style={{ color: "#b42318" }}>{cgalError}</div>}
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Backend diagnostics</summary>
                    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                      <div>Backend: {implicitMeshingBackendLabel}</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Padding (%)
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={0.5}
                          value={Number.isFinite(cgalPadFrac) ? (cgalPadFrac * 100).toFixed(1) : "5.0"}
                          disabled={cgalDisabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalPadFrac(Math.min(0.5, Math.max(0, v / 100)));
                          }}
                          style={{ width: 70 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Preflight samples
                        <input
                          type="number"
                          min={3}
                          max={40}
                          step={1}
                          value={Math.max(3, Math.min(40, Math.round(cgalPreflightSamples)))}
                          disabled={cgalDisabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalPreflightSamples(Math.max(3, Math.min(40, Math.round(v))));
                          }}
                          style={{ width: 80 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Radius bound
                        <input
                          type="number"
                          min={0.001}
                          max={1}
                          step={0.001}
                          value={Number.isFinite(cgalRadiusBound) ? cgalRadiusBound : 0.1}
                          disabled={cgalDisabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalRadiusBound(Math.max(0.001, Math.min(1, v)));
                          }}
                          style={{ width: 90 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={cgalMinTrisEnabled}
                          disabled={cgalDisabled}
                          onChange={(e) => onChangeCgalMinTrisEnabled(e.target.checked)}
                        />
                        Min triangles
                        <input
                          type="number"
                          min={200}
                          max={1000000}
                          step={200}
                          value={Math.min(1000000, Math.max(200, Math.round(cgalMinTris)))}
                          disabled={cgalDisabled || !cgalMinTrisEnabled}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeCgalMinTris(Math.min(1000000, Math.max(200, v)));
                          }}
                          style={{ width: 110 }}
                        />
                      </label>
                      {cgalMinTrisEnabled && (
                        <div style={{ color: "#556" }}>
                          Min-tris edge estimate {fmtVal(estimateTargetEdgeFromBudget(cgalDomainDiag, cgalMinTris), 4)}
                        </div>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={cgalVerbose}
                          disabled={cgalDisabled}
                          onChange={(e) => onChangeCgalVerbose(e.target.checked)}
                        />
                        Verbose engine logs
                      </label>
                      <button type="button" onClick={() => void onStopCgalWorker()} disabled={cgalStopDisabled}>
                        Stop worker
                      </button>
                      {cgalHealthState?.logsPath && (
                        <div style={{ fontSize: 10, color: "#667085", wordBreak: "break-all" }}>log: {cgalHealthState.logsPath}</div>
                      )}
                    </div>
                  </details>
                </div>
                </div>
              </details>
            )}
            {viewerKind === "implicit" && (
              <details
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                }}
              >
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>
                  Legacy marching-cubes baker
                </summary>
                <div style={{ fontSize: 11, color: "#667085", margin: "6px 0" }}>
                  Direct backend diagnostics. Use Mesh Operations for normal implicit meshing.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={{ fontSize: 11 }}>
                    x span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.xSpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          xSpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    y span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.ySpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          ySpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    z span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.zSpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          zSpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    resolution
                    <input
                      type="number"
                      min={16}
                      max={320}
                      step={1}
                      value={implicitBakeResolution}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          onChangeImplicitBakeResolution(Math.max(16, Math.min(320, Math.round(v))));
                        }
                      }}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={onUseImplicitBakeDomain} style={{ padding: "4px 8px" }}>
                    Use domain
                  </button>
                  <button type="button" onClick={onResetImplicitBakeBounds} style={{ padding: "4px 8px" }}>
                    Reset
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <button type="button" onClick={onBakeImplicit} disabled={implicitBakeBusy} style={{ padding: "4px 10px" }}>
                    {implicitBakeBusy ? "Baking..." : "Bake (marching cubes)"}
                  </button>
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  Runs in a worker so higher resolutions stay responsive.
                </div>
                {implicitBakeBusy && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {implicitBakePhase === "marching" ? "Marching cubes" : "Sampling grid"} · {implicitBakePercent}%
                    </div>
                    <div style={{ height: 6, background: "#eee", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                      <div style={{ width: `${implicitBakePercent}%`, height: "100%", background: "#0a66c2" }} />
                    </div>
                  </div>
                )}
                {implicitBakeCacheHit && (
                  <div style={{ fontSize: 11, color: "#357", marginTop: 6 }}>Used cached bake.</div>
                )}
                {implicitBakeError && (
                  <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{implicitBakeError}</div>
                )}
              </details>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{surfaceMeshLabel}</div>
            {surfaceMeshStats && (
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                {surfaceMeshStats.vertCount.toLocaleString()} verts · {surfaceMeshStats.triCount.toLocaleString()} tris
              </div>
            )}
            {surfaceMeshSource && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                Source: {formatSurfaceMeshSource(surfaceMeshSource)}
              </div>
            )}
            {meshPromotionTrace && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid #dbe2ea",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 5,
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 700 }}>Promotion traceability</div>
                <div>
                  <strong>Geometry object:</strong> {meshPromotionTrace.sourceGeometryObjectName}
                </div>
                <div>
                  <strong>Promoted mesh:</strong> {meshPromotionTrace.snapshotLabel}
                </div>
                <div>
                  <strong>Status:</strong> {meshPromotionTrace.frozen ? "frozen" : "live"}
                </div>
                {meshPromotionHasIndependentEdits && (
                  <div style={{ color: "#b54708" }}>
                    This promoted mesh has independent downstream edits. Refreshing from Geometry will create a new mesh snapshot rather than overwrite the existing result.
                  </div>
                )}
                <div style={{ marginTop: 2 }}>
                  <strong>Operations after promotion</strong>
                  <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                    {meshPromotionTrace.operationHistory.slice(0, 8).map((entry) => (
                      <div key={`mesh-promotion-op-${entry.id}`} style={{ color: "#475467", display: "grid", gap: 1 }}>
                        <div>
                          {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {entry.label}
                        </div>
                        {entry.result && (
                          <div style={{ color: "#0f3557", fontSize: 10 }}>
                            {entry.result.engine.toUpperCase()} · {entry.result.status} ·{" "}
                            {entry.result.beforeFaces.toLocaleString()} {"->"}{" "}
                            {entry.result.afterFaces == null ? "n/a" : entry.result.afterFaces.toLocaleString()} faces ·{" "}
                            {entry.result.durationMs >= 1000
                              ? `${(entry.result.durationMs / 1000).toFixed(2)} s`
                              : `${Math.round(entry.result.durationMs)} ms`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                  <button type="button" onClick={onOpenMeshPromotionSourceGeometryObject}>
                    Open source Geometry object
                  </button>
                  <button type="button" onClick={onOpenPromotedMeshObject}>
                    Open promoted Mesh object
                  </button>
                  <button type="button" onClick={onCompareMeshPromotionWithSource} disabled={!meshReady}>
                    Compare source vs promoted mesh
                  </button>
                  <button type="button" onClick={onRefreshMeshPromotionFromSource}>
                    Refresh promotion from current source
                  </button>
                  <button type="button" onClick={onToggleMeshPromotionFreeze}>
                    {meshPromotionTrace.frozen ? "Unfreeze promotion" : "Freeze promotion"}
                  </button>
                </div>
                {meshPromotionStatus && <div style={{ color: "#475467" }}>{meshPromotionStatus}</div>}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Generate</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {surfaceMeshPresets.map((p) => (
                <button key={p.id} type="button" onClick={() => onGenerateSurfaceMeshPreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {surfaceMeshAssetPresets.length > 0 && (
              <>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Bundled presets</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {surfaceMeshAssetPresets.map((p) => (
                    <button key={p.id} type="button" onClick={() => onGenerateSurfaceMeshAssetPreset(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {surfaceMeshTopologySavedPresets.length > 0 && (
              <>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Saved edited meshes</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {surfaceMeshTopologySavedPresets.slice(0, 5).map((preset) => (
                    <button
                      key={`surface-mesh-saved-topology-${preset.id}`}
                      type="button"
                      onClick={() => onApplySurfaceMeshTopologySavedPreset(preset.id)}
                      title={`${preset.name}\n${preset.summary}`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Load file</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => meshFileInputRef.current?.click()}
                disabled={surfaceMeshImportBusy}
              >
                {surfaceMeshImportBusy ? "Loading..." : "Load STL/OBJ/PLY/GLTF"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceMeshMergeVertices}
                  onChange={(e) => onToggleSurfaceMeshMergeVertices(e.target.checked)}
                />
                merge vertices
              </label>
              <input
                ref={meshFileInputRef}
                type="file"
                multiple
                accept=".stl,.obj,.ply,.gltf,.glb"
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = e.currentTarget.files ?? null;
                  onLoadSurfaceMeshFile(files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              For .gltf with external .bin/textures, select all related files together.
            </div>
            {(surfaceMeshBenchmarkAvailable || surfaceMeshBenchmarkError) && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onToggleSurfaceMeshBenchmarkBrowser(!surfaceMeshBenchmarkBrowserOpen)}
                  disabled={surfaceMeshImportBusy || !surfaceMeshBenchmarkAvailable}
                  data-testid="mesh-benchmark-browser-toggle"
                >
                  Benchmark Model... [DEV]
                </button>
                {surfaceMeshBenchmarkError && (
                  <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshBenchmarkError}</div>
                )}
                {surfaceMeshBenchmarkBrowserOpen && surfaceMeshBenchmarkAvailable && (
                  <div
                    data-testid="mesh-benchmark-browser"
                    style={{
                      display: "grid",
                      gap: 10,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed #d5dbe5",
                    }}
                  >
                    {surfaceMeshBenchmarkModelsByCategory.map((group) => (
                      <div key={`mesh-benchmark-group-${group.category}`}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{group.label}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {group.models.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => onLoadSurfaceMeshBenchmarkModel(model.id)}
                              disabled={surfaceMeshImportBusy}
                              title={model.relativePath}
                              data-testid={`mesh-benchmark-model-${model.id}`}
                            >
                              {model.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {surfaceMeshImportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshImportError}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Export</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button type="button" onClick={onExportSurfaceMeshGlb} disabled={surfaceMeshExportBusy || !meshReady}>
                {surfaceMeshExportBusy ? "Exporting..." : "Export GLB"}
              </button>
              <button type="button" onClick={onExportSurfaceMeshObj} disabled={surfaceMeshExportBusy || !meshReady}>
                {surfaceMeshExportBusy ? "Exporting..." : "Export OBJ"}
              </button>
              <button type="button" onClick={onExportSurfaceMeshPly} disabled={surfaceMeshExportBusy || !meshReady}>
                {surfaceMeshExportBusy ? "Exporting..." : "Export PLY"}
              </button>
            </div>
            {surfaceMeshExportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshExportError}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Weld vertices</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <label style={{ fontSize: 11 }}>
                Tolerance
                <input
                  type="number"
                  min={1e-6}
                  max={0.1}
                  step={0.0001}
                  value={surfaceMeshWeldTolerance}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      onChangeSurfaceMeshWeldTolerance(Math.max(1e-6, Math.min(0.1, v)));
                    }
                  }}
                  style={{ width: 90, marginLeft: 6 }}
                />
              </label>
              <button type="button" onClick={onWeldSurfaceMesh} disabled={surfaceMeshWeldBusy || !meshReady}>
                {surfaceMeshWeldBusy ? "Welding..." : "Weld"}
              </button>
            </div>
            {surfaceMeshWeldError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshWeldError}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Basic mesh ops</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button type="button" onClick={onTriangulateSurfaceMesh} disabled={!meshReady}>
                Triangulate
              </button>
              <button type="button" onClick={onRecomputeSurfaceMeshNormals} disabled={!meshReady}>
                Recompute normals
              </button>
              <button type="button" onClick={onCenterSurfaceMesh} disabled={!meshReady}>
                Center
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 11 }}>
                Subdivide
                <input
                  type="number"
                  min={1}
                  max={4}
                  step={1}
                  value={surfaceMeshSubdivideIterations}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      onChangeSurfaceMeshSubdivideIterations(clampNumber(Math.round(v), 1, 4));
                    }
                  }}
                  style={{ width: 60, marginLeft: 6 }}
                />
              </label>
              <button type="button" onClick={onSubdivideSurfaceMesh} disabled={!meshReady}>
                Subdivide
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 11 }}>
                Normalize diag
                <input
                  type="number"
                  min={0.001}
                  step={0.1}
                  value={surfaceMeshNormalizeDiag}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      onChangeSurfaceMeshNormalizeDiag(Math.max(0.001, v));
                    }
                  }}
                  style={{ width: 80, marginLeft: 6 }}
                />
              </label>
              <button type="button" onClick={onNormalizeSurfaceMeshScale} disabled={!meshReady}>
                Normalize scale
              </button>
            </div>
            <div
              style={{
                marginTop: 12,
                border: "1px solid #dbe2ea",
                borderRadius: 8,
                padding: "8px 10px",
                background: "#f8fbff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Topology editing</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={onSaveSurfaceMeshTopologyEditedPreset}
                    disabled={!meshReady}
                    style={{ fontSize: 10, padding: "2px 7px" }}
                  >
                    Save edited
                  </button>
                  <div style={{ fontSize: 11, color: "#475467" }}>{meshReady ? "Current SurfaceMesh" : "No mesh"}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#475467", marginTop: 4 }}>
                Face 0-{maxSurfaceMeshTopologyFaceIndex.toLocaleString()} - Vertex 0-
                {maxSurfaceMeshTopologyVertexIndex.toLocaleString()}
              </div>
              <label
                style={{
                  display: "grid",
                  gap: 3,
                  marginTop: 8,
                  fontSize: 11,
                  color: "#475467",
                }}
              >
                Example name
                <input
                  aria-label="Mesh topology example name"
                  value={surfaceMeshTopologySaveName}
                  onChange={(event) => onChangeSurfaceMeshTopologySaveName(event.currentTarget.value)}
                  placeholder="Edited mesh example"
                  disabled={!meshReady}
                  style={{ minWidth: 0, width: "100%" }}
                />
              </label>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 8,
                  fontSize: 11,
                }}
              >
                <span style={{ color: "#475467" }}>Pick target</span>
                {SURFACE_MESH_TOPOLOGY_PICK_MODES.map((pickMode) => (
                  <button
                    key={`surface-mesh-topology-pick-mode-${pickMode}`}
                    type="button"
                    onClick={() => onChangeSurfaceMeshTopologyPickMode(pickMode)}
                    disabled={!meshReady || !unifiedSelectionKindFilters[pickMode]}
                    style={{
                      background: surfaceMeshTopologyPickMode === pickMode ? "#dbeafe" : undefined,
                      borderColor: surfaceMeshTopologyPickMode === pickMode ? "#0a66c2" : undefined,
                      color: unifiedSelectionKindFilters[pickMode] ? undefined : "#98a2b3",
                    }}
                  >
                    {pickMode[0].toUpperCase() + pickMode.slice(1)}
                  </button>
                ))}
                <span style={{ color: "#475467" }}>
                  Pick source: {surfaceMeshTopologyPickSummary ?? (probeEnabled ? "click mesh" : "probe off")}
                </span>
                <button type="button" onClick={onUseSurfaceMeshTopologyPick} disabled={!meshReady || !surfaceMeshTopologyPickSummary}>
                  Refresh from pick
                </button>
                {!probeEnabled && (
                  <button type="button" onClick={onToggleProbe} disabled={!meshReady}>
                    Enable Probe
                  </button>
                )}
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: "7px 8px",
                  border: "1px solid #e4e7ec",
                  borderRadius: 8,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700 }}>Current implementations</div>
                <div style={{ fontSize: 11, color: "#475467", marginTop: 3 }}>
                  Face Subdivide, Split Edge, Collapse Edge, Bevel Edge, Edge Loop, Edge Ring, Boundary, Sharp, Feature
                </div>
                <div
                  style={{
                    marginTop: 7,
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    background: "#eff6ff",
                    padding: "7px 8px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>Pick target</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SURFACE_MESH_TOPOLOGY_PICK_MODES.map((pickMode) => (
                      <button
                        key={`surface-mesh-topology-primary-pick-mode-${pickMode}`}
                        type="button"
                        onClick={() => onChangeSurfaceMeshTopologyPickMode(pickMode)}
                        disabled={!meshReady || !unifiedSelectionKindFilters[pickMode]}
                        style={{
                          background: surfaceMeshTopologyPickMode === pickMode ? "#bfdbfe" : "#fff",
                          borderColor: surfaceMeshTopologyPickMode === pickMode ? "#0a66c2" : "#d0d5dd",
                          color: unifiedSelectionKindFilters[pickMode] ? undefined : "#98a2b3",
                          fontWeight: surfaceMeshTopologyPickMode === pickMode ? 700 : 600,
                        }}
                      >
                        {pickMode[0].toUpperCase() + pickMode.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 5, borderTop: "1px solid #dbeafe", paddingTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>Selection filters</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {SURFACE_MESH_TOPOLOGY_PICK_MODES.map((pickMode) => {
                        const enabledCount = SURFACE_MESH_TOPOLOGY_PICK_MODES.filter(
                          (mode) => unifiedSelectionKindFilters[mode]
                        ).length;
                        return (
                          <button
                            key={`surface-mesh-selection-filter-kind-${pickMode}`}
                            type="button"
                            data-testid={`mesh-selection-filter-kind-secondary-${pickMode}`}
                            onClick={() => onToggleUnifiedSelectionKindFilter(pickMode)}
                            disabled={unifiedSelectionKindFilters[pickMode] && enabledCount <= 1}
                            aria-pressed={unifiedSelectionKindFilters[pickMode]}
                            style={pill(unifiedSelectionKindFilters[pickMode])}
                          >
                            {pickMode[0].toUpperCase() + pickMode.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(["all", "boundary", "interior", "non-manifold"] as UnifiedSelectionTopologyFilterMode[]).map(
                        (filterMode) => (
                          <button
                            key={`surface-mesh-selection-filter-topology-${filterMode}`}
                            type="button"
                            data-testid={`mesh-selection-filter-topology-secondary-${filterMode}`}
                            onClick={() => onChangeUnifiedSelectionTopologyFilter(filterMode)}
                            aria-pressed={unifiedSelectionTopologyFilter === filterMode}
                            style={pill(unifiedSelectionTopologyFilter === filterMode)}
                          >
                            {filterMode === "all"
                              ? "All topology"
                              : filterMode === "non-manifold"
                                ? "Non-manifold"
                                : filterMode[0].toUpperCase() + filterMode.slice(1)}
                          </button>
                        )
                      )}
                    </div>
                    <div
                      data-testid="mesh-selection-filter-summary-secondary"
                      style={{ fontSize: 11, color: unifiedSelectionFilterStatus ? "#b42318" : "#475467" }}
                    >
                      {unifiedSelectionFilterStatus ?? unifiedSelectionFilterLabel}
                    </div>
                  </div>
                  <UnifiedSelectionInspector
                    selection={meshUnifiedInspectorSelection}
                    selectionSet={meshMultiSelectionSet}
                    title="Unified selection"
                    materialInfo={meshUnifiedInspectorMaterialInfo}
                    creaseInfo={meshUnifiedInspectorCreaseInfo}
                  />
                </div>
                <div style={{ display: "grid", gap: 5, marginTop: 7 }}>
                  {SURFACE_MESH_TOPOLOGY_DEMO_PRESETS.map((preset) => (
                    <div key={`mesh-topology-demo-${preset.id}`} style={{ display: "grid", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => onApplySurfaceMeshTopologyDemoPreset(preset.id)}
                        title={`${preset.operation}: ${preset.summary}\n${preset.expectedResult}`}
                        style={{
                          textAlign: "left",
                          borderRadius: 7,
                          border: "1px solid " + (preset.workflowKind === "round-trip" ? "#7dd3fc" : "#dbe2ea"),
                          background: preset.workflowKind === "round-trip" ? "#f0f9ff" : "#f8fafc",
                          padding: "5px 7px",
                        }}
                      >
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700 }}>
                          <span>{preset.label}</span>
                          {preset.workflowKind === "round-trip" && (
                            <span style={{ color: "#075985", fontSize: 10 }}>Round-trip</span>
                          )}
                        </span>
                        <span style={{ display: "block", fontSize: 10, color: "#475467", marginTop: 2 }}>
                          {preset.tryHint}
                        </span>
                        {preset.workflowHint && (
                          <span style={{ display: "block", fontSize: 10, color: "#075985", marginTop: 2 }}>
                            {preset.workflowHint}
                          </span>
                        )}
                      </button>
                      {preset.workflowKind === "round-trip" && (
                        <button
                          type="button"
                          data-testid={`mesh-roundtrip-full-demo-${preset.id}`}
                          onClick={() => onRunSurfaceMeshTopologyFullRoundTripDemoPreset(preset.id)}
                          style={{
                            justifySelf: "start",
                            fontSize: 10,
                            padding: "3px 8px",
                            borderColor: "#38bdf8",
                            background: "#e0f2fe",
                            color: "#075985",
                            fontWeight: 800,
                          }}
                          title="Load, edit, promote to Geometry, select the result, and show the linked Mesh source card."
                        >
                          Run full round-trip demo
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {surfaceMeshTopologyPreview.ghost && (
                  <div
                    style={{
                      border: "1px solid #bfdbfe",
                      borderRadius: 7,
                      background: "#eff6ff",
                      color: "#1e3a8a",
                      fontSize: 11,
                      marginTop: 7,
                      padding: "5px 7px",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>Previewing</strong>
                      {SURFACE_MESH_TOPOLOGY_OPERATION_OPTIONS.map((operation) => (
                        <button
                          key={`surface-mesh-topology-preview-operation-${operation}`}
                          type="button"
                          onClick={() => onChangeSurfaceMeshTopologyPreviewOperation(operation)}
                          disabled={!meshReady}
                          style={{
                            padding: "2px 7px",
                            fontSize: 10,
                            background: surfaceMeshTopologyPreviewOperation === operation ? "#dbeafe" : "#fff",
                            borderColor: surfaceMeshTopologyPreviewOperation === operation ? "#0a66c2" : "#bfdbfe",
                            fontWeight: surfaceMeshTopologyPreviewOperation === operation ? 800 : 600,
                          }}
                        >
                          {operation === "Face Subdivide"
                            ? "Subdivide"
                            : operation === "Split Edge"
                            ? "Split"
                            : operation === "Collapse Edge"
                            ? "Collapse"
                            : "Bevel"}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={onApplySurfaceMeshTopologySelectedPreview}
                        disabled={!surfaceMeshTopologyPreview.ghost}
                        style={{ padding: "2px 8px", fontSize: 10, fontWeight: 800 }}
                      >
                        Apply selected preview
                      </button>
                    </div>
                    <div style={{ overflowWrap: "anywhere" }}>Ghost preview: {surfaceMeshTopologyPreview.ghost}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", color: "#334155" }}>
                      <span>Face {Math.max(0, Math.round(surfaceMeshTopologyFaceIndex || 0))}</span>
                      <span>
                        Edge {Math.max(0, Math.round(surfaceMeshTopologyEdgeA || 0))}-
                        {Math.max(0, Math.round(surfaceMeshTopologyEdgeB || 0))}
                      </span>
                      <span>Vertex {Math.max(0, Math.round(surfaceMeshTopologyVertexIndex || 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 5,
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    background: "#eff6ff",
                    color: "#1e3a8a",
                    padding: "7px 8px",
                    fontSize: 11,
                  }}
                >
                  <strong>Use selected mesh entity</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span data-testid="mesh-topology-selected-face">{selectedSurfaceMeshTopologyFaceLabel}</span>
                    <span data-testid="mesh-topology-selected-edge">{selectedSurfaceMeshTopologyEdgeLabel}</span>
                    <span data-testid="mesh-topology-selected-vertex">{selectedSurfaceMeshTopologyVertexLabel}</span>
                  </div>
                  {surfaceMeshEdgeSelection && (
                    <span data-testid="mesh-edge-selection-summary" style={{ color: "#0f766e", fontWeight: 800 }}>
                      {surfaceMeshEdgeSelection.status}
                    </span>
                  )}
                  <span style={{ color: "#475467" }}>Click the mesh to update these picks before applying an operation.</span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>Face</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{selectedSurfaceMeshTopologyFaceLabel}</span>
                    <select
                      value={surfaceMeshTopologySubdivideMode}
                      onChange={(e) => onChangeSurfaceMeshTopologySubdivideMode(e.target.value as FaceSubdivideMode)}
                      disabled={!meshReady}
                    >
                      <option value="center-fan">Center fan</option>
                      <option value="four-triangles">Four triangles</option>
                    </select>
                    <button
                      type="button"
                      onClick={onSurfaceMeshFaceSubdivide}
                      disabled={
                        surfaceMeshTopologyPickMode !== "face" ||
                        !meshReady ||
                        Boolean(unifiedSelectionFilterStatus)
                      }
                    >
                      Subdivide Face
                    </button>
                    {surfaceMeshTopologyFaceGuidedPreset && (
                      <>
                        <button
                          type="button"
                          onClick={() => onApplySurfaceMeshTopologyDemoPreset(surfaceMeshTopologyFaceGuidedPreset.id)}
                          title={surfaceMeshTopologyFaceGuidedPreset.expectedResult}
                          style={{ fontSize: 10, padding: "3px 7px" }}
                        >
                          Try this
                        </button>
                        <button
                          type="button"
                          onClick={() => onRunSurfaceMeshTopologyDemoPreset(surfaceMeshTopologyFaceGuidedPreset.id)}
                          title={`Run demo: ${surfaceMeshTopologyFaceGuidedPreset.expectedResult}`}
                          style={{ fontSize: 10, padding: "3px 7px" }}
                        >
                          Run demo
                        </button>
                      </>
                    )}
                  </div>
                  {surfaceMeshTopologyPreview.faceSubdivide && (
                    <div style={{ fontSize: 11, color: "#475467" }}>{surfaceMeshTopologyPreview.faceSubdivide}</div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      color: surfaceMeshTopologyFieldValidation.faceValid ? "#047857" : "#b42318",
                    }}
                  >
                    {surfaceMeshTopologyFieldValidation.faceLabel}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>Edge</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{selectedSurfaceMeshTopologyEdgeLabel}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: surfaceMeshTopologyFieldValidation.edgeValid ? "#047857" : "#b42318",
                    }}
                  >
                    {surfaceMeshTopologyFieldValidation.edgeLabel}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        Split
                        <input
                          type="number"
                          min={0.01}
                          max={0.99}
                          step={0.05}
                          value={surfaceMeshTopologySplitRatio}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeSurfaceMeshTopologySplitRatio(clampNumber(v, 0.01, 0.99));
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={onSurfaceMeshSplitEdge}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Split Edge
                      </button>
                      {surfaceMeshTopologySplitGuidedPreset && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApplySurfaceMeshTopologyDemoPreset(surfaceMeshTopologySplitGuidedPreset.id)}
                            title={surfaceMeshTopologySplitGuidedPreset.expectedResult}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Try this
                          </button>
                          <button
                            type="button"
                            onClick={() => onRunSurfaceMeshTopologyDemoPreset(surfaceMeshTopologySplitGuidedPreset.id)}
                            title={`Run demo: ${surfaceMeshTopologySplitGuidedPreset.expectedResult}`}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Run demo
                          </button>
                        </>
                      )}
                      {surfaceMeshTopologyPreview.splitEdge && (
                        <span style={{ fontSize: 11, color: "#475467" }}>{surfaceMeshTopologyPreview.splitEdge}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select
                        value={surfaceMeshTopologyCollapseMode}
                        onChange={(e) => onChangeSurfaceMeshTopologyCollapseMode(e.target.value as EdgeCollapseMode)}
                        disabled={!meshReady}
                      >
                        <option value="midpoint">Midpoint</option>
                        <option value="keep-a">Keep A</option>
                        <option value="keep-b">Keep B</option>
                      </select>
                      <button
                        type="button"
                        onClick={onSurfaceMeshCollapseEdge}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Collapse Edge
                      </button>
                      {surfaceMeshTopologyCollapseGuidedPreset && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApplySurfaceMeshTopologyDemoPreset(surfaceMeshTopologyCollapseGuidedPreset.id)}
                            title={surfaceMeshTopologyCollapseGuidedPreset.expectedResult}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Try this
                          </button>
                          <button
                            type="button"
                            onClick={() => onRunSurfaceMeshTopologyDemoPreset(surfaceMeshTopologyCollapseGuidedPreset.id)}
                            title={`Run demo: ${surfaceMeshTopologyCollapseGuidedPreset.expectedResult}`}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Run demo
                          </button>
                        </>
                      )}
                      {surfaceMeshTopologyPreview.collapseEdge && (
                        <span style={{ fontSize: 11, color: "#475467" }}>
                          {surfaceMeshTopologyPreview.collapseEdge}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        Bevel
                        <input
                          type="number"
                          min={0.001}
                          step={0.01}
                          value={surfaceMeshTopologyBevelAmount}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onChangeSurfaceMeshTopologyBevelAmount(Math.max(0.001, v));
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={onSurfaceMeshBevelEdge}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Bevel Edge
                      </button>
                      {surfaceMeshTopologyBevelGuidedPreset && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApplySurfaceMeshTopologyDemoPreset(surfaceMeshTopologyBevelGuidedPreset.id)}
                            title={surfaceMeshTopologyBevelGuidedPreset.expectedResult}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Try this
                          </button>
                          <button
                            type="button"
                            onClick={() => onRunSurfaceMeshTopologyDemoPreset(surfaceMeshTopologyBevelGuidedPreset.id)}
                            title={`Run demo: ${surfaceMeshTopologyBevelGuidedPreset.expectedResult}`}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            Run demo
                          </button>
                        </>
                      )}
                      {surfaceMeshTopologyPreview.bevelEdge && (
                        <span style={{ fontSize: 11, color: "#475467" }}>{surfaceMeshTopologyPreview.bevelEdge}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>Selection</span>
                      <button
                        type="button"
                        data-testid="mesh-topology-select-edge-loop"
                        onClick={() => onSelectSurfaceMeshEdgeSet("loop")}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Loop
                      </button>
                      <button
                        type="button"
                        data-testid="mesh-topology-select-edge-ring"
                        onClick={() => onSelectSurfaceMeshEdgeSet("ring")}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Ring
                      </button>
                      <button
                        type="button"
                        data-testid="mesh-topology-select-boundary"
                        onClick={() => onSelectSurfaceMeshEdgeSet("boundary")}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Boundary
                      </button>
                      <button
                        type="button"
                        data-testid="mesh-topology-select-sharp"
                        onClick={() => onSelectSurfaceMeshEdgeSet("sharp")}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Sharp
                      </button>
                      <button
                        type="button"
                        data-testid="mesh-topology-select-feature"
                        onClick={() => onSelectSurfaceMeshEdgeSet("feature")}
                        disabled={
                          surfaceMeshTopologyPickMode !== "edge" ||
                          !meshReady ||
                          Boolean(unifiedSelectionFilterStatus) ||
                          !surfaceMeshTopologyFieldValidation.edgeValid
                        }
                      >
                        Feature
                      </button>
                    </div>
                  </div>
                </div>
                <details
                  data-testid="mesh-topology-advanced-ids"
                  style={{
                    border: "1px solid #dbe2ea",
                    borderRadius: 8,
                    background: "#fff",
                    padding: "6px 8px",
                  }}
                >
                  <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Advanced IDs</summary>
                  <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        Face
                        <input
                          aria-label="Advanced face id"
                          type="number"
                          min={0}
                          max={maxSurfaceMeshTopologyFaceIndex}
                          step={1}
                          value={surfaceMeshTopologyFaceIndex}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onChangeSurfaceMeshTopologyFaceIndex(
                                clampNumber(Math.round(v), 0, maxSurfaceMeshTopologyFaceIndex)
                              );
                            }
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <span
                        style={{
                          fontSize: 11,
                          color: surfaceMeshTopologyFieldValidation.faceValid ? "#047857" : "#b42318",
                        }}
                      >
                        {surfaceMeshTopologyFieldValidation.faceLabel}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        Vertex
                        <input
                          aria-label="Advanced vertex id"
                          type="number"
                          min={0}
                          max={maxSurfaceMeshTopologyVertexIndex}
                          step={1}
                          value={surfaceMeshTopologyVertexIndex}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onChangeSurfaceMeshTopologyVertexIndex(
                                clampNumber(Math.round(v), 0, maxSurfaceMeshTopologyVertexIndex)
                              );
                            }
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <span
                        style={{
                          fontSize: 11,
                          color: surfaceMeshTopologyFieldValidation.vertexValid ? "#047857" : "#b42318",
                        }}
                      >
                        {surfaceMeshTopologyFieldValidation.vertexLabel}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        Edge A
                        <input
                          aria-label="Advanced edge A id"
                          type="number"
                          min={0}
                          max={maxSurfaceMeshTopologyVertexIndex}
                          step={1}
                          value={surfaceMeshTopologyEdgeA}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onChangeSurfaceMeshTopologyEdgeA(
                                clampNumber(Math.round(v), 0, maxSurfaceMeshTopologyVertexIndex)
                              );
                            }
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <label style={{ fontSize: 11 }}>
                        Edge B
                        <input
                          aria-label="Advanced edge B id"
                          type="number"
                          min={0}
                          max={maxSurfaceMeshTopologyVertexIndex}
                          step={1}
                          value={surfaceMeshTopologyEdgeB}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onChangeSurfaceMeshTopologyEdgeB(
                                clampNumber(Math.round(v), 0, maxSurfaceMeshTopologyVertexIndex)
                              );
                            }
                          }}
                          style={{ width: 72, marginLeft: 6 }}
                        />
                      </label>
                      <span
                        style={{
                          fontSize: 11,
                          color: surfaceMeshTopologyFieldValidation.edgeValid ? "#047857" : "#b42318",
                        }}
                      >
                        {surfaceMeshTopologyFieldValidation.edgeLabel}
                      </span>
                    </div>
                  </div>
                </details>
              </div>
              {surfaceMeshTopologyStatus && (
                <div style={{ fontSize: 11, color: "#05603a", marginTop: 8 }}>{surfaceMeshTopologyStatus}</div>
              )}
            </div>
            {surfaceMeshOpsError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshOpsError}</div>
            )}
          </>
        )}
        </div>
      </div>
      )}

      {meshToolsTab === "volume" && (
      <div style={{ ...cardStyle, marginTop: 0 }}>
        <div style={{ marginTop: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{"Surface -> Volume bridge"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeDistanceSigned}
                onChange={(e) => onToggleVolumeDistanceSigned(e.target.checked)}
              />
              Signed (winding number)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeDistanceAutoBounds}
                onChange={(e) => onToggleVolumeDistanceAutoBounds(e.target.checked)}
              />
              Auto bounds (fit mesh)
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={onBuildDistanceVolume}
              disabled={volumeDistanceBusy || !pythonWorkerAvailable}
              style={{ padding: "4px 10px" }}
            >
              {volumeDistanceBusy ? "Building..." : "Surface -> Volume (distance)"}
            </button>
          </div>
          {!pythonWorkerAvailable && (
            <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>
              {pythonWorkerStatusMessage ?? "Python worker unavailable."}
            </div>
          )}
          {!pythonWorkerAvailable && pythonWorkerLogPath && (
            <div style={{ fontSize: 10, color: "#667085", marginTop: 4, wordBreak: "break-all" }}>
              log: {pythonWorkerLogPath}
            </div>
          )}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Builds a {volumeDistanceSigned ? "signed" : "unsigned"} distance field on{" "}
            {volumeDistanceAutoBounds ? "auto mesh bounds" : "the current sampling box"}. Then open the Volume viewer in 3D mode.
          </div>
          {volumeDistanceError && (
            <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{volumeDistanceError}</div>
          )}
        </div>
      </div>
      )}

      {meshToolsTab === "operations" && (
      <div style={{ ...cardStyle, marginTop: 0 }}>
        <div style={{ marginTop: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Mesh Operations</div>
          <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
            <div>
              <strong>Input:</strong> Current SurfaceMesh: {meshReady ? "ready" : "missing"}
            </div>
            {surfaceMeshStats && (
              <div>
                <strong>Vertices / faces:</strong> {surfaceMeshStats.vertCount.toLocaleString()} /{" "}
                {surfaceMeshStats.triCount.toLocaleString()}
              </div>
            )}
            {surfaceMeshBounds && (
              <div>
                <strong>Bounds:</strong> min ({fmtVal(surfaceMeshBounds.min[0], 3)}, {fmtVal(surfaceMeshBounds.min[1], 3)},{" "}
                {fmtVal(surfaceMeshBounds.min[2], 3)}) · max ({fmtVal(surfaceMeshBounds.max[0], 3)},{" "}
                {fmtVal(surfaceMeshBounds.max[1], 3)}, {fmtVal(surfaceMeshBounds.max[2], 3)})
              </div>
            )}
            {!pythonWorkerAvailable && (
              <div style={{ color: "#b42318" }}>
                {pythonWorkerStatusMessage ?? "Python worker unavailable."}
              </div>
            )}
            {!pythonWorkerAvailable && pythonWorkerLogPath && (
              <div style={{ fontSize: 10, color: "#667085", wordBreak: "break-all" }}>
                log: {pythonWorkerLogPath}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <MeshOperationsPanel
              testId="mesh-operation-registry"
              meshReady={meshReady}
              activeMeshLabel={surfaceMeshLabel}
              workerReady={meshOperationAvailable && pythonWorkerAvailable}
              workerStatusText={pythonWorkerStatusMessage ?? "worker unavailable"}
              cgalReady={cgalReady}
              cgalStatusText={cgalStatusText}
              busy={meshOperationBusy}
              cgalBusy={cgalBusy}
              lastResult={meshLastOperation}
              lastValidation={meshOperationLastValidation}
              focusedOperation={meshOperationFocusedOperation}
              focusedOperationToken={meshOperationFocusedOperationToken}
              operationHistory={meshOperationHistory}
              savedPresets={meshOperationSavedPresets}
              onRestoreOperationHistoryEntry={onRestoreMeshOperationHistoryEntry}
              onUndoLastOperation={onUndoLatestMeshOperation}
              canUndoLastOperation={canUndoLatestMeshOperation}
              onApplyOperationPreset={onApplyMeshOperationPreset}
              onApplySavedOperationPreset={onApplyMeshOperationSavedPreset}
              onSaveOperationPreset={onSaveMeshOperationPreset}
              canSaveOperationPreset={canSaveMeshOperationPreset}
              cleanComputeNormals={meshOperationCleanComputeNormals}
              onChangeCleanComputeNormals={onChangeMeshOperationCleanComputeNormals}
              onValidate={onMeshOperationValidate}
              repairOrientFaces={meshOperationRepairOrientFaces}
              onChangeRepairOrientFaces={onChangeMeshOperationRepairOrientFaces}
              repairRemoveDegenerateFaces={meshOperationRepairRemoveDegenerateFaces}
              onChangeRepairRemoveDegenerateFaces={onChangeMeshOperationRepairRemoveDegenerateFaces}
              repairRemoveDuplicateFaces={meshOperationRepairRemoveDuplicateFaces}
              onChangeRepairRemoveDuplicateFaces={onChangeMeshOperationRepairRemoveDuplicateFaces}
              repairCompactVertices={meshOperationRepairCompactVertices}
              onChangeRepairCompactVertices={onChangeMeshOperationRepairCompactVertices}
              repairFillSmallHoles={meshOperationRepairFillSmallHoles}
              onChangeRepairFillSmallHoles={onChangeMeshOperationRepairFillSmallHoles}
              repairMaxHoleEdges={meshOperationRepairMaxHoleEdges}
              onChangeRepairMaxHoleEdges={onChangeMeshOperationRepairMaxHoleEdges}
              onRepair={onMeshOperationRepair}
              onRepairValidate={onMeshOperationRepairValidate}
              remeshTargetEdgeLength={meshOperationRemeshTargetEdgeLength}
              onChangeRemeshTargetEdgeLength={onChangeMeshOperationRemeshTargetEdgeLength}
              remeshIterations={meshOperationRemeshIterations}
              onChangeRemeshIterations={onChangeMeshOperationRemeshIterations}
              remeshPreserveSharpEdges={meshOperationRemeshPreserveSharpEdges}
              onChangeRemeshPreserveSharpEdges={onChangeMeshOperationRemeshPreserveSharpEdges}
              onRemesh={onMeshOperationRemesh}
              onClean={onMeshOperationCleanNormals}
              decimateReduction={meshOperationDecimateReduction}
              onChangeDecimateReduction={onChangeMeshOperationDecimateReduction}
              decimateTargetFaces={meshOperationDecimateTargetFaces}
              onChangeDecimateTargetFaces={onChangeMeshOperationDecimateTargetFaces}
              decimateUseTargetFaces={meshOperationUseTargetFaces}
              onChangeDecimateUseTargetFaces={onToggleMeshOperationUseTargetFaces}
              onDecimate={onMeshOperationDecimate}
              smoothIterations={meshOperationSmoothIterations}
              onChangeSmoothIterations={onChangeMeshOperationSmoothIterations}
              smoothPassband={meshOperationSmoothPassband}
              onChangeSmoothPassband={onChangeMeshOperationSmoothPassband}
              onSmooth={onMeshOperationSmooth}
              booleanOperation={meshOperationBooleanOperation}
              onChangeBooleanOperation={onChangeMeshOperationBooleanOperation}
              booleanStrategy={meshOperationBooleanStrategy}
              onChangeBooleanStrategy={onChangeMeshOperationBooleanStrategy}
              booleanOperandObjectId={meshOperationBooleanOperandObjectId}
              onChangeBooleanOperandObjectId={onChangeMeshOperationBooleanOperandObjectId}
              booleanOperandOptions={meshOperationBooleanOperandOptions}
              booleanCurveRadius={meshOperationBooleanCurveRadius}
              onChangeBooleanCurveRadius={onChangeMeshOperationBooleanCurveRadius}
              booleanStatus={meshOperationBooleanStatus}
              onRunBoolean={onRunMeshOperationBoolean}
              onPrepareBooleanDemo={onPrepareMeshOperationBooleanDemo}
              onSwapBooleanOperands={onSwapMeshOperationBooleanOperands}
              outputMode={meshOperationOutputMode}
              onChangeOutputMode={onChangeMeshOperationOutputMode}
              implicitAvailable={isImplicitAny}
              implicitExpr={implicitExprTrimmed}
              onOpenImplicitSpherePreset={onOpenImplicitSpherePreset}
              implicitResolution={implicitResolution}
              previewBusy={meshOperationPreviewBusy}
              previewError={meshOperationPreviewError}
              previewTargetFaces={meshOperationPreviewTargetFaces}
              previewUseDecimate={meshOperationPreviewUseDecimate}
              onChangePreviewTargetFaces={onChangeMeshOperationPreviewTargetFaces}
              onChangePreviewUseDecimate={onChangeMeshOperationPreviewUseDecimate}
              onRunPreview={onRunMeshOperationPreview}
              cgalTargetEdge={cgalTargetEdge}
              onChangeCgalTargetEdge={onChangeCgalTargetEdge}
              cgalAutoTargetEdge={cgalAutoTargetEdge}
              onChangeCgalAutoTargetEdge={onChangeCgalAutoTargetEdge}
              cgalTriBudgetEnabled={cgalTriBudgetEnabled}
              onChangeCgalTriBudgetEnabled={onChangeCgalTriBudgetEnabled}
              cgalTriBudget={cgalTriBudget}
              onChangeCgalTriBudget={onChangeCgalTriBudget}
              cgalEffectiveEdge={cgalEffectiveEdge}
              cgalEstimatedTris={cgalEstimatedTris}
              cgalError={cgalError}
              onRunCgalMesh={onRunCgalMesh}
              onShowResultDetails={() => undefined}
              canSendToGeometry={meshReady}
              onSendToGeometry={onConvertToMeshObject}
              onRepairResult={onMeshOperationRepair}
              onUseResultAsBooleanA={onUseMeshOperationResultAsBooleanA}
              onUseResultAsBooleanB={onUseMeshOperationResultAsBooleanB}
            />
          </div>
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.72 }}>
            Result details appear in the right Inspector under Mesh Operation Result.
          </div>
          {meshOperationError && <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{meshOperationError}</div>}
        </div>
      </div>
      )}
      </>
      )}
      </>
      )}

      {leftTab === "analysis" && (
      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Surface / Mesh Analyze</div>
        <div style={{ marginTop: 0, fontSize: 12 }}>
          <div style={{ fontSize: 11, color: "#475467", marginBottom: 10 }}>
            Full curvature, principal-curve, Gauss map, region-stat, and mesh-quality workflows live here.
            Keep display-only viewer controls in the View tab.
          </div>

          <details
            style={analysisAccordionStyle}
            open
            onToggle={(event) => handleAnalysisSectionToggle("differential-geometry", event)}
          >
            <summary style={analysisAccordionSummaryStyle}>Differential geometry</summary>
            <div style={{ marginTop: 8, marginBottom: 10, marginLeft: 4 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setDifferentialUiMode("basic")}
                  style={pill(differentialUiMode === "basic")}
                  aria-pressed={differentialUiMode === "basic"}
                >
                  Basic
                </button>
                <button
                  type="button"
                  onClick={() => setDifferentialUiMode("advanced")}
                  style={pill(differentialUiMode === "advanced")}
                  aria-pressed={differentialUiMode === "advanced"}
                >
                  Advanced
                </button>
              </div>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Source</div>
              <div style={{ display: "grid", gap: 6, fontSize: 11, marginBottom: 10 }}>
                <div><strong>Object:</strong> current selected surface</div>
                <div><strong>Object type:</strong> {differentialObjectTypeLabel}</div>
                <div><strong>Input:</strong> {differentialInputLabel}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 70 }}>Mode</span>
                  <select
                    value={differentialMode}
                    onChange={(e) => setDifferentialMode(e.target.value as DifferentialGeometryAnalysisMode)}
                    style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                  >
                    <option value="auto">Auto</option>
                    <option value="fast-preview">Fast Preview</option>
                    <option value="robust-mesh">Robust Mesh</option>
                    <option value="analytic">Analytic</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 70 }}>Precheck</span>
                  <select
                    value={differentialPrecheck}
                    onChange={(e) => setDifferentialPrecheck(e.target.value as DifferentialGeometryPrecheckMode)}
                    style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                  >
                    <option value="auto">Auto</option>
                    <option value="run">Run</option>
                  </select>
                </label>
              </div>

              {differentialUiMode === "basic" ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Quick operations</div>
                  <div style={{ display: "grid", gap: 4, fontSize: 11, marginBottom: 10 }}>
                    <label><input type="checkbox" checked={differentialMeanCurvature} onChange={(e) => setDifferentialMeanCurvature(e.target.checked)} style={{ marginRight: 6 }} />Mean curvature H</label>
                    <label><input type="checkbox" checked={differentialGaussianCurvature} onChange={(e) => setDifferentialGaussianCurvature(e.target.checked)} style={{ marginRight: 6 }} />Gaussian curvature K</label>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Quantities to compute</div>
                  <div style={{ display: "grid", gap: 4, fontSize: 11, marginBottom: 10 }}>
                    <label><input type="checkbox" checked={differentialMeanCurvature} onChange={(e) => setDifferentialMeanCurvature(e.target.checked)} style={{ marginRight: 6 }} />Mean curvature H</label>
                    <label><input type="checkbox" checked={differentialGaussianCurvature} onChange={(e) => setDifferentialGaussianCurvature(e.target.checked)} style={{ marginRight: 6 }} />Gaussian curvature K</label>
                    <label><input type="checkbox" checked={differentialPrincipalCurvatureK1} onChange={(e) => setDifferentialPrincipalCurvatureK1(e.target.checked)} style={{ marginRight: 6 }} />Principal curvature k1</label>
                    <label><input type="checkbox" checked={differentialPrincipalCurvatureK2} onChange={(e) => setDifferentialPrincipalCurvatureK2(e.target.checked)} style={{ marginRight: 6 }} />Principal curvature k2</label>
                    <label><input type="checkbox" checked={differentialShapeIndex} onChange={(e) => setDifferentialShapeIndex(e.target.checked)} style={{ marginRight: 6 }} />Shape index</label>
                    <label><input type="checkbox" checked={differentialCurvedness} onChange={(e) => setDifferentialCurvedness(e.target.checked)} style={{ marginRight: 6 }} />Curvedness</label>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Direction fields</div>
                  <div style={{ display: "grid", gap: 4, fontSize: 11, marginBottom: 10 }}>
                    <label><input type="checkbox" checked={differentialNormals} onChange={(e) => setDifferentialNormals(e.target.checked)} style={{ marginRight: 6 }} />Normals</label>
                    <label><input type="checkbox" checked={differentialDirectionD1} onChange={(e) => setDifferentialDirectionD1(e.target.checked)} style={{ marginRight: 6 }} />Principal direction d1</label>
                    <label><input type="checkbox" checked={differentialDirectionD2} onChange={(e) => setDifferentialDirectionD2(e.target.checked)} style={{ marginRight: 6 }} />Principal direction d2</label>
                    <label><input type="checkbox" checked={differentialAsymptoticDirections} onChange={(e) => setDifferentialAsymptoticDirections(e.target.checked)} style={{ marginRight: 6 }} />Asymptotic directions</label>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Feature detection</div>
                  <div style={{ fontSize: 11, color: "#475467", marginBottom: 10 }}>
                    Curvature topology, umbilics, high-curvature regions, uncertainty, and feature edges are produced by the cached Surface Features analysis below. Ridge and valley tracing remains a separate analysis.
                  </div>
                </>
              )}

              {differentialUiMode === "advanced" && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Post-processing</div>
                  <div style={{ display: "grid", gap: 6, fontSize: 11, marginBottom: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ minWidth: 138 }}>Smoothing</span>
                      <select
                        value={differentialSmoothing}
                        onChange={(e) => setDifferentialSmoothing(e.target.value as DifferentialGeometrySmoothing)}
                        style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                      >
                        <option value="none">none</option>
                        <option value="light">light</option>
                        <option value="medium">medium</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ minWidth: 138 }}>Remesh before analysis</span>
                      <select
                        value={differentialRemeshBeforeAnalysis}
                        onChange={(e) => setDifferentialRemeshBeforeAnalysis(e.target.value as DifferentialGeometryBinaryToggle)}
                        style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                      >
                        <option value="off">off</option>
                        <option value="on">on</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ minWidth: 138 }}>Normalize scale</span>
                      <select
                        value={differentialNormalizeScale}
                        onChange={(e) => setDifferentialNormalizeScale(e.target.value as DifferentialGeometryBinaryToggle)}
                        style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                      >
                        <option value="off">off</option>
                        <option value="on">on</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ minWidth: 138 }}>Clamp outliers</span>
                      <select
                        value={differentialClampOutliers}
                        onChange={(e) => setDifferentialClampOutliers(e.target.value as DifferentialGeometryBinaryToggle)}
                        style={{ fontSize: 11, padding: "2px 4px", minWidth: 120 }}
                      >
                        <option value="off">off</option>
                        <option value="on">on</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {differentialUiMode === "advanced" && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Saved output</div>
                  <div style={{ display: "grid", gap: 4, fontSize: 11, marginBottom: 10 }}>
                    <label><input type="checkbox" checked={differentialSaveDerivedResult} onChange={(e) => setDifferentialSaveDerivedResult(e.target.checked)} style={{ marginRight: 6 }} />Save as derived result</label>
                    <label><input type="checkbox" checked={differentialExportScalarFields} onChange={(e) => setDifferentialExportScalarFields(e.target.checked)} style={{ marginRight: 6 }} />Export scalar fields</label>
                  </div>
                </>
              )}

              <button type="button" onClick={handleComputeDifferentialGeometry} style={{ padding: "4px 10px", fontSize: 11 }}>
                Compute / Recompute
              </button>
            </div>
          </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("vector-calculus", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Vector calculus</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>Scalar source</span>
              <select
                value={calculusScalarSource}
                onChange={(e) => onChangeCalculusScalarSource(e.target.value)}
                style={{ fontSize: 11, padding: "2px 4px", minWidth: 150 }}
              >
                {calculusScalarOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {calculusScalarSource === "custom" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
                  f(x,y,z,u,v)
                </div>
                <input
                  type="text"
                  value={calculusCustomScalarExpr}
                  onChange={(e) => onChangeCalculusCustomScalarExpr(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid #d0d7de",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <button type="button" onClick={onRunCalculusGradient}>
                Compute grad
              </button>
              <button type="button" onClick={onRunCalculusLaplacian}>
                Compute Δ
              </button>
              <button type="button" onClick={onRunCalculusDivergence} disabled={!calculusVectorOptions.length}>
                Compute div
              </button>
              <button type="button" onClick={onRunCalculusCurl} disabled={!calculusVectorOptions.length}>
                Compute curl
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>Vector source</span>
              <select
                value={calculusVectorSource}
                onChange={(e) => onChangeCalculusVectorSource(e.target.value)}
                style={{ fontSize: 11, padding: "2px 4px", minWidth: 160 }}
                disabled={!calculusVectorOptions.length}
              >
                {calculusVectorOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {calculusVectorSource === "custom-vector" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Fx; Fy; Fz (projected tangent)</div>
                <input
                  type="text"
                  value={calculusCustomVectorExpr}
                  onChange={(event) => onChangeCalculusCustomVectorExpr(event.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", borderRadius: 6, border: "1px solid #d0d7de", fontFamily: "monospace", fontSize: 11 }}
                />
              </div>
            )}
            <label style={{ display: "block", cursor: "pointer", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={calculusVectorOverlayEnabled}
                onChange={onToggleCalculusVectorOverlay}
                style={{ marginRight: 6 }}
              />
              Show vector field overlay
            </label>
            <div style={{ marginLeft: 18, opacity: calculusVectorOverlayEnabled ? 1 : 0.7 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span>Active vector</span>
                <select
                  value={calculusActiveVectorField}
                  onChange={(e) => onChangeCalculusActiveVectorField(e.target.value)}
                  style={{ fontSize: 11, padding: "2px 4px", minWidth: 160 }}
                  disabled={!calculusVectorOptions.length}
                >
                  {calculusVectorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span>Density</span>
                <input
                  type="number"
                  min={20}
                  max={4000}
                  step={20}
                  value={calculusVectorDensity}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    onChangeCalculusVectorDensity(clampNumber(Math.round(value), 20, 4000));
                  }}
                  style={{ width: 84 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span>Scale</span>
                <input
                  type="number"
                  min={0.05}
                  max={6}
                  step={0.05}
                  value={calculusVectorScale}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    onChangeCalculusVectorScale(clampNumber(value, 0.05, 6));
                  }}
                  style={{ width: 84 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>
                Heatmap: {calculusHeatmapEnabled ? "on" : "off"}
              </div>
              {calculusHeatmapEnabled && (
                <button type="button" onClick={onClearCalculusHeatmap}>
                  Clear heatmap
                </button>
              )}
            </div>
            {calculusStatus && (
              <div style={{ fontSize: 11, color: "#0f5132", marginTop: 6 }}>
                {calculusStatus}
              </div>
            )}
            {calculusError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>
                {calculusError}
              </div>
            )}
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("curvature-lines", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Compute curvature lines</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showCurvatureLines}
                onChange={onToggleCurvatureLines}
                style={{ marginRight: 6 }}
              />
              Show curvature lines
            </label>
            <div
              style={{
                marginLeft: 18,
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                opacity: showCurvatureLines ? 1 : 0.6,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#555" }}>Field</div>
                <label style={{ marginRight: 10 }}>
                  <input
                    type="radio"
                    name="curvature-field"
                    value="d1"
                    checked={curvatureLineField === "d1"}
                    onChange={() => onChangeCurvatureLineField("d1")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  along d1 (k1)
                </label>
                <label>
                  <input
                    type="radio"
                    name="curvature-field"
                    value="d2"
                    checked={curvatureLineField === "d2"}
                    onChange={() => onChangeCurvatureLineField("d2")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  along d2 (k2)
                </label>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#555" }}>Seed source</div>
                <label style={{ marginRight: 10 }}>
                  <input
                    type="radio"
                    name="curvature-seed-source"
                    value="global"
                    checked={curvatureSeedSource === "global"}
                    onChange={() => onChangeCurvatureSeedSource("global")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  Global grid
                </label>
                <label title={selectionMaskCount ? "" : "No selection available"}>
                  <input
                    type="radio"
                    name="curvature-seed-source"
                    value="selection"
                    checked={curvatureSeedSource === "selection"}
                    onChange={() => onChangeCurvatureSeedSource("selection")}
                    disabled={!showCurvatureLines || selectionMaskCount === 0}
                    style={{ marginRight: 4 }}
                  />
                  Selection region
                </label>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Seed density</span>
                <select
                  value={curvatureSeedDensity}
                  onChange={(e) => onChangeCurvatureSeedDensity(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ fontSize: 11, padding: "2px 4px" }}
                >
                  <option value={50}>High</option>
                  <option value={100}>Medium</option>
                  <option value={200}>Low</option>
                </select>
              </label>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>
                  Step size h {curvatureStepSize > 0 ? curvatureStepSize.toFixed(3) : "(auto)"}
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={curvatureStepSize}
                  onChange={(e) => onChangeCurvatureStepSize(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>Max steps {curvatureMaxSteps}</div>
                <input
                  type="range"
                  min={80}
                  max={800}
                  step={20}
                  value={curvatureMaxSteps}
                  onChange={(e) => onChangeCurvatureMaxSteps(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>Max lines {curvatureMaxLines}</div>
                <input
                  type="range"
                  min={40}
                  max={400}
                  step={20}
                  value={curvatureMaxLines}
                  onChange={(e) => onChangeCurvatureMaxLines(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <button
                type="button"
                onClick={onRebuildCurvatureLines}
                disabled={!showCurvatureLines}
                style={{ alignSelf: "flex-start", fontSize: 11, padding: "3px 6px" }}
              >
                Rebuild
              </button>
            </div>
          </div>
        </details>

        <details
          data-testid="mesh-surface-features"
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("surface-features", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Extract surface features</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, display: "grid", gap: 9, fontSize: 11 }}>
            {!surfaceFeatureResult ? (
              <div style={{ color: "#667085" }}>
                {viewerKind === "mesh"
                  ? "Feature extraction is waiting for cached normals, curvature, and principal directions."
                  : "Load a mesh to extract reusable surface features."}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ color: "#166534" }}>Ready · {surfaceFeatureCacheHit ? "cached" : "computed"}</strong>
                  <span style={{ color: "#64748b" }}>
                    {surfaceFeatureComputeTimeMs == null ? "" : `${surfaceFeatureComputeTimeMs.toFixed(2)} ms`}
                  </span>
                </div>
                <div style={{ color: "#475467" }}>
                  mesh → normals → curvature → principal directions → classifications
                </div>
                <label style={{ display: "grid", gap: 3 }}>
                  <span>Classification</span>
                  <select
                    data-testid="surface-feature-class"
                    value={surfaceFeatureClass}
                    onChange={(event) => onChangeSurfaceFeatureClass(event.target.value as SurfaceFeatureClass)}
                    style={{ fontSize: 11, padding: "3px 5px" }}
                  >
                    {SURFACE_FEATURE_CLASSES.map((featureClass) => (
                      <option key={featureClass} value={featureClass}>
                        {SURFACE_FEATURE_LABELS[featureClass]} ({surfaceFeatureResult.summary.classCounts[featureClass].toLocaleString()})
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <input
                      data-testid="surface-feature-overlay"
                      type="checkbox"
                      checked={surfaceFeatureOverlayVisible}
                      onChange={onToggleSurfaceFeatureOverlay}
                    />
                    Show overlay
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <input
                      type="checkbox"
                      checked={surfaceFeatureShowEdges}
                      onChange={onToggleSurfaceFeatureEdges}
                      disabled={!surfaceFeatureOverlayVisible}
                    />
                    Feature edges
                  </label>
                </div>
                <button
                  type="button"
                  data-testid="surface-feature-select-members"
                  onClick={onSelectSurfaceFeatureMembers}
                  disabled={!surfaceFeatureSelectionAvailable || surfaceFeatureResult.summary.classCounts[surfaceFeatureClass] === 0}
                  style={{ width: "fit-content", padding: "4px 8px", fontWeight: 700 }}
                >
                  Select {SURFACE_FEATURE_LABELS[surfaceFeatureClass].toLowerCase()} members
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px", color: "#475467" }}>
                  <span>Valid vertices</span><strong>{surfaceFeatureResult.summary.validVertexCount.toLocaleString()}</strong>
                  <span>Uncertain vertices</span><strong>{surfaceFeatureResult.summary.uncertainVertexCount.toLocaleString()}</strong>
                  <span>Sharp / feature edges</span><strong>{surfaceFeatureResult.summary.sharpEdgeCount.toLocaleString()} / {surfaceFeatureResult.summary.featureEdgeCount.toLocaleString()}</strong>
                  <span>Parabolic segments</span><strong>{surfaceFeatureResult.summary.parabolicSegmentCount.toLocaleString()}</strong>
                </div>
              </>
            )}

            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Tolerances and uncertainty</summary>
              <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
                {([
                  ["Curvature threshold", surfaceFeatureCurvatureThreshold, onChangeSurfaceFeatureCurvatureThreshold, 0.01],
                  ["Gaussian zero tolerance", surfaceFeatureGaussianTolerance, onChangeSurfaceFeatureGaussianTolerance, 0.005],
                  ["Umbilic tolerance |k1-k2|", surfaceFeatureUmbilicTolerance, onChangeSurfaceFeatureUmbilicTolerance, 0.005],
                  ["Uncertainty relative band", surfaceFeatureUncertaintyBand, onChangeSurfaceFeatureUncertaintyBand, 0.01],
                  ["Sharp edge angle (deg)", surfaceFeatureSharpAngle, onChangeSurfaceFeatureSharpAngle, 1],
                ] as const).map(([label, value, onChange, step]) => (
                  <label key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 82px", gap: 8, alignItems: "center" }}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={label === "Uncertainty relative band" ? 1 : label === "Sharp edge angle (deg)" ? 180 : undefined}
                      step={step}
                      value={value}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) onChange(next);
                      }}
                      style={{ width: 78, boxSizing: "border-box" }}
                    />
                  </label>
                ))}
                <div style={{ color: "#64748b" }}>
                  Uncertainty combines differential-geometry warnings with configurable bands around every decision threshold.
                </div>
              </div>
            </details>
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("ridges-valleys", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Compute ridges / valleys</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
            {(() => {
              const ridgeValleyAvailable =
                viewerKind === "graph" ||
                viewerKind === "implicit" ||
                viewerKind === "param" ||
                viewerKind === "weierstrass" ||
                viewerKind === "mesh" ||
                viewerKind === "complex";
              if (!ridgeValleyAvailable) {
                return (
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                    Ridge/valley detection unavailable (principal curvatures/directions not computed).
                  </div>
                );
              }
              return null;
            })()}

            {(() => {
              const ridgeValleyAvailable =
                viewerKind === "graph" ||
                viewerKind === "implicit" ||
                viewerKind === "param" ||
                viewerKind === "weierstrass" ||
                viewerKind === "mesh" ||
                viewerKind === "complex";
              const ridgeValleyEnabled = ridgeValleyAvailable && (showRidges || showValleys);
              const ridgeValleyStitchEnabled = ridgeValleyEnabled && ridgeValleyStitch;
              return (
                <>
                  <label style={{ display: "block", cursor: ridgeValleyAvailable ? "pointer" : "not-allowed" }}>
                    <input
                      type="checkbox"
                      checked={showRidges}
                      onChange={onToggleRidges}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Show ridges
                  </label>
                  <label style={{ display: "block", cursor: ridgeValleyAvailable ? "pointer" : "not-allowed" }}>
                    <input
                      type="checkbox"
                      checked={showValleys}
                      onChange={onToggleValleys}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Show valleys
                  </label>

                  <label
                    style={{
                      display: "block",
                      cursor: ridgeValleyAvailable && selectionMaskCount ? "pointer" : "not-allowed",
                      color: ridgeValleyAvailable && selectionMaskCount ? "#000" : "#999",
                      marginTop: 4,
                    }}
                    title={selectionMaskCount ? "" : "No selection available"}
                  >
                    <input
                      type="checkbox"
                      checked={ridgeValleySelectionOnly}
                      onChange={onToggleRidgeValleySelectionOnly}
                      disabled={!ridgeValleyAvailable || selectionMaskCount === 0}
                      style={{ marginRight: 6 }}
                    />
                    Only inside selection
                  </label>

                  <label
                    style={{
                      display: "block",
                      cursor: ridgeValleyAvailable ? "pointer" : "not-allowed",
                      marginTop: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ridgeValleyStitch}
                      onChange={onToggleRidgeValleyStitch}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Stitch into curves (v2)
                  </label>

                  <div
                    style={{
                      marginLeft: 18,
                      marginTop: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      opacity: ridgeValleyEnabled ? 1 : 0.6,
                    }}
                  >
                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Magnitude threshold {ridgeValleyMagMin.toFixed(3)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.005}
                        value={ridgeValleyMagMin}
                        onChange={(e) => onChangeRidgeValleyMagMin(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Contrast threshold {ridgeValleyContrast.toFixed(3)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.005}
                        value={ridgeValleyContrast}
                        onChange={(e) => onChangeRidgeValleyContrast(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Link minCos {ridgeValleyMinCos.toFixed(2)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.7}
                        step={0.02}
                        value={ridgeValleyMinCos}
                        onChange={(e) => onChangeRidgeValleyMinCos(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    {!ridgeValleyStitch && (
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontSize: 11, color: "#555" }}>
                          Segment length {ridgeValleySegmentScale.toFixed(4)}
                        </div>
                        <input
                          type="range"
                          min={0.001}
                          max={0.02}
                          step={0.001}
                          value={ridgeValleySegmentScale}
                          onChange={(e) => onChangeRidgeValleySegmentScale(Number(e.target.value))}
                          disabled={!ridgeValleyEnabled}
                          style={{ width: 180 }}
                        />
                      </div>
                    )}

                    {ridgeValleyStitch && (
                      <>
                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Decimate spacing {ridgeValleyDecimate.toFixed(4)}
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.02}
                            step={0.0005}
                            value={ridgeValleyDecimate}
                            onChange={(e) => onChangeRidgeValleyDecimate(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>

                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Max curves {ridgeValleyMaxCurves}
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={400}
                            step={10}
                            value={ridgeValleyMaxCurves}
                            onChange={(e) => onChangeRidgeValleyMaxCurves(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>

                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Min confidence {ridgeValleyMinConf.toFixed(3)}
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={ridgeValleyMinConf}
                            onChange={(e) => onChangeRidgeValleyMinConf(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>
                      </>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>Sample density</span>
                      <select
                        value={ridgeValleySampleMode}
                        onChange={(e) => onChangeRidgeValleySampleMode(e.target.value as "high" | "medium" | "low")}
                        disabled={!ridgeValleyEnabled}
                        style={{ fontSize: 11, padding: "2px 4px" }}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                  </div>
                </>
              );
            })()}
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("chart-analysis", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Surface chart (chart-cell analysis)</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, display: "grid", gap: 6, fontSize: 11 }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={showChartGrid} onChange={onToggleChartGrid} style={{ marginRight: 6 }} />
              Surface chart grid
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Chart mode</span>
              <select
                value={chartMode}
                onChange={(e) => onChangeChartMode(e.target.value as ChartMode)}
                style={{ fontSize: 11, padding: "2px 4px" }}
              >
                <option value="auto">Auto</option>
                <option value="xy">XY</option>
                <option value="uv">UV</option>
                <option value="local">Local</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Chart density</span>
              <input
                type="number"
                min={2}
                max={64}
                step={1}
                value={chartGridDensity}
                onChange={(e) => onChangeChartGridDensity(clampInt(Number(e.target.value), 2, 64))}
                style={{ width: 76 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={chartCoordinateReadoutEnabled}
                onChange={onToggleChartCoordinateReadout}
                style={{ marginRight: 6 }}
              />
              Coordinate readout
            </label>
            {chartCoordinateReadoutEnabled && chartCoordinateReadout && (
              <div style={{ color: "#475467" }}>
                Chart coord: ({fmt(chartCoordinateReadout.u)}, {fmt(chartCoordinateReadout.v)})
                {chartCoordinateReadout.valid ? "" : " invalid"}
              </div>
            )}
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("mesh-quality", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Mesh quality analysis</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectRegionEnabled}
              onChange={onToggleSelectRegion}
              style={{ marginRight: 6 }}
            />
            Select region {selectionMaskCount ? `(${selectionMaskCount} normals)` : ""}
          </label>
          {selectRegionEnabled && (
            <div
              style={{
                marginLeft: 20,
                marginTop: 6,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
                <div style={{ fontSize: 10, color: "#555" }}>Selection mode</div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="selection-mode"
                    value="euclidean"
                    checked={selectionMode === "euclidean"}
                    onChange={() => onChangeSelectionMode("euclidean")}
                  />
                  Euclidean ball
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="selection-mode"
                    value="geodesic"
                    checked={selectionMode === "geodesic"}
                    onChange={() => onChangeSelectionMode("geodesic")}
                  />
                  Geodesic disk
                </label>
              </div>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 10, color: "#555" }}>Radius {selectionRadius.toFixed(2)}</div>
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={selectionRadius}
                  onChange={(e) => onSetSelectionRadius(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: selectionHasUV && selectionMode === "euclidean" ? "pointer" : "not-allowed",
                  color: selectionHasUV && selectionMode === "euclidean" ? "#000" : "#999",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectionUseUV}
                  onChange={onToggleSelectionUseUV}
                  disabled={!selectionHasUV || selectionMode === "geodesic"}
                  style={{ marginRight: 6 }}
                />
                Use UV
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={zoomToRegion}
                  onChange={onToggleZoomToRegion}
                  style={{ marginRight: 6 }}
                />
                Zoom to region
              </label>
              <button type="button" onClick={onZoomNow} style={{ padding: "4px 8px" }}>
                Zoom now
              </button>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionOverlayVisible}
                  onChange={onToggleSelectionOverlayVisible}
                  style={{ marginRight: 6 }}
                />
                Show selection
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionOverlayOnTop}
                  onChange={onToggleSelectionOverlayOnTop}
                  style={{ marginRight: 6 }}
                />
                Overlay on top
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionSphereVisible}
                  onChange={onToggleSelectionSphereVisible}
                  style={{ marginRight: 6 }}
                />
                Show selection sphere
              </label>
              <button type="button" onClick={onClearSelection} style={{ padding: "4px 8px" }}>
                Clear selection
              </button>
            </div>
          )}
          {selectRegionEnabled && (
            <details style={{ marginLeft: 20, marginTop: 8 }} open>
              <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Selection stats</summary>
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={onRefreshSelectionStats}
                    style={{ padding: "3px 8px", fontSize: 11 }}
                  >
                    Refresh stats
                  </button>
                </div>
                <SelectionStatsPanel
                  stats={selectionStats}
                  availableMetrics={availableSelectionMetrics}
                  selectedMetric={availableSelectionMetrics.length ? selectedMetric : null}
                  onSelectedMetricChange={onChangeSelectedMetric}
                />
              </div>
            </details>
          )}
          {surfaceMeshStats && (
            <div style={{ marginLeft: 20, marginTop: 8, fontSize: 11, color: "#475467" }}>
              Active mesh: {surfaceMeshStats.vertCount.toLocaleString()} vertices / {surfaceMeshStats.triCount.toLocaleString()} triangles
            </div>
          )}
          {isMeshViewer && (
            <details style={{ marginLeft: 20, marginTop: 8 }} open>
              <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Mesh quality report</summary>
              <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 11 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "grid", gap: 3 }}>
                    <span>High aspect threshold</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      step={0.5}
                      value={Number.isFinite(meshQualityHighAspectThreshold) ? meshQualityHighAspectThreshold : 8}
                      onChange={(e) =>
                        onChangeMeshQualityHighAspectThreshold(clampNumber(Number(e.target.value), 1, 1000))
                      }
                      style={{ width: 88, padding: "2px 4px", fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 3 }}>
                    <span>Max listed defects</span>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={10}
                      value={Number.isFinite(meshQualityMaxListedDefects) ? meshQualityMaxListedDefects : 120}
                      onChange={(e) =>
                        onChangeMeshQualityMaxListedDefects(clampInt(Number(e.target.value), 10, 1000))
                      }
                      style={{ width: 88, padding: "2px 4px", fontSize: 11 }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={meshQualityShowDegenerateFaces}
                      onChange={onToggleMeshQualityShowDegenerateFaces}
                    />
                    Highlight degenerate faces
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={meshQualityShowHighAspectFaces}
                      onChange={onToggleMeshQualityShowHighAspectFaces}
                    />
                    Highlight high-aspect faces
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={meshQualityShowNonManifoldEdges}
                      onChange={onToggleMeshQualityShowNonManifoldEdges}
                    />
                    Highlight non-manifold edges
                  </label>
                </div>
                {!meshReady && <div style={{ color: "#667085" }}>Load or generate a mesh to compute report metrics.</div>}
                {meshReady && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "#475467" }}>
                    {meshQualityBusy ? (
                      <>
                        <span>
                          {meshQualityPhaseLabel} ({meshQualityPercent}%)
                        </span>
                        <button type="button" onClick={onCancelMeshQualityCompute} style={{ padding: "3px 8px" }}>
                          Cancel
                        </button>
                      </>
                    ) : meshQualityCacheHit ? (
                      <span>Using cached report.</span>
                    ) : (
                      <span>Report up to date.</span>
                    )}
                  </div>
                )}
                {meshQualityError && <div style={{ color: "#b42318" }}>{meshQualityError}</div>}
                {meshReady && meshQualityReport && (
                  <>
                    <div style={{ color: "#475467" }}>
                      Generated: {new Date(meshQualityReport.generatedAt).toLocaleString()}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(120px, auto) repeat(3, minmax(64px, auto))",
                        gap: "4px 8px",
                        alignItems: "center",
                      }}
                    >
                      <strong>Metric</strong>
                      <strong>Min</strong>
                      <strong>Avg</strong>
                      <strong>Max</strong>
                      <span>Edge length</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeLength.min ?? NaN, 4)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeLength.avg ?? NaN, 4)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeLength.max ?? NaN, 4)}</span>
                      <span>Triangle area</span>
                      <span>{fmtVal(meshQualityReport.metrics.triangleArea.min ?? NaN, 4)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.triangleArea.avg ?? NaN, 4)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.triangleArea.max ?? NaN, 4)}</span>
                      <span>Aspect ratio</span>
                      <span>{fmtVal(meshQualityReport.metrics.aspectRatio.min ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.aspectRatio.avg ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.aspectRatio.max ?? NaN, 3)}</span>
                      <span>Edge ratio</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeRatio.min ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeRatio.avg ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.edgeRatio.max ?? NaN, 3)}</span>
                      <span>Minimum angle (deg)</span>
                      <span>{fmtVal(meshQualityReport.metrics.minimumAngleDeg.min ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.minimumAngleDeg.avg ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.minimumAngleDeg.max ?? NaN, 2)}</span>
                      <span>Maximum angle (deg)</span>
                      <span>{fmtVal(meshQualityReport.metrics.maximumAngleDeg.min ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.maximumAngleDeg.avg ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.maximumAngleDeg.max ?? NaN, 2)}</span>
                      <span>Radius ratio</span>
                      <span>{fmtVal(meshQualityReport.metrics.radiusRatio.min ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.radiusRatio.avg ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.radiusRatio.max ?? NaN, 3)}</span>
                      <span>Scaled Jacobian</span>
                      <span>{fmtVal(meshQualityReport.metrics.scaledJacobian.min ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.scaledJacobian.avg ?? NaN, 3)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.scaledJacobian.max ?? NaN, 3)}</span>
                      <span>Vertex valence</span>
                      <span>{fmtVal(meshQualityReport.metrics.vertexValence.min ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.vertexValence.avg ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.vertexValence.max ?? NaN, 2)}</span>
                      <span>Dihedral (deg)</span>
                      <span>{fmtVal(meshQualityReport.metrics.dihedralAngleDeg.min ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.dihedralAngleDeg.avg ?? NaN, 2)}</span>
                      <span>{fmtVal(meshQualityReport.metrics.dihedralAngleDeg.max ?? NaN, 2)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: "#334155" }}>
                      <span>Boundary edges: {meshQualityReport.topology.boundaryEdgeCount.toLocaleString()}</span>
                      <span>Non-manifold edges: {meshQualityReport.topology.nonManifoldEdgeCount.toLocaleString()}</span>
                      <span>Degenerate faces: {meshQualityReport.topology.degenerateFaceCount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: "#334155" }}>
                      <span>Listed degenerate: {meshQualityReport.defects.degenerateFaces.length.toLocaleString()}</span>
                      <span>Listed high-aspect: {meshQualityReport.defects.highAspectFaces.length.toLocaleString()}</span>
                      <span>Listed non-manifold: {meshQualityReport.defects.nonManifoldEdges.length.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={onExportMeshQualityReportJson}
                        style={{ padding: "3px 8px" }}
                        disabled={meshQualityBusy}
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        onClick={onExportMeshQualityReportCsv}
                        style={{ padding: "3px 8px" }}
                        disabled={meshQualityBusy}
                      >
                        Export CSV
                      </button>
                    </div>
                    {meshQualityExportStatus && <div style={{ color: "#475467" }}>{meshQualityExportStatus}</div>}
                  </>
                )}
              </div>
            </details>
          )}
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("geodesics", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Geodesics</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
          <details style={{ marginLeft: 20, marginTop: 10 }} open={geodesicDiskEnabled}>
            <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Compute geodesic disk</summary>
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: geodesicDiskAvailable ? "pointer" : "not-allowed",
                  color: geodesicDiskAvailable ? "#000" : "#999",
                }}
                title={geodesicDiskAvailable ? "" : geodesicDiskUnavailableReason}
              >
                <input
                  type="checkbox"
                  checked={geodesicDiskEnabled}
                  onChange={onToggleGeodesicDiskEnabled}
                  disabled={!geodesicDiskAvailable}
                  style={{ marginRight: 6 }}
                />
                Enable disk
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onPickGeodesicDiskCenter}
                  disabled={!geodesicDiskAvailable || !geodesicDiskEnabled}
                  style={{ padding: "3px 8px" }}
                >
                  {geodesicDiskPickMode ? "Click surface..." : "Pick center"}
                </button>
                <span>Center: {geodesicDiskCenter ? geodesicDiskCenter.faceIndex : "-"}</span>
                {geodesicDiskBusy && <span style={{ color: "#666" }}>Computing...</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontSize: 10, color: "#555" }}>
                    Radius {geodesicDiskRadius.toFixed(2)}
                  </div>
                  <input
                    type="range"
                    min={0.001}
                    max={5}
                    step={0.01}
                    value={geodesicDiskRadius}
                    onChange={(e) => onChangeGeodesicDiskRadius(Number(e.target.value))}
                    disabled={!geodesicDiskEnabled}
                    style={{ width: "100%" }}
                  />
                </div>
                <input
                  type="number"
                  min={0.001}
                  step={0.01}
                  value={Number.isFinite(geodesicDiskRadius) ? geodesicDiskRadius : 0}
                  onChange={(e) => onChangeGeodesicDiskRadius(Number(e.target.value))}
                  disabled={!geodesicDiskEnabled}
                  style={{ width: 80, padding: "2px 4px", fontSize: 11 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={geodesicDiskAutoUpdate}
                    onChange={onToggleGeodesicDiskAutoUpdate}
                    disabled={!geodesicDiskEnabled}
                  />
                  Auto-update radius
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={geodesicDiskShowBoundary}
                    onChange={onToggleGeodesicDiskShowBoundary}
                    disabled={!geodesicDiskEnabled}
                  />
                  Show boundary
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Method</span>
                  <select
                    value={geodesicDiskMethod}
                    onChange={(e) => onChangeGeodesicDiskMethod(e.target.value as "heat" | "dijkstra")}
                    disabled={!geodesicDiskEnabled}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                  >
                    <option value="heat">Heat</option>
                    <option value="dijkstra">Dijkstra (approx)</option>
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onRecomputeGeodesicDisk}
                  disabled={!geodesicDiskEnabled || !geodesicDiskCenter || geodesicDiskBusy}
                  style={{ padding: "3px 8px" }}
                >
                  {geodesicDiskBusy ? "Running..." : "Recompute distances"}
                </button>
                {!geodesicDiskAutoUpdate && (
                  <button
                    type="button"
                    onClick={onApplyGeodesicDiskRadius}
                    disabled={!geodesicDiskEnabled}
                    style={{ padding: "3px 8px" }}
                  >
                    Apply radius
                  </button>
                )}
                <button type="button" onClick={onClearGeodesicDisk} style={{ padding: "3px 8px" }}>
                  Clear disk
                </button>
              </div>
              {geodesicDiskMessage && <div style={{ color: "#b23b1a" }}>{geodesicDiskMessage}</div>}
              <DiskStatsPanel
                stats={geodesicDiskStats}
                curvatureStats={geodesicDiskSelectionStats.metrics}
                sampleCount={geodesicDiskSelectionStats.count}
                compact
              />
            </div>
          </details>
          <details style={{ marginLeft: 20, marginTop: 10 }} open={geodesicPathEnabled}>
            <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Geodesic path methods</summary>
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={geodesicPathEnabled}
                  onChange={onToggleGeodesicPathEnabled}
                  style={{ marginRight: 6 }}
                />
                Enable geodesic path tool
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Method</span>
                <select
                  value={geodesicPathMethod}
                  onChange={(event) => onChangeGeodesicPathMethod(event.target.value as GeodesicPathMethod)}
                  disabled={geodesicPathBusy}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                >
                  <option value="graph">Approximate edge-graph routing</option>
                  <option value="surface">Accurate CGAL surface path</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Source</span>
                <select
                  value={geodesicPathSourceMode}
                  onChange={(event) => onChangeGeodesicPathSourceMode(event.target.value as GeodesicPathSourceMode)}
                  disabled={geodesicPathBusy}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                >
                  <option value="selected-vertex">Selected vertex</option>
                  <option value="selected-point">Selected surface point</option>
                  <option value="selection-set" disabled={!selectionMaskCount}>
                    Selection set (nearest source)
                  </option>
                </select>
              </label>
              <div style={{ color: "#596579" }}>
                {geodesicPathMethod === "graph"
                  ? "Approximation constrained to mesh edges; point picks snap to the nearest vertex."
                  : "CGAL shortest path crosses triangle interiors and uses face/barycentric point locations."}
                {geodesicPathSourceMode === "selection-set"
                  ? " Click one target; selected vertices are the source set."
                  : " Click a source, then a target."}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={onClearGeodesicPath} style={{ padding: "3px 8px" }}>
                  Clear path
                </button>
                {geodesicPathBusy && <span style={{ fontWeight: 600 }}>Running…</span>}
                {geodesicPathLength != null && Number.isFinite(geodesicPathLength) && (
                  <span style={{ fontWeight: 600 }}>Length: {geodesicPathLength.toFixed(3)}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <span>
                  Source:{" "}
                  {geodesicPathSourceMode === "selection-set"
                    ? `${selectionMaskCount} selected vertices`
                    : geodesicPathStart
                      ? geodesicPathMethod === "surface" && geodesicPathSourceMode === "selected-point"
                        ? `face ${geodesicPathStart.faceIndex ?? "-"}`
                        : `vertex ${geodesicPathStart.vertexIndex}`
                      : "-"}
                </span>
                <span>
                  Target:{" "}
                  {geodesicPathEnd
                    ? geodesicPathMethod === "surface"
                      ? `face ${geodesicPathEnd.faceIndex ?? "-"}`
                      : `vertex ${geodesicPathEnd.vertexIndex}`
                    : "-"}
                </span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: selectionMaskCount && geodesicPathMethod === "graph" ? "pointer" : "not-allowed",
                  color: selectionMaskCount && geodesicPathMethod === "graph" ? "#000" : "#999",
                }}
                title={
                  geodesicPathMethod !== "graph"
                    ? "Selection constraints apply only to edge-graph routing"
                    : selectionMaskCount
                      ? ""
                      : "No selection available"
                }
              >
                <input
                  type="checkbox"
                  checked={geodesicPathConstrain}
                  onChange={onToggleGeodesicPathConstrain}
                  disabled={!selectionMaskCount || geodesicPathMethod !== "graph"}
                  style={{ marginRight: 6 }}
                />
                Constrain path to selection
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: geodesicSmoothEnabled ? "pointer" : "not-allowed",
                  color: geodesicSmoothEnabled ? "#000" : "#999",
                }}
                title={geodesicSmoothEnabled ? "" : "Smooth path only applies to param surfaces"}
              >
                <input
                  type="checkbox"
                  checked={geodesicPathSmooth}
                  onChange={onToggleGeodesicPathSmooth}
                  disabled={!geodesicSmoothEnabled}
                  style={{ marginRight: 6 }}
                />
                Smooth path (param)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={geodesicPathDebug}
                  onChange={onToggleGeodesicPathDebug}
                  style={{ marginRight: 6 }}
                />
                Debug geodesic
              </label>
              {geodesicPathMessage && (
                <div style={{ color: "#b23b1a" }}>{geodesicPathMessage}</div>
              )}
              {geodesicPathDebug && geodesicPathDebugInfo && (
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#445" }}>
                  {geodesicPathDebugInfo}
                </div>
              )}

              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #ddd" }}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>Experimental heat distance (advanced)</div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: geodesicHeatAvailable ? "pointer" : "not-allowed",
                    color: geodesicHeatAvailable ? "#000" : "#999",
                  }}
                  title={geodesicHeatAvailable ? "" : geodesicHeatUnavailableReason}
                >
                  <input
                    type="checkbox"
                    checked={geodesicHeatEnabled}
                    onChange={onToggleGeodesicHeatEnabled}
                    disabled={!geodesicHeatAvailable}
                    style={{ marginRight: 6 }}
                  />
                  Enable experimental heat-distance tool
                </label>
                <div style={{ display: "flex", gap: 12 }}>
                  <span>Start: {geodesicHeatStart ? geodesicHeatStart.faceIndex : "-"}</span>
                  <span>End: {geodesicHeatEnd ? geodesicHeatEnd.faceIndex : "-"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onRunGeodesicHeat}
                    disabled={!geodesicHeatAvailable || geodesicHeatBusy}
                    style={{ padding: "3px 8px" }}
                  >
                    {geodesicHeatBusy ? "Running..." : "Run heat path"}
                  </button>
                  <button
                    type="button"
                    onClick={onClearGeodesicHeat}
                    style={{ padding: "3px 8px" }}
                  >
                    Clear heat
                  </button>
                  {geodesicHeatLength != null && Number.isFinite(geodesicHeatLength) && (
                    <span style={{ fontWeight: 600 }}>Length: {geodesicHeatLength.toFixed(3)}</span>
                  )}
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: geodesicHeatHeatmapAllowed ? "pointer" : "not-allowed",
                    color: geodesicHeatHeatmapAllowed ? "#000" : "#999",
                  }}
                  title={geodesicHeatHeatmapAllowed ? "" : geodesicHeatHeatmapReason}
                >
                  <input
                    type="checkbox"
                    checked={geodesicHeatShowHeatmap}
                    onChange={onToggleGeodesicHeatShowHeatmap}
                    disabled={!geodesicHeatHeatmapAllowed}
                    style={{ marginRight: 6 }}
                  />
                  Show distance heatmap
                </label>
                {(viewerKind === "graph" || viewerKind === "param" || viewerKind === "weierstrass") && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={geodesicHeatUseContinuous}
                      onChange={onToggleGeodesicHeatUseContinuous}
                      style={{ marginRight: 6 }}
                    />
                    Use continuous ODE (graph/param)
                  </label>
                )}
                {geodesicHeatMessage && (
                  <div style={{ color: "#b23b1a" }}>{geodesicHeatMessage}</div>
                )}
              </div>
            </div>
          </details>
          </div>
        </details>

        <details
          style={analysisAccordionStyle}
          onToggle={(event) => handleAnalysisSectionToggle("diagnostics", event)}
        >
          <summary style={analysisAccordionSummaryStyle}>Diagnostics</summary>
          <div style={{ marginTop: 8, marginBottom: 6, marginLeft: 4, fontSize: 12 }}>
            <div style={{ fontSize: 11, color: "#475467", marginBottom: 6 }}>
              Analysis results are shown in the right panel. Topology diagnostics are available in the Topology module.
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={inspectEnabled}
                onChange={onToggleInspectEnabled}
                style={{ marginRight: 6 }}
              />
              Inspect mode
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <button type="button" onClick={onClearInspect} style={{ padding: "4px 8px" }}>
                Clear inspect
              </button>
              <span style={{ fontSize: 11, color: "#666" }}>Shortcut: I / Esc</span>
            </div>
            {inspectIdx != null && inspectPos && inspectNormal && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid #d9dde7",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "#f7f8fb",
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Inspect</div>
                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "4px 8px" }}>
                  <div style={{ color: "#556" }}>Idx</div>
                  <div>{inspectIdx}</div>
                  <div style={{ color: "#556" }}>Pos</div>
                  <div>{fmt3(inspectPos)}</div>
                  <div style={{ color: "#556" }}>Normal</div>
                  <div>{fmt3(inspectNormal)}</div>
                  {inspectMetrics?.K != null && (
                    <>
                      <div style={{ color: "#556" }}>K</div>
                      <div>{fmt(inspectMetrics.K)}</div>
                    </>
                  )}
                  {inspectMetrics?.H != null && (
                    <>
                      <div style={{ color: "#556" }}>H</div>
                      <div>{fmt(inspectMetrics.H)}</div>
                    </>
                  )}
                  {inspectMetrics?.k1 != null && (
                    <>
                      <div style={{ color: "#556" }}>k1</div>
                      <div>{fmt(inspectMetrics.k1)}</div>
                    </>
                  )}
                  {inspectMetrics?.k2 != null && (
                    <>
                      <div style={{ color: "#556" }}>k2</div>
                      <div>{fmt(inspectMetrics.k2)}</div>
                    </>
              )}
            </div>
          </div>
        )}
        {(viewerKind === "mesh" || viewerKind === "complex") && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {viewerKind === "complex"
              ? "Complex map controls live in the left panel."
              : "SurfaceMesh presets and import live in the left panel."}
          </div>
        )}
        </div>
        </details>
        <button
          type="button"
          onClick={onResetCamera}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Reset camera view
        </button>
      </div>
      </div>
      )}
      {showViewControls && (
      <>
      {false && (viewerKind === "param" ||
        viewerKind === "weierstrass" ||
        viewerKind === "graph" ||
        viewerKind === "implicit") && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Display & analysis</div>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPrincipalDirections}
              onChange={onTogglePrincipalDirections}
              style={{ marginRight: 6 }}
            />
            Show principal directions
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPrincipalNormalPlanes}
              onChange={onTogglePrincipalNormalPlanes}
              style={{ marginRight: 6 }}
            />
            Show principal normal planes
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPrincipalLines}
              onChange={onTogglePrincipalLines}
              style={{ marginRight: 6 }}
            />
            Trace principal curvature lines
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPrincipalGlyphs}
              onChange={onTogglePrincipalGlyphs}
              style={{ marginRight: 6 }}
            />
            Show principal direction glyphs
          </label>
          {showPrincipalGlyphs && (
            <div
              style={{
                marginLeft: 20,
                marginTop: 6,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Density</span>
                <select
                  value={principalGlyphDensity}
                  onChange={(e) => onChangePrincipalGlyphDensity(Number(e.target.value))}
                  style={{ fontSize: 11, padding: "2px 4px" }}
                >
                  <option value={50}>1/50</option>
                  <option value={100}>1/100</option>
                  <option value={200}>1/200</option>
                  <option value={400}>1/400</option>
                </select>
              </label>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: 10, color: "#555" }}>
                  Length {principalGlyphLength.toFixed(2)}
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1.2}
                  step={0.05}
                  value={principalGlyphLength}
                  onChange={(e) => onChangePrincipalGlyphLength(Number(e.target.value))}
                  style={{ width: 160 }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Mode</span>
                <select
                  value={principalGlyphMode}
                  onChange={(e) => onChangePrincipalGlyphMode(e.target.value as "both" | "d1")}
                  style={{ fontSize: 11, padding: "2px 4px" }}
                >
                  <option value="both">d1 + d2</option>
                  <option value="d1">d1 only</option>
                </select>
              </label>
            </div>
          )}
        </div>
      )}
      {!hideViewControls && (
      <>

      {/* color mode */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Coloring</div>
        <div style={pillRow}>
          {colorModes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeColorMode(m)}
              style={pill(colorMode === m)}
              aria-pressed={colorMode === m}
            >
              {COLOR_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {showGaussMap && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Gauss map</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Color by</div>
          <div style={pillRow}>
            {(["components", "palette"] as GaussColorMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeGaussColorMode(m)}
                style={pill(gaussColorMode === m)}
                aria-pressed={gaussColorMode === m}
              >
                {m === "components" ? "Normal RGB" : "Palette (N.z)"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {gaussPointsCount > 0 ? `${gaussPointsCount} normals plotted` : "Waiting for normals..."}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Lighting</div>
        <div style={pillRow}>
          {(["studio", "soft", "contrast", "neutral", "warm"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChangeLightPreset(p)}
              style={pill(lightPreset === p)}
              aria-pressed={lightPreset === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Material</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ minWidth: 80 }}>Roughness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={materialRoughness}
            onChange={(e) => onSetMaterialRoughness(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialRoughness}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialRoughness(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ minWidth: 80 }}>Metalness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={materialMetalness}
            onChange={(e) => onSetMaterialMetalness(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialMetalness}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialMetalness(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ minWidth: 80 }}>Opacity</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={materialOpacity}
            onChange={(e) => onSetMaterialOpacity(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialOpacity}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialOpacity(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>
      </div>
      </>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Mesh resolution</div>
        {viewerKind === "graph" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Graph</span>
            <input
              type="range"
              min={20}
              max={160}
              step={1}
              value={graphResolution}
              onChange={(e) => onSetGraphResolution(clampInt(Number(e.target.value), 20, 160))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={20}
              max={200}
              step={1}
              value={graphResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetGraphResolution(clampInt(v, 20, 200));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}

        {viewerKind === "implicit" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Implicit</span>
            <input
              type="range"
              min={18}
              max={64}
              step={1}
              value={implicitResolution}
              onChange={(e) => onSetImplicitResolution(clampInt(Number(e.target.value), 18, 64))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={18}
              max={80}
              step={1}
              value={implicitResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetImplicitResolution(clampInt(v, 18, 80));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}

        {viewerKind === "param" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Param</span>
            <input
              type="range"
              min={20}
              max={240}
              step={1}
              value={paramResolution}
              onChange={(e) => onSetParamResolution(clampInt(Number(e.target.value), 20, 240))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={20}
              max={240}
              step={1}
              value={paramResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetParamResolution(clampInt(v, 20, 240));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}
        {viewerKind === "weierstrass" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Weierstrass</span>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={weierstrassResolution}
              onChange={(e) => onChangeWeierstrassResolution(clampInt(Number(e.target.value), 40, 200))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={40}
              max={200}
              step={1}
              value={weierstrassResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeWeierstrassResolution(clampInt(v, 40, 200));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}
      </div>

      {viewerKind === "implicit" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Implicit overlays</div>
          <div style={pillRow}>
            {(["none", "normals", "curvature"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeImplicitOverlay(m)}
                style={pill(implicitOverlay === m)}
                aria-pressed={implicitOverlay === m}
              >
                {m}
              </button>
            ))}
          </div>
          <div style={styles.hint}>Normals use f(x,y,z) gradients; curvature colors the implicit mesh.</div>
        </div>
      )}

      {!hideViewControls && (
      <div style={{ marginBottom: 10 }}>
  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Palette</div>

  <div style={pillRow}>
    {(["blueRed", "rainbow", "grayscale", "redYellow"] as const).map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onChangeColorPalette(p)}
        style={pill(colorPalette === p)}
        aria-pressed={colorPalette === p}
      >
        {p === "blueRed" ? "blue–red" : p === "redYellow" ? "red–yellow" : p}
      </button>
    ))}
  </div>
</div>
      )}

      {isEqViewer && <p style={styles.hint}>{eqMeta.note}</p>}
      {viewerKind === "param" && <p style={styles.hint}>{paramMeta.note}</p>}
      {viewerKind === "weierstrass" && <p style={styles.hint}>{WEIERSTRASS_META.note}</p>}

      {viewerKind === "graph" && isGraphAny && !isGraphCustom && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={onEditGraphAsCustom}
            disabled={!canEditGraphAsCustom}
            style={{ padding: "4px 10px" }}
          >
            Edit as Custom z=f(x,y)
          </button>
          <div style={styles.hint}>
            Copies this explicit preset equation into editable custom graph mode.
          </div>
        </div>
      )}

      {/* custom graph formula */}
      {isGraphCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Custom formula z =</label>
          <input
            type="text"
            value={graphExpr}
            onChange={(e) => onChangeGraphExpr(e.target.value)}
            placeholder="e.g. x*x - y*y, sin(x)*cos(y), x^y"
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <p style={styles.hint}>
            Use <code>x</code>, <code>y</code>, operators <code>+ - * / ^</code>, and functions like
            <code> sin</code>, <code>cos</code>, <code>sqrt</code>, <code>abs</code>, <code>log</code>,
            <code>exp</code>, <code>min</code>, <code>max</code>. Constants: <code>pi</code>, <code>e</code>.
            For real values, <code>x^y</code> is valid when <code>x &gt;= 0</code> (or integer <code>y</code>);
            otherwise use <code>abs(x)^y</code>.
          </p>
        </div>
      )}

      {/* contours for graph + implicit */}
      {(isGraphAny || isImplicitAny) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Contours (level sets)</div>
          {isImplicitAny && (
            <div style={styles.hint}>Implicit contours are intersections with horizontal planes (y = const).</div>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={showContours} onChange={onToggleContours} />
            Show contour lines
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <span style={{ minWidth: 52 }}>Levels</span>
            <input
              type="range"
              min={3}
              max={30}
              value={contourCount}
              onChange={(e) => onSetContourCount(parseInt(e.target.value, 10))}
              disabled={!showContours}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: "right", opacity: showContours ? 1 : 0.5 }}>{contourCount}</span>
          </div>
        </div>
      )}

      {viewerKind === "implicit" && isImplicitAny && !isImplicitCustom && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={onEditImplicitAsCustom}
            disabled={!canEditImplicitAsCustom}
            style={{ padding: "4px 10px" }}
          >
            Edit as Custom f(x,y,z)
          </button>
          <div style={styles.hint}>
            Copies this implicit preset equation into editable custom implicit mode.
          </div>
        </div>
      )}

      {/* custom implicit */}
      {isImplicitCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Implicit function f(x, y, z) =</label>
          <input
            type="text"
            value={implicitExpr}
            onChange={(e) => onChangeImplicitExpr(e.target.value)}
            placeholder="e.g. x*x + y*y + z*z - 1"
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Load implicit preset</div>
            <div style={pillRow}>
              {IMPLICIT_EXPR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChangeImplicitExpr(p.expr)}
                  style={pill(implicitExprTrimmed === p.expr)}
                  aria-pressed={implicitExprTrimmed === p.expr}
                  title={p.expr}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewerKind === "weierstrass" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Weierstrass data</div>
          <div style={styles.hint}>z = u + i v. Expressions use z (complex), u, v, i, pi, e.</div>

          <label style={{ fontSize: 12 }}>g(z) =</label>
          <input
            type="text"
            value={weierstrassGExpr}
            onChange={(e) => onChangeWeierstrassGExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>phi(z) =</label>
          <input
            type="text"
            value={weierstrassPhiExpr}
            onChange={(e) => onChangeWeierstrassPhiExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          {weierstrassError && (
            <div style={{ fontSize: 11, color: "#b42318", marginBottom: 6 }}>
              {weierstrassError}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
            <label style={{ fontSize: 11 }}>
              u min
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.uMin}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, uMin: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              u max
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.uMax}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, uMax: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              v min
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.vMin}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, vMin: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              v max
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.vMax}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, vMax: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 8 }}>
            <input type="checkbox" checked={weierstrassRecenter} onChange={onToggleWeierstrassRecenter} />
            Recenter / Rescale
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onResetWeierstrass} style={{ padding: "4px 8px" }}>
              Reset defaults
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e0e0e0",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Diagnostics</span>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: diagStatusColor,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                Status: {diagStatusLabel}
              </span>
            </div>
            {weierstrassDiagnosticError ? (
              <div style={{ fontSize: 11, color: "#b42318", marginBottom: 6 }}>{weierstrassDiagnosticError}</div>
            ) : (
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                Path-independence is checked by integrating Φ(z) along the UV box boundary. The status
                follows the thresholds: green &lt; 1e-3, yellow 1e-3..1e-2, red &gt; 1e-2.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Path drift (rectangle loop):</span>
              <span style={{ fontFamily: "monospace" }}>
                {diagSuccess ? fmt(diagSuccess.drift) : "-"}
              </span>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              dx, dy, dz drift vector:{" "}
              <span style={{ fontFamily: "monospace" }}>
                {diagSuccess ? fmt3(diagSuccess.driftVec) : "(-)"}
              </span>
            </div>
            {weierstrassPathDisagreement && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span>Path disagreement:</span>
                <span style={{ fontFamily: "monospace" }}>
                  avg {fmt(weierstrassPathDisagreement.avg)}, max {fmt(weierstrassPathDisagreement.max)}
                </span>
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={showDriftArrow} onChange={onToggleDriftArrow} />
                Show drift vector arrow
              </label>
              <button type="button" onClick={onRecomputeDiagnostics} style={{ padding: "4px 8px" }}>
                Recompute diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {isGeneralRotationalParam && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Rotational profile</label>
          <p style={styles.hint}>
            General form: <code>(r(v), z(v)) → (r(v) cos u, r(v) sin u, z(v))</code> with x/y/z or arbitrary axis.
          </p>

          <div style={pillRow}>
            {(["formula", "points", "spline"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeRotationalProfileMode(mode)}
                style={pill(rotationalProfileMode === mode)}
                aria-pressed={rotationalProfileMode === mode}
              >
                {mode}
              </button>
            ))}
          </div>

          {rotationalProfileMode === "formula" && (
            <>
              <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                Preset defaults: r(v) = <code>{rotationalDefaults?.rExpr ?? "-"}</code>, z(v) ={" "}
                <code>{rotationalDefaults?.zExpr ?? "-"}</code>
              </div>
              <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>r(v) =</label>
              <input
                type="text"
                value={rotationalProfileRExpr}
                placeholder={rotationalDefaults?.rExpr ?? "r(v)"}
                onChange={(e) => onChangeRotationalProfileRExpr(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 2,
                  marginBottom: 6,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />

              <label style={{ fontSize: 12 }}>z(v) =</label>
              <input
                type="text"
                value={rotationalProfileZExpr}
                placeholder={rotationalDefaults?.zExpr ?? "z(v)"}
                onChange={(e) => onChangeRotationalProfileZExpr(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 2,
                  marginBottom: 6,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  onChangeRotationalProfileRExpr("");
                  onChangeRotationalProfileZExpr("");
                }}
                style={{ padding: "4px 8px" }}
              >
                Use preset profile
              </button>
            </>
          )}

          {(rotationalProfileMode === "points" || rotationalProfileMode === "spline") && (
            <>
              <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                Spline/points parameters are available in the main view overlay dialog (center). Current rows:{" "}
                {rotationalProfilePointsText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0).length}
              </div>
              <button
                type="button"
                onClick={() => onChangeRotationalProfilePointsText(DEFAULT_ROTATIONAL_PROFILE_POINTS_TEXT)}
                style={{ padding: "4px 8px", width: "fit-content" }}
              >
                Load sample points
              </button>
            </>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Axis of revolution</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>quick axis</div>
            <div style={pillRow}>
              {(["x", "y", "z"] as const).map((axis) => (
                <button
                  key={`rot-axis-${axis}`}
                  type="button"
                  onClick={() => onChangeRotationalAxisDirection({ ...ROTATIONAL_AXIS_DIRECTIONS[axis] })}
                  style={pill(rotationalPrincipalAxis === axis)}
                  aria-pressed={rotationalPrincipalAxis === axis}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 8, marginBottom: 4 }}>
              Arbitrary axis: edit direction below.
            </div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>origin</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6 }}>
              {(["x", "y", "z"] as const).map((axis) => (
                <label key={`axis-origin-${axis}`} style={{ fontSize: 11 }}>
                  {axis}
                  <input
                    type="number"
                    step={0.1}
                    value={rotationalAxisOrigin[axis]}
                    onChange={(e) =>
                      onChangeRotationalAxisOrigin(
                        patchVecAxis(rotationalAxisOrigin, axis, Number(e.target.value))
                      )
                    }
                    style={{ width: "100%", marginTop: 3 }}
                  />
                </label>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#666", marginTop: 8, marginBottom: 4 }}>direction</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6 }}>
              {(["x", "y", "z"] as const).map((axis) => (
                <label key={`axis-dir-${axis}`} style={{ fontSize: 11 }}>
                  {axis}
                  <input
                    type="number"
                    step={0.1}
                    value={rotationalAxisDirection[axis]}
                    onChange={(e) =>
                      onChangeRotationalAxisDirection(
                        patchVecAxis(rotationalAxisDirection, axis, Number(e.target.value))
                      )
                    }
                    style={{ width: "100%", marginTop: 3 }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {isRmfRibbonParam && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>RMF ribbon options</label>
          <p style={styles.hint}>
            Uses a rotation-minimizing frame along the centerline. Enable twist to rotate ribbon orientation along
            <code> v</code>.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={rmfRibbonTwistEnabled}
              onChange={(e) => onChangeRmfRibbonTwistEnabled(e.target.checked)}
            />
            Enable twist
          </label>
          <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>
            Twist turns across v-range
            <input
              type="number"
              min={-8}
              max={8}
              step={0.25}
              value={rmfRibbonTwistTurns}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onChangeRmfRibbonTwistTurns(clampNumber(v, -8, 8));
              }}
              style={{ width: "100%", marginTop: 4 }}
              disabled={!rmfRibbonTwistEnabled}
            />
          </label>
        </div>
      )}

      {isSplinePatchParam && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>
            Spline patch parameters
          </label>
          <p style={styles.hint}>
            Control rows use format <code>x,y,z; x,y,z; ...</code>. Use one row per line. JSON arrays also work.
          </p>

          {isBezierPatchParam && (
            <>
              <label style={{ fontSize: 12 }}>Control grid Pᵢⱼ</label>
              <textarea
                value={bezierControlGridText}
                onChange={(e) => onChangeBezierControlGridText(e.target.value)}
                rows={6}
                style={{
                  width: "100%",
                  marginTop: 4,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => onChangeBezierControlGridText(DEFAULT_BEZIER_CONTROL_GRID_TEXT)}
                style={{ padding: "4px 8px", marginTop: 8 }}
              >
                Reset Bezier control grid
              </button>
            </>
          )}

          {(isBSplinePatchParam || isNurbsPatchParam) && (
            <>
              <label style={{ fontSize: 12 }}>Control grid Pᵢⱼ</label>
              <textarea
                value={isNurbsPatchParam ? nurbsControlGridText : bSplineControlGridText}
                onChange={(e) =>
                  isNurbsPatchParam
                    ? onChangeNurbsControlGridText(e.target.value)
                    : onChangeBSplineControlGridText(e.target.value)
                }
                rows={7}
                style={{
                  width: "100%",
                  marginTop: 4,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 11 }}>
                  degree u
                  <input
                    type="number"
                    min={1}
                    max={8}
                    step={1}
                    value={isNurbsPatchParam ? nurbsDegreeU : bSplineDegreeU}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      if (isNurbsPatchParam) onChangeNurbsDegreeU(Math.max(1, Math.round(value)));
                      else onChangeBSplineDegreeU(Math.max(1, Math.round(value)));
                    }}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  degree v
                  <input
                    type="number"
                    min={1}
                    max={8}
                    step={1}
                    value={isNurbsPatchParam ? nurbsDegreeV : bSplineDegreeV}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      if (isNurbsPatchParam) onChangeNurbsDegreeV(Math.max(1, Math.round(value)));
                      else onChangeBSplineDegreeV(Math.max(1, Math.round(value)));
                    }}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>

              <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>Knot vector u</label>
              <input
                type="text"
                value={isNurbsPatchParam ? nurbsKnotUText : bSplineKnotUText}
                onChange={(e) =>
                  isNurbsPatchParam
                    ? onChangeNurbsKnotUText(e.target.value)
                    : onChangeBSplineKnotUText(e.target.value)
                }
                style={{
                  width: "100%",
                  marginTop: 4,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />

              <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>Knot vector v</label>
              <input
                type="text"
                value={isNurbsPatchParam ? nurbsKnotVText : bSplineKnotVText}
                onChange={(e) =>
                  isNurbsPatchParam
                    ? onChangeNurbsKnotVText(e.target.value)
                    : onChangeBSplineKnotVText(e.target.value)
                }
                style={{
                  width: "100%",
                  marginTop: 4,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  fontFamily: "monospace",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />

              {isNurbsPatchParam && (
                <>
                  <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>Weights wᵢⱼ</label>
                  <textarea
                    value={nurbsWeightsText}
                    onChange={(e) => onChangeNurbsWeightsText(e.target.value)}
                    rows={5}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      fontFamily: "monospace",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isNurbsPatchParam) {
                    onChangeNurbsControlGridText(DEFAULT_NURBS_CONTROL_GRID_TEXT);
                    onChangeNurbsDegreeU(DEFAULT_NURBS_DEGREE_U);
                    onChangeNurbsDegreeV(DEFAULT_NURBS_DEGREE_V);
                    onChangeNurbsKnotUText(DEFAULT_NURBS_KNOT_U_TEXT);
                    onChangeNurbsKnotVText(DEFAULT_NURBS_KNOT_V_TEXT);
                    onChangeNurbsWeightsText(DEFAULT_NURBS_WEIGHTS_TEXT);
                  } else {
                    onChangeBSplineControlGridText(DEFAULT_BSPLINE_CONTROL_GRID_TEXT);
                    onChangeBSplineDegreeU(DEFAULT_BSPLINE_DEGREE_U);
                    onChangeBSplineDegreeV(DEFAULT_BSPLINE_DEGREE_V);
                    onChangeBSplineKnotUText(DEFAULT_BSPLINE_KNOT_U_TEXT);
                    onChangeBSplineKnotVText(DEFAULT_BSPLINE_KNOT_V_TEXT);
                  }
                }}
                style={{ padding: "4px 8px", marginTop: 8 }}
              >
                Reset {isNurbsPatchParam ? "NURBS" : "B-spline"} defaults
              </button>
            </>
          )}
        </div>
      )}

      {viewerKind === "param" && !isParamCustom && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={onEditParamAsCustom}
            disabled={!canEditParamAsCustom}
            style={{ padding: "4px 10px" }}
          >
            Start as Custom σ(u,v)
          </button>
          <div style={styles.hint}>
            Copies the active parametric preset into editable <code>x(u,v)</code>, <code>y(u,v)</code>, <code>z(u,v)</code>.
          </div>
        </div>
      )}

      {/* custom param */}
      {isParamCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Custom σ(u,v)</label>
          <p style={styles.hint}>
            Enter three expressions in <code>u</code>, <code>v</code>. Use <code>Math.*</code>.
          </p>

          <label style={{ fontSize: 12 }}>x(u,v) =</label>
          <input
            type="text"
            value={paramXExpr}
            onChange={(e) => onChangeParamXExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>y(u,v) =</label>
          <input
            type="text"
            value={paramYExpr}
            onChange={(e) => onChangeParamYExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>z(u,v) =</label>
          <input
            type="text"
            value={paramZExpr}
            onChange={(e) => onChangeParamZExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
      </>
      )}
      </div>

      <div style={{ display: leftTab === "theory" ? "block" : "none" }}>
        <h3 style={styles.h3}>{activeMeta.label} theory</h3>
        <p style={styles.hint}>Curvature, gradients, and vectors from the latest probe.</p>

        {!probeInfo ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Enable <b>Probe mode</b> and click the surface to populate details.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Probe</div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>p</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.point)}</span>
              </div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>n</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.normal)}</span>
              </div>
              {probeInfo.xy && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b>x,y</b> ={" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({fmt(probeInfo.xy.x)}, {fmt(probeInfo.xy.y)})
                  </span>
                </div>
              )}
              {probeInfo.uv && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b>u,v</b> ={" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({fmt(probeInfo.uv.u)}, {fmt(probeInfo.uv.v)})
                  </span>
                </div>
              )}
              {chartCoordinateReadoutEnabled && chartCoordinateReadout && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b>
                    {chartCoordinateReadout.kind === "xy"
                      ? "chart (x,y)"
                      : chartCoordinateReadout.kind === "uv"
                        ? "chart (u,v)"
                        : "chart (xi,eta)"}
                  </b>{" "}
                  ={" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({fmt(chartCoordinateReadout.u)}, {fmt(chartCoordinateReadout.v)})
                    {chartCoordinateReadout.valid ? "" : " invalid"}
                  </span>
                </div>
              )}
            </div>

            {probeCurv && isGraphAny ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Principal curvatures</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                    k1 = {fmt(probeCurv.k1)}
                    <br />
                    k2 = {fmt(probeCurv.k2)}
                    <br />
                    H = {fmt(probeCurv.H)}
                    <br />
                    K = {fmt(probeCurv.K)}
                  </div>
                </div>
                {(() => {
                  const xu = { x: 1, y: probeCurv.fx, z: 0 };
                  const xv = { x: 0, y: probeCurv.fy, z: 1 };
                  const e1 = vNormalize(xu);
                  const proj = vScale(e1, vDot(xv, e1));
                  const e2 = vNormalize(vSub(xv, proj));
                  const nFromXuXv = vNormalize(vCross(xu, xv));

                  return (
                    <>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Tangent basis (world)</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                          Xu = {fmt3(xu)}
                          <br />
                          Xv = {fmt3(xv)}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Orthonormal basis (world)</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                          e1 = {fmt3(e1)}
                          <br />
                          e2 = {fmt3(e2)}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Normal from Xu x Xv</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                          n = {fmt3(nFromXuXv)}
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Derivatives</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                    fx = {fmt(probeCurv.fx)}{"  "}fy = {fmt(probeCurv.fy)}
                    <br />
                    fxx = {fmt(probeCurv.fxx)}{"  "}fyy = {fmt(probeCurv.fyy)}{"  "}fxy = {fmt(probeCurv.fxy)}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Gradient</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                    grad f = ({fmt(probeCurv.fx)}, {fmt(probeCurv.fy)})
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Curvature / invariants</div>
                  <pre
                    style={{
                      marginTop: 6,
                      marginBottom: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 11,
                      background: "#fafafa",
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    {JSON.stringify(probeCurv, null, 2)}
                  </pre>
                </div>
              </>
            ) : (viewerKind === "param" || viewerKind === "weierstrass") && paramProbeCurv ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Principal curvatures</div>
                <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                  k1 = {fmt(paramProbeCurv.k1)}
                  <br />
                  k2 = {fmt(paramProbeCurv.k2)}
                  <br />
                  H = {fmt(paramProbeCurv.H)}
                  <br />
                  K = {fmt(paramProbeCurv.K)}
                </div>
                {paramProbeCurv.isUmbilic && (
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    Umbilic point: principal directions are unstable.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
                {viewerKind === "param" || viewerKind === "weierstrass"
                  ? "Principal curvature data unavailable for this probe."
                  : "Curvature details currently compute only for graph surfaces."}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Command prompt</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => onChangeCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRunCommand(commandInput);
              }}
              placeholder='Try: surface graph graph_ripple'
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={() => onRunCommand(commandInput)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Run
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Examples: <code>help</code>, <code>colorMode gaussian</code>, <code>probe at 0.4 -0.2</code>, <code>expr graph "sin(x)+cos(y)"</code>
          </div>

          {commandHistory.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {commandHistory.slice(0, 4).map((h, i) => (
                <div
                  key={`${h.cmd}-${i}`}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontFamily: "monospace", marginBottom: 4 }}>&gt; {h.cmd}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{h.out}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Theory notes</div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
            <div>Graph parametrization: X(u,v) = (u, f(u,v), v) in world coordinates.</div>
            <div>Tangents: Xu = (1, fx, 0), Xv = (0, fy, 1).</div>
            <div>First fundamental form: E = dot(Xu, Xu), F = dot(Xu, Xv), G = dot(Xv, Xv).</div>
            <div>Second fundamental form: e = dot(n, Xuu), f = dot(n, Xuv), g = dot(n, Xvv).</div>
            <div>Curvatures: K = (eg - f^2)/(EG - F^2), H = (Eg - 2Ff + Ge)/(2(EG - F^2)).</div>
          </div>
          {(viewerKind === "mesh" || viewerKind === "implicit" || viewerKind === "complex") && (
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.92, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>B. Mesh-face grid</div>
              <div style={{ marginBottom: 6 }}>Best for:</div>
              <pre
                style={{
                  margin: 0,
                  marginBottom: 10,
                  background: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {"imported meshes\nimplicit surfaces\nengine-generated meshes\nbaked surfaces"}
              </pre>
              <div style={{ marginBottom: 8 }}>
                Here the surface may not have natural <i>u, v</i> coordinates.
              </div>
              <div style={{ marginBottom: 6 }}>
                So instead of true rectangular parameter cells, we can display:
              </div>
              <pre
                style={{
                  margin: 0,
                  marginBottom: 10,
                  background: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {"mesh triangle cells\nremeshed cells\nsubdivision cells\nselected connected regions"}
              </pre>
              <div>This is not the same as a parametric grid, but it is still useful.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export type MeshAnalyzeDiagnosticsSummary = MeshDiagnosticsAnalysisPayload;

export type SurfacesRightPanelProps = {
  viewerKind: SurfaceViewerKind;
  meshKernelDocument: MeshDocument | null;
  meshAnalysisActive: boolean;
  surfaceId: SurfaceId;
  paramId: ParamSurfaceId;
  surfaceMeshLabel: string;
  meshActiveAnalysisResult: MeshActiveAnalysisResultSummary;
  meshAnalysisComputationHistory: MeshAnalysisComputationRecord[];
  meshSelectedScientificFields: MeshEntityScientificFields | null;
  meshWorkspaceSummary: MeshWorkspaceInspectorSummary;
  meshWorkspaceSelectedProvenanceEntry: MeshOperationHistoryEntry | null;
  requestedInspectorTab?: InspectorPanelTab | null;
  meshActiveSelectionCardType: ActiveSelectionCardProps["type"];
  meshActiveSelectionCardId: ActiveSelectionCardProps["entityId"];
  meshActiveSelectionCardActions: ActiveSelectionCardProps["actions"];
  meshActiveSelectionCardActionButtons: readonly ActiveSelectionCardAction[];
  meshActiveSelectionCardEmptyState: ActiveSelectionCardProps["emptyState"];
  meshActiveSelectionCardConfirmationLabel: ActiveSelectionCardProps["confirmationLabel"];
  meshActiveSelectionCardLastCommandLabel: ActiveSelectionCardProps["lastCommandLabel"];
  meshActiveSelectionCardCanUndoLast: boolean;
  meshAdaptiveTopologyGizmoLabel: ActiveSelectionCardProps["adaptiveGizmoLabel"];
  onUndoSurfaceMeshTopologyEdit: () => void;
  onOpenSurfaceMeshTopologyHistory: () => void;
  onClearSurfaceMeshTopologySelection: () => void;
  meshCanBookmarkSelection: boolean;
  onBookmarkMeshSelection: () => void;
  meshCanRedoSelection: boolean;
  onRedoMeshSelection: () => void;
  meshSelectionHistoryItems: readonly SelectionHistoryEntry[];
  meshSelectionBookmarks: readonly SelectionHistoryEntry[];
  onRestoreMeshSelection: (entry: SelectionHistoryEntry) => void;
  onRemoveMeshSelectionBookmark: (entry: SelectionHistoryEntry) => void;
  meshContextualPreviewActive: boolean;
  commandPreviewHighVisibility: boolean;
  onOpenPreviewSettings: () => void;
  surfaceMeshStats: { vertCount: number; triCount: number } | null;
  surfaceMeshBounds: BBox3 | null;
  surfaceMeshSource: SurfaceMeshSource | null;
  graphResolution: number;
  onSetGraphResolution: (v: number) => void;
  paramResolution: number;
  onSetParamResolution: (v: number) => void;
  weierstrassResolution: number;
  onSetWeierstrassResolution: (v: number) => void;
  lightPreset: "studio" | "soft" | "contrast" | "neutral" | "warm";
  onChangeLightPreset: (preset: "studio" | "soft" | "contrast" | "neutral" | "warm") => void;
  materialRoughness: number;
  onSetMaterialRoughness: (v: number) => void;
  materialMetalness: number;
  onSetMaterialMetalness: (v: number) => void;
  materialOpacity: number;
  onSetMaterialOpacity: (v: number) => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  showPlanes: boolean;
  onTogglePlanes: () => void;
  showGaussMap: boolean;
  onToggleGaussMap: () => void;
  showContours: boolean;
  onToggleContours: () => void;
  contourCount: number;
  onSetContourCount: (v: number) => void;
  showPrincipalDirections: boolean;
  onTogglePrincipalDirections: () => void;
  showPrincipalLines: boolean;
  onTogglePrincipalLines: () => void;
  showCurvatureLines: boolean;
  onToggleCurvatureLines: () => void;
  canDuplicate: boolean;
  onDuplicate: () => void;
  canExport: boolean;
  onExport: () => void;
  canBake: boolean;
  onBake: () => void;
  canCompare: boolean;
  onCompare: () => void;
  surfaceWorkflowActiveStepId: SurfaceWorkflowStepId;
  surfaceWorkflowStepStateById: Record<SurfaceWorkflowStepId, SurfaceWorkflowStepState>;

  onPickEqSurface: (id: SurfaceId) => void;
  onPickParamSurface: (id: ParamSurfaceId) => void;

  graphExpr: string;
  implicitExpr: string;
  onChangeImplicitExpr: (s: string) => void;
  onLoadDeterministicImplicitSample: () => void;
  implicitResolution: number;
  meshOperationPreviewBusy: boolean;
  meshOperationPreviewError: string | null;
  generateSurfaceStatus: GenerateSurfaceStatus;
  meshOperationPreviewTargetFaces: number;
  meshOperationPreviewUseDecimate: boolean;
  meshLastOperation: MeshOperationResultSummary | null;
  meshOperationLastValidation: MeshOperationLastValidation | null;
  meshOperationHistory: MeshOperationHistoryEntry[];
  surfaceMeshTopologyHistory: SurfaceMeshTopologyHistoryEntry[];
  meshOperationError: string | null;
  onValidateActiveMesh: () => void | Promise<void>;
  onShowMeshHealthProblems: () => void;
  onValidateLastMeshOperationResult: () => void | Promise<void>;
  onPreviewMeshOperationHistoryEntry: (entryId: string, side: "before" | "after") => void;
  onRestoreMeshOperationHistoryEntry: (entryId: string) => void;
  onPreviewSurfaceMeshTopologyHistoryEntry: (entryId: string, side: "before" | "after") => void;
  onRestoreSurfaceMeshTopologyHistoryEntry: (entryId: string) => void;
  onUndoLatestMeshOperation: () => void;
  canUndoLatestMeshOperation: boolean;
  onSaveMeshOperationPreset: () => void;
  onChangeMeshOperationPreviewTargetFaces: (v: number) => void;
  onChangeMeshOperationPreviewUseDecimate: (v: boolean) => void;
  onRunMeshOperationPreview: () => void;
  cgalHealthState: CgalHealthState | null;
  cgalBusy: boolean;
  cgalError: string | null;
  cgalTargetEdge: number;
  onChangeCgalTargetEdge: (v: number) => void;
  cgalAutoTargetEdge: boolean;
  onChangeCgalAutoTargetEdge: (v: boolean) => void;
  cgalPadFrac: number;
  onChangeCgalPadFrac: (v: number) => void;
  cgalTriBudgetEnabled: boolean;
  onChangeCgalTriBudgetEnabled: (v: boolean) => void;
  cgalTriBudget: number;
  onChangeCgalTriBudget: (v: number) => void;
  cgalAutoEdge: number;
  cgalTriBudgetEdge: number;
  cgalRadiusBound: number;
  onChangeCgalRadiusBound: (v: number) => void;
  cgalMinTrisEnabled: boolean;
  onChangeCgalMinTrisEnabled: (v: boolean) => void;
  cgalMinTris: number;
  onChangeCgalMinTris: (v: number) => void;
  cgalDomainDiag: number;
  cgalEffectiveEdge: number;
  cgalEstimatedTris: number;
  cgalTooHeavy: boolean;
  cgalVerbose: boolean;
  onChangeCgalVerbose: (v: boolean) => void;
  cgalPreflightSamples: number;
  onChangeCgalPreflightSamples: (v: number) => void;
  onRunCgalMesh: () => void;
  onStopCgalWorker: () => void;
  cgalMeshInfo: { vertexCount: number; triCount: number } | null;
  isDevMode: boolean;
  surfacePerformanceSnapshot: SurfacePerformanceSnapshot | null;
  meshPerformanceBenchmarkId: MeshPerfBenchmarkId | null;
  meshPerformanceLastBuildMs: number | null;
  meshPipelineProfile: MeshPipelineProfileRun | null;
  meshDebugMonitor: MeshDebugMonitorState;
  onOpenMeshDeveloperDiagnostics: () => void;
  onClearMeshDebugMonitor: () => void;
  onRunMeshPerformanceBenchmark: (id: MeshPerfBenchmarkId) => void;
  onRestoreMeshPerformanceBaseline: () => void;
  meshBenchmarkPerformanceSuite: MeshBenchmarkPerformanceSuiteState;
  onRunMeshBenchmarkPerformanceSuite: () => void;
  meshInteractionQualityMode: MeshInteractionQualityMode;
  onChangeMeshInteractionQualityMode: (mode: MeshInteractionQualityMode) => void;
  meshInteractionRestoreDelayMs: number;
  onChangeMeshInteractionRestoreDelayMs: (value: number) => void;
  meshInteractionPreviewTriangleTarget: number;
  onChangeMeshInteractionPreviewTriangleTarget: (value: number) => void;
  meshInteractionHideVertexMarkers: boolean;
  onChangeMeshInteractionHideVertexMarkers: (value: boolean) => void;
  meshInteractionHideFaceNormals: boolean;
  onChangeMeshInteractionHideFaceNormals: (value: boolean) => void;
  meshInteractionHideCurvatureGlyphs: boolean;
  onChangeMeshInteractionHideCurvatureGlyphs: (value: boolean) => void;
  meshInteractionHideWireframe: boolean;
  onChangeMeshInteractionHideWireframe: (value: boolean) => void;
  meshInspectorStats: {
    vertexCount: number | null;
    faceCount: number | null;
    boundaryEdgeCount: number | null;
    connectedComponentCount: number | null;
  };
  deferredSurfaceSampleSetInfo: DeferredSurfaceSampleSetInfo | null;
  onPrepareDeferredSurfaceAnalysisData: () => void;
  meshTopologyDetails: MeshTopologyInspectorDetails | null;
  meshAnalyzeDiagnostics: MeshAnalyzeDiagnosticsSummary | null;
  meshBenchmarkVerification: MeshBenchmarkVerificationContext | null;
  onHighlightMeshAnalyzeBoundary: () => void;
  onHighlightMeshAnalyzeDuplicates: () => void;
  onPreviewMeshAnalyzeWeld: () => void;
  onRecomputeMeshAnalyzeDiagnostics: () => void;
  badTriangleCount: number | null;
  geodesicPathLength: number | null;
  curvatureRanges: {
    K: { min: number; max: number } | null;
    H: { min: number; max: number } | null;
    k1: { min: number; max: number } | null;
    k2: { min: number; max: number } | null;
  };
  analysisFocusedSection: AnalysisFocusedSection;
  meshQualityReport: MeshQualityReport | null;
  meshQualityBusy: boolean;
  meshQualityProgress: number;
  meshQualityPhase: MeshQualityReportPhase | "idle";
  calculusScalarSource: string;
  calculusVectorSource: string;
  calculusActiveVectorField: string;
  calculusVectorOverlayEnabled: boolean;
  calculusVectorDensity: number;
  calculusVectorScale: number;
  calculusStatus: string | null;
  calculusError: string | null;
  activeVectorMagnitudeRange: { min: number; max: number } | null;
  curvatureLineField: "d1" | "d2";
  curvatureSeedSource: "global" | "selection";
  curvatureSeedDensity: number;
  curvatureMaxSteps: number;
  curvatureMaxLines: number;
  onRebuildCurvatureLines: () => void;
  onSelectMeshAnalysisCurvatureField: (field: "K" | "H" | "k1" | "k2") => void;

  probeInfo: ProbeInfo | null;
  probeCurv: CurvatureData | null;
  paramProbeCurv: PrincipalCurvatureScalars | null;
  geometryProbeSelectionMode?: GeometryProbeSelectionMode;
  geometryProbeSelectionDetails?: GeometryProbeSelectionDetails | null;
  geometryProbeHoverSelectionDetails?: GeometryProbeSelectionDetails | null;
  probeEnabled: boolean;
  onToggleProbe: () => void;
  showProbeNormal: boolean;
  onToggleProbeNormal: () => void;
  showProbeTangentPlane: boolean;
  onToggleProbeTangentPlane: () => void;
  showProbeTangents: boolean;
  onToggleProbeTangents: () => void;
  inspectEnabled: boolean;
  onToggleInspectEnabled: () => void;
  onClearInspect: () => void;
  inspectIdx: number | null;
  inspectPos: { x: number; y: number; z: number } | null;
  inspectNormal: { x: number; y: number; z: number } | null;
  inspectMetrics: SurfaceInspectMetrics | null;
  meshDifferentialGeometrySummary: MeshDifferentialGeometrySummary | null;
  meshAnalyzeProbeHistory: MeshAnalyzeProbeHistoryEntry[];
  onRestoreMeshAnalyzeProbe: (entry: MeshAnalyzeProbeHistoryEntry) => void;
  onClearMeshAnalyzeProbeHistory: () => void;

  onPickDomainUV: (uv: { u: number; v: number }) => void;
  onPickDomainXY: (xy: { x: number; y: number }) => void;
  onPickDomainXYZ: (xyz: { x: number; y: number; z: number }) => void;

  graphDomain: GraphDomain;
  onChangeGraphDomain: (d: GraphDomain) => void;
  paramDomain: ParamDomain;
  onChangeParamDomain: (d: ParamDomain) => void;
  implicitDomain: ImplicitDomain;
  onChangeImplicitDomain: (d: ImplicitDomain) => void;

  graphDomainPresets: GraphDomainPreset[];
  paramDomainPresets: ParamDomainPreset[];
  implicitDomainPresets: ImplicitDomainPreset[];
  onSaveGraphDomainPreset: (label: string) => void;
  onSaveParamDomainPreset: (label: string) => void;
  onSaveImplicitDomainPreset: (label: string) => void;
  onApplyGraphDomainPreset: (id: string) => void;
  onApplyParamDomainPreset: (id: string) => void;
  onApplyImplicitDomainPreset: (id: string) => void;
  onRemoveGraphDomainPreset: (id: string) => void;
  onRemoveParamDomainPreset: (id: string) => void;
  onRemoveImplicitDomainPreset: (id: string) => void;
};

export type AnalysisResultsView = "show-all" | "current-screen";

export type MeshAnalysisFeatureState = "ready" | "running" | "deferred" | "not-requested" | "missing" | "unavailable";

export type MeshAnalysisFeatureRow = {
  id: string;
  group: "Surface" | "Topology" | "Quality";
  label: string;
  state: MeshAnalysisFeatureState;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  onOpenResult?: () => void;
  disabled?: boolean;
};

export const SurfacesRightPanel: React.FC<SurfacesRightPanelProps> = ({
  viewerKind,
  meshKernelDocument,
  meshAnalysisActive,
  surfaceId,
  paramId,
  surfaceMeshLabel,
  meshActiveAnalysisResult,
  meshAnalysisComputationHistory,
  meshSelectedScientificFields,
  meshWorkspaceSummary,
  meshWorkspaceSelectedProvenanceEntry,
  requestedInspectorTab = null,
  meshActiveSelectionCardType,
  meshActiveSelectionCardId,
  meshActiveSelectionCardActions,
  meshActiveSelectionCardActionButtons,
  meshActiveSelectionCardEmptyState,
  meshActiveSelectionCardConfirmationLabel,
  meshActiveSelectionCardLastCommandLabel,
  meshActiveSelectionCardCanUndoLast,
  meshAdaptiveTopologyGizmoLabel,
  onUndoSurfaceMeshTopologyEdit,
  onOpenSurfaceMeshTopologyHistory,
  onClearSurfaceMeshTopologySelection,
  meshCanBookmarkSelection,
  onBookmarkMeshSelection,
  meshCanRedoSelection,
  onRedoMeshSelection,
  meshSelectionHistoryItems,
  meshSelectionBookmarks,
  onRestoreMeshSelection,
  onRemoveMeshSelectionBookmark,
  meshContextualPreviewActive,
  commandPreviewHighVisibility,
  onOpenPreviewSettings,
  surfaceMeshStats,
  surfaceMeshBounds,
  surfaceMeshSource,
  graphResolution,
  onSetGraphResolution,
  paramResolution,
  onSetParamResolution,
  weierstrassResolution,
  onSetWeierstrassResolution,
  lightPreset,
  onChangeLightPreset,
  materialRoughness,
  onSetMaterialRoughness,
  materialMetalness,
  onSetMaterialMetalness,
  materialOpacity,
  onSetMaterialOpacity,
  showWireframe,
  onToggleWireframe,
  showPlanes,
  onTogglePlanes,
  showGaussMap,
  onToggleGaussMap,
  showContours,
  onToggleContours,
  contourCount,
  onSetContourCount,
  showPrincipalDirections,
  onTogglePrincipalDirections,
  showPrincipalLines,
  onTogglePrincipalLines,
  showCurvatureLines,
  onToggleCurvatureLines,
  canDuplicate,
  onDuplicate,
  canExport,
  onExport,
  canBake,
  onBake,
  canCompare,
  onCompare,
  surfaceWorkflowActiveStepId,
  surfaceWorkflowStepStateById,
  onPickEqSurface,
  onPickParamSurface,
  graphExpr,
  implicitExpr,
  onChangeImplicitExpr,
  onLoadDeterministicImplicitSample,
  implicitResolution,
  meshOperationPreviewBusy,
  meshOperationPreviewError,
  generateSurfaceStatus,
  meshOperationPreviewTargetFaces,
  meshOperationPreviewUseDecimate,
  meshLastOperation,
  meshOperationLastValidation,
  meshOperationHistory,
  surfaceMeshTopologyHistory,
  meshOperationError,
  onValidateActiveMesh,
  onShowMeshHealthProblems,
  onValidateLastMeshOperationResult,
  onPreviewMeshOperationHistoryEntry,
  onRestoreMeshOperationHistoryEntry,
  onPreviewSurfaceMeshTopologyHistoryEntry,
  onRestoreSurfaceMeshTopologyHistoryEntry,
  onUndoLatestMeshOperation,
  canUndoLatestMeshOperation,
  onSaveMeshOperationPreset,
  onChangeMeshOperationPreviewTargetFaces,
  onChangeMeshOperationPreviewUseDecimate,
  onRunMeshOperationPreview,
  cgalHealthState,
  cgalBusy,
  cgalError,
  cgalTargetEdge,
  onChangeCgalTargetEdge,
  cgalAutoTargetEdge,
  onChangeCgalAutoTargetEdge,
  cgalPadFrac,
  onChangeCgalPadFrac,
  cgalTriBudgetEnabled,
  onChangeCgalTriBudgetEnabled,
  cgalTriBudget,
  onChangeCgalTriBudget,
  cgalAutoEdge,
  cgalTriBudgetEdge,
  cgalRadiusBound,
  onChangeCgalRadiusBound,
  cgalMinTrisEnabled,
  onChangeCgalMinTrisEnabled,
  cgalMinTris,
  onChangeCgalMinTris,
  cgalDomainDiag,
  cgalEffectiveEdge,
  cgalEstimatedTris,
  cgalTooHeavy,
  cgalVerbose,
  onChangeCgalVerbose,
  cgalPreflightSamples,
  onChangeCgalPreflightSamples,
  onRunCgalMesh,
  onStopCgalWorker,
  cgalMeshInfo,
  isDevMode,
  surfacePerformanceSnapshot,
  meshPerformanceBenchmarkId,
  meshPerformanceLastBuildMs,
  meshPipelineProfile,
  meshDebugMonitor,
  onOpenMeshDeveloperDiagnostics,
  onClearMeshDebugMonitor,
  onRunMeshPerformanceBenchmark,
  onRestoreMeshPerformanceBaseline,
  meshBenchmarkPerformanceSuite,
  onRunMeshBenchmarkPerformanceSuite,
  meshInteractionQualityMode,
  onChangeMeshInteractionQualityMode,
  meshInteractionRestoreDelayMs,
  onChangeMeshInteractionRestoreDelayMs,
  meshInteractionPreviewTriangleTarget,
  onChangeMeshInteractionPreviewTriangleTarget,
  meshInteractionHideVertexMarkers,
  onChangeMeshInteractionHideVertexMarkers,
  meshInteractionHideFaceNormals,
  onChangeMeshInteractionHideFaceNormals,
  meshInteractionHideCurvatureGlyphs,
  onChangeMeshInteractionHideCurvatureGlyphs,
  meshInteractionHideWireframe,
  onChangeMeshInteractionHideWireframe,
  meshInspectorStats,
  deferredSurfaceSampleSetInfo,
  onPrepareDeferredSurfaceAnalysisData,
  meshTopologyDetails,
  meshAnalyzeDiagnostics,
  meshBenchmarkVerification,
  onHighlightMeshAnalyzeBoundary,
  onHighlightMeshAnalyzeDuplicates,
  onPreviewMeshAnalyzeWeld,
  onRecomputeMeshAnalyzeDiagnostics,
  badTriangleCount,
  geodesicPathLength,
  curvatureRanges,
  analysisFocusedSection,
  meshQualityReport,
  meshQualityBusy,
  meshQualityProgress,
  meshQualityPhase,
  calculusScalarSource,
  calculusVectorSource,
  calculusActiveVectorField,
  calculusVectorOverlayEnabled,
  calculusVectorDensity,
  calculusVectorScale,
  calculusStatus,
  calculusError,
  activeVectorMagnitudeRange,
  curvatureLineField,
  curvatureSeedSource,
  curvatureSeedDensity,
  curvatureMaxSteps,
  curvatureMaxLines,
  onRebuildCurvatureLines,
  onSelectMeshAnalysisCurvatureField,
  probeInfo,
  probeCurv,
  paramProbeCurv,
  probeEnabled,
  onToggleProbe,
  showProbeNormal,
  onToggleProbeNormal,
  showProbeTangentPlane,
  onToggleProbeTangentPlane,
  showProbeTangents,
  onToggleProbeTangents,
  inspectEnabled,
  onToggleInspectEnabled,
  onClearInspect,
  inspectIdx,
  inspectPos,
  inspectNormal,
  inspectMetrics,
  meshDifferentialGeometrySummary,
  meshAnalyzeProbeHistory,
  onRestoreMeshAnalyzeProbe,
  onClearMeshAnalyzeProbeHistory,
  geometryProbeSelectionMode = "object",
  geometryProbeSelectionDetails = null,
  geometryProbeHoverSelectionDetails = null,
  onPickDomainUV,
  onPickDomainXY,
  onPickDomainXYZ,
  graphDomain,
  onChangeGraphDomain,
  paramDomain,
  onChangeParamDomain,
  implicitDomain,
  onChangeImplicitDomain,
  graphDomainPresets,
  paramDomainPresets,
  implicitDomainPresets,
  onSaveGraphDomainPreset,
  onSaveParamDomainPreset,
  onSaveImplicitDomainPreset,
  onApplyGraphDomainPreset,
  onApplyParamDomainPreset,
  onApplyImplicitDomainPreset,
  onRemoveGraphDomainPreset,
  onRemoveParamDomainPreset,
  onRemoveImplicitDomainPreset,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isWeierstrass = viewerKind === "weierstrass";
  const isMeshViewer = viewerKind === "mesh" || viewerKind === "complex";
  const isGraphViewer = viewerKind === "graph";
  const isParamViewer = viewerKind === "param" || isWeierstrass;
  const isImplicitViewer = viewerKind === "implicit";
  const isEqViewer = isGraphViewer || isImplicitViewer;
  const showDomainPicker = isGraphViewer || isParamViewer || isImplicitViewer;
  const cgalReady = cgalHealthState?.ok === true;
  const cgalStatusText = !cgalHealthState
    ? "checking..."
    : cgalHealthState.ok
      ? `available${cgalHealthState.version ? ` · v${cgalHealthState.version}` : ""}`
      : "unavailable";
  const cgalStatusColor = cgalHealthState ? (cgalHealthState.ok ? "#1f894f" : "#b42318") : "#777";
  const cgalDisabled = cgalBusy || cgalHealthState?.ok !== true;
  const cgalStopDisabled = !cgalBusy && cgalHealthState?.ok !== true;
  const cgalTargetEdgeLocked = cgalDisabled || cgalAutoTargetEdge || cgalTriBudgetEnabled;
  const meshOperationPreviewDisabled = meshOperationPreviewBusy || cgalBusy;
  const meshOperationPreviewResolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));
  const workerReady = cgalHealthState?.ok === true;
  const workerStatusLabel = workerReady ? "ready" : "unavailable";
  const workerStatusText = workerReady
    ? "worker ready"
    : `worker unavailable: ${cgalHealthState?.error ?? cgalHealthState?.statusMessage ?? "checking..."}`;
  const generateStateLabel = meshOperationPreviewBusy ? "running" : generateSurfaceStatus.state;
  const generateStatusText = meshOperationPreviewBusy ? "generate running..." : generateSurfaceStatus.message;
  const generateStatusColor = generateStateLabel === "success"
    ? "#1f894f"
    : generateStateLabel === "error"
      ? "#b42318"
      : "#556";
  const fmtTriEstimate = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return `${Math.round(value)}`;
  };

  const [graphDomainLabel, setGraphDomainLabel] = useState("");
  const [implicitDomainLabel, setImplicitDomainLabel] = useState("");
  const [paramDomainLabel, setParamDomainLabel] = useState("");
  const [inspectorPanelTab, setInspectorPanelTab] = useState<InspectorPanelTab>("summary");
  const [analysisResultsView, setAnalysisResultsView] = useState<AnalysisResultsView>("current-screen");
  const [selectedAnalysisComputationId, setSelectedAnalysisComputationId] = useState<string | null>(null);
  useEffect(() => {
    if (inspectorPanelTab === "warnings") setInspectorPanelTab("diagnostics");
  }, [inspectorPanelTab]);
  useEffect(() => {
    if (!requestedInspectorTab) return;
    if (requestedInspectorTab === "probe") {
      setInspectorPanelTab("selection");
      return;
    }
    setInspectorPanelTab(requestedInspectorTab === "object" ? "summary" : requestedInspectorTab === "result" ? "geometry" : requestedInspectorTab);
  }, [meshAnalysisActive, requestedInspectorTab]);
  useEffect(() => {
    if (!meshAnalysisActive) return;
    if (inspectorPanelTab === "summary" || inspectorPanelTab === "geometry" || inspectorPanelTab === "analysis") setInspectorPanelTab("analysis");
    else if (inspectorPanelTab === "probe" || inspectorPanelTab === "warnings") setInspectorPanelTab("selection");
  }, [inspectorPanelTab, meshAnalysisActive]);
  const selectedAnalysisComputation =
    meshAnalysisComputationHistory.find((record) => record.id === selectedAnalysisComputationId) ??
    meshAnalysisComputationHistory[0] ??
    null;

  const paramDefaults = isWeierstrass ? WEIERSTRASS_DEFAULTS.domain : getParamDomainPreviewBounds(paramId);
  const safeGraphDomain = normalizeGraphDomain(graphDomain, getDefaultGraphSpan(surfaceId));
  const safeParamDomain = normalizeParamDomain(paramDomain, paramDefaults);
  const safeImplicitDomain = normalizeImplicitDomain(implicitDomain, getDefaultImplicitDomain(surfaceId));
  const meshMeta = {
    label: surfaceMeshLabel,
    formula: "Triangle surface mesh",
    note: "Imported or generated triangle mesh.",
  };
  const activeMeta = isMeshViewer
    ? meshMeta
    : isWeierstrass
      ? WEIERSTRASS_META
      : isParamViewer
        ? paramMeta
        : eqMeta;
  const inspectorSectionCard: React.CSSProperties = {
    marginBottom: 12,
    padding: "10px 10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--workspace-section-bg)",
  };
  const inspectorSectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 7,
    color: "var(--text)",
  };
  const topologyFlagTone = {
    good: { background: "#ecfdf3", border: "#abefc6", color: "#067647" },
    warn: { background: "#fff1f3", border: "#fecdd6", color: "#b42318" },
    neutral: { background: "#f8fafc", border: "#dbe4ee", color: "#475467" },
  } as const;
  const renderTopologyRows = (
    rows: readonly MeshTopologyListRow[],
    totalCount: number,
    emptyLabel: string,
    testId: string
  ) => (
    <div data-testid={testId} style={{ display: "grid", gap: 5 }}>
      {rows.length === 0 ? (
        <div style={{ color: "#64748b" }}>{emptyLabel}</div>
      ) : (
        rows.map((row) => (
          <div key={`${testId}-${row.label}`} style={{ display: "grid", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <strong>{row.label}</strong>
              {row.flags.map((flag) => (
                <span
                  key={`${testId}-${row.label}-${flag}`}
                  style={{
                    border: "1px solid #dbe4ee",
                    borderRadius: 999,
                    color: "#475467",
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {flag}
                </span>
              ))}
            </div>
            <div style={{ color: "#475467", lineHeight: 1.4 }}>{row.detail}</div>
          </div>
        ))
      )}
      {totalCount > rows.length && (
        <div style={{ color: "#64748b" }}>
          Showing first {rows.length.toLocaleString()} of {totalCount.toLocaleString()} rows.
        </div>
      )}
    </div>
  );
  const renderTopologyDetails = (testIdPrefix: string) =>
    meshTopologyDetails ? (
      <div style={{ fontSize: 11, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid={`${testIdPrefix}-topology-flags`}>
          {meshTopologyDetails.flags.map((flag) => {
            const tone = topologyFlagTone[flag.tone];
            return (
              <span
                key={`${testIdPrefix}-topology-flag-${flag.label}`}
                style={{
                  display: "inline-flex",
                  gap: 4,
                  alignItems: "center",
                  border: `1px solid ${tone.border}`,
                  borderRadius: 999,
                  background: tone.background,
                  color: tone.color,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                {flag.label}: {flag.value}
              </span>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: 5 }}>
          <div>
            <strong>Edges:</strong> {meshTopologyDetails.edgeCount.toLocaleString()}
          </div>
          <div>
            <strong>Components:</strong> {meshTopologyDetails.connectedComponentCount.toLocaleString()}
          </div>
          <div>
            <strong>Euler characteristic:</strong> {meshTopologyDetails.eulerCharacteristic.toLocaleString()}
          </div>
          <div>
            <strong>Boundary edges:</strong> {meshTopologyDetails.boundaryEdgeCount.toLocaleString()}
          </div>
          <div>
            <strong>Boundary loops:</strong> {topologyBoundaryLoopsLabel}
          </div>
          <div>
            <strong>State check:</strong> {meshTopologyDetails.topologyTypeLabel}
          </div>
          <div>
            <strong>Orientability:</strong> {meshTopologyDetails.orientabilityLabel}
          </div>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Vertex adjacency</strong>
          {renderTopologyRows(
            meshTopologyDetails.vertexAdjacencyRows,
            meshTopologyDetails.vertexCount,
            "No vertices.",
            `${testIdPrefix}-vertex-adjacency`
          )}
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Face adjacency</strong>
          {renderTopologyRows(
            meshTopologyDetails.faceAdjacencyRows,
            meshTopologyDetails.faceCount,
            "No faces.",
            `${testIdPrefix}-face-adjacency`
          )}
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Edge incidence</strong>
          {renderTopologyRows(
            meshTopologyDetails.edgeIncidenceRows,
            meshTopologyDetails.edgeCount,
            "No edges.",
            `${testIdPrefix}-edge-incidence`
          )}
        </div>
        <div style={{ display: "grid", gap: 4 }} data-testid={`${testIdPrefix}-boundary-components`}>
          <strong>Boundary loops</strong>
          {meshTopologyDetails.boundaryLoops.length === 0 ? (
            <div style={{ color: "#64748b" }}>No boundary edges.</div>
          ) : (
            meshTopologyDetails.boundaryLoops.map((loop) => (
              <div key={`${testIdPrefix}-boundary-${loop.label}`} style={{ color: "#475467" }}>
                <strong>{loop.label}:</strong> {loop.edgeCount.toLocaleString()} edges
                {loop.edges.length ? ` (${loop.edges.map((edge) => `e${edge}`).join(", ")})` : ""}
                {loop.edgeCount > loop.edges.length ? ` +${loop.edgeCount - loop.edges.length} more` : ""}
                {loop.vertices.length ? `; vertices ${loop.vertices.map((vertex) => `v${vertex}`).join(" -> ")}` : ""}
              </div>
            ))
          )}
        </div>
      </div>
    ) : (
      <div style={{ fontSize: 11, color: "#64748b" }}>Topology details are not available for the current view.</div>
    );
  const workflowStatePriority: Record<SurfaceWorkflowStepState, number> = {
    disabled: 0,
    done: 1,
    available: 2,
    active: 3,
  };
  const workflowStateText: Record<SurfaceWorkflowStepState, string> = {
    active: "active",
    done: "done",
    available: "ready",
    disabled: "blocked",
  };
  const workflowToneByState: Record<
    SurfaceWorkflowStepState,
    {
      cardBackground: string;
      cardBorder: string;
      cardShadow?: string;
      badgeBackground: string;
      badgeBorder: string;
      badgeText: string;
    }
  > = {
    active: {
      cardBackground: "linear-gradient(180deg, #f6fbff, #eef6ff)",
      cardBorder: "#8fb4e8",
      cardShadow: "inset 0 0 0 1px #cddff8",
      badgeBackground: "#dbeafe",
      badgeBorder: "#93c5fd",
      badgeText: "#1d4ed8",
    },
    available: {
      cardBackground: "#f8fbff",
      cardBorder: "#cfe0f4",
      badgeBackground: "#eef4ff",
      badgeBorder: "#c2d4ef",
      badgeText: "#1e3a5f",
    },
    done: {
      cardBackground: "#f5f9ff",
      cardBorder: "#dbe7f7",
      badgeBackground: "#eaf2ff",
      badgeBorder: "#c9d9f2",
      badgeText: "#334155",
    },
    disabled: {
      cardBackground: "#f8fafc",
      cardBorder: "#dbe4ee",
      badgeBackground: "#f1f5f9",
      badgeBorder: "#d5dee8",
      badgeText: "#64748b",
    },
  };
  const resolveWorkflowState = (...stepIds: SurfaceWorkflowStepId[]): SurfaceWorkflowStepState => {
    if (stepIds.includes(surfaceWorkflowActiveStepId)) return "active";
    let state: SurfaceWorkflowStepState = "disabled";
    for (const stepId of stepIds) {
      const nextState = surfaceWorkflowStepStateById[stepId] ?? "disabled";
      if (workflowStatePriority[nextState] > workflowStatePriority[state]) state = nextState;
    }
    return state;
  };
  const workflowCardStyle = (...stepIds: SurfaceWorkflowStepId[]): React.CSSProperties => {
    const state = resolveWorkflowState(...stepIds);
    const tone = workflowToneByState[state];
    return {
      ...inspectorSectionCard,
      background: tone.cardBackground,
      border: `1px solid ${tone.cardBorder}`,
      boxShadow: tone.cardShadow,
    };
  };
  const renderWorkflowStatus = (label: string, ...stepIds: SurfaceWorkflowStepId[]) => {
    const state = resolveWorkflowState(...stepIds);
    const tone = workflowToneByState[state];
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 999,
          border: `1px solid ${tone.badgeBorder}`,
          background: tone.badgeBackground,
          color: tone.badgeText,
          padding: "2px 8px",
          letterSpacing: 0.1,
        }}
      >
        {label}: {workflowStateText[state]}
      </span>
    );
  };
  const viewSourceKind = isMeshViewer
    ? "Mesh object"
    : isGraphViewer
      ? "Explicit surface"
      : isImplicitViewer
        ? "Implicit surface"
        : isWeierstrass
          ? "Weierstrass minimal surface"
          : "Parametric surface";
  const identitySourceKind = isMeshViewer
    ? "mesh"
    : isWeierstrass
      ? "Weierstrass"
      : isParamViewer
        ? "parametric"
        : "formula";
  const sourceEquation = isMeshViewer
    ? surfaceMeshSource
      ? formatSurfaceMeshSource(surfaceMeshSource)
      : "mesh dataset"
    : isGraphViewer
      ? graphExpr
      : isImplicitViewer
        ? (getEditableImplicitCustomExpr(surfaceId, implicitExpr) ?? implicitExpr)
        : activeMeta.formula;
  const definitionParameters = isMeshViewer
    ? "n/a"
    : isParamViewer
      ? "u, v"
      : isGraphViewer
        ? "x, y"
        : "x, y, z";
  const activeResolution = isGraphViewer
    ? graphResolution
    : isWeierstrass
      ? weierstrassResolution
      : isParamViewer
        ? paramResolution
        : implicitResolution;
  const previewResolutionLabel = isImplicitViewer
    ? `${meshOperationPreviewResolution}^3 preview grid`
    : `${Math.round(activeResolution)}`;
  const formatInspectorCount = (value: number | null): string =>
    value == null || !Number.isFinite(value) ? "n/a" : Math.round(value).toLocaleString();
  const formatRange = (range: { min: number; max: number } | null) =>
    range ? `[${fmt(range.min)}, ${fmt(range.max)}]` : "n/a";
  const normalMagnitude = probeInfo?.normal
    ? Math.hypot(probeInfo.normal.x, probeInfo.normal.y, probeInfo.normal.z)
    : null;
  const hasUnstableNormals =
    normalMagnitude != null && (!Number.isFinite(normalMagnitude) || normalMagnitude < 0.7 || normalMagnitude > 1.3);
  const warningContextText = `${generateStatusText} ${meshOperationPreviewError ?? ""} ${cgalError ?? ""}`.toLowerCase();
  const hasSingularityRisk =
    isImplicitViewer && (warningContextText.includes("nan") || warningContextText.includes("inf") || warningContextText.includes("singular"));
  const hasFailedTraces = Boolean(meshOperationPreviewError || cgalError || (isImplicitViewer && !workerReady));
  const hasStaleAnalysis =
    !showGaussMap &&
    !showContours &&
    !showPrincipalDirections &&
    !showPrincipalLines &&
    !showCurvatureLines;
  const hasHighCurvature = showCurvatureLines || showPrincipalLines;
  const hasUnsupportedAnalysis = isImplicitViewer;
  const warningRows: Array<{ id: string; label: string; active: boolean; detail: string }> = [
    {
      id: "stale-analysis",
      label: "stale analysis",
      active: hasStaleAnalysis,
      detail: hasStaleAnalysis
        ? "No analysis overlays are active."
        : "At least one analysis overlay is active.",
    },
    {
      id: "singularities",
      label: "singularities",
      active: hasSingularityRisk,
      detail: hasSingularityRisk ? "Potential singular behavior detected in recent analysis output." : "No singularity flags from current analysis output.",
    },
    {
      id: "unstable-normals",
      label: "unstable normals",
      active: hasUnstableNormals,
      detail:
        normalMagnitude == null
          ? "No probe sample yet."
          : hasUnstableNormals
            ? `Probe normal magnitude=${fmt(normalMagnitude)} (expected near 1).`
            : `Probe normal magnitude=${fmt(normalMagnitude)} (stable).`,
    },
    {
      id: "high-curvature",
      label: "high curvature zones",
      active: hasHighCurvature,
      detail: hasHighCurvature ? "Curvature overlays/lines are active; inspect highlighted regions." : "Curvature overlays are not active.",
    },
    {
      id: "failed-traces",
      label: "failed traces",
      active: hasFailedTraces,
      detail: hasFailedTraces
        ? meshOperationPreviewError ?? cgalError ?? (isImplicitViewer && !workerReady ? "Worker unavailable." : "Trace failures detected.")
        : "No failed preview/mesh traces.",
    },
    {
      id: "unsupported-analysis",
      label: "unsupported analysis",
      active: hasUnsupportedAnalysis,
      detail: hasUnsupportedAnalysis
        ? "At least one analysis mode is unavailable for the current object type."
        : "All current analysis modes are supported.",
    },
  ];
  const diagnosticsWarningCount = warningRows.filter((row) => row.active).length;
  const activeWarningRows = warningRows.filter((row) => row.active);
  const diagnosticsErrorRows = [
    meshOperationPreviewError ? { id: "mesh-preview-error", label: "Mesh preview", detail: meshOperationPreviewError } : null,
    cgalError ? { id: "cgal-error", label: "Robust meshing", detail: cgalError } : null,
    meshOperationError ? { id: "mesh-operation-error", label: "Mesh operation", detail: meshOperationError } : null,
    ...(meshLastOperation?.errors.map((detail, index) => ({
      id: `mesh-last-operation-error-${index}`,
      label: meshLastOperation.label,
      detail,
    })) ?? []),
  ].filter((row): row is { id: string; label: string; detail: string } => !!row);
  const diagnosticsErrorCount =
    diagnosticsErrorRows.length;
  const diagnosticsInfoCount =
    (meshAnalyzeDiagnostics ? 1 : 0) +
    (meshTopologyDetails ? 1 : 0) +
    (meshQualityReport ? 1 : 0) +
    (meshLastOperation ? 1 : 0);
  const diagnosticsTotalCount = diagnosticsErrorCount + diagnosticsWarningCount + diagnosticsInfoCount;
  const renderDiagnosticsSeveritySummary = () => (
    <div
      data-testid="mesh-inspector-diagnostics-severity-summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 6,
        marginBottom: 10,
        fontSize: 11,
      }}
    >
      {[
        { label: "Errors", count: diagnosticsErrorCount, tone: diagnosticsErrorCount > 0 ? "#b42318" : "#166534", bg: diagnosticsErrorCount > 0 ? "#fef2f2" : "#f0fdf4", border: diagnosticsErrorCount > 0 ? "#fca5a5" : "#bbf7d0" },
        { label: "Warnings", count: diagnosticsWarningCount, tone: diagnosticsWarningCount > 0 ? "#9a3412" : "#166534", bg: diagnosticsWarningCount > 0 ? "#fff7ed" : "#f0fdf4", border: diagnosticsWarningCount > 0 ? "#fed7aa" : "#bbf7d0" },
        { label: "Info", count: diagnosticsInfoCount, tone: "#475569", bg: "#f8fafc", border: "#dbe4ee" },
      ].map((entry) => (
        <div
          key={`diagnostics-severity-${entry.label}`}
          style={{
            border: `1px solid ${entry.border}`,
            borderRadius: 7,
            background: entry.bg,
            color: entry.tone,
            padding: "6px 7px",
            display: "grid",
            gap: 2,
          }}
        >
          <span style={{ fontWeight: 800 }}>{entry.label}</span>
          <strong>{entry.count.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
  const renderDiagnosticsErrors = () => (
    <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 9 }}>
      <div style={{ ...inspectorSectionTitle, marginBottom: 6 }}>Errors</div>
      {diagnosticsErrorRows.length === 0 ? (
        <div style={{ fontSize: 11, color: "#1f894f" }}>No active errors.</div>
      ) : (
        <div style={{ fontSize: 11, display: "grid", gap: 7 }}>
          {diagnosticsErrorRows.map((row) => (
            <div key={`diagnostics-error-row-${row.id}`} style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 700, color: "#b42318" }}>{row.label}</div>
              <div style={{ color: "#475467" }}>{row.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const renderDiagnosticsWarnings = () => (
    <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 9 }}>
      <div style={{ ...inspectorSectionTitle, marginBottom: 6 }}>Warnings</div>
      {activeWarningRows.length === 0 ? (
        <div style={{ fontSize: 11, color: "#1f894f" }}>No active warnings.</div>
      ) : (
        <div style={{ fontSize: 11, display: "grid", gap: 7 }}>
          {activeWarningRows.map((row) => (
            <div key={`warning-row-${row.id}`} style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 700, color: "#b42318" }}>{row.label}</div>
              <div style={{ color: "#475467" }}>{row.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const selectedProbeCurvature =
    isGraphViewer && probeCurv
      ? { K: probeCurv.K, H: probeCurv.H, k1: probeCurv.k1, k2: probeCurv.k2 }
      : isParamViewer && paramProbeCurv
        ? { K: paramProbeCurv.K, H: paramProbeCurv.H, k1: paramProbeCurv.k1, k2: paramProbeCurv.k2 }
        : isMeshViewer && inspectMetrics?.K != null
          ? { K: inspectMetrics.K, H: inspectMetrics.H, k1: inspectMetrics.k1, k2: inspectMetrics.k2 }
          : null;
  const meshDifferentialGeometryReady =
    isMeshViewer && (meshDifferentialGeometrySummary?.validVertexCount ?? 0) > 0;
  const differentialGeometryStatus: "ready" | "stale" | "missing" =
    selectedProbeCurvature || meshDifferentialGeometryReady || (!isMeshViewer && (showPrincipalDirections || showPrincipalLines || showCurvatureLines))
      ? "ready"
      : probeEnabled || !!probeInfo
        ? "stale"
        : "missing";
  const curvatureLinesStatus: "ready" | "stale" | "missing" =
    showCurvatureLines ? "ready" : probeEnabled ? "stale" : "missing";
  const vectorCalculusStatus = showGaussMap || showContours || showPlanes ? "ready" : "not computed";
  const meshQualityStatus = meshQualityBusy
    ? "running"
    : meshQualityReport
      ? "ready"
      : deferredSurfaceSampleSetInfo
        ? "deferred"
        : "not requested";
  const chartAnalysisStatus = isImplicitViewer ? "unavailable for implicit surface" : "ready";
  const topologyDiagnosticsStatus = meshInspectorStats.boundaryEdgeCount != null || badTriangleCount != null ? "ready" : "missing";
  const resultsIssueCount =
    (differentialGeometryStatus === "ready" ? 0 : 1) +
    (curvatureLinesStatus === "ready" ? 0 : 1) +
    (vectorCalculusStatus === "ready" ? 0 : 1) +
    (meshQualityStatus === "ready" ? 0 : 1) +
    (chartAnalysisStatus === "ready" ? 0 : 1) +
    (topologyDiagnosticsStatus === "ready" ? 0 : 1);
  const principalDirectionsStatus: "ready" | "stale" | "missing" =
    isMeshViewer
      ? (meshDifferentialGeometrySummary?.directionValidVertexCount ?? 0) > 0
        ? "ready"
        : meshDifferentialGeometrySummary
          ? "stale"
          : "missing"
      : showPrincipalDirections
        ? "ready"
        : probeEnabled || !!probeInfo
          ? "stale"
          : "missing";
  const vectorCalculusDetailedStatus = calculusError
    ? "stale"
    : calculusStatus || calculusVectorOverlayEnabled
      ? "ready"
      : "not computed";
  const calculusScalarSourceLabel = (() => {
    if (calculusScalarSource === "height") return "Height (y)";
    if (calculusScalarSource === "radius") return "Radius |p|";
    if (calculusScalarSource === "temperature") return "Temperature";
    if (calculusScalarSource === "K") return "K (Gaussian)";
    if (calculusScalarSource === "H") return "H (mean)";
    if (calculusScalarSource === "custom") return "Custom expression";
    return calculusScalarSource;
  })();
  const vectorCalculusLastOperation = calculusError ?? calculusStatus ?? "none";
  const activeVectorFieldLabel =
    calculusVectorOverlayEnabled && calculusActiveVectorField ? calculusActiveVectorField : "none";
  const curvatureLineCountLabel = showCurvatureLines ? `<= ${Math.max(0, Math.round(curvatureMaxLines))}` : "n/a";
  const topologyBoundaryLoopsLabel = meshTopologyDetails
    ? `${meshTopologyDetails.boundaryLoops.length.toLocaleString()} component${
        meshTopologyDetails.boundaryLoops.length === 1 ? "" : "s"
      }`
    : "n/a";
  const topologyOrientabilityLabel =
    meshTopologyDetails?.orientable == null ? "unknown" : meshTopologyDetails.orientable ? "yes" : "no";
  const topologyEulerCharacteristic = (() => {
    if (meshTopologyDetails) return meshTopologyDetails.eulerCharacteristic;
    return null;
  })();
  const topologyNonManifoldEdgeCount =
    meshQualityReport?.topology.nonManifoldEdgeCount ?? meshTopologyDetails?.nonManifoldEdgeCount ?? null;
  const meshFeatureHasMesh = meshInspectorStats.vertexCount != null || meshInspectorStats.faceCount != null;
  const meshQualityProgressLabel = meshQualityBusy
    ? `${meshQualityPhase === "idle" ? "quality" : meshQualityPhase} ${Math.round(Math.max(0, Math.min(1, meshQualityProgress)) * 100)}%`
    : undefined;
  const meshAnalysisFeatureRows = useMemo<MeshAnalysisFeatureRow[]>(() => {
    const topologyState: MeshAnalysisFeatureState = meshTopologyDetails
      ? "ready"
      : deferredSurfaceSampleSetInfo
        ? "deferred"
        : meshFeatureHasMesh
          ? "not-requested"
          : "missing";
    const topologyAction =
      topologyState === "deferred"
        ? { actionLabel: "Prepare", onAction: onPrepareDeferredSurfaceAnalysisData }
        : topologyState === "not-requested"
          ? { actionLabel: "Run", onAction: onRecomputeMeshAnalyzeDiagnostics }
          : {};
    const curvatureState = (range: { min: number; max: number } | null): MeshAnalysisFeatureState =>
      range ? "ready" : meshFeatureHasMesh ? "not-requested" : "missing";
    const diagnosticsState: MeshAnalysisFeatureState = meshAnalyzeDiagnostics
      ? "ready"
      : deferredSurfaceSampleSetInfo
        ? "deferred"
        : meshFeatureHasMesh
          ? "not-requested"
          : "missing";
    const diagnosticsAction =
      diagnosticsState === "deferred" || diagnosticsState === "not-requested"
        ? { actionLabel: diagnosticsState === "deferred" ? "Prepare" : "Run", onAction: onRecomputeMeshAnalyzeDiagnostics }
        : {};
    const qualityState: MeshAnalysisFeatureState = meshQualityBusy
      ? "running"
      : meshQualityReport
        ? "ready"
        : deferredSurfaceSampleSetInfo
          ? "deferred"
          : meshFeatureHasMesh
            ? "not-requested"
            : "missing";
    const qualityAction =
      qualityState === "deferred" || qualityState === "not-requested"
        ? { actionLabel: qualityState === "deferred" ? "Prepare" : "Run", onAction: onRecomputeMeshAnalyzeDiagnostics }
        : {};
    return [
      {
        id: "normals",
        group: "Surface",
        label: "Normals",
        state: meshFeatureHasMesh ? "ready" : "missing",
        detail: hasUnstableNormals ? "probe normal unstable" : "viewer normals available",
      },
      {
        id: "mean-curvature",
        group: "Surface",
        label: "Mean curvature",
        state: curvatureState(curvatureRanges.H),
        detail: formatRange(curvatureRanges.H),
        actionLabel: curvatureRanges.H ? undefined : "Run",
        onAction: curvatureRanges.H ? undefined : onRebuildCurvatureLines,
        onOpenResult: curvatureRanges.H
          ? () => {
              onSelectMeshAnalysisCurvatureField("H");
              setInspectorPanelTab("analysis");
              window.requestAnimationFrame(() => {
                document.querySelector('[data-testid="mesh-analysis-active-result"]')?.scrollIntoView({
                  block: "nearest",
                });
              });
            }
          : undefined,
      },
      {
        id: "gaussian-curvature",
        group: "Surface",
        label: "Gaussian curvature",
        state: curvatureState(curvatureRanges.K),
        detail: formatRange(curvatureRanges.K),
        actionLabel: curvatureRanges.K ? undefined : "Run",
        onAction: curvatureRanges.K ? undefined : onToggleGaussMap,
        onOpenResult: curvatureRanges.K
          ? () => {
              onSelectMeshAnalysisCurvatureField("K");
              setInspectorPanelTab("analysis");
              window.requestAnimationFrame(() => {
                document.querySelector('[data-testid="mesh-analysis-active-result"]')?.scrollIntoView({
                  block: "nearest",
                });
              });
            }
          : undefined,
      },
      {
        id: "principal-directions",
        group: "Surface",
        label: "Principal directions",
        state: showPrincipalDirections ? "ready" : meshFeatureHasMesh ? "not-requested" : "missing",
        detail: principalDirectionsStatus,
        actionLabel: showPrincipalDirections ? undefined : "Run",
        onAction: showPrincipalDirections ? undefined : onTogglePrincipalDirections,
      },
      {
        id: "gauss-map",
        group: "Surface",
        label: "Gauss map",
        state: showGaussMap ? "ready" : meshFeatureHasMesh ? "not-requested" : "missing",
        detail: showGaussMap ? "visible" : "overlay off",
        actionLabel: showGaussMap ? undefined : "Run",
        onAction: showGaussMap ? undefined : onToggleGaussMap,
      },
      {
        id: "adjacency",
        group: "Topology",
        label: "Adjacency",
        state: topologyState,
        detail: meshTopologyDetails ? `${meshTopologyDetails.edgeCount.toLocaleString()} edges` : undefined,
        ...topologyAction,
      },
      {
        id: "components",
        group: "Topology",
        label: "Components",
        state: topologyState,
        detail: formatInspectorCount(meshInspectorStats.connectedComponentCount),
        ...topologyAction,
      },
      {
        id: "boundaries",
        group: "Topology",
        label: "Boundaries",
        state: topologyState,
        detail: `edges ${formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}, loops ${topologyBoundaryLoopsLabel}`,
        ...topologyAction,
      },
      {
        id: "manifoldness",
        group: "Topology",
        label: "Manifoldness",
        state: topologyState,
        detail: topologyNonManifoldEdgeCount == null ? undefined : `${topologyNonManifoldEdgeCount.toLocaleString()} non-manifold edges`,
        ...topologyAction,
      },
      {
        id: "self-intersections",
        group: "Topology",
        label: "Self intersections",
        state: diagnosticsState,
        detail: meshAnalyzeDiagnostics ? `${meshAnalyzeDiagnostics.selfIntersectionPairs.toLocaleString()} pairs` : undefined,
        ...diagnosticsAction,
      },
      {
        id: "triangle-quality",
        group: "Quality",
        label: "Triangle quality",
        state: qualityState,
        detail: meshQualityProgressLabel ?? (badTriangleCount == null ? undefined : `${badTriangleCount.toLocaleString()} bad triangles`),
        ...qualityAction,
      },
    ];
  }, [
    badTriangleCount,
    curvatureRanges.H,
    curvatureRanges.K,
    deferredSurfaceSampleSetInfo,
    formatRange,
    hasUnstableNormals,
    meshAnalyzeDiagnostics,
    meshFeatureHasMesh,
    meshInspectorStats.boundaryEdgeCount,
    meshInspectorStats.connectedComponentCount,
    meshQualityBusy,
    meshQualityProgressLabel,
    meshQualityReport,
    meshTopologyDetails,
    onPrepareDeferredSurfaceAnalysisData,
    onRecomputeMeshAnalyzeDiagnostics,
    onRebuildCurvatureLines,
    onSelectMeshAnalysisCurvatureField,
    onToggleGaussMap,
    onTogglePrincipalDirections,
    principalDirectionsStatus,
    showGaussMap,
    showPrincipalDirections,
    topologyBoundaryLoopsLabel,
    topologyNonManifoldEdgeCount,
  ]);
  const meshAnalysisReadyCount = meshAnalysisFeatureRows.filter((row) => row.state === "ready").length;
  const meshAnalysisRequestedCount = meshAnalysisFeatureRows.filter((row) => row.state !== "not-requested" && row.state !== "missing").length;
  const featureStateTone: Record<MeshAnalysisFeatureState, { label: string; bg: string; border: string; color: string }> = {
    ready: { label: "ready", bg: "#ecfdf3", border: "#abefc6", color: "#067647" },
    running: { label: "running", bg: "#eff8ff", border: "#b2ddff", color: "#175cd3" },
    deferred: { label: "deferred", bg: "#fffaeb", border: "#fedf89", color: "#b54708" },
    "not-requested": { label: "not requested", bg: "#f8fafc", border: "#dbe4ee", color: "#475467" },
    missing: { label: "missing", bg: "#fff1f3", border: "#fecdd6", color: "#b42318" },
    unavailable: { label: "unavailable", bg: "#f8fafc", border: "#dbe4ee", color: "#64748b" },
  };
  const renderMeshAnalysisFeatureStatus = (testId: string) => (
    <div data-testid={testId} style={{ display: "grid", gap: 10 }}>
      {(["Surface", "Topology", "Quality"] as const).map((group) => (
        <div key={`${testId}-${group}`} style={{ display: "grid", gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#334155" }}>{group}</div>
          {meshAnalysisFeatureRows
            .filter((row) => row.group === group)
            .map((row) => {
              const tone = featureStateTone[row.state];
              return (
                <div
                  key={`${testId}-${row.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, 1fr) auto",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <button
                    type="button"
                    data-testid={`mesh-analysis-feature-${row.id}`}
                    onClick={row.onOpenResult}
                    disabled={!row.onOpenResult}
                    style={{
                      minWidth: 0,
                      padding: 0,
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      cursor: row.onOpenResult ? "pointer" : "default",
                      textAlign: "left",
                      font: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    {row.detail && <div style={{ color: "#64748b" }}>{row.detail}</div>}
                  </button>
                  <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        border: `1px solid ${tone.border}`,
                        borderRadius: 999,
                        background: tone.bg,
                        color: tone.color,
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tone.label}
                    </span>
                    {row.actionLabel && row.onAction && (
                      <button
                        type="button"
                        onClick={row.onAction}
                        disabled={row.disabled}
                        style={{ padding: "2px 7px", fontSize: 10 }}
                      >
                        {row.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
  const meshBenchmarkRows = useMemo(
    () =>
      buildMeshBenchmarkVerificationRows(meshBenchmarkVerification?.model.expected, {
        boundaryEdges: meshInspectorStats.boundaryEdgeCount,
        boundaryLoops: meshTopologyDetails?.boundaryLoops.length ?? null,
        closed: meshTopologyDetails?.closed ?? null,
        components: meshInspectorStats.connectedComponentCount,
        degenerateFaces: badTriangleCount,
        edges: meshTopologyDetails?.edgeCount ?? null,
        eulerCharacteristic: meshTopologyDetails?.eulerCharacteristic ?? null,
        faces: meshInspectorStats.faceCount,
        nonManifoldEdges: topologyNonManifoldEdgeCount,
        orientationConsistent: meshTopologyDetails?.orientationConsistent ?? null,
        selfIntersectionPairs: meshAnalyzeDiagnostics?.selfIntersectionPairs ?? null,
        vertices: meshInspectorStats.vertexCount,
      }),
    [
      badTriangleCount,
      meshAnalyzeDiagnostics?.selfIntersectionPairs,
      meshBenchmarkVerification?.model.expected,
      meshInspectorStats.boundaryEdgeCount,
      meshInspectorStats.connectedComponentCount,
      meshInspectorStats.faceCount,
      meshInspectorStats.vertexCount,
      meshTopologyDetails,
      topologyNonManifoldEdgeCount,
    ]
  );
  const meshBenchmarkPass = meshBenchmarkVerificationPasses(meshBenchmarkRows);
  const showDetailedResultsCards = showDomainPicker;
  const showAllResultsCards = showDetailedResultsCards && analysisResultsView === "show-all";
  const showFocusedResultCard = showDetailedResultsCards && analysisResultsView === "current-screen";
  const calculusVectorScaleLabel = Number.isInteger(calculusVectorScale)
    ? `${calculusVectorScale}`
    : fmt(calculusVectorScale);
  const focusedResult = (() => {
    switch (analysisFocusedSection) {
      case "differential-geometry":
        return {
          title: "Differential geometry",
          status: differentialGeometryStatus,
          rows: [
            { label: "Samples", value: formatInspectorCount(meshInspectorStats.vertexCount) },
            { label: "Principal directions", value: principalDirectionsStatus },
            { label: "Curvature lines", value: curvatureLinesStatus },
            { label: "K range", value: formatRange(curvatureRanges.K) },
            { label: "H range", value: formatRange(curvatureRanges.H) },
          ],
          nextAction: "Enable principal directions or recompute curvature lines.",
        };
      case "curvature-lines":
        return {
          title: "Curvature lines",
          status: curvatureLinesStatus,
          rows: [
            { label: "Field", value: curvatureLineField },
            { label: "Seed source", value: curvatureSeedSource },
            { label: "Seed density", value: `${Math.max(1, Math.round(curvatureSeedDensity))}` },
            { label: "Max steps", value: `${Math.max(1, Math.round(curvatureMaxSteps))}` },
            { label: "Lines", value: curvatureLineCountLabel },
          ],
          nextAction: "Recompute curvature lines.",
        };
      case "mesh-quality":
        return {
          title: "Mesh quality",
          status: meshQualityStatus,
          rows: [
            { label: "Bad triangles", value: formatInspectorCount(badTriangleCount) },
            { label: "Boundary edges", value: formatInspectorCount(meshInspectorStats.boundaryEdgeCount) },
            { label: "Non-manifold edges", value: formatInspectorCount(topologyNonManifoldEdgeCount) },
            {
              label: "Max aspect ratio",
              value: meshQualityReport?.metrics.aspectRatio.max != null ? fmt(meshQualityReport.metrics.aspectRatio.max) : "n/a",
            },
          ],
          nextAction: "Run mesh quality analysis to refresh the report.",
        };
      case "geodesics":
        return {
          title: "Geodesics",
          status: geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? "ready" : "not computed",
          rows: [
            {
              label: "Path length",
              value: geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? fmt(geodesicPathLength) : "n/a",
            },
          ],
          nextAction: "Pick points and run geodesic path or heat flow.",
        };
      case "chart-analysis":
        return {
          title: "Surface chart analysis",
          status: chartAnalysisStatus,
          rows: [
            { label: "Topology diagnostics", value: topologyDiagnosticsStatus },
          ],
          nextAction: "Enable chart grid in the View tab if you need chart-cell coverage.",
        };
      case "diagnostics":
        return {
          title: "Diagnostics",
          status: diagnosticsWarningCount > 0 ? "warning" : "ready",
          rows: [
            { label: "Warnings", value: `${diagnosticsWarningCount}` },
            { label: "Stale analysis", value: hasStaleAnalysis ? "yes" : "no" },
          ],
          nextAction: "Review active warnings and enable missing analysis overlays.",
        };
      case "ridges-valleys":
        return {
          title: "Ridges / valleys",
          status: "stale",
          rows: [
            { label: "Prerequisite", value: "principal curvatures + directions" },
          ],
          nextAction: "Compute principal directions, then enable ridge/valley tracing.",
        };
      case "vector-calculus":
      default:
        return {
          title: "Vector calculus",
          status: vectorCalculusDetailedStatus,
          rows: [
            { label: "Scalar source", value: calculusScalarSourceLabel },
            { label: "Vector source", value: calculusVectorSource || "none" },
            { label: "Active vector", value: activeVectorFieldLabel },
            { label: "Density", value: `${Math.max(20, Math.round(calculusVectorDensity))}` },
            { label: "Scale", value: calculusVectorScaleLabel },
            { label: "Magnitude range", value: formatRange(activeVectorMagnitudeRange) },
          ],
          nextAction: "Compute grad, div, or curl.",
        };
    }
  })();
  const formatBenchmarkValue = (
    value: MeshBenchmarkVerificationRow["actual"] | MeshBenchmarkVerificationRow["expected"],
    comparator?: MeshBenchmarkVerificationRow["comparator"]
  ): string => {
    if (value == null) return "n/a";
    const prefix = comparator === "atLeast" ? ">= " : "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return `${prefix}${Math.round(value).toLocaleString()}`;
  };
  const handleBenchmarkRowClick = (row: MeshBenchmarkVerificationRow) => {
    if (row.highlightKind === "boundary") onHighlightMeshAnalyzeBoundary();
  };
  const renderMeshBenchmarkVerification = () => {
    if (!isDevMode || !meshBenchmarkVerification || meshBenchmarkRows.length === 0) return null;
    return (
      <div data-testid="mesh-benchmark-verification" style={inspectorSectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: "#475467", fontWeight: 850, letterSpacing: 0.4 }}>
              BENCHMARK
            </div>
            <div style={inspectorSectionTitle}>{meshBenchmarkVerification.model.label}</div>
          </div>
          <span
            data-testid="mesh-benchmark-result"
            style={{
              border: `1px solid ${meshBenchmarkPass ? "#86efac" : "#fecaca"}`,
              borderRadius: 999,
              background: meshBenchmarkPass ? "#dcfce7" : "#fef2f2",
              color: meshBenchmarkPass ? "#166534" : "#b42318",
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 900,
            }}
          >
            {meshBenchmarkPass ? "PASS" : "FAIL"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.8fr 0.8fr 0.65fr", gap: "5px 7px", fontSize: 11 }}>
          <strong>Metric</strong>
          <strong>Expected</strong>
          <strong>Actual</strong>
          <strong>Result</strong>
          {meshBenchmarkRows.map((row) => {
            const clickable = !row.passes && row.highlightKind === "boundary";
            const contents = (
              <>
                <span>{row.label}</span>
                <span>{formatBenchmarkValue(row.expected, row.comparator)}</span>
                <span>{formatBenchmarkValue(row.actual)}</span>
                <strong style={{ color: row.passes ? "#166534" : "#b42318" }}>{row.passes ? "OK" : "FAIL"}</strong>
              </>
            );
            return clickable ? (
              <button
                key={row.id}
                type="button"
                onClick={() => handleBenchmarkRowClick(row)}
                title="Highlight the related boundary geometry"
                style={{
                  display: "contents",
                  color: "inherit",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                {contents}
              </button>
            ) : (
              <React.Fragment key={row.id}>{contents}</React.Fragment>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: meshBenchmarkPass ? "#166534" : "#b42318", fontWeight: 800 }}>
          Benchmark result: {meshBenchmarkPass ? "PASS" : "FAIL"}
        </div>
      </div>
    );
  };
  const inspectorTabs: Array<{ id: InspectorPanelTab; label: string }> = [
    { id: "object", label: "Object" },
    { id: "selection", label: "Selection" },
    { id: "analysis", label: "Analysis" },
    { id: "diagnostics", label: `Diagnostics ${diagnosticsTotalCount}` },
  ];
  const pointPickSection = (
    <div style={workflowCardStyle("domain")}>
      <div style={inspectorSectionTitle}>Point pick</div>
      <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Domain", "domain")}</div>

      {!showDomainPicker ? (
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {isMeshViewer
            ? "Domain picking is not used for SurfaceMesh. Use probe mode to pick points on the mesh."
            : "Domain picking is available for graph, param, and Weierstrass surfaces. Use probe mode to pick points on implicit surfaces."}
        </div>
      ) : isParamViewer ? (
        <>
          <ParamDomainPreview
            width={260}
            height={220}
            uMin={safeParamDomain.uMin}
            uMax={safeParamDomain.uMax}
            vMin={safeParamDomain.vMin}
            vMax={safeParamDomain.vMax}
            onPick={onPickDomainUV}
            picked={probeInfo?.uv ?? null}
          />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            Click to send (u,v) into the {isWeierstrass ? "Weierstrass" : "param"} surface viewer.
          </div>
        </>
      ) : isGraphViewer ? (
        <>
          <XYDomainPreview
            width={260}
            height={220}
            xSpan={safeGraphDomain.xSpan}
            ySpan={safeGraphDomain.ySpan}
            onPick={onPickDomainXY}
            picked={probeInfo?.xy ?? null}
          />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            Click to send (x,y) into the graph/implicit viewer.
          </div>
        </>
      ) : (
        <>
          <XYDomainPreview
            width={260}
            height={220}
            xSpan={safeImplicitDomain.xSpan}
            ySpan={safeImplicitDomain.ySpan}
            onPick={(xy) => onPickDomainXYZ({ x: xy.x, y: xy.y, z: 0 })}
            picked={probeInfo?.point ? { x: probeInfo.point.x, y: probeInfo.point.y } : null}
          />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            Click to send (x,y, z=0) into the implicit viewer.
          </div>
        </>
      )}

      <div style={{ marginTop: 8, fontSize: 11, display: "grid", gap: 3 }}>
        <div><strong>Selected point:</strong> {probeInfo?.point ? `(${fmt(probeInfo.point.x)}, ${fmt(probeInfo.point.y)}, ${fmt(probeInfo.point.z)})` : "none"}</div>
        {probeInfo?.xy && <div><strong>Domain (x,y):</strong> ({fmt(probeInfo.xy.x)}, {fmt(probeInfo.xy.y)})</div>}
        {probeInfo?.uv && <div><strong>Domain (u,v):</strong> ({fmt(probeInfo.uv.u)}, {fmt(probeInfo.uv.v)})</div>}
      </div>
    </div>
  );

  const meshOperationMethodLabel = meshLastOperation
    ? meshLastOperation.boolean
      ? meshLastOperation.engine === "cgal" || meshLastOperation.boolean.kernel === "native-cgal"
        ? "Robust"
        : "Fast"
      : meshLastOperation.engine === "cgal" || String(meshLastOperation.operation).startsWith("cgal")
        ? "Robust"
        : "Standard"
    : "n/a";
  const meshBackendLabel = cgalMeshInfo
    ? "Robust mesh result"
    : meshLastOperation
      ? `Method: ${meshOperationMethodLabel}`
      : isImplicitViewer
        ? "Mesh operations"
        : "SurfaceMesh";
  const watertight =
    meshTopologyDetails?.watertight ??
    (meshQualityReport?.topology?.boundaryEdgeCount != null && meshQualityReport?.topology?.nonManifoldEdgeCount != null
      ? meshQualityReport.topology.boundaryEdgeCount === 0 && meshQualityReport.topology.nonManifoldEdgeCount === 0
      : null);
  const normalStatus =
    normalMagnitude == null ? "unknown" : hasUnstableNormals ? "unstable" : "valid";
  const operationBeforeFaces = meshLastOperation?.beforeFaces ?? null;
  const operationAfterFaces = meshLastOperation?.afterFaces ?? null;
  const operationReductionPct =
    operationBeforeFaces && operationAfterFaces && operationBeforeFaces > 0
      ? ((operationBeforeFaces - operationAfterFaces) / operationBeforeFaces) * 100
      : null;
  const topologyChangedLabel =
    meshLastOperation == null
      ? "n/a"
      : meshLastOperation.warnings.some((w) => w.toLowerCase().includes("topology"))
        ? "yes"
        : meshLastOperation.operation.toLowerCase().includes("decimate") ||
            meshLastOperation.operation.toLowerCase().includes("clean")
          ? "maybe"
          : "unlikely";
  const overlayLegend = [
    showGaussMap ? "Gauss map" : null,
    showContours ? "Contours" : null,
    showPrincipalDirections ? "Principal directions" : null,
    showPrincipalLines ? "Principal lines" : null,
    showCurvatureLines ? "Curvature lines" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const stickyPickPoint = probeInfo?.point ?? inspectPos;
  const stickyPickLabel = stickyPickPoint
    ? `(${fmt(stickyPickPoint.x)}, ${fmt(stickyPickPoint.y)}, ${fmt(stickyPickPoint.z)})`
    : "none";
  const meshPerformanceModeLabel = meshPerformanceBenchmarkId ? "Mesh Demonstration" : "Regular Scene";
  const activeMeshPerformancePresetLabel =
    MESH_PERF_BENCHMARK_PRESETS.find((entry) => entry.id === meshPerformanceBenchmarkId)?.label ?? null;
  const formatPerfMetric = (value: number | null | undefined, digits = 1) =>
    value == null || !Number.isFinite(value) ? "n/a" : Number(value).toFixed(digits);
  const formatSummaryTime = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return "n/a";
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value).toLocaleString()} ms`;
  };
  const meshViewerTrace = surfacePerformanceSnapshot?.trace ?? meshPipelineProfile?.firstFrameSnapshot?.trace ?? null;
  const meshPipelineProfileElapsedMs = meshPipelineProfile
    ? Math.max(0, (meshPipelineProfile.completedAt ?? meshPipelineProfile.updatedAt) - meshPipelineProfile.startedAt)
    : null;
  const meshPipelineProfilePhaseRows =
    meshPipelineProfile?.phases
      .slice()
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 12) ?? [];
  const meshDebugRecentEvents = meshDebugMonitor.events.slice(-18).reverse();
  const meshDebugMemory = meshDebugMonitor.memory;
  const meshSummaryTitle = (() => {
    const filename = surfaceMeshSource?.kind === "import" ? surfaceMeshSource.filename : null;
    const raw = filename?.trim() || surfaceMeshLabel || "Mesh";
    return raw.toUpperCase();
  })();
  const meshSummarySourceLabel = surfaceMeshSource
    ? surfaceMeshSource.kind === "import" && surfaceMeshSource.filename
      ? formatSurfaceMeshSource(surfaceMeshSource)
      : sourceEquation
    : sourceEquation;
  const meshSummaryDimensions = surfaceMeshBounds
    ? {
        x: Math.abs(surfaceMeshBounds.max[0] - surfaceMeshBounds.min[0]),
        y: Math.abs(surfaceMeshBounds.max[1] - surfaceMeshBounds.min[1]),
        z: Math.abs(surfaceMeshBounds.max[2] - surfaceMeshBounds.min[2]),
      }
    : null;
  const meshSummaryMaxDimension = meshSummaryDimensions
    ? Math.max(meshSummaryDimensions.x, meshSummaryDimensions.y, meshSummaryDimensions.z)
    : 0;
  const meshSummaryDimensionRows =
    meshSummaryDimensions && meshSummaryMaxDimension > 0
      ? ([
          ["X", meshSummaryDimensions.x],
          ["Y", meshSummaryDimensions.y],
          ["Z", meshSummaryDimensions.z],
        ] as const).map(([axis, value]) => ({
          axis,
          value,
          normalized: value / meshSummaryMaxDimension,
        }))
      : [];
  const meshSummaryGenus =
    meshTopologyDetails?.closed && meshTopologyDetails.orientable
      ? (2 * Math.max(1, meshTopologyDetails.connectedComponentCount) - meshTopologyDetails.eulerCharacteristic) / 2
      : null;
  const meshSummaryFullReadyMs =
    meshPipelineProfile?.phases.find((phase) => phase.phase === "full:dedicatedViewerReady")?.lastMs ??
    meshDebugMonitor.events
      .slice()
      .reverse()
      .find((event) => event.kind === "full" && event.label.startsWith("Dedicated Full viewer ready:"))?.ms ??
    null;
  const meshSummaryVisibleMs = meshPipelineProfile?.firstFrameMs ?? meshPipelineProfileElapsedMs;
  const meshSummaryFullAnalysisLabel =
    meshSummaryFullReadyMs != null
      ? formatSummaryTime(meshSummaryFullReadyMs)
      : deferredSurfaceSampleSetInfo
        ? "deferred"
        : "n/a";
  const meshSummaryTopologyDeferred = isMeshViewer && !meshTopologyDetails && !!deferredSurfaceSampleSetInfo;
  const meshSummaryTopologyMuted = meshSummaryTopologyDeferred ? "deferred" : "unknown";
  const meshSummaryComponentCount =
    meshAnalyzeDiagnostics?.componentCount ?? meshInspectorStats.connectedComponentCount;
  const meshSummaryComponentLabel =
    meshSummaryComponentCount == null
      ? meshSummaryTopologyMuted
      : formatInspectorCount(meshSummaryComponentCount);
  const meshSummaryEdgeLabel =
    meshAnalyzeDiagnostics?.edgeCount ?? meshTopologyDetails?.edgeCount ?? null;
  const meshHealthBoundaryEdgeCount =
    meshAnalyzeDiagnostics?.boundaryEdgeCount ?? null;
  const meshHealthNonManifoldEdgeCount =
    meshAnalyzeDiagnostics?.nonManifoldEdgeCount ?? null;
  const meshHealthDegenerateFaceCount =
    meshAnalyzeDiagnostics?.degenerateTriangleCount ?? null;
  const meshHealthDuplicateFaceCount = meshAnalyzeDiagnostics?.duplicateFaceCount ?? null;
  const meshHealthSelfIntersectionLabel = meshAnalyzeDiagnostics
    ? `${meshAnalyzeDiagnostics.selfIntersectionPairs.toLocaleString()} suspected${
        meshAnalyzeDiagnostics.selfIntersection.truncated
          ? " (sampled)"
          : meshAnalyzeDiagnostics.selfIntersection.checked
            ? ""
            : " (local estimate)"
      }`
    : "Not checked";
  const meshHealthSuspectedSelfIntersectionCount = meshAnalyzeDiagnostics?.selfIntersectionPairs ?? 0;
  const meshHealthIssueCount =
    (meshHealthBoundaryEdgeCount ?? 0) +
    (meshHealthNonManifoldEdgeCount ?? 0) +
    (meshHealthDegenerateFaceCount ?? 0) +
    (meshHealthDuplicateFaceCount ?? 0) +
    meshHealthSuspectedSelfIntersectionCount;
  const meshHealthIssueCategoryCount = [
    meshHealthBoundaryEdgeCount,
    meshHealthNonManifoldEdgeCount,
    meshHealthDegenerateFaceCount,
    meshHealthDuplicateFaceCount,
    meshHealthSuspectedSelfIntersectionCount,
  ].filter((count) => (count ?? 0) > 0).length;
  const meshHealthStatusLabel = meshSummaryTopologyDeferred
    ? "Unverified"
    : meshAnalyzeDiagnostics?.state ?? "Unverified";
  const meshHealthStatusDisplay =
    meshHealthStatusLabel === "Healthy"
      ? "✓ Healthy"
      : meshHealthStatusLabel === "Invalid"
        ? "✕ Invalid"
        : meshHealthStatusLabel === "Warning"
          ? "! Warning"
        : "? Unverified";
  const meshDiagnosticsValidationBlockers = getMeshHealthBlockers(meshAnalyzeDiagnostics);
  const meshCompactDimensionLabel = meshSummaryDimensions
    ? `X ${fmt(meshSummaryDimensions.x)} | Y ${fmt(meshSummaryDimensions.y)} | Z ${fmt(meshSummaryDimensions.z)}`
    : "n/a";
  const meshHealthToneForState = (state: "pass" | "warn" | "fail") =>
    state === "pass"
      ? { border: "#86efac", background: "#f0fdf4", color: "#166534" }
      : state === "fail"
        ? { border: "#fca5a5", background: "#fef2f2", color: "#b42318" }
        : { border: "#fcd34d", background: "#fffbeb", color: "#92400e" };
  const meshHealthTone =
    meshHealthStatusLabel === "Healthy"
      ? { border: "#86efac", background: "#f0fdf4", color: "#166534" }
      : meshHealthStatusLabel === "Invalid"
        ? { border: "#fca5a5", background: "#fef2f2", color: "#b42318" }
        : meshHealthStatusLabel === "Warning"
        ? { border: "#fcd34d", background: "#fffbeb", color: "#92400e" }
        : { border: "#dbe4ee", background: "#f8fafc", color: "#475467" };
  const meshLastOperationVerdict = (() => {
    if (meshOperationError || meshLastOperation?.status === "error") {
      return { label: "Failed", border: "#fca5a5", background: "#fef2f2", color: "#b42318" };
    }
    if (!meshLastOperation) {
      return { label: "No operation yet", border: "#dbe4ee", background: "#f8fafc", color: "#475467" };
    }
    if (meshLastOperation.repairValidation?.verdict === "improved") {
      return { label: "Improved", border: "#86efac", background: "#f0fdf4", color: "#166534" };
    }
    if (meshLastOperation.repairValidation?.verdict === "needs-review" || meshLastOperation.status === "warning") {
      return { label: "Still needs review", border: "#fcd34d", background: "#fffbeb", color: "#92400e" };
    }
    if (meshLastOperation.repairValidation?.verdict === "no-change") {
      return { label: "No change", border: "#cbd5e1", background: "#f8fafc", color: "#475467" };
    }
    return { label: "Complete", border: "#86efac", background: "#f0fdf4", color: "#166534" };
  })();
  const renderHealthCountRow = (label: string, value: string | number | null) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatInspectorCount(value) : value ?? "n/a"}</strong>
    </div>
  );
  const renderOperationDeltaRow = (label: string, before: number | null | undefined, after: number | null | undefined) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span>{label}</span>
      <strong>
        {before == null ? "n/a" : formatInspectorCount(before)} {"->"} {after == null ? "n/a" : formatInspectorCount(after)}
      </strong>
    </div>
  );
  const renderMeshActiveSelectionCard = () => (
    <ActiveSelectionCard
      testId="mesh-active-selection-card"
      workspace="Mesh"
      type={meshActiveSelectionCardType}
      entityId={meshActiveSelectionCardId}
      actions={meshActiveSelectionCardActions}
      actionButtons={meshActiveSelectionCardActionButtons}
      emptyState={meshActiveSelectionCardEmptyState}
      confirmationLabel={meshActiveSelectionCardConfirmationLabel}
      confirmationTestId="mesh-active-selection-confirmation"
      lastCommandLabel={meshActiveSelectionCardLastCommandLabel}
      lastCommandTestId="mesh-active-selection-last-command"
      canUndoLast={meshActiveSelectionCardCanUndoLast}
      onUndoLast={onUndoSurfaceMeshTopologyEdit}
      undoTestId="mesh-active-selection-undo-last"
      onOpenHistory={onOpenSurfaceMeshTopologyHistory}
      openHistoryTestId="mesh-active-selection-open-history"
      onClearSelection={onClearSurfaceMeshTopologySelection}
      canBookmarkSelection={meshCanBookmarkSelection}
      onBookmarkSelection={onBookmarkMeshSelection}
      bookmarkSelectionTestId="mesh-active-selection-bookmark"
      canRedoSelection={meshCanRedoSelection}
      onRedoSelection={onRedoMeshSelection}
      redoSelectionTestId="mesh-active-selection-redo"
      selectionHistoryItems={meshSelectionHistoryItems}
      selectionBookmarks={meshSelectionBookmarks}
      onRestoreSelection={onRestoreMeshSelection}
      onRemoveSelectionBookmark={onRemoveMeshSelectionBookmark}
      adaptiveGizmoLabel={meshAdaptiveTopologyGizmoLabel}
      adaptiveGizmoTestId="mesh-active-selection-adaptive-gizmo"
      previewHighVisibility={commandPreviewHighVisibility}
      previewAccessibilityLabel={
        meshContextualPreviewActive
          ? `High visibility: ${commandPreviewHighVisibility ? "on" : "off"}`
          : undefined
      }
      previewAccessibilityTestId="mesh-active-selection-card-preview-accessibility"
      onOpenPreviewSettings={meshContextualPreviewActive ? onOpenPreviewSettings : undefined}
      openPreviewSettingsTestId="mesh-active-selection-card-open-preview-settings"
    />
  );
  const copyMeshPipelineProfile = () => {
    if (!meshPipelineProfile) return;
    const text = JSON.stringify(serializeMeshPipelineProfileRun(meshPipelineProfile), null, 2);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clipboard?.writeText) {
      void clipboard.writeText(text);
    }
  };
  const copyMeshDebugTrace = () => {
    const text = JSON.stringify(serializeMeshDebugMonitorState(meshDebugMonitor, meshPipelineProfile), null, 2);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clipboard?.writeText) {
      void clipboard.writeText(text);
    }
  };

  const resultsOnlyInspector = true;
  if (resultsOnlyInspector) {
    return (
      <SharedInspectorShell
        activeCategory={inspectorPanelTab === "object" ? "summary" : inspectorPanelTab === "result" ? "geometry" : inspectorPanelTab === "probe" ? "selection" : inspectorPanelTab === "warnings" ? "diagnostics" : inspectorPanelTab}
        onCategoryChange={setInspectorPanelTab}
        summary={
          <div style={{ display: "grid", gap: 2 }}>
            <strong>{activeMeta.label}</strong>
            <span>{isMeshViewer ? "Surface / Mesh" : activeMeta.formula}</span>
            <span>{surfaceMeshStats ? `${surfaceMeshStats.vertCount.toLocaleString()} V · ${surfaceMeshStats.triCount.toLocaleString()} F` : "Geometry pending"}</span>
            <span style={{ color: meshHealthStatusLabel === "Healthy" ? "#166534" : "#475467" }}>{meshHealthStatusDisplay} · pick {stickyPickLabel}</span>
          </div>
        }
      >

        {inspectorPanelTab === "summary" && (
          <>
            {isMeshViewer && (
              meshWorkspaceSummary.meshCount > 1 ? (
                <div
                  style={{
                    ...inspectorSectionCard,
                    border: "1px solid #bfdbfe",
                    background: "#f8fbff",
                    display: "grid",
                    gap: 7,
                  }}
                  data-testid="mesh-workspace-inspector-summary"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 11, textTransform: "uppercase", color: "#1e3a5f" }}>
                      Workspace
                    </strong>
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      {meshWorkspaceSummary.meshCount.toLocaleString()} total · {meshWorkspaceSummary.linkedGeometryCount.toLocaleString()} linked Geometry
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#1e293b" }}>
                    <strong>{meshWorkspaceSummary.selectedCount.toLocaleString()}</strong> selected · {meshWorkspaceSummary.vertexCount.toLocaleString()} V · {meshWorkspaceSummary.faceCount.toLocaleString()} F
                  </div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    {meshWorkspaceSummary.stateLabel}
                    {meshWorkspaceSummary.bounds
                      ? ` · Bounds ${fmt(meshWorkspaceSummary.bounds.min[0])}, ${fmt(meshWorkspaceSummary.bounds.min[1])}, ${fmt(meshWorkspaceSummary.bounds.min[2])} to ${fmt(meshWorkspaceSummary.bounds.max[0])}, ${fmt(meshWorkspaceSummary.bounds.max[1])}, ${fmt(meshWorkspaceSummary.bounds.max[2])}`
                      : ""}
                  </div>
                </div>
              ) : null
            )}
            {isMeshViewer && meshWorkspaceSelectedProvenanceEntry && (
              <div
                data-testid="mesh-workspace-selected-provenance"
                style={{ ...inspectorSectionCard, border: "1px solid #93c5fd", background: "#f8fbff", display: "grid", gap: 6 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ color: "#1e3a5f", fontSize: 11, textTransform: "uppercase" }}>Selected operation</strong>
                  <span style={{ color: meshWorkspaceSelectedProvenanceEntry.result.status === "error" ? "#b42318" : "#166534", fontSize: 10, fontWeight: 800 }}>
                    {meshWorkspaceSelectedProvenanceEntry.result.status}
                  </span>
                </div>
                <strong style={{ fontSize: 12, overflowWrap: "anywhere" }}>{meshWorkspaceSelectedProvenanceEntry.result.label}</strong>
                <div style={{ color: "#475569", fontSize: 10 }}>
                  Inputs: {meshWorkspaceSelectedProvenanceEntry.request?.inputs.join(" + ") || "source mesh"}
                </div>
                <div style={{ fontSize: 11 }}>
                  {meshWorkspaceSelectedProvenanceEntry.result.beforeVertices.toLocaleString()} → {meshWorkspaceSelectedProvenanceEntry.result.afterVertices == null ? "n/a" : meshWorkspaceSelectedProvenanceEntry.result.afterVertices.toLocaleString()} V · {meshWorkspaceSelectedProvenanceEntry.result.beforeFaces.toLocaleString()} → {meshWorkspaceSelectedProvenanceEntry.result.afterFaces == null ? "n/a" : meshWorkspaceSelectedProvenanceEntry.result.afterFaces.toLocaleString()} F
                </div>
                <div style={{ color: "#64748b", fontSize: 10 }}>
                  Output: {meshWorkspaceSelectedProvenanceEntry.outputLabel ?? "in memory"}
                </div>
                <div style={{ color: "#475569", fontSize: 10 }}>
                  Result state: {meshWorkspaceSelectedProvenanceEntry.result.validation
                    ? `${meshWorkspaceSelectedProvenanceEntry.result.validation.watertight ? "closed" : "open"} · ${meshWorkspaceSelectedProvenanceEntry.result.validation.manifold ? "manifold" : "non-manifold"} · ${meshWorkspaceSelectedProvenanceEntry.result.validation.selfIntersection.suspectedPairs.toLocaleString()} suspected intersections`
                    : "not validated; preview or validate this result"}
                </div>
              </div>
            )}
            {isMeshViewer && (
              <div
                style={{
                  ...inspectorSectionCard,
                  background: "#ffffff",
                  border: "1px solid #c7d7ea",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
                data-testid="mesh-summary-card"
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                        State check
                    </div>
                    <span
                      data-testid="mesh-health-status"
                      style={{
                        border: `1px solid ${meshHealthTone.border}`,
                        borderRadius: 999,
                        background: meshHealthTone.background,
                        color: meshHealthTone.color,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 850,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meshHealthStatusDisplay}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: "#0f172a",
                        overflowWrap: "anywhere",
                        lineHeight: 1.2,
                      }}
                    >
                      {meshSummaryTitle}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", overflowWrap: "anywhere" }}>
                      {meshSummarySourceLabel}
                    </div>
                  </div>

                  {meshHealthIssueCount > 0 ? (
                    <div
                      style={{
                        border: `1px solid ${meshHealthTone.border}`,
                        borderRadius: 7,
                        background: meshHealthTone.background,
                        padding: "7px 8px",
                        display: "grid",
                        gap: 4,
                        fontSize: 11,
                      }}
                    >
                      <strong style={{ color: meshHealthTone.color }}>
                        {meshHealthStatusLabel} · {meshHealthIssueCategoryCount} issue categor{meshHealthIssueCategoryCount === 1 ? "y" : "ies"}
                      </strong>
                      {renderHealthCountRow("Boundary edges", meshHealthBoundaryEdgeCount)}
                      {renderHealthCountRow("Non-manifold edges", meshHealthNonManifoldEdgeCount)}
                      {renderHealthCountRow("Degenerate faces", meshHealthDegenerateFaceCount)}
                      {renderHealthCountRow("Duplicate faces", meshHealthDuplicateFaceCount)}
                      {renderHealthCountRow("Self intersections", meshHealthSelfIntersectionLabel)}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" data-testid="mesh-health-validate-fully" onClick={() => void onValidateActiveMesh()}>
                          Validate fully
                        </button>
                        <button
                          type="button"
                          data-testid="mesh-health-show-problems"
                          onClick={() => {
                            setInspectorPanelTab("diagnostics");
                            onShowMeshHealthProblems();
                          }}
                        >
                          Show problems
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <details open style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 900, color: "#475467", textTransform: "uppercase" }}>
                      Geometry
                    </summary>
                    <div style={{ display: "grid", gap: 4, paddingTop: 6 }}>
                      {renderHealthCountRow("Vertices", meshInspectorStats.vertexCount)}
                      {renderHealthCountRow("Faces", meshInspectorStats.faceCount)}
                      {renderHealthCountRow("Edges", meshSummaryEdgeLabel == null ? meshSummaryTopologyMuted : meshSummaryEdgeLabel)}
                    </div>
                  </details>

                  <details open style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 900, color: "#475467", textTransform: "uppercase" }}>
                      Topology
                    </summary>
                    <div style={{ display: "grid", gap: 4, paddingTop: 6 }}>
                    {renderHealthCountRow("Components", meshSummaryComponentLabel)}
                    {renderHealthCountRow("Boundary loops", meshAnalyzeDiagnostics?.boundaryLoopCount ?? (meshTopologyDetails ? meshTopologyDetails.boundaryLoops.length : meshSummaryTopologyMuted))}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Boundary</span>
                      <strong>
                        {meshAnalyzeDiagnostics?.watertight != null
                          ? meshAnalyzeDiagnostics.watertight
                            ? "Closed"
                            : "Open"
                          : meshSummaryTopologyMuted}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Manifold</span>
                      <strong>
                        {meshAnalyzeDiagnostics?.manifold == null
                          ? meshSummaryTopologyMuted
                          : meshAnalyzeDiagnostics.manifold
                            ? "Manifold"
                            : `Non-manifold (${(meshAnalyzeDiagnostics.nonManifoldEdgeCount ?? 0).toLocaleString()})`}
                      </strong>
                    </div>
                    {renderHealthCountRow("Non-manifold edges", meshHealthNonManifoldEdgeCount)}
                    {renderHealthCountRow("Degenerate faces", meshHealthDegenerateFaceCount)}
                    {renderHealthCountRow("Duplicate faces", meshHealthDuplicateFaceCount)}
                    {renderHealthCountRow("Self intersections", meshHealthSelfIntersectionLabel)}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Orientable</span>
                      <strong>
                        {meshAnalyzeDiagnostics?.orientable == null
                          ? meshSummaryTopologyMuted
                          : meshAnalyzeDiagnostics.orientable
                            ? "Orientable"
                            : "Non-orientable"}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Genus</span>
                      <strong>
                        {meshSummaryGenus == null
                          ? meshTopologyDetails
                            ? "n/a"
                            : meshSummaryTopologyMuted
                          : Math.abs(meshSummaryGenus - Math.round(meshSummaryGenus)) < 1e-6
                            ? Math.round(meshSummaryGenus).toLocaleString()
                            : meshSummaryGenus.toFixed(2)}
                      </strong>
                    </div>
                    </div>
                  </details>

                  <details style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 900, color: "#475467", textTransform: "uppercase" }}>
                      Dimensions
                    </summary>
                    <div style={{ display: "grid", gap: 4, paddingTop: 6 }}>
                    {meshSummaryDimensionRows.length ? (
                      meshSummaryDimensionRows.map((row) => (
                        <div key={`mesh-summary-size-${row.axis}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{row.axis}</span>
                          <strong title={`extent ${fmt(row.value)}`}>{row.normalized.toFixed(2)}</strong>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "#64748b" }}>Bounds n/a</div>
                    )}
                    </div>
                  </details>

                  <details style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 900, color: "#475467", textTransform: "uppercase" }}>
                      Backend / provenance
                    </summary>
                    <div style={{ display: "grid", gap: 4, paddingTop: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>State check</span>
                      <strong>{meshAnalyzeDiagnostics?.backend === "hybrid" ? "Math3D + CGAL" : "Math3D"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Payload</span>
                      <strong>{formatBenchmarkBytes(meshPipelineProfile?.memoryBytes)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Visible</span>
                      <strong>{formatSummaryTime(meshSummaryVisibleMs)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>Full analysis</span>
                      <strong>{meshSummaryFullAnalysisLabel}</strong>
                    </div>
                    </div>
                  </details>
                </div>
              </div>
            )}

            <div style={inspectorSectionCard}>
              <div style={inspectorSectionTitle}>Mesh Details</div>
              <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                {meshKernelDocument && (
                  <div data-testid="mesh-kernel-document">
                    <strong>Document:</strong> revision {meshKernelDocument.identity.revision} · {meshKernelDocument.identity.id.slice(-8)} · artifact {meshKernelDocument.source.resource.checksum.slice(7, 15)}
                  </div>
                )}
                <div><strong>Source/method:</strong> {meshBackendLabel}</div>
                <div><strong>Vertices:</strong> {formatInspectorCount(meshInspectorStats.vertexCount)}</div>
                <div><strong>Faces:</strong> {formatInspectorCount(meshInspectorStats.faceCount)}</div>
                <div><strong>Edges:</strong> {formatInspectorCount(meshTopologyDetails?.edgeCount ?? null)}</div>
                <div><strong>Dimensions:</strong> {meshCompactDimensionLabel}</div>
                {deferredSurfaceSampleSetInfo && (
                  <div
                    data-testid="mesh-analysis-deferred-status"
                    style={{
                      border: "1px solid #93c5fd",
                      borderRadius: 7,
                      background: "#eff6ff",
                      padding: "6px 7px",
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    <div>
                      <strong>Analysis data:</strong> deferred
                    </div>
                    <div>
                      Mesh loaded; diagnostics deferred until requested.
                      {deferredSurfaceSampleSetInfo.firstFrameSeen ? " First frame is visible." : ""}
                    </div>
                    <div>
                      <strong>Deferred samples:</strong> {formatInspectorCount(deferredSurfaceSampleSetInfo.sampleCount)}
                      {" | "}
                      <strong>Payload:</strong> {formatBenchmarkBytes(deferredSurfaceSampleSetInfo.meshDataBytes)}
                    </div>
                    <button
                      type="button"
                      data-testid="mesh-prepare-analysis-data"
                      onClick={onPrepareDeferredSurfaceAnalysisData}
                    >
                      Prepare analysis data
                    </button>
                  </div>
                )}
                <div><strong>Watertight:</strong> {watertight == null ? "unknown" : watertight ? "yes" : "no"}</div>
                <div><strong>Normal status:</strong> {normalStatus}</div>
              </div>
            </div>

          </>
        )}

        {inspectorPanelTab === "geometry" && !meshAnalysisActive && (
          <div style={inspectorSectionCard} data-testid="mesh-operation-result-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <div style={inspectorSectionTitle}>Last Operation</div>
              <span
                data-testid="mesh-last-operation-verdict"
                style={{
                  border: `1px solid ${meshLastOperationVerdict.border}`,
                  borderRadius: 999,
                  background: meshLastOperationVerdict.background,
                  color: meshLastOperationVerdict.color,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 850,
                  whiteSpace: "nowrap",
                }}
              >
                {meshLastOperationVerdict.label}
              </span>
            </div>
            {meshLastOperation ? (
              <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                <div><strong>{meshLastOperation.label}</strong> · {meshOperationMethodLabel}</div>
                {renderOperationDeltaRow("Vertices", meshLastOperation.beforeVertices, meshLastOperation.afterVertices)}
                {renderOperationDeltaRow("Faces", meshLastOperation.beforeFaces, meshLastOperation.afterFaces)}
                {meshLastOperation.repairValidation && (
                  <>
                    {renderOperationDeltaRow("Components", meshLastOperation.repairValidation.before.componentCount, meshLastOperation.repairValidation.after.componentCount)}
                    {renderOperationDeltaRow("Non-manifold", meshLastOperation.repairValidation.before.nonManifoldEdgeCount, meshLastOperation.repairValidation.after.nonManifoldEdgeCount)}
                    {renderOperationDeltaRow("Boundary edges", meshLastOperation.repairValidation.before.boundaryEdgeCount, meshLastOperation.repairValidation.after.boundaryEdgeCount)}
                  </>
                )}
                <div><strong>Duration:</strong> {formatSummaryTime(meshLastOperation.durationMs)}</div>
                <div><strong>Output:</strong> {meshLastOperation.outputMode}</div>
                {meshLastOperation.warnings.length > 0 && <div><strong>Warnings:</strong> {meshLastOperation.warnings.join("; ")}</div>}
                {meshLastOperation.errors.length > 0 && <div style={{ color: "#b42318" }}><strong>Errors:</strong> {meshLastOperation.errors.join("; ")}</div>}
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced result details</summary>
                  <div style={{ display: "grid", gap: 4, paddingTop: 6 }}>
                    <div><strong>Topology changed:</strong> {topologyChangedLabel}</div>
                    <div><strong>Reduction:</strong> {operationReductionPct == null ? "n/a" : `${Math.max(0, operationReductionPct).toFixed(1)}%`}</div>
                    <div><strong>Engine:</strong> {meshLastOperation.engine.toUpperCase()}</div>
                  </div>
                </details>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void onValidateLastMeshOperationResult()} disabled={meshLastOperation.status === "error"}>Validate</button>
                  <button type="button" onClick={onUndoLatestMeshOperation} disabled={!canUndoLatestMeshOperation}>Undo</button>
                  <button type="button" onClick={onSaveMeshOperationPreset}>Save operation settings</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#556" }}>No mesh operation result yet.</div>
            )}
          </div>
        )}

        {inspectorPanelTab === "selection" && (
          <>
            {renderMeshActiveSelectionCard()}
            <div style={inspectorSectionCard}>
              <div style={inspectorSectionTitle}>Selection</div>
              <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                <div>
                  <strong>Selected point p:</strong>{" "}
                  {probeInfo?.point ? `(${fmt(probeInfo.point.x)}, ${fmt(probeInfo.point.y)}, ${fmt(probeInfo.point.z)})` : "none"}
                </div>
                <div>
                  <strong>Normal n:</strong>{" "}
                  {probeInfo?.normal ? `(${fmt(probeInfo.normal.x)}, ${fmt(probeInfo.normal.y)}, ${fmt(probeInfo.normal.z)})` : "none"}
                </div>
                <div>
                  <strong>Chart coordinates:</strong>{" "}
                  {probeInfo?.uv
                    ? `u,v=(${fmt(probeInfo.uv.u)}, ${fmt(probeInfo.uv.v)})`
                    : probeInfo?.xy
                      ? `x,y=(${fmt(probeInfo.xy.x)}, ${fmt(probeInfo.xy.y)})`
                      : "n/a"}
                </div>
                <div><strong>Geodesic/path:</strong> {geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? `length=${fmt(geodesicPathLength)}` : "n/a"}</div>
              </div>
            </div>
            {meshAnalysisActive && (
              <div data-testid="mesh-selection-scientific-fields" style={inspectorSectionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 7 }}>
                  <div style={inspectorSectionTitle}>Scientific entity values</div>
                  <span style={{ color: meshSelectedScientificFields?.principalDirectionsValidated ? "#166534" : "#92400e", fontSize: 10, fontWeight: 850 }}>
                    directions {meshSelectedScientificFields?.principalDirectionsValidated ? "validated" : "uncertain"}
                  </span>
                </div>
                {meshSelectedScientificFields ? (
                  <div style={{ display: "grid", gap: 9, fontSize: 10 }}>
                    <div>
                      <strong>{meshSelectedScientificFields.target.kind}</strong> · vertices {meshSelectedScientificFields.vertexIndices.join(", ") || "n/a"}
                    </div>
                    <details open>
                      <summary style={{ cursor: "pointer", fontWeight: 850 }}>Scalar fields · {meshSelectedScientificFields.scalars.length}</summary>
                      <div style={{ display: "grid", gap: 3, paddingTop: 5 }}>
                        {meshSelectedScientificFields.scalars.length ? meshSelectedScientificFields.scalars.map((field) => (
                          <div key={`selected-scalar-${field.name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{field.name} <small style={{ color: "#64748b" }}>({field.domain})</small></span>
                            <strong>{fmt(field.value)}</strong>
                          </div>
                        )) : <span style={{ color: "#64748b" }}>No scalar fields computed.</span>}
                      </div>
                    </details>
                    <details open>
                      <summary style={{ cursor: "pointer", fontWeight: 850 }}>Vector fields · {meshSelectedScientificFields.vectors.length}</summary>
                      <div style={{ display: "grid", gap: 4, paddingTop: 5 }}>
                        {meshSelectedScientificFields.vectors.length ? meshSelectedScientificFields.vectors.map((field) => (
                          <div key={`selected-vector-${field.name}`}>
                            <strong>{field.name}</strong> <small style={{ color: "#64748b" }}>({field.domain})</small>
                            <div style={{ color: "#475569" }}>({field.value.map((value) => fmt(value)).join(", ")}) · |v| {fmt(field.magnitude)}</div>
                          </div>
                        )) : <span style={{ color: "#64748b" }}>No vector fields computed.</span>}
                      </div>
                    </details>
                    <div>
                      <strong>Face / edge quality</strong>
                      <div style={{ display: "grid", gap: 3, paddingTop: 4 }}>
                        {meshSelectedScientificFields.quality.length ? meshSelectedScientificFields.quality.map((field) => (
                          <div key={`selected-quality-${field.name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{field.name} <small style={{ color: "#64748b" }}>({field.domain})</small></span>
                            <strong>{fmt(field.value)}</strong>
                          </div>
                        )) : <span style={{ color: "#64748b" }}>No native quality value for this entity.</span>}
                      </div>
                    </div>
                    <div><strong>Feature membership:</strong> {meshSelectedScientificFields.featureMembership.join(", ") || "none"}</div>
                    <div>
                      <strong>Warnings:</strong>{" "}
                      {meshSelectedScientificFields.warnings.length ? meshSelectedScientificFields.warnings.join("; ") : "none"}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 10 }}>Select a mesh vertex, edge, or face to inspect computed fields.</div>
                )}
              </div>
            )}
            {meshAnalysisActive && (
              <>
                <SurfacesInspectPanel
                  viewerKind={viewerKind}
                  inspectEnabled={inspectEnabled}
                  onToggleInspectEnabled={onToggleInspectEnabled}
                  onClearInspect={onClearInspect}
                  inspectIdx={inspectIdx}
                  inspectPos={inspectPos}
                  inspectNormal={inspectNormal}
                  inspectMetrics={inspectMetrics}
                  probeInfo={probeInfo}
                  probeCurv={probeCurv}
                  paramProbeCurv={paramProbeCurv}
                  graphDomain={safeGraphDomain}
                  paramDomain={safeParamDomain}
                  onPickDomainXY={onPickDomainXY}
                  onPickDomainUV={onPickDomainUV}
                  probeEnabled={probeEnabled}
                  onToggleProbe={onToggleProbe}
                  showProbeNormal={showProbeNormal}
                  onToggleProbeNormal={onToggleProbeNormal}
                  showProbeTangentPlane={showProbeTangentPlane}
                  onToggleProbeTangentPlane={onToggleProbeTangentPlane}
                  showProbeTangents={showProbeTangents}
                  onToggleProbeTangents={onToggleProbeTangents}
                  geometryProbeSelectionMode={geometryProbeSelectionMode}
                  geometryProbeSelectionDetails={geometryProbeSelectionDetails}
                  geometryProbeHoverSelectionDetails={geometryProbeHoverSelectionDetails}
                />
                <div data-testid="mesh-inspector-probe-history" style={inspectorSectionCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <div style={inspectorSectionTitle}>Recent probes</div>
                    <button type="button" onClick={onClearMeshAnalyzeProbeHistory} disabled={!meshAnalyzeProbeHistory.length} style={{ padding: "3px 7px", fontSize: 10 }}>
                      Clear
                    </button>
                  </div>
                  {meshAnalyzeProbeHistory.length ? (
                    <div style={{ display: "grid", gap: 4 }}>
                      {meshAnalyzeProbeHistory.map((entry) => (
                        <button
                          key={`inspector-${entry.id}`}
                          type="button"
                          onClick={() => onRestoreMeshAnalyzeProbe(entry)}
                          style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr", gap: 6, padding: "5px 7px", textAlign: "left", fontSize: 10 }}
                        >
                          <strong>v{entry.vertexIndex}</strong>
                          <span>K {fmt(entry.K)}</span>
                          <span>H {fmt(entry.H)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "#64748b", fontSize: 10 }}>No recorded probes.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {inspectorPanelTab === "selection" && !meshAnalysisActive && (
          <SurfacesInspectPanel
            viewerKind={viewerKind}
            inspectEnabled={inspectEnabled}
            onToggleInspectEnabled={onToggleInspectEnabled}
            onClearInspect={onClearInspect}
            inspectIdx={inspectIdx}
            inspectPos={inspectPos}
            inspectNormal={inspectNormal}
            inspectMetrics={inspectMetrics}
            probeInfo={probeInfo}
            probeCurv={probeCurv}
            paramProbeCurv={paramProbeCurv}
            graphDomain={safeGraphDomain}
            paramDomain={safeParamDomain}
            onPickDomainXY={onPickDomainXY}
            onPickDomainUV={onPickDomainUV}
            probeEnabled={probeEnabled}
            onToggleProbe={onToggleProbe}
            showProbeNormal={showProbeNormal}
            onToggleProbeNormal={onToggleProbeNormal}
            showProbeTangentPlane={showProbeTangentPlane}
            onToggleProbeTangentPlane={onToggleProbeTangentPlane}
            showProbeTangents={showProbeTangents}
            onToggleProbeTangents={onToggleProbeTangents}
            geometryProbeSelectionMode={geometryProbeSelectionMode}
            geometryProbeSelectionDetails={geometryProbeSelectionDetails}
            geometryProbeHoverSelectionDetails={geometryProbeHoverSelectionDetails}
          />
        )}

        {inspectorPanelTab === "analysis" && (
          <>
            {meshAnalysisActive && (
              <div style={inspectorSectionCard} data-testid="mesh-analysis-active-result">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 9 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>
                      {meshActiveAnalysisResult.category ?? "Analysis"}
                    </div>
                    <div style={{ ...inspectorSectionTitle, marginTop: 2, overflowWrap: "anywhere" }}>
                      {meshActiveAnalysisResult.result}
                    </div>
                  </div>
                  <span
                    data-testid="mesh-analysis-active-result-state"
                    style={{
                      border: `1px solid ${meshActiveAnalysisResult.state === "Ready" ? "#abefc6" : meshActiveAnalysisResult.state === "Running" ? "#b2ddff" : "#dbe4ee"}`,
                      borderRadius: 999,
                      background: meshActiveAnalysisResult.state === "Ready" ? "#ecfdf3" : meshActiveAnalysisResult.state === "Running" ? "#eff8ff" : "#f8fafc",
                      color: meshActiveAnalysisResult.state === "Ready" ? "#067647" : meshActiveAnalysisResult.state === "Running" ? "#175cd3" : "#475467",
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 850,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meshActiveAnalysisResult.state}
                  </span>
                </div>
                <div
                  data-testid="mesh-analysis-result-definition"
                  style={{ borderTop: "1px solid #e2e8f0", padding: "7px 0", display: "grid", gap: 4, fontSize: 10 }}
                >
                  {([
                    ["Quantity", meshActiveAnalysisResult.quantity],
                    ["Method", meshActiveAnalysisResult.method],
                    ["Domain", meshActiveAnalysisResult.domain],
                  ] as const).map(([label, value]) => (
                    <div key={`mesh-analysis-definition-${label}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: "#64748b" }}>{label}</span>
                      <strong style={{ textAlign: "right", overflowWrap: "anywhere" }}>{value}</strong>
                    </div>
                  ))}
                </div>
                {meshActiveAnalysisResult.statistics.length > 0 ? (
                  <div style={{ marginBottom: 9 }}>
                    <div style={{ color: "#475569", fontSize: 10, fontWeight: 850, textTransform: "uppercase", marginBottom: 5 }}>Statistics</div>
                    <div
                      data-testid="mesh-analysis-result-statistics"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        borderTop: "1px solid #e2e8f0",
                        borderLeft: "1px solid #e2e8f0",
                      }}
                    >
                      {meshActiveAnalysisResult.statistics.map((statistic) => (
                        <div
                          key={`active-result-stat-${statistic.label}`}
                          data-testid={`mesh-analysis-result-stat-${statistic.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`}
                          style={{ borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", padding: "6px 7px", minWidth: 0 }}
                        >
                          <div style={{ color: "#64748b", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>{statistic.label}</div>
                          <div style={{ color: "#0f172a", fontSize: 11, fontWeight: 850, overflowWrap: "anywhere" }}>{statistic.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 11, marginBottom: 9 }}>No numerical result is available yet.</div>
                )}
                <div data-testid="mesh-analysis-result-percentiles" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, marginBottom: 9 }}>
                  <div style={{ color: "#475569", fontSize: 10, fontWeight: 850, textTransform: "uppercase", marginBottom: 5 }}>Percentiles</div>
                  {meshActiveAnalysisResult.percentiles.length ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
                      {meshActiveAnalysisResult.percentiles.map((entry) => (
                        <div key={`active-result-percentile-${entry.label}`} style={{ minWidth: 0, textAlign: "center", background: "#f8fafc", borderRadius: 4, padding: "4px 2px" }}>
                          <div style={{ color: "#64748b", fontSize: 8, fontWeight: 800 }}>{entry.label}</div>
                          <strong style={{ fontSize: 9, overflowWrap: "anywhere" }}>{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: "#64748b", fontSize: 10 }}>Not applicable to this result.</div>}
                </div>
                {meshActiveAnalysisResult.extrema?.length ? (
                  <div data-testid="mesh-analysis-result-extrema" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, marginBottom: 9, display: "grid", gap: 4, fontSize: 10 }}>
                    <div style={{ color: "#475569", fontWeight: 850, textTransform: "uppercase" }}>Extrema</div>
                    {meshActiveAnalysisResult.extrema.map((entry) => (
                      <div key={`active-result-extrema-${entry.label}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "#64748b" }}>{entry.label}</span>
                        <strong>{entry.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                {meshActiveAnalysisResult.histogram?.length ? (() => {
                  const maxBinCount = Math.max(...meshActiveAnalysisResult.histogram.map((bin) => bin.count), 1);
                  return (
                    <div data-testid="mesh-analysis-result-histogram" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, marginBottom: 9 }}>
                      <div style={{ color: "#475569", fontSize: 10, fontWeight: 850, textTransform: "uppercase", marginBottom: 6 }}>Histogram</div>
                      <div style={{ height: 64, display: "flex", gap: 2, alignItems: "flex-end", borderBottom: "1px solid #cbd5e1" }}>
                        {meshActiveAnalysisResult.histogram.map((bin, index) => (
                          <div
                            key={`active-result-histogram-${index}`}
                            title={`${fmt(bin.min)} to ${fmt(bin.max)}: ${bin.count}`}
                            style={{
                              flex: "1 1 0",
                              minWidth: 2,
                              height: `${Math.max(3, (bin.count / maxBinCount) * 100)}%`,
                              background: "#2563eb",
                              opacity: bin.count ? 0.82 : 0.18,
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 3, color: "#64748b", fontSize: 9 }}>
                        <span>{fmt(meshActiveAnalysisResult.histogram[0].min)}</span>
                        <span>{fmt(meshActiveAnalysisResult.histogram[meshActiveAnalysisResult.histogram.length - 1].max)}</span>
                      </div>
                    </div>
                  );
                })() : null}
                <div data-testid="mesh-analysis-result-metadata" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, display: "grid", gap: 4, fontSize: 10 }}>
                  <div style={{ color: "#475569", fontWeight: 850, textTransform: "uppercase" }}>Computation</div>
                  {meshActiveAnalysisResult.metadata.map((entry) => (
                    <div key={`active-result-meta-${entry.label}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: "#64748b" }}>{entry.label}</span>
                      <strong style={{ textAlign: "right", overflowWrap: "anywhere" }}>{entry.value}</strong>
                    </div>
                  ))}
                </div>
                <div data-testid="mesh-analysis-result-provenance" style={{ borderTop: "1px solid #e2e8f0", marginTop: 7, paddingTop: 7, display: "grid", gap: 4, fontSize: 10 }}>
                  <div style={{ color: "#475569", fontWeight: 850, textTransform: "uppercase" }}>Provenance</div>
                  {meshActiveAnalysisResult.provenance.map((entry) => (
                    <div key={`active-result-provenance-${entry.label}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: "#64748b" }}>{entry.label}</span>
                      <strong style={{ textAlign: "right", overflowWrap: "anywhere" }}>{entry.value}</strong>
                    </div>
                  ))}
                </div>
                <div data-testid="mesh-analysis-result-warnings" style={{ borderTop: "1px solid #e2e8f0", marginTop: 7, paddingTop: 7, display: "grid", gap: 4, fontSize: 10 }}>
                  <div style={{ color: "#475569", fontWeight: 850, textTransform: "uppercase" }}>Warnings</div>
                  {meshActiveAnalysisResult.warnings.length
                    ? meshActiveAnalysisResult.warnings.map((warning) => <div key={warning} style={{ color: "#92400e" }}>! {warning}</div>)
                    : <div style={{ color: "#166534" }}>None</div>}
                </div>
              </div>
            )}
            {renderMeshBenchmarkVerification()}

            <div style={inspectorSectionCard}>
              <div style={inspectorSectionTitle}>{meshAnalysisActive ? "Scientific results" : "Analyze by feature"}</div>
              {showDetailedResultsCards && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setAnalysisResultsView("show-all")}
                    style={pill(analysisResultsView === "show-all")}
                    aria-pressed={analysisResultsView === "show-all"}
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisResultsView("current-screen")}
                    style={pill(analysisResultsView === "current-screen")}
                    aria-pressed={analysisResultsView === "current-screen"}
                  >
                    For your current screen
                  </button>
                </div>
              )}
              <div style={{ fontSize: 11, display: "grid", gap: 8 }}>
                <div>
                  <strong>Computed:</strong> {meshAnalysisReadyCount} ready / {meshAnalysisFeatureRows.length} features
                  {meshAnalysisRequestedCount < meshAnalysisFeatureRows.length
                    ? `, ${meshAnalysisFeatureRows.length - meshAnalysisRequestedCount} on demand`
                    : ""}
                </div>
                {renderMeshAnalysisFeatureStatus("mesh-analysis-feature-status")}
                <div><strong>Warnings:</strong> {diagnosticsWarningCount}</div>
              </div>
            </div>

            {showFocusedResultCard && (
              <div style={inspectorSectionCard}>
                <div style={inspectorSectionTitle}>Focused result: {focusedResult.title}</div>
                <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                  <div><strong>Status:</strong> {focusedResult.status}</div>
                  {focusedResult.rows.map((row) => (
                    <div key={`focused-result-row-${row.label}`}>
                      <strong>{row.label}:</strong> {row.value}
                    </div>
                  ))}
                  <div><strong>Next action:</strong></div>
                  <div>{focusedResult.nextAction}</div>
                </div>
              </div>
            )}

            <div style={inspectorSectionCard}>
              <div style={inspectorSectionTitle}>Numerical summaries</div>
              <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                <div><strong>K range:</strong> {formatRange(curvatureRanges.K)}</div>
                <div><strong>H range:</strong> {formatRange(curvatureRanges.H)}</div>
                <div><strong>k1 / k2 range:</strong> {formatRange(curvatureRanges.k1)} / {formatRange(curvatureRanges.k2)}</div>
                {meshDifferentialGeometrySummary && (
                  <>
                    <div data-testid="mesh-differential-geometry-valid-count">
                      <strong>Valid curvature vertices:</strong> {meshDifferentialGeometrySummary.validVertexCount.toLocaleString()} / {meshDifferentialGeometrySummary.vertexCount.toLocaleString()}
                    </div>
                    <div data-testid="mesh-differential-geometry-direction-count">
                      <strong>Fitted principal directions:</strong> {meshDifferentialGeometrySummary.directionValidVertexCount.toLocaleString()}
                    </div>
                    <div data-testid="mesh-differential-geometry-warning-counts">
                      <strong>Uncertainty masks:</strong> {meshDifferentialGeometrySummary.boundaryVertexCount.toLocaleString()} boundary · {meshDifferentialGeometrySummary.umbilicVertexCount.toLocaleString()} umbilic · {meshDifferentialGeometrySummary.nearlyFlatVertexCount.toLocaleString()} flat · {meshDifferentialGeometrySummary.inconsistentOrientationVertexCount.toLocaleString()} winding
                    </div>
                    <div>
                      <strong>Convention:</strong> barycentric area · π boundary defect · outward-convex H positive
                    </div>
                  </>
                )}
                <div><strong>bad triangles:</strong> {formatInspectorCount(badTriangleCount)}</div>
                <div><strong>boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
                <div><strong>geodesic length:</strong> {geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? fmt(geodesicPathLength) : "n/a"}</div>
                <div><strong>vector field magnitude range:</strong> {formatRange(activeVectorMagnitudeRange)}</div>
                <div><strong>overlay legend:</strong> {overlayLegend || "none active"}</div>
              </div>
            </div>

            {showAllResultsCards && (
              <>
                <div style={inspectorSectionCard}>
                  <div style={inspectorSectionTitle}>Differential geometry</div>
                  <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                    <div><strong>Status:</strong> {differentialGeometryStatus}</div>
                    <div><strong>Samples:</strong> {formatInspectorCount(meshInspectorStats.vertexCount)}</div>
                    <div><strong>k1 range:</strong> {formatRange(curvatureRanges.k1)}</div>
                    <div><strong>k2 range:</strong> {formatRange(curvatureRanges.k2)}</div>
                    <div><strong>H range:</strong> {formatRange(curvatureRanges.H)}</div>
                    <div><strong>K range:</strong> {formatRange(curvatureRanges.K)}</div>
                    <div><strong>Principal directions:</strong> {principalDirectionsStatus}</div>
                    <div><strong>Curvature lines:</strong> {curvatureLinesStatus}</div>
                    <div>
                      <button
                        type="button"
                        onClick={onRebuildCurvatureLines}
                        style={{ padding: "3px 7px", fontSize: 11 }}
                      >
                        Recompute
                      </button>
                    </div>
                  </div>
                </div>

                <div style={inspectorSectionCard}>
                  <div style={inspectorSectionTitle}>Vector calculus</div>
                  <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                    <div><strong>Status:</strong> {vectorCalculusDetailedStatus}</div>
                    <div><strong>Scalar source:</strong> {calculusScalarSourceLabel}</div>
                    <div><strong>Vector source:</strong> {calculusVectorSource || "none"}</div>
                    <div><strong>Last operation:</strong> {vectorCalculusLastOperation}</div>
                    <div><strong>Active vector field:</strong> {activeVectorFieldLabel}</div>
                    <div><strong>Magnitude range:</strong> {formatRange(activeVectorMagnitudeRange)}</div>
                  </div>
                </div>

                <div style={inspectorSectionCard}>
                  <div style={inspectorSectionTitle}>Curvature lines</div>
                  <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                    <div><strong>Status:</strong> {curvatureLinesStatus}</div>
                    <div><strong>Field:</strong> {curvatureLineField}</div>
                    <div><strong>Seed source:</strong> {curvatureSeedSource}</div>
                    <div><strong>Seed density:</strong> {Math.max(1, Math.round(curvatureSeedDensity))}</div>
                    <div><strong>Lines:</strong> {curvatureLineCountLabel}</div>
                    <div><strong>Average length:</strong> n/a</div>
                    <div><strong>Stopped at boundary:</strong> n/a</div>
                    <div><strong>Stopped near singularity:</strong> n/a</div>
                    <div><strong>Max steps:</strong> {Math.max(1, Math.round(curvatureMaxSteps))}</div>
                  </div>
                </div>

                <div style={inspectorSectionCard}>
                  <div style={inspectorSectionTitle}>Mesh quality</div>
                  <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                    <div><strong>Status:</strong> {meshQualityStatus}</div>
                    <div><strong>Bad triangles:</strong> {formatInspectorCount(badTriangleCount)}</div>
                    <div><strong>Boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
                    <div><strong>Non-manifold edges:</strong> {formatInspectorCount(topologyNonManifoldEdgeCount)}</div>
                    <div><strong>Min angle:</strong> n/a</div>
                    <div><strong>Max aspect ratio:</strong> {meshQualityReport?.metrics.aspectRatio.max != null ? fmt(meshQualityReport.metrics.aspectRatio.max) : "n/a"}</div>
                  </div>
                </div>

                <div style={inspectorSectionCard}>
                  <div style={inspectorSectionTitle}>Topology diagnostics</div>
                  <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                    <div><strong>Status:</strong> {topologyDiagnosticsStatus}</div>
                    <div><strong>Connected components:</strong> {formatInspectorCount(meshInspectorStats.connectedComponentCount)}</div>
                    <div><strong>Edges:</strong> {formatInspectorCount(meshTopologyDetails?.edgeCount ?? null)}</div>
                    <div><strong>Boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
                    <div><strong>Non-manifold edges:</strong> {formatInspectorCount(topologyNonManifoldEdgeCount)}</div>
                    <div><strong>Boundary loops:</strong> {topologyBoundaryLoopsLabel}</div>
                    <div><strong>Euler characteristic χ:</strong> {topologyEulerCharacteristic != null && Number.isFinite(topologyEulerCharacteristic) ? fmt(topologyEulerCharacteristic) : "n/a"}</div>
                    <div><strong>Orientability:</strong> {topologyOrientabilityLabel}</div>
                    {renderTopologyDetails("mesh-results-topology")}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {inspectorPanelTab === "diagnostics" && (
          <div data-testid="mesh-inspector-diagnostics-card" style={inspectorSectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={inspectorSectionTitle}>Diagnostics</div>
              <span
                style={{
                  border: `1px solid ${meshAnalyzeDiagnostics?.state === "Healthy" ? "#bbf7d0" : meshAnalyzeDiagnostics?.state === "Invalid" ? "#fca5a5" : "#fed7aa"}`,
                  borderRadius: 999,
                  background: meshAnalyzeDiagnostics?.state === "Healthy" ? "#f0fdf4" : meshAnalyzeDiagnostics?.state === "Invalid" ? "#fef2f2" : "#fff7ed",
                  color: meshAnalyzeDiagnostics?.state === "Healthy" ? "#166534" : meshAnalyzeDiagnostics?.state === "Invalid" ? "#b42318" : "#9a3412",
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 850,
                }}
              >
                {meshAnalyzeDiagnostics ? meshAnalyzeDiagnostics.state : "not ready"}
              </span>
            </div>
            <div data-testid="mesh-inspector-canonical-health" style={{ border: "1px solid #dbe4ee", borderRadius: 7, background: "#f8fafc", padding: "7px", marginBottom: 9, display: "grid", gap: 4, fontSize: 10 }}>
              <strong>Canonical MeshHealthResult</strong>
              <div><strong>Backend:</strong> {meshAnalyzeDiagnostics?.backend === "hybrid" ? "Math3D + CGAL" : meshAnalyzeDiagnostics?.backend === "cgal" ? "CGAL" : "Math3D"}</div>
              <div><strong>Status:</strong> {meshAnalyzeDiagnostics?.state ?? "not ready"}</div>
              <div><strong>Warnings:</strong> {meshAnalyzeDiagnostics?.warnings.length ? meshAnalyzeDiagnostics.warnings.join("; ") : "none"}</div>
            </div>
            {renderDiagnosticsSeveritySummary()}
            {meshAnalyzeDiagnostics?.cleanMesh && (
              <div
                style={{
                  border: "1px solid #bbf7d0",
                  borderRadius: 7,
                  background: "#f0fdf4",
                  color: "#166534",
                  padding: "6px 7px",
                  fontSize: 11,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                Clean mesh: closed, manifold, watertight.
              </div>
            )}
            {meshAnalyzeDiagnostics?.sphereSeamWarning && (
              <div
                style={{
                  border: "1px solid #fed7aa",
                  borderRadius: 7,
                  background: "#fff7ed",
                  color: "#9a3412",
                  padding: "6px 7px",
                  fontSize: 11,
                  fontWeight: 750,
                  marginBottom: 8,
                }}
              >
                Sphere mesh has open boundary/seam; curvature/topology results may be unreliable.
              </div>
            )}
            {meshAnalyzeDiagnostics?.cleanMesh && (
              <div
                data-testid="mesh-analyze-clean-counts"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                  border: "1px solid #bbf7d0",
                  borderRadius: 7,
                  background: "#f8fff9",
                  padding: "7px",
                  fontSize: 11,
                  color: "#166534",
                  marginBottom: 9,
                }}
              >
                <strong style={{ gridColumn: "1 / -1" }}>Clean counts</strong>
                <button
                  type="button"
                  onClick={onHighlightMeshAnalyzeBoundary}
                  title="No boundary edges: mesh is closed"
                  style={{
                    border: "1px solid #86efac",
                    borderRadius: 999,
                    background: "#dcfce7",
                    color: "#166534",
                    padding: "4px 6px",
                    font: "inherit",
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  Boundary: 0
                </button>
                <button
                  type="button"
                  onClick={onHighlightMeshAnalyzeDuplicates}
                  title="No coincident vertices found"
                  style={{
                    border: "1px solid #86efac",
                    borderRadius: 999,
                    background: "#dcfce7",
                    color: "#166534",
                    padding: "4px 6px",
                    font: "inherit",
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  Coincident: 0
                </button>
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px 8px",
                fontSize: 11,
                color: "#334155",
                marginBottom: 10,
              }}
            >
              <div>
                <strong>Triangles:</strong>{" "}
                {meshAnalyzeDiagnostics
                  ? meshAnalyzeDiagnostics.trianglesValid
                    ? "valid"
                    : `${meshAnalyzeDiagnostics.invalidFaceCount.toLocaleString()} invalid, ${meshAnalyzeDiagnostics.degenerateTriangleCount.toLocaleString()} degenerate`
                  : "unknown"}
              </div>
              <button
                type="button"
                data-testid="mesh-analyze-diagnostics-boundary-count"
                onClick={onHighlightMeshAnalyzeBoundary}
                disabled={!meshAnalyzeDiagnostics}
                title={
                  meshAnalyzeDiagnostics?.boundaryEdgeCount
                    ? "Highlight boundary edges in the viewport"
                    : "No boundary edges: mesh is closed"
                }
                style={{
                  border: meshAnalyzeDiagnostics?.boundaryEdgeCount ? "1px solid #fed7aa" : "1px solid #bbf7d0",
                  borderRadius: 6,
                  background: meshAnalyzeDiagnostics?.boundaryEdgeCount ? "#fff7ed" : "#f0fdf4",
                  color: meshAnalyzeDiagnostics?.boundaryEdgeCount ? "#9a3412" : "#166534",
                  padding: "3px 5px",
                  textAlign: "left",
                  font: "inherit",
                  cursor: meshAnalyzeDiagnostics ? "pointer" : "default",
                }}
              >
                <strong>Boundary:</strong>{" "}
                {meshAnalyzeDiagnostics
                  ? meshAnalyzeDiagnostics.boundaryEdgeCount === 0
                    ? "0 clean"
                    : meshAnalyzeDiagnostics.boundaryEdgeCount.toLocaleString()
                  : "unknown"}
              </button>
              <div>
                <strong>Non-manifold:</strong>{" "}
                {meshAnalyzeDiagnostics?.nonManifoldEdgeCount.toLocaleString() ?? "unknown"}
              </div>
              <button
                type="button"
                data-testid="mesh-analyze-diagnostics-coincident-count"
                onClick={onHighlightMeshAnalyzeDuplicates}
                disabled={!meshAnalyzeDiagnostics}
                title={
                  meshAnalyzeDiagnostics?.duplicateVertexCount
                    ? "Highlight coincident vertices in the viewport"
                    : "No coincident vertices found"
                }
                style={{
                  border: meshAnalyzeDiagnostics?.duplicateVertexCount ? "1px solid #f5d0fe" : "1px solid #bbf7d0",
                  borderRadius: 6,
                  background: meshAnalyzeDiagnostics?.duplicateVertexCount ? "#fdf4ff" : "#f0fdf4",
                  color: meshAnalyzeDiagnostics?.duplicateVertexCount ? "#86198f" : "#166534",
                  padding: "3px 5px",
                  textAlign: "left",
                  font: "inherit",
                  cursor: meshAnalyzeDiagnostics ? "pointer" : "default",
                }}
              >
                <strong>Coincident:</strong>{" "}
                {meshAnalyzeDiagnostics
                  ? meshAnalyzeDiagnostics.duplicateVertexCount === 0
                    ? "0 clean"
                    : meshAnalyzeDiagnostics.duplicateVertexCount.toLocaleString()
                  : "unknown"}
              </button>
              <div>
                <strong>Euler chi:</strong> {meshAnalyzeDiagnostics?.eulerCharacteristic?.toLocaleString() ?? "unknown"}
              </div>
              <div>
                <strong>Watertight:</strong>{" "}
                {meshAnalyzeDiagnostics?.watertight == null ? "unknown" : meshAnalyzeDiagnostics.watertight ? "yes" : "no"}
              </div>
            </div>
            {meshAnalyzeDiagnostics?.cleanMesh ? (
              <div style={{ fontSize: 11, color: "#166534", fontWeight: 750, display: "grid", gap: 8 }}>
                <span>No repair actions needed.</span>
                <button type="button" onClick={onRecomputeMeshAnalyzeDiagnostics} style={{ fontSize: 11 }}>
                  Recompute diagnostics
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onHighlightMeshAnalyzeBoundary}
                  disabled={!meshAnalyzeDiagnostics?.boundaryEdgeCount}
                  style={{ fontSize: 11 }}
                >
                  Highlight boundary
                </button>
                <button
                  type="button"
                  onClick={onHighlightMeshAnalyzeDuplicates}
                  disabled={!meshAnalyzeDiagnostics?.duplicateVertexCount}
                  style={{ fontSize: 11 }}
                >
                  Highlight duplicates
                </button>
                <button
                  type="button"
                  onClick={onPreviewMeshAnalyzeWeld}
                  disabled={
                    !meshAnalyzeDiagnostics ||
                    (meshAnalyzeDiagnostics.boundaryEdgeCount <= 0 && meshAnalyzeDiagnostics.duplicateVertexCount <= 0)
                  }
                  style={{ fontSize: 11 }}
                >
                  Weld preview
                </button>
                <button type="button" onClick={onRecomputeMeshAnalyzeDiagnostics} style={{ fontSize: 11 }}>
                  Recompute diagnostics
                </button>
              </div>
            )}
            {renderDiagnosticsErrors()}
            {renderDiagnosticsWarnings()}
            <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10, display: "grid", gap: 8 }}>
              <div style={inspectorSectionTitle}>Backend and validation</div>
              <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
                <div><strong>Worker:</strong> {cgalHealthState?.ok ? "available" : cgalHealthState?.error ?? "unknown"}</div>
                <div><strong>Last operation status:</strong> {meshLastOperation?.status ?? "none"}</div>
                <div><strong>Warnings:</strong> {diagnosticsWarningCount.toLocaleString()}</div>
                <div><strong>Errors:</strong> {diagnosticsErrorCount.toLocaleString()}</div>
                <div>
                  <strong>Boolean blockers:</strong>{" "}
                  {meshDiagnosticsValidationBlockers.length
                    ? meshDiagnosticsValidationBlockers.join(", ")
                    : "none"}
                </div>
                <div>
                  <strong>Worker log:</strong>{" "}
                  {cgalHealthState?.logsPath ? (
                    <a
                      href={`file:///${String(cgalHealthState.logsPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      open log
                    </a>
                  ) : (
                    "n/a"
                  )}
                </div>
              </div>
            </div>
            {isDevMode && (
              <div
                data-testid="mesh-developer-diagnostics-card"
                style={{
                  borderTop: "1px solid #e2e8f0",
                  marginTop: 10,
                  paddingTop: 10,
                  display: "grid",
                  gap: 7,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={inspectorSectionTitle}>Developer</div>
                  <span
                    style={{
                      color: meshDebugMemory?.warning ? "#b42318" : cgalHealthState?.ok ? "#166534" : "#92400e",
                      fontSize: 10,
                      fontWeight: 850,
                    }}
                  >
                    {meshDebugMemory?.warning ? "memory warning" : cgalHealthState?.ok ? "worker ready" : "worker unavailable"}
                  </span>
                </div>
                <div style={{ color: "#475467", fontSize: 11 }}>
                  Worker {cgalHealthState?.ok ? "ready" : "unavailable"} · RSS{" "}
                  {meshDebugMemory?.workingSetGb != null ? `${meshDebugMemory.workingSetGb.toFixed(2)} GB` : "n/a"}
                </div>
                <div>
                  <button type="button" data-testid="mesh-open-developer-diagnostics" onClick={onOpenMeshDeveloperDiagnostics}>
                    Open developer diagnostics
                  </button>
                </div>
              </div>
            )}
            <details style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10 }}>
              <summary
                data-testid="mesh-inspector-diagnostics-raw-topology-toggle"
                style={{ cursor: "pointer", fontWeight: 850, fontSize: 12 }}
              >
                Raw topology details
              </summary>
              <div style={{ marginTop: 8 }}>{renderTopologyDetails("mesh-inspector-diagnostics-topology")}</div>
            </details>
            {isDevMode && (
              <details style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 850, fontSize: 12 }}>Runtime performance and debug</summary>
                <div style={{ fontSize: 11, display: "grid", gap: 6, marginTop: 8 }}>
                  <div><strong>Mode:</strong> {meshPerformanceModeLabel}</div>
                  {activeMeshPerformancePresetLabel && (
                    <div><strong>Benchmark:</strong> {activeMeshPerformancePresetLabel}</div>
                  )}
                  <div><strong>FPS:</strong> {formatPerfMetric(surfacePerformanceSnapshot?.fps ?? null, 1)}</div>
                  <div><strong>Frame time:</strong> {formatPerfMetric(surfacePerformanceSnapshot?.frameTimeMs ?? null, 1)} ms</div>
                  <div><strong>Draw calls:</strong> {formatInspectorCount(surfacePerformanceSnapshot?.drawCalls ?? null)}</div>
                  <div><strong>GPU estimate:</strong> {surfacePerformanceSnapshot?.gpuMemoryEstimateLabel ?? formatBenchmarkBytes(meshDebugMemory?.gpuEstimateBytes)}</div>
                  <div data-testid="mesh-debug-monitor">
                    <strong>Stalls:</strong> {meshDebugMonitor.stallCount.toLocaleString()}
                    {" | "}
                    <strong>Worst:</strong> {formatPerfMetric(meshDebugMonitor.worstStallMs, 1)} ms
                    {" | "}
                    <strong>Events:</strong> {meshDebugMonitor.events.length.toLocaleString()}
                  </div>
                  {meshPipelineProfile && (
                    <div data-testid="mesh-pipeline-profile">
                      <strong>Pipeline:</strong> {meshPipelineProfile.status} · first frame{" "}
                      {formatPerfMetric(meshPipelineProfile.firstFrameMs, 1)} ms · total{" "}
                      {formatPerfMetric(meshPipelineProfileElapsedMs, 1)} ms
                    </div>
                  )}
                  {(meshBenchmarkPerformanceSuite.status || meshBenchmarkPerformanceSuite.results.length > 0) && (
                    <div data-testid="mesh-benchmark-performance-suite">
                      <strong>Performance suite:</strong> {meshBenchmarkPerformanceSuite.status ?? `${meshBenchmarkPerformanceSuite.results.length} result(s)`}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={copyMeshPipelineProfile} disabled={!meshPipelineProfile}>
                      Copy pipeline trace
                    </button>
                    <button type="button" onClick={copyMeshDebugTrace}>
                      Copy debug trace
                    </button>
                    <button type="button" onClick={onClearMeshDebugMonitor}>
                      Clear debug trace
                    </button>
                    <button type="button" onClick={onRunMeshBenchmarkPerformanceSuite} disabled={meshBenchmarkPerformanceSuite.running}>
                      Run Performance Suite
                    </button>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {inspectorPanelTab === "history" && (
          <div data-testid="mesh-inspector-history-card" style={inspectorSectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={inspectorSectionTitle}>Mesh History</div>
              <span style={{ color: "#64748b", fontSize: 10 }}>
                {(meshAnalysisComputationHistory.length + meshOperationHistory.length + surfaceMeshTopologyHistory.length).toLocaleString()} event{meshAnalysisComputationHistory.length + meshOperationHistory.length + surfaceMeshTopologyHistory.length === 1 ? "" : "s"}
              </span>
            </div>
            <details open data-testid="mesh-analysis-computation-history" style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 850, color: "#0f172a" }}>
                Analysis computations · {meshAnalysisComputationHistory.length}
              </summary>
              {meshAnalysisComputationHistory.length ? (
                <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    {meshAnalysisComputationHistory.slice(0, 16).map((record, index) => {
                      const isStale = record.state === "stale";
                      return (
                        <button
                          key={record.id}
                          type="button"
                          data-testid={`mesh-analysis-history-entry-${index}`}
                          data-state={record.state}
                          onClick={() => setSelectedAnalysisComputationId(record.id)}
                          style={{ border: `1px solid ${isStale ? "#fcd34d" : "#bfdbfe"}`, borderRadius: 6, background: selectedAnalysisComputation?.id === record.id ? "#eff6ff" : "#fff", padding: "6px 7px", textAlign: "left", fontSize: 10 }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 7 }}>
                            <strong>{record.kind}{record.variant === "default" ? "" : ` · ${record.variant}`}</strong>
                            <span style={{ color: isStale ? "#92400e" : "#166534", fontWeight: 850 }}>{isStale ? "STALE" : record.state.toUpperCase()}</span>
                          </div>
                          <div style={{ color: "#64748b", marginTop: 2 }}>{record.backend} · {record.durationMs == null ? "duration n/a" : formatSummaryTime(record.durationMs)} · {new Date(record.timestamp).toLocaleString()}</div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedAnalysisComputation && (
                    <div data-testid="mesh-analysis-history-detail" style={{ border: `1px solid ${selectedAnalysisComputation.state === "stale" ? "#fcd34d" : "#cbd5e1"}`, borderRadius: 7, background: selectedAnalysisComputation.state === "stale" ? "#fffbeb" : "#f8fafc", padding: 7, display: "grid", gap: 4, fontSize: 10 }}>
                      {selectedAnalysisComputation.state === "stale" && <strong style={{ color: "#92400e" }}>STALE SNAPSHOT — inspectable, but not used by the viewport</strong>}
                      <div><strong>Status:</strong> {selectedAnalysisComputation.state}</div>
                      <div><strong>Backend:</strong> {selectedAnalysisComputation.backend}</div>
                      <div><strong>Duration:</strong> {selectedAnalysisComputation.durationMs == null ? "n/a" : formatSummaryTime(selectedAnalysisComputation.durationMs)}</div>
                      <div><strong>Timestamp:</strong> {new Date(selectedAnalysisComputation.timestamp).toLocaleString()}</div>
                      <div><strong>Revision:</strong> {selectedAnalysisComputation.identity.revision}</div>
                      <div><strong>Parameters:</strong> {JSON.stringify(selectedAnalysisComputation.parameters)}</div>
                      <div><strong>Dependencies:</strong> {selectedAnalysisComputation.dependencies.length ? selectedAnalysisComputation.dependencies.map((dependency) => `${dependency.kind}:${dependency.state}`).join(", ") : "none"}</div>
                      <div><strong>Result summary:</strong> {Object.keys(selectedAnalysisComputation.payloadSummary).length ? JSON.stringify(selectedAnalysisComputation.payloadSummary) : "no scalar summary"}</div>
                      {selectedAnalysisComputation.error && <div style={{ color: "#b42318" }}><strong>Error:</strong> {selectedAnalysisComputation.error}</div>}
                    </div>
                  )}
                </div>
              ) : <div style={{ color: "#64748b", fontSize: 10, marginTop: 6 }}>No analysis computations recorded yet.</div>}
            </details>
            {surfaceMeshTopologyHistory.length > 0 && (
              <details open data-testid="mesh-topology-provenance-timeline" style={{ marginBottom: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 850, color: "#0f172a" }}>
                  Topology edits · {surfaceMeshTopologyHistory.length}
                </summary>
                <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
                  {surfaceMeshTopologyHistory.slice(0, 12).map((entry, index) => (
                    <div
                      key={`mesh-inspector-topology-history-${entry.id}`}
                      style={{ border: "1px solid #bfdbfe", borderRadius: 7, background: "#fff", padding: "7px", display: "grid", gap: 4, fontSize: 11 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>{entry.actionLabel}</strong>
                        {index === 0 && <span style={{ color: "#166534", fontSize: 10, fontWeight: 850 }}>current</span>}
                      </div>
                      <div style={{ color: "#475569" }}>Input: {entry.targetLabel} · {entry.paramsLabel}</div>
                      <div style={{ color: "#475569" }}>
                        Output: {entry.resultLabel} · {entry.beforeCounts.vertexCount.toLocaleString()} → {entry.afterCounts.vertexCount.toLocaleString()} vertices · {entry.beforeCounts.faceCount.toLocaleString()} → {entry.afterCounts.faceCount.toLocaleString()} faces
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => onPreviewSurfaceMeshTopologyHistoryEntry(entry.id, "before")}>Preview before</button>
                        <button type="button" onClick={() => onPreviewSurfaceMeshTopologyHistoryEntry(entry.id, "after")}>Preview after</button>
                        <button type="button" onClick={() => onPreviewSurfaceMeshTopologyHistoryEntry(entry.id, "after")}>Compare</button>
                        <button type="button" onClick={() => onRestoreSurfaceMeshTopologyHistoryEntry(entry.id)}>Restore</button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {meshOperationHistory.length > 0 && (
              <details open data-testid="mesh-operation-provenance-graph" style={{ marginBottom: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 850, color: "#0f172a" }}>
                  Operation provenance
                </summary>
                <div style={{ display: "grid", gap: 0, marginTop: 7, fontSize: 11 }}>
                  <div
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      background: "#f8fafc",
                      padding: "6px 7px",
                      color: "#334155",
                    }}
                  >
                    <strong>Source</strong> · {meshOperationHistory[meshOperationHistory.length - 1]?.request?.inputs.join(" + ") || meshSummaryTitle}
                  </div>
                  {meshOperationHistory
                    .slice(0, 12)
                    .slice()
                    .reverse()
                    .map((entry, index, chain) => {
                      const isCurrent = index === chain.length - 1 && !entry.undoneAt;
                      const inputCount = entry.request?.inputs.length ?? 0;
                      const parentCount = entry.parentEntryIds?.length ?? 0;
                      return (
                        <React.Fragment key={`mesh-operation-provenance-node-${entry.id}`}>
                          <div style={{ height: 10, borderLeft: "2px solid #94a3b8", marginLeft: 14 }} />
                          <button
                            type="button"
                            data-testid={`mesh-operation-provenance-node-${entry.id}`}
                            data-parent-count={parentCount}
                            onClick={() => onPreviewMeshOperationHistoryEntry(entry.id, "after")}
                            disabled={!entry.topologyHistoryEntryId}
                            title={entry.topologyHistoryEntryId ? "Preview this operation result" : "No preview snapshot is available"}
                            style={{
                              appearance: "none",
                              width: "100%",
                              textAlign: "left",
                              border: `1px solid ${isCurrent ? "#86efac" : "#bfdbfe"}`,
                              borderRadius: 6,
                              background: isCurrent ? "#f0fdf4" : "#eff6ff",
                              padding: "6px 7px",
                              color: "#0f3557",
                              opacity: entry.topologyHistoryEntryId ? 1 : 0.72,
                              cursor: entry.topologyHistoryEntryId ? "pointer" : "default",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                              <strong>{entry.result.label}</strong>
                              {isCurrent && <span style={{ color: "#166534", fontSize: 10, fontWeight: 850 }}>current</span>}
                            </div>
                            <div style={{ color: "#475569", marginTop: 2 }}>
                              {inputCount > 1
                                ? `Inputs: ${entry.request?.inputs.join(" + ")}`
                                : entry.request?.inputs[0]
                                  ? `from ${entry.request.inputs[0]}`
                                  : "operation result"}
                              {parentCount > 0 ? ` · depends on ${parentCount} earlier result${parentCount === 1 ? "" : "s"}` : ""}
                              {entry.undoneAt ? " · undone" : ""}
                            </div>
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>
              </details>
            )}
            <div style={{ fontSize: 11, display: "grid", gap: 8 }}>
              {meshOperationHistory.length === 0 ? (
                <div style={{ color: "#64748b" }}>No mesh operations yet.</div>
              ) : (
                meshOperationHistory.slice(0, 8).map((entry, index) => {
                  const isLatest = index === 0;
                  const entryVerdict =
                    entry.undoneAt
                      ? "Undone"
                      : entry.result.repairValidation?.verdict === "improved"
                        ? "Improved"
                        : entry.result.repairValidation?.verdict === "needs-review" || entry.result.status === "warning"
                          ? "Needs review"
                          : entry.result.status === "error"
                            ? "Failed"
                            : "Complete";
                  const verdictTone =
                    entryVerdict === "Improved" || entryVerdict === "Complete"
                      ? meshHealthToneForState("pass")
                      : entryVerdict === "Failed"
                        ? meshHealthToneForState("fail")
                        : meshHealthToneForState("warn");
                  return (
                    <div
                      key={`mesh-inspector-operation-history-${entry.id}`}
                      style={{
                        border: `1px solid ${verdictTone.border}`,
                        borderRadius: 7,
                        background: entry.undoneAt ? "#f8fafc" : "#ffffff",
                        padding: "7px",
                        display: "grid",
                        gap: 5,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{meshOperationHistory.length - index}</span>
                          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.result.label}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isLatest && !entry.undoneAt && <span style={{ color: "#166534", fontSize: 10, fontWeight: 850 }}>current</span>}
                          <span
                            style={{
                              border: `1px solid ${verdictTone.border}`,
                              borderRadius: 999,
                              background: verdictTone.background,
                              color: verdictTone.color,
                              padding: "2px 7px",
                              fontSize: 10,
                              fontWeight: 850,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entryVerdict}
                          </span>
                        </div>
                      </div>
                      <div>
                        {formatSummaryTime(entry.result.durationMs)} · {entry.result.beforeFaces.toLocaleString()} {"->"}{" "}
                        {entry.result.afterFaces == null ? "n/a" : entry.result.afterFaces.toLocaleString()} faces
                      </div>
                      <div style={{ color: "#64748b" }}>
                        {entry.result.beforeVertices.toLocaleString()} {"->"}{" "}
                        {entry.result.afterVertices == null ? "n/a" : entry.result.afterVertices.toLocaleString()} vertices
                      </div>
                      <div style={{ color: "#64748b" }}>
                        <strong>Inputs:</strong> {entry.request?.inputs.join(" + ") || entry.result.sourceIds.join(" + ") || "active mesh"}
                        {" · "}<strong>Output:</strong> {entry.outputLabel ?? entry.result.label}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          data-testid={`mesh-history-preview-before-${entry.id}`}
                          onClick={() => onPreviewMeshOperationHistoryEntry(entry.id, "before")}
                          disabled={!entry.topologyHistoryEntryId}
                        >
                          Preview before
                        </button>
                        <button
                          type="button"
                          data-testid={`mesh-history-preview-after-${entry.id}`}
                          onClick={() => onPreviewMeshOperationHistoryEntry(entry.id, "after")}
                          disabled={!entry.topologyHistoryEntryId}
                        >
                          Preview after
                        </button>
                        <button
                          type="button"
                          data-testid={`mesh-history-restore-${entry.id}`}
                          onClick={() => onRestoreMeshOperationHistoryEntry(entry.id)}
                          disabled={Boolean(entry.undoneAt) || !entry.topologyHistoryEntryId}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => entry.topologyHistoryEntryId && onPreviewSurfaceMeshTopologyHistoryEntry(entry.topologyHistoryEntryId, "after")}
                          disabled={!entry.topologyHistoryEntryId}
                          title="Show the result with its input mesh"
                        >
                          Compare
                        </button>
                        {isLatest && (
                          <button
                            type="button"
                            onClick={() => void onValidateLastMeshOperationResult()}
                            disabled={entry.result.status === "error"}
                          >
                            Validate
                          </button>
                        )}
                        {isLatest && (
                          <button
                            type="button"
                            onClick={onUndoLatestMeshOperation}
                            disabled={!canUndoLatestMeshOperation}
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        {inspectorPanelTab === "provenance" && (
          <div data-testid="mesh-inspector-provenance" style={inspectorSectionCard}>
            <strong>Provenance</strong>
            <div>Source: {meshSummarySourceLabel}</div>
            <div>Kernel document: {meshKernelDocument?.identity.id ?? "not available"}</div>
            <div>Revision: {meshKernelDocument?.identity.revision ?? "n/a"}</div>
            {meshWorkspaceSelectedProvenanceEntry && <div>Latest operation: {meshWorkspaceSelectedProvenanceEntry.result.label}</div>}
          </div>
        )}
      </SharedInspectorShell>
    );
  }


  return (
    <section>
      <h2 style={styles.h2}>INSPECTOR</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {inspectorTabs.map((tab) => (
          <button
            key={`inspector-tab-${tab.id}`}
            type="button"
            onClick={() => setInspectorPanelTab(tab.id)}
            style={pill(inspectorPanelTab === tab.id)}
            aria-pressed={inspectorPanelTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {inspectorPanelTab === "object" && (
        <>
      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Object</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Name:</strong> {activeMeta.label}</div>
          <div><strong>Type:</strong> {viewSourceKind}</div>
          <div><strong>Formula/source:</strong> {sourceEquation || activeMeta.formula || "n/a"}</div>
          <div>
            <strong>Domain:</strong>{" "}
            {isGraphViewer
              ? `x in ±${fmt(safeGraphDomain.xSpan)}, y in ±${fmt(safeGraphDomain.ySpan)}`
              : isParamViewer
                ? `u in [${fmt(safeParamDomain.uMin)}, ${fmt(safeParamDomain.uMax)}], v in [${fmt(safeParamDomain.vMin)}, ${fmt(safeParamDomain.vMax)}]`
                : isImplicitViewer
                  ? `x in ±${fmt(safeImplicitDomain.xSpan)}, y in ±${fmt(safeImplicitDomain.ySpan)}`
                  : "mesh domain"}
          </div>
          <div><strong>Resolution:</strong> {Math.round(activeResolution)}</div>
          <div>
            <strong>Vertices / Faces:</strong>{" "}
            {formatInspectorCount(meshInspectorStats.vertexCount)} / {formatInspectorCount(meshInspectorStats.faceCount)}
          </div>
          <div><strong>Source mode:</strong> {identitySourceKind}</div>
        </div>
      </div>

      {/* Identity */}
      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Identity</div>
        <div style={{ fontSize: 12, opacity: 0.82 }}>Active surface</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{activeMeta.label}</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 6 }}>Type: {viewSourceKind}</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>Source: {identitySourceKind}</div>
        {isMeshViewer && surfaceMeshStats && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            {surfaceMeshStats.vertCount.toLocaleString()} verts · {surfaceMeshStats.triCount.toLocaleString()} tris
            {surfaceMeshSource ? ` · ${formatSurfaceMeshSource(surfaceMeshSource)}` : ""}
          </div>
        )}
      </div>

      {(meshLastOperation || meshOperationError) && (
        <div style={inspectorSectionCard}>
          <div style={inspectorSectionTitle}>Mesh Operation Result</div>
          {meshLastOperation ? (
            <div style={{ fontSize: 11, display: "grid", gap: 5 }}>
              <div><strong>Operation:</strong> {meshLastOperation.label}</div>
              <div><strong>Method:</strong> {meshOperationMethodLabel}</div>
              <div><strong>Status:</strong> {meshLastOperation.status}</div>
              <div><strong>Before:</strong> {meshLastOperation.beforeFaces.toLocaleString()} faces</div>
              <div>
                <strong>After:</strong>{" "}
                {meshLastOperation.afterFaces == null ? "n/a" : `${meshLastOperation.afterFaces.toLocaleString()} faces`}
              </div>
              <div><strong>Duration:</strong> {formatSummaryTime(meshLastOperation.durationMs)}</div>
              <div><strong>Output:</strong> {meshLastOperation.outputMode}</div>
              <div>
                <strong>Warnings:</strong>{" "}
                {meshLastOperation.warnings.length > 0 ? meshLastOperation.warnings.join("; ") : "none"}
              </div>
              {meshLastOperation.errors.length > 0 && (
                <div style={{ color: "#b42318" }}>
                  <strong>Errors:</strong> {meshLastOperation.errors.join("; ")}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.75 }}>No mesh operation has completed yet.</div>
          )}
          {meshOperationError && (
            <div style={{ marginTop: 7, fontSize: 11, color: "#b42318" }}>
              Last operation error: {meshOperationError}
            </div>
          )}
        </div>
      )}

      <div style={workflowCardStyle("equation", "parse")}>
        <div style={inspectorSectionTitle}>Definition</div>
        <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Equation", "equation", "parse")}</div>
        <div style={{ fontSize: 12, opacity: 0.82 }}>{activeMeta.formula}</div>
        <div style={{ fontSize: 11, opacity: 0.82, marginTop: 6 }}>
          <strong>Parameters:</strong> {definitionParameters}
        </div>
        <div style={{ fontSize: 11, opacity: 0.82, marginTop: 4, wordBreak: "break-word" }}>
          <strong>Source equation:</strong> {sourceEquation || "n/a"}
        </div>
        {!isImplicitViewer && (
          <div style={{ fontSize: 11, opacity: 0.78, marginTop: 6 }}>
            {activeMeta.note}
          </div>
        )}
        {isImplicitViewer && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 6 }}>Implicit formula</div>
            <input
              data-testid="surface-input"
              type="text"
              value={implicitExpr}
              onChange={(e) => onChangeImplicitExpr(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>

      {(showDomainPicker || isImplicitViewer) && (
        <div id="surfaces-inspector-domain-card" tabIndex={-1} style={workflowCardStyle("domain")}>
          <div style={inspectorSectionTitle}>Domain</div>
          <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Domain", "domain")}</div>
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            <strong>Resolution:</strong> {Math.round(activeResolution)}
          </div>
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            <strong>Preview resolution:</strong> {previewResolutionLabel}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="range"
              min={8}
              max={220}
              step={1}
              value={Math.max(8, Math.min(220, Math.round(activeResolution)))}
              onChange={(e) => {
                const next = Math.max(8, Math.min(220, Number(e.target.value)));
                if (!Number.isFinite(next)) return;
                if (isGraphViewer) onSetGraphResolution(next);
                else if (isWeierstrass) onSetWeierstrassResolution(next);
                else if (isParamViewer) onSetParamResolution(next);
              }}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={8}
              max={220}
              step={1}
              value={Math.max(8, Math.min(220, Math.round(activeResolution)))}
              onChange={(e) => {
                const next = Math.max(8, Math.min(220, Number(e.target.value)));
                if (!Number.isFinite(next)) return;
                if (isGraphViewer) onSetGraphResolution(next);
                else if (isWeierstrass) onSetWeierstrassResolution(next);
                else if (isParamViewer) onSetParamResolution(next);
              }}
              style={{ width: 72 }}
            />
          </div>
          {isImplicitViewer && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
              Implicit preview resolution is controlled in Definition/Analysis tools.
            </div>
          )}
          {isGraphViewer && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
              x span: ±{fmt(safeGraphDomain.xSpan)} · y span: ±{fmt(safeGraphDomain.ySpan)}
            </div>
          )}
          {isParamViewer && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
              u in [{fmt(safeParamDomain.uMin)}, {fmt(safeParamDomain.uMax)}], v in [{fmt(safeParamDomain.vMin)}, {fmt(safeParamDomain.vMax)}]
            </div>
          )}
          {isImplicitViewer && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
              x span: ±{fmt(safeImplicitDomain.xSpan)} · y span: ±{fmt(safeImplicitDomain.ySpan)}
            </div>
          )}
        </div>
      )}

      {(showDomainPicker || isImplicitViewer) && (
        <div style={workflowCardStyle("domain")}>
          <div style={inspectorSectionTitle}>Domain bounds</div>
          <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Domain", "domain")}</div>
          {isGraphViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  x span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeGraphDomain.xSpan}
                    onChange={(e) =>
                      onChangeGraphDomain({
                        ...safeGraphDomain,
                        xSpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  y span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeGraphDomain.ySpan}
                    onChange={(e) =>
                      onChangeGraphDomain({
                        ...safeGraphDomain,
                        ySpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                    onClick={() => onChangeGraphDomain(getDefaultGraphSpan(surfaceId))}
                    style={{ padding: "4px 8px" }}
                  >
                  Reset
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={graphDomainLabel}
                    onChange={(e) => setGraphDomainLabel(e.target.value)}
                    style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveGraphDomainPreset(graphDomainLabel);
                      setGraphDomainLabel("");
                    }}
                    style={{ padding: "4px 8px" }}
                  >
                    Save
                  </button>
                </div>
                {graphDomainPresets.filter((p) => p.surfaceId === surfaceId).length === 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {graphDomainPresets
                      .filter((p) => p.surfaceId === surfaceId)
                      .map((p) => (
                        <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button type="button" onClick={() => onApplyGraphDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                            {p.label}
                          </button>
                          <button type="button" onClick={() => onRemoveGraphDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
          {isParamViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  u min
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.uMin}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, uMin: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  u max
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.uMax}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, uMax: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  v min
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.vMin}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, vMin: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  v max
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.vMax}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, vMax: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onChangeParamDomain({ ...paramDefaults })}
                  style={{ padding: "4px 8px" }}
                >
                  Reset
                </button>
              </div>
              {viewerKind === "param" && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      placeholder="Label (optional)"
                      value={paramDomainLabel}
                      onChange={(e) => setParamDomainLabel(e.target.value)}
                      style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSaveParamDomainPreset(paramDomainLabel);
                        setParamDomainLabel("");
                      }}
                      style={{ padding: "4px 8px" }}
                    >
                      Save
                    </button>
                  </div>
                  {paramDomainPresets.filter((p) => p.surfaceId === paramId).length === 0 ? (
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                      {paramDomainPresets
                        .filter((p) => p.surfaceId === paramId)
                        .map((p) => (
                          <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button type="button" onClick={() => onApplyParamDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                              {p.label}
                            </button>
                            <button type="button" onClick={() => onRemoveParamDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                              Remove
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {isImplicitViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  x span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeImplicitDomain.xSpan}
                    onChange={(e) =>
                      onChangeImplicitDomain({
                        ...safeImplicitDomain,
                        xSpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  y span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeImplicitDomain.ySpan}
                    onChange={(e) =>
                      onChangeImplicitDomain({
                        ...safeImplicitDomain,
                        ySpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onChangeImplicitDomain(getDefaultImplicitDomain(surfaceId))}
                  style={{ padding: "4px 8px" }}
                >
                  Reset
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={implicitDomainLabel}
                    onChange={(e) => setImplicitDomainLabel(e.target.value)}
                    style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveImplicitDomainPreset(implicitDomainLabel);
                      setImplicitDomainLabel("");
                    }}
                    style={{ padding: "4px 8px" }}
                  >
                    Save
                  </button>
                </div>
                {implicitDomainPresets.filter((p) => p.surfaceId === surfaceId).length === 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {implicitDomainPresets
                      .filter((p) => p.surfaceId === surfaceId)
                      .map((p) => (
                        <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button type="button" onClick={() => onApplyImplicitDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                            {p.label}
                          </button>
                          <button type="button" onClick={() => onRemoveImplicitDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                Affects the sampling box for marching-cubes implicit surfaces (z uses the larger span).
              </div>
            </>
          )}
        </div>
      )}

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Mesh stats</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Vertices:</strong> {formatInspectorCount(meshInspectorStats.vertexCount)}</div>
          <div><strong>Faces:</strong> {formatInspectorCount(meshInspectorStats.faceCount)}</div>
          <div><strong>Edges:</strong> {formatInspectorCount(meshTopologyDetails?.edgeCount ?? null)}</div>
          <div><strong>Boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
          <div><strong>Connected components:</strong> {formatInspectorCount(meshInspectorStats.connectedComponentCount)}</div>
          <div><strong>Non-manifold edges:</strong> {formatInspectorCount(topologyNonManifoldEdgeCount)}</div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Topology details</div>
        {renderTopologyDetails("mesh-inspector-fallback")}
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Analysis status</div>
        <div style={{ fontSize: 11, display: "grid", gap: 8 }}>
          <div>
            <strong>Computed:</strong> {meshAnalysisReadyCount} ready / {meshAnalysisFeatureRows.length} features
          </div>
          {renderMeshAnalysisFeatureStatus("mesh-object-analysis-feature-status")}
          <div><strong>Diagnostics:</strong> {diagnosticsWarningCount} warnings</div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Selected surface point</div>
        <SurfaceProbeResult probeInfo={probeInfo} curvature={selectedProbeCurvature} probeEnabled={probeEnabled} />
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>View</div>
        <div style={{ fontSize: 11, marginBottom: 7 }}><strong>Source kind:</strong> {viewSourceKind}<br /><strong>Viewer:</strong> {viewerKind}</div>
        <SurfaceViewControls lightPreset={lightPreset} onChangeLightPreset={onChangeLightPreset}
          materialRoughness={materialRoughness} onSetMaterialRoughness={onSetMaterialRoughness}
          materialMetalness={materialMetalness} onSetMaterialMetalness={onSetMaterialMetalness}
          materialOpacity={materialOpacity} onSetMaterialOpacity={onSetMaterialOpacity}
          showWireframe={showWireframe} onToggleWireframe={onToggleWireframe} />
      </div>
        </>
      )}

      {inspectorPanelTab === "analysis" && (
        <>
      {renderMeshBenchmarkVerification()}

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Analyze by feature</div>
        {showDetailedResultsCards && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setAnalysisResultsView("show-all")}
              style={pill(analysisResultsView === "show-all")}
              aria-pressed={analysisResultsView === "show-all"}
            >
              Show all
            </button>
            <button
              type="button"
              onClick={() => setAnalysisResultsView("current-screen")}
              style={pill(analysisResultsView === "current-screen")}
              aria-pressed={analysisResultsView === "current-screen"}
            >
              For your current screen
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, display: "grid", gap: 8 }}>
          <div>
            <strong>Computed:</strong> {meshAnalysisReadyCount} ready / {meshAnalysisFeatureRows.length} features
            {meshAnalysisRequestedCount < meshAnalysisFeatureRows.length
              ? `, ${meshAnalysisFeatureRows.length - meshAnalysisRequestedCount} on demand`
              : ""}
          </div>
          {renderMeshAnalysisFeatureStatus("mesh-analysis-feature-status-alt")}
          <div><strong>Topology diagnostics summary:</strong> {topologyDiagnosticsStatus}</div>
          <div><strong>Warnings:</strong> {diagnosticsWarningCount}</div>
        </div>
      </div>

      {showFocusedResultCard && (
      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Focused result: {focusedResult.title}</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {focusedResult.status}</div>
          {focusedResult.rows.map((row) => (
            <div key={`focused-result-row-${row.label}`}>
              <strong>{row.label}:</strong> {row.value}
            </div>
          ))}
          <div><strong>Next action:</strong></div>
          <div>{focusedResult.nextAction}</div>
        </div>
      </div>
      )}

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Numerical summaries</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>K range:</strong> {formatRange(curvatureRanges.K)}</div>
          <div><strong>H range:</strong> {formatRange(curvatureRanges.H)}</div>
          <div><strong>k1 / k2 range:</strong> {formatRange(curvatureRanges.k1)} / {formatRange(curvatureRanges.k2)}</div>
          <div><strong>bad triangles:</strong> {formatInspectorCount(badTriangleCount)}</div>
          <div><strong>boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
          <div><strong>geodesic length:</strong> {geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? fmt(geodesicPathLength) : "n/a"}</div>
          <div><strong>vector field magnitude range:</strong> {formatRange(activeVectorMagnitudeRange)}</div>
        </div>
      </div>

      {showAllResultsCards && (
        <>
      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Differential geometry</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {differentialGeometryStatus}</div>
          <div><strong>Samples:</strong> {formatInspectorCount(meshInspectorStats.vertexCount)}</div>
          <div><strong>k1 range:</strong> {formatRange(curvatureRanges.k1)}</div>
          <div><strong>k2 range:</strong> {formatRange(curvatureRanges.k2)}</div>
          <div><strong>H range:</strong> {formatRange(curvatureRanges.H)}</div>
          <div><strong>K range:</strong> {formatRange(curvatureRanges.K)}</div>
          <div><strong>Principal directions:</strong> {principalDirectionsStatus}</div>
          <div><strong>Curvature lines:</strong> {curvatureLinesStatus}</div>
          <div>
            <button
              type="button"
              onClick={onRebuildCurvatureLines}
              style={{ padding: "3px 7px", fontSize: 11 }}
            >
              Recompute
            </button>
          </div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Vector calculus</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {vectorCalculusDetailedStatus}</div>
          <div><strong>Scalar source:</strong> {calculusScalarSourceLabel}</div>
          <div><strong>Vector source:</strong> {calculusVectorSource || "none"}</div>
          <div><strong>Last operation:</strong> {vectorCalculusLastOperation}</div>
          <div><strong>Active vector field:</strong> {activeVectorFieldLabel}</div>
          <div><strong>Magnitude range:</strong> {formatRange(activeVectorMagnitudeRange)}</div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Curvature lines</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {curvatureLinesStatus}</div>
          <div><strong>Field:</strong> {curvatureLineField}</div>
          <div><strong>Seed source:</strong> {curvatureSeedSource}</div>
          <div><strong>Seed density:</strong> {Math.max(1, Math.round(curvatureSeedDensity))}</div>
          <div><strong>Lines:</strong> {curvatureLineCountLabel}</div>
          <div><strong>Average length:</strong> n/a</div>
          <div><strong>Stopped at boundary:</strong> n/a</div>
          <div><strong>Stopped near singularity:</strong> n/a</div>
          <div><strong>Max steps:</strong> {Math.max(1, Math.round(curvatureMaxSteps))}</div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Mesh quality</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {meshQualityStatus}</div>
          <div><strong>Bad triangles:</strong> {formatInspectorCount(badTriangleCount)}</div>
          <div><strong>Boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
          <div><strong>Non-manifold edges:</strong> {formatInspectorCount(topologyNonManifoldEdgeCount)}</div>
          <div><strong>Min angle:</strong> n/a</div>
          <div><strong>Max aspect ratio:</strong> {meshQualityReport?.metrics.aspectRatio.max != null ? fmt(meshQualityReport.metrics.aspectRatio.max) : "n/a"}</div>
        </div>
      </div>

      <div style={inspectorSectionCard}>
        <div style={inspectorSectionTitle}>Topology diagnostics</div>
        <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
          <div><strong>Status:</strong> {topologyDiagnosticsStatus}</div>
          <div><strong>Connected components:</strong> {formatInspectorCount(meshInspectorStats.connectedComponentCount)}</div>
          <div><strong>Edges:</strong> {formatInspectorCount(meshTopologyDetails?.edgeCount ?? null)}</div>
          <div><strong>Boundary edges:</strong> {formatInspectorCount(meshInspectorStats.boundaryEdgeCount)}</div>
          <div><strong>Non-manifold edges:</strong> {formatInspectorCount(topologyNonManifoldEdgeCount)}</div>
          <div><strong>Boundary loops:</strong> {topologyBoundaryLoopsLabel}</div>
          <div><strong>Euler characteristic χ:</strong> {topologyEulerCharacteristic != null && Number.isFinite(topologyEulerCharacteristic) ? fmt(topologyEulerCharacteristic) : "n/a"}</div>
          <div><strong>Orientability:</strong> {topologyOrientabilityLabel}</div>
          {renderTopologyDetails("mesh-results-topology-fallback")}
        </div>
      </div>
        </>
      )}

      <div style={workflowCardStyle("analyze")}>
        <div style={inspectorSectionTitle}>Analysis</div>
        <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Analyze", "analyze")}</div>
        <SurfaceOverlayControls showGaussMap={showGaussMap} onToggleGaussMap={onToggleGaussMap}
          showContours={showContours} onToggleContours={onToggleContours} contourCount={contourCount} onSetContourCount={onSetContourCount}
          showPlanes={showPlanes} onTogglePlanes={onTogglePlanes} showPrincipalDirections={showPrincipalDirections} onTogglePrincipalDirections={onTogglePrincipalDirections}
          showPrincipalLines={showPrincipalLines} onTogglePrincipalLines={onTogglePrincipalLines} showCurvatureLines={showCurvatureLines} onToggleCurvatureLines={onToggleCurvatureLines} />
      </div>

      {isImplicitViewer && (
        <div
          data-testid="worker-status"
          style={{
            ...workflowCardStyle("analyze"),
            fontSize: 11,
          }}
        >
          <div style={inspectorSectionTitle}>Worker status</div>
          <div style={{ color: workerReady ? "#1f894f" : "#b42318" }}>
            worker: {workerStatusLabel}
          </div>
          <div style={{ color: generateStatusColor }}>
            generate: {generateStateLabel}
          </div>
          <div style={{ color: workerReady ? "#556" : "#b42318" }}>{workerStatusText}</div>
          <div style={{ color: generateStatusColor }}>{generateStatusText}</div>
          <div>
            <button
              type="button"
              data-testid="sample-surface-button"
              onClick={onLoadDeterministicImplicitSample}
              style={{ padding: "4px 8px" }}
            >
              Load deterministic sample
            </button>
          </div>
        </div>
      )}

      {isImplicitViewer && (
        <div style={workflowCardStyle("preview", "mesh")}>
          <div style={inspectorSectionTitle}>Mesh generation</div>
          <div style={{ marginTop: -2, marginBottom: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {renderWorkflowStatus("Preview", "preview")}
            {renderWorkflowStatus("Mesh", "mesh")}
          </div>
          <div style={{ fontSize: 11, color: "#556", lineHeight: 1.5 }}>
            Use <strong>Object → SurfaceMesh → Generate</strong> for preview and robust meshing controls.
          </div>
        </div>
      )}

      <div style={workflowCardStyle("analyze")}>
        <div style={inspectorSectionTitle}>Analysis results</div>
        <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Analyze", "analyze")}</div>
        <div style={{ display: "grid", gap: 7, fontSize: 11 }}>
          <div>
            <strong>Differential geometry results:</strong>{" "}
            {showPrincipalDirections || showPrincipalLines || showCurvatureLines ? "active overlays" : "not enabled"}
          </div>
          <div>
            <strong>Vector calculus results:</strong> {showGaussMap || showContours || showPlanes ? "active overlays" : "not enabled"}
          </div>
          <div>
            <strong>Curvature-line results:</strong> {showCurvatureLines ? "visible" : "not visible"}
          </div>
          <div>
            <strong>Mesh quality results:</strong>{" "}
            {formatInspectorCount(meshInspectorStats.vertexCount)} verts, {formatInspectorCount(meshInspectorStats.faceCount)} faces
          </div>
          <div>
            <strong>Geodesic results:</strong> use Selection/analysis tools to compute geodesic paths.
          </div>
        </div>
      </div>
        </>
      )}

      {inspectorPanelTab === "selection" && (
        <>
          {pointPickSection}
          <div style={inspectorSectionCard}>
            <div style={inspectorSectionTitle}>Selection</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              <div>
                <strong>Selected point p:</strong>{" "}
                {probeInfo?.point ? `(${fmt(probeInfo.point.x)}, ${fmt(probeInfo.point.y)}, ${fmt(probeInfo.point.z)})` : "none"}
              </div>
              <div>
                <strong>Normal n:</strong>{" "}
                {probeInfo?.normal ? `(${fmt(probeInfo.normal.x)}, ${fmt(probeInfo.normal.y)}, ${fmt(probeInfo.normal.z)})` : "none"}
              </div>
              <div><strong>Face id:</strong> n/a</div>
              <div>
                <strong>Chart coordinates u,v:</strong>{" "}
                {probeInfo?.uv ? `(${fmt(probeInfo.uv.u)}, ${fmt(probeInfo.uv.v)})` : "n/a"}
              </div>
              <div><strong>Local K:</strong> {selectedProbeCurvature?.K != null && Number.isFinite(selectedProbeCurvature.K) ? fmt(selectedProbeCurvature.K) : "n/a"}</div>
              <div><strong>Local H:</strong> {selectedProbeCurvature?.H != null && Number.isFinite(selectedProbeCurvature.H) ? fmt(selectedProbeCurvature.H) : "n/a"}</div>
              <div><strong>Local k1:</strong> {selectedProbeCurvature?.k1 != null && Number.isFinite(selectedProbeCurvature.k1) ? fmt(selectedProbeCurvature.k1) : "n/a"}</div>
              <div><strong>Local k2:</strong> {selectedProbeCurvature?.k2 != null && Number.isFinite(selectedProbeCurvature.k2) ? fmt(selectedProbeCurvature.k2) : "n/a"}</div>
              <div>
                <strong>Local vector values:</strong>{" "}
                {calculusVectorOverlayEnabled && calculusActiveVectorField ? `${calculusActiveVectorField} (point sampling TBA)` : "n/a"}
              </div>
              <div><strong>Selected geodesic/path data:</strong> {geodesicPathLength != null && Number.isFinite(geodesicPathLength) ? `length=${fmt(geodesicPathLength)}` : "n/a"}</div>
            </div>
          </div>
        </>
      )}

      {inspectorPanelTab === "diagnostics" && (
        <div data-testid="surface-inspector-diagnostics-card" style={inspectorSectionCard}>
          <div style={inspectorSectionTitle}>Diagnostics</div>
          {renderDiagnosticsSeveritySummary()}
          {renderDiagnosticsErrors()}
          {renderDiagnosticsWarnings()}
          <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 9, fontSize: 11, display: "grid", gap: 6 }}>
            <div><strong>Mesh status:</strong> {meshQualityStatus}</div>
            <div><strong>Topology:</strong> {topologyDiagnosticsStatus}</div>
            <div><strong>Watertight:</strong> {watertight == null ? "unknown" : watertight ? "yes" : "no"}</div>
            <div><strong>Normal status:</strong> {normalStatus}</div>
          </div>
          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10, display: "grid", gap: 8 }}>
            <div style={inspectorSectionTitle}>Backend and validation</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              <div><strong>Worker:</strong> {cgalHealthState?.ok ? "available" : cgalHealthState?.error ?? "unknown"}</div>
              <div><strong>Last operation status:</strong> {meshLastOperation?.status ?? "none"}</div>
              <div><strong>Warnings:</strong> {diagnosticsWarningCount.toLocaleString()}</div>
              <div><strong>Errors:</strong> {diagnosticsErrorCount.toLocaleString()}</div>
              <div>
                <strong>Boolean blockers:</strong>{" "}
                {meshDiagnosticsValidationBlockers.length ? meshDiagnosticsValidationBlockers.join(", ") : "none"}
              </div>
            </div>
          </div>
          <details style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10 }}>
            <summary
              data-testid="mesh-inspector-diagnostics-raw-topology-toggle"
              style={{ cursor: "pointer", fontWeight: 850, fontSize: 12 }}
            >
              Raw topology details
            </summary>
            <div style={{ marginTop: 8 }}>{renderTopologyDetails("mesh-inspector-diagnostics-topology")}</div>
          </details>
        </div>
      )}

      {inspectorPanelTab === "object" && (
      <div style={workflowCardStyle("promote")}>
        <div style={inspectorSectionTitle}>Actions</div>
        <div style={{ marginTop: -2, marginBottom: 7 }}>{renderWorkflowStatus("Promote", "promote")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={onDuplicate} disabled={!canDuplicate} style={{ padding: "4px 8px" }}>
            Duplicate
          </button>
          <button type="button" onClick={onExport} disabled={!canExport} style={{ padding: "4px 8px" }}>
            Export
          </button>
          <button type="button" onClick={onBake} disabled={!canBake} style={{ padding: "4px 8px" }}>
            Bake to SurfaceMesh
          </button>
          <button type="button" onClick={onCompare} disabled={!canCompare} style={{ padding: "4px 8px" }}>
            Compare
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
          Bake promotes the current surface to a SurfaceMesh dataset. Duplicate/Export/Compare operate on the selected scene object.
        </div>
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Quick pick</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Implicit / Graph</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SURFACES_EQ_META.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickEqSurface(s.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid " + (surfaceId === s.id && isEqViewer ? "#0a66c2" : "#ddd"),
                    background: surfaceId === s.id && isEqViewer ? "#e6f0ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Parametric</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PARAM_SURFACES_META.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickParamSurface(s.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid " + (paramId === s.id && viewerKind === "param" ? "#0a66c2" : "#ddd"),
                    background: paramId === s.id && viewerKind === "param" ? "#e6f0ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        </details>
      </div>
      )}
    </section>
  );
};

export type XYDomainPreviewProps = {
  width: number;
  height: number;
  xSpan: number; // shows x in [-xSpan, xSpan]
  ySpan: number; // shows y in [-ySpan, ySpan]
  onPick: (xy: { x: number; y: number }) => void;
  picked?: { x: number; y: number } | null;
  mode?: "click" | "hover";
  dragToPick?: boolean;
};

export const XYDomainPreview = React.memo(function XYDomainPreview({
  width,
  height,
  xSpan,
  ySpan,
  onPick,
  picked: pickedProp,
  mode = "click",
  dragToPick = false,
}: XYDomainPreviewProps) {
  const [picked, setPicked] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isPointerInsideRef = useRef(false);
  const safeXSpan = Number.isFinite(xSpan) && xSpan > 0 ? xSpan : 1;
  const safeYSpan = Number.isFinite(ySpan) && ySpan > 0 ? ySpan : 1;
  const hoverTimerRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<{ x: number; y: number; updateLocal: boolean } | null>(null);
  const lastSentRef = useRef<{ x: number; y: number } | null>(null);
  const HOVER_PICK_INTERVAL_MS = 90;

  const pushPick = useCallback(
    (xy: { x: number; y: number }, updateLocal = true) => {
      if (updateLocal) setPicked(xy);
      onPick(xy);
      lastSentRef.current = xy;
    },
    [onPick]
  );

  const flushHoverPick = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    const pending = pendingHoverRef.current;
    pendingHoverRef.current = null;
    if (!pending) return;
    const next = { x: pending.x, y: pending.y };

    const last = lastSentRef.current;
    const epsX = safeXSpan * 0.01;
    const epsY = safeYSpan * 0.01;
    if (last && Math.abs(next.x - last.x) <= epsX && Math.abs(next.y - last.y) <= epsY) {
      return;
    }
    pushPick(next, pending.updateLocal);
  }, [pushPick, safeXSpan, safeYSpan]);

  const scheduleHoverPick = useCallback(
    (xy: { x: number; y: number }, updateLocal: boolean) => {
      pendingHoverRef.current = { ...xy, updateLocal };
      if (hoverTimerRef.current != null) return;
      hoverTimerRef.current = window.setTimeout(() => {
        flushHoverPick();
      }, HOVER_PICK_INTERVAL_MS);
    },
    [flushHoverPick]
  );

  useEffect(() => {
    if (!pickedProp) return;
    if (mode === "hover" && isPointerInsideRef.current) return;
    setPicked(pickedProp);
    lastSentRef.current = pickedProp;
  }, [mode, pickedProp?.x, pickedProp?.y]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current != null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    },
    []
  );

  const pad = 12;
  const w = width;
  const h = height;

  const toXY = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const x = (px * 2 - 1) * safeXSpan;
    const y = (1 - py * 2) * safeYSpan;
    return { x, y };
  };

  const toPx = (x: number, y: number) => {
    const px = pad + ((x / safeXSpan + 1) * 0.5) * (w - 2 * pad);
    const py = pad + ((1 - (y / safeYSpan + 1) * 0.5) * (h - 2 * pad));
    return { px, py };
  };

  const gridLines = 8;

  return (
    <div style={{ border: "1px solid #dbe4ee", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
      <svg
        width={w}
        height={h}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          setIsDragging(true);
          isPointerInsideRef.current = true;
          const svg = e.currentTarget;
          const xy = toXY(e.clientX, e.clientY, svg);
          setHovered(xy);
          pushPick(xy);
        }}
        onMouseMove={(e) => {
          isPointerInsideRef.current = true;
          const svg = e.currentTarget;
          const xy = toXY(e.clientX, e.clientY, svg);
          if (mode !== "hover") setHovered(xy);
          if (mode === "hover" || (dragToPick && isDragging)) {
            const updateLocal = mode === "hover" ? false : true;
            scheduleHoverPick(xy, updateLocal);
          }
        }}
        onMouseUp={() => {
          setIsDragging(false);
          flushHoverPick();
        }}
        onMouseLeave={() => {
          isPointerInsideRef.current = false;
          setHovered(null);
          setIsDragging(false);
          flushHoverPick();
        }}
      >
        {/* background */}
        <rect x={0} y={0} width={w} height={h} fill="#f8fbff" />

        {/* inner frame */}
        <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="#ffffff" stroke="#dbe4ee" />

        {/* grid */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const t = i / gridLines;
          const x = pad + t * (w - 2 * pad);
          const y = pad + t * (h - 2 * pad);
          const major = i === 0 || i === gridLines || i === gridLines / 2 || i % 2 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={pad} x2={x} y2={h - pad} stroke={major ? "#d8e0ea" : "#edf2f7"} strokeWidth={major ? 1.1 : 1} />
              <line x1={pad} y1={y} x2={w - pad} y2={y} stroke={major ? "#d8e0ea" : "#edf2f7"} strokeWidth={major ? 1.1 : 1} />
            </g>
          );
        })}

        {/* axes */}
        {(() => {
          const o = toPx(0, 0);
          return (
            <g>
              <line x1={pad} y1={o.py} x2={w - pad} y2={o.py} stroke="#94a3b8" strokeWidth={1.3} />
              <line x1={o.px} y1={pad} x2={o.px} y2={h - pad} stroke="#94a3b8" strokeWidth={1.3} />
              <text x={w - pad - 8} y={o.py - 4} fontSize="10" fill="#64748b">x</text>
              <text x={o.px + 4} y={pad + 11} fontSize="10" fill="#64748b">y</text>
            </g>
          );
        })()}

        {/* crosshair (disabled in drag mode to avoid flicker) */}
        {!dragToPick && mode === "click" && (picked || hovered) && (() => {
          const marker = picked ?? hovered!;
          const p = toPx(marker.x, marker.y);
          return (
            <g>
              <line x1={pad} y1={p.py} x2={w - pad} y2={p.py} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
              <line x1={p.px} y1={pad} x2={p.px} y2={h - pad} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
            </g>
          );
        })()}

        {/* picked marker */}
        {picked && (() => {
          const p = toPx(picked.x, picked.y);
          return (
            <g>
              <circle cx={p.px} cy={p.py} r={10} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.45} />
              <circle cx={p.px} cy={p.py} r={6} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              <circle cx={p.px} cy={p.py} r={2.2} fill="#ffffff" />
            </g>
          );
        })()}
      </svg>

      <div style={{ padding: "8px 10px", fontSize: 11, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ opacity: 0.75 }}>x in ±{xSpan.toFixed(2)}  y in ±{ySpan.toFixed(2)}  linked to 3D probe</span>
        <span style={{ fontFamily: "monospace", textAlign: "right" }}>
          {picked ? `pick ${fmt(picked.x)}, ${fmt(picked.y)}` : "pick (none)"}
          {mode !== "hover" && hovered ? ` | hover ${fmt(hovered.x)}, ${fmt(hovered.y)}` : ""}
        </span>
      </div>
    </div>
  );
});

export type ParamDomainPreviewProps = {
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  onPick: (uv: { u: number; v: number }) => void;
  picked?: { u: number; v: number } | null;
  mode?: "click" | "hover";
  dragToPick?: boolean;
};

export const ParamDomainPreview = React.memo(function ParamDomainPreview({
  width,
  height,
  uMin,
  uMax,
  vMin,
  vMax,
  onPick,
  picked: pickedProp,
  mode = "click",
  dragToPick = false,
}: ParamDomainPreviewProps) {
  const [picked, setPicked] = useState<{ u: number; v: number } | null>(null);
  const [hovered, setHovered] = useState<{ u: number; v: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isPointerInsideRef = useRef(false);
  const hoverTimerRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<{ u: number; v: number; updateLocal: boolean } | null>(null);
  const lastSentRef = useRef<{ u: number; v: number } | null>(null);
  const HOVER_PICK_INTERVAL_MS = 90;
  const spanU = Math.max(1e-9, Math.abs(uMax - uMin));
  const spanV = Math.max(1e-9, Math.abs(vMax - vMin));

  const pushPick = useCallback(
    (uv: { u: number; v: number }, updateLocal = true) => {
      if (updateLocal) setPicked(uv);
      onPick(uv);
      lastSentRef.current = uv;
    },
    [onPick]
  );

  const flushHoverPick = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    const pending = pendingHoverRef.current;
    pendingHoverRef.current = null;
    if (!pending) return;
    const next = { u: pending.u, v: pending.v };

    const last = lastSentRef.current;
    const epsU = spanU * 0.01;
    const epsV = spanV * 0.01;
    if (last && Math.abs(next.u - last.u) <= epsU && Math.abs(next.v - last.v) <= epsV) {
      return;
    }
    pushPick(next, pending.updateLocal);
  }, [pushPick, spanU, spanV]);

  const scheduleHoverPick = useCallback(
    (uv: { u: number; v: number }, updateLocal: boolean) => {
      pendingHoverRef.current = { ...uv, updateLocal };
      if (hoverTimerRef.current != null) return;
      hoverTimerRef.current = window.setTimeout(() => {
        flushHoverPick();
      }, HOVER_PICK_INTERVAL_MS);
    },
    [flushHoverPick]
  );

  useEffect(() => {
    if (!pickedProp) return;
    if (mode === "hover" && isPointerInsideRef.current) return;
    setPicked(pickedProp);
    lastSentRef.current = pickedProp;
  }, [mode, pickedProp?.u, pickedProp?.v]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current != null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    },
    []
  );

  const pad = 12;
  const w = width;
  const h = height;

  const toUV = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const u = uMin + px * (uMax - uMin);
    const v = vMax - py * (vMax - vMin);
    return { u, v };
  };

  const toPx = (u: number, v: number) => {
    const px = pad + ((u - uMin) / (uMax - uMin)) * (w - 2 * pad);
    const py = pad + ((vMax - v) / (vMax - vMin)) * (h - 2 * pad);
    return { px, py };
  };

  const gridLines = 8;

  return (
    <div style={{ border: "1px solid #dbe4ee", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
      <svg
        width={w}
        height={h}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          setIsDragging(true);
          isPointerInsideRef.current = true;
          const svg = e.currentTarget;
          const uv = toUV(e.clientX, e.clientY, svg);
          setHovered(uv);
          pushPick(uv);
        }}
        onMouseMove={(e) => {
          isPointerInsideRef.current = true;
          const svg = e.currentTarget;
          const uv = toUV(e.clientX, e.clientY, svg);
          if (mode !== "hover") setHovered(uv);
          if (mode === "hover" || (dragToPick && isDragging)) {
            const updateLocal = mode === "hover" ? false : true;
            scheduleHoverPick(uv, updateLocal);
          }
        }}
        onMouseUp={() => {
          setIsDragging(false);
          flushHoverPick();
        }}
        onMouseLeave={() => {
          isPointerInsideRef.current = false;
          setHovered(null);
          setIsDragging(false);
          flushHoverPick();
        }}
      >
        <rect x={0} y={0} width={w} height={h} fill="#f8fbff" />
        <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="#ffffff" stroke="#dbe4ee" />

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const t = i / gridLines;
          const x = pad + t * (w - 2 * pad);
          const y = pad + t * (h - 2 * pad);
          const major = i === 0 || i === gridLines || i === gridLines / 2 || i % 2 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={pad} x2={x} y2={h - pad} stroke={major ? "#d8e0ea" : "#edf2f7"} strokeWidth={major ? 1.1 : 1} />
              <line x1={pad} y1={y} x2={w - pad} y2={y} stroke={major ? "#d8e0ea" : "#edf2f7"} strokeWidth={major ? 1.1 : 1} />
            </g>
          );
        })}

        <text x={w - pad - 10} y={h - pad + 14} fontSize="10" fill="#64748b">u</text>
        <text x={pad - 8} y={pad - 4} fontSize="10" fill="#64748b">v</text>

        {!dragToPick && mode === "click" && (picked || hovered) && (() => {
          const marker = picked ?? hovered!;
          const p = toPx(marker.u, marker.v);
          return (
            <g>
              <line x1={pad} y1={p.py} x2={w - pad} y2={p.py} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
              <line x1={p.px} y1={pad} x2={p.px} y2={h - pad} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
            </g>
          );
        })()}

        {/* picked marker */}
        {picked && (() => {
          const p = toPx(picked.u, picked.v);
          return (
            <g>
              <circle cx={p.px} cy={p.py} r={10} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.45} />
              <circle cx={p.px} cy={p.py} r={6} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              <circle cx={p.px} cy={p.py} r={2.2} fill="#ffffff" />
            </g>
          );
        })()}
      </svg>

      <div style={{ padding: "8px 10px", fontSize: 11, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ opacity: 0.75 }}>u in [{fmt(uMin)},{fmt(uMax)}], v in [{fmt(vMin)},{fmt(vMax)}], linked to 3D probe</span>
        <span style={{ fontFamily: "monospace", textAlign: "right" }}>
          {picked ? `pick ${fmt(picked.u)}, ${fmt(picked.v)}` : "pick (none)"}
          {mode !== "hover" && hovered ? ` | hover ${fmt(hovered.u)}, ${fmt(hovered.v)}` : ""}
        </span>
      </div>
    </div>
  );
});
