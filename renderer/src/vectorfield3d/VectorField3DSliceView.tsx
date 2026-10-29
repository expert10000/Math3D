import { useEffect, useId, useState } from "react";
import { canonicalJsonStringify, structuralHash } from "@math3d/core";
import type { VectorField3DDocument, VectorField3DSliceArtifact,
  VectorField3DClipBounds, VectorField3DLinkedLineProfile,
  VectorField3DOverlayRegion,
  Graph2DScientificVolume, Graph2DLinkedRegionSelection,
  AnalysisResultEnvelope } from "@math3d/core";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";
import { sliceSeedMarkerAtPoint, sliceSeedPointAtSvgPosition, slicePlot } from "./sliceSeedPlacement";
import type { ScalarSliceOverlay, SliceOverlayArrow,
  LinkedOverlayLineProfile, OverlayRegionSummary, VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import { phaseContourSegments } from "./scientificSliceOverlay";
import { LinkedOverlayProfileView } from "./LinkedOverlayProfileView";
import { OverlayRegionView } from "./OverlayRegionView";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import type { CombinedRegionInspection } from "./combinedFieldInspection";

const color = (value: number | null, min: number, max: number) => {
  if (value === null) return "#64748b";
  const t = max === min ? .5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `rgb(${Math.round(35 + 212 * t)}, ${Math.round(105 + 110 * (1 - Math.abs(2 * t - 1)))}, ${Math.round(224 - 184 * t)})`;
};
const phaseColor = (value: number) =>
  `hsl(${((value + Math.PI) / (2 * Math.PI) * 360) % 360} 84% 58%)`;

export function VectorField3DSliceView({ document, slice, probe, clipBounds, zoom = 1,
  center = [0.5, 0.5], onZoomChange, onCenterChange, onProbeSelect, onSendLineToGraphs,
  onSendDerivedLineToGraphs, derivedLineBusy, seedPlacementActive = false,
  seedPlacementDisabled = false, onSeedPlacementToggle, onSeedPropose, proposedSeed,
  scalarOverlay, contourOverlay = null, contourStatus = "", scalarStatus = "",
  complexStatus = "", vectorStatus = "",
  overlayArrows = [], overlayVectorSamples = [], overlayStatus = "",
  overlayVectorPlane = null, scalarOverlayVolume = null, complexOverlayVolumes = null,
  linkedLineProfile = null, linkedProfileMismatch = "", onLinkedLineProfileChange,
  onSendLinkedLineToGraphs, linkedLineBusy = false,
  overlayRegion = null, onOverlayRegionChange, savedRegionResults = [],
  regionResultStatuses = {}, onSaveRegionResult, onSendRegionToGraphs,
  onSendCombinedRegionToGraphs, onFocusRegionInGraphs,
  regionBusy = false, linkedRegionFocus = null }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  probe?: readonly [number, number, number] | null;
  clipBounds?: VectorField3DClipBounds;
  zoom?: number; onZoomChange?: (zoom: number) => void;
  center?: readonly [number, number];
  onCenterChange?: (center: readonly [number, number]) => void;
  onProbeSelect?: (point: readonly [number, number, number]) => void;
  seedPlacementActive?: boolean;
  seedPlacementDisabled?: boolean;
  onSeedPlacementToggle?: () => void;
  onSeedPropose?: (point: readonly [number, number, number] | null) => void;
  proposedSeed?: readonly [number, number, number] | null;
  scalarOverlay?: ScalarSliceOverlay | null;
  contourOverlay?: ScalarSliceOverlay | null;
  contourStatus?: string;
  scalarStatus?: string; complexStatus?: string; vectorStatus?: string;
  overlayArrows?: readonly SliceOverlayArrow[];
  overlayVectorSamples?: readonly Readonly<{ name: string; sampleSha256: string }>[];
  overlayStatus?: string;
  overlayVectorPlane?: VectorSliceOverlayPlane | null;
  scalarOverlayVolume?: Graph2DScientificVolume | null;
  complexOverlayVolumes?: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  linkedLineProfile?: VectorField3DLinkedLineProfile | null;
  linkedProfileMismatch?: string;
  onLinkedLineProfileChange?: (profile: VectorField3DLinkedLineProfile | null) => void;
  onSendLinkedLineToGraphs?: (line: LinkedOverlayLineProfile,
    profile: VectorField3DLinkedLineProfile,
    samples: readonly Readonly<{ name: string; sampleSha256: string }>[]) => void;
  linkedLineBusy?: boolean;
  overlayRegion?: VectorField3DOverlayRegion | null;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  onOverlayRegionChange?: (region: VectorField3DOverlayRegion | null) => void;
  savedRegionResults?: readonly AnalysisResultEnvelope[];
  regionResultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onSaveRegionResult?: (result: AnalysisResultEnvelope) => void;
  onSendRegionToGraphs?: (region: VectorField3DOverlayRegion,
    summary: OverlayRegionSummary,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    overlaySamples: readonly Readonly<{ name: string; sampleSha256: string }>[]) => void;
  onSendCombinedRegionToGraphs?: (region: VectorField3DOverlayRegion,
    inspection: CombinedRegionInspection,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    scalarSampleSha256: string, realSampleSha256: string,
    imaginarySampleSha256: string) => void;
  onFocusRegionInGraphs?: (region: VectorField3DOverlayRegion,
    physical: Graph2DLinkedRegionSelection["physical"]) => Promise<void>;
  regionBusy?: boolean;
  onSendLineToGraphs?: (component: "p" | "q" | "r" | "speed", varyingAxis: 0 | 1 | 2,
    point: readonly [number, number, number]) => void;
  onSendDerivedLineToGraphs?: (slice: VectorField3DSliceArtifact, varyingAxis: 0 | 1 | 2,
    profileFixedCoordinate: number) => void;
  derivedLineBusy?: boolean;
}) {
  const [profileDirection, setProfileDirection] = useState<0 | 1>(0);
  const [regionSelecting, setRegionSelecting] = useState(false);
  const [regionFirstCorner, setRegionFirstCorner] = useState<readonly [number, number, number] | null>(null);
  const [graphSelectionMode, setGraphSelectionMode] = useState<"point" | "interval" | null>(null);
  const [graphSelectionFirstX, setGraphSelectionFirstX] = useState<number | null>(null);
  const [graphSelectionBusy, setGraphSelectionBusy] = useState(false);
  const [graphSelectionError, setGraphSelectionError] = useState("");
  useEffect(() => { setRegionSelecting(false); setRegionFirstCorner(null); },
    [slice.normalAxis, slice.fixedCoordinate, document.identity.structuralHash,
      document.workspace?.scalarOverlay?.visible, document.workspace?.complexOverlay?.visible]);
  useEffect(() => { setGraphSelectionMode(null); setGraphSelectionFirstX(null);
    setGraphSelectionError(""); }, [overlayRegion, slice.normalAxis, slice.fixedCoordinate]);
  const arrowMarkerId = useId().replace(/:/g, "");
  const [first, second] = slice.planeAxes;
  const { left, top, width, height } = slicePlot;
  const cellWidth = width / slice.shape[0], cellHeight = height / slice.shape[1];
  const contours = contourOverlay ? phaseContourSegments(contourOverlay.values, slice.shape) : [];
  const firstAxis = document.source.axes[first], secondAxis = document.source.axes[second];
  const normalAxis = document.source.axes[slice.normalAxis];
  const probeOnPlane = probe && Math.abs(probe[slice.normalAxis] - slice.fixedCoordinate) < 1e-9;
  const probeFirst = probeOnPlane ? slice.coordinates[0].findIndex(value => Math.abs(value - probe[first]) < 1e-9) : -1;
  const probeSecond = probeOnPlane ? slice.coordinates[1].findIndex(value => Math.abs(value - probe[second]) < 1e-9) : -1;
  const profile = probeFirst >= 0 && probeSecond >= 0 ?
    slice.coordinates[profileDirection].map((coordinate, index) => ({ coordinate,
      value: profileDirection === 0 ? slice.values[index * slice.shape[1] + probeSecond] :
        slice.values[probeFirst * slice.shape[1] + index] })) : [];
  const finiteProfile = profile.map(row => row.value).filter((value): value is number =>
    value !== null && value !== undefined && Number.isFinite(value));
  const profileMin = Math.min(...finiteProfile), profileMax = Math.max(...finiteProfile);
  const profileSpan = profileMax - profileMin || 1;
  const profilePath = profile.map((row, index) => row.value === null || row.value === undefined ? "" :
    `${index === 0 || profile[index - 1]?.value == null ? "M" : "L"}${
      24 + index * 272 / Math.max(profile.length - 1, 1)},${
      104 - (row.value - profileMin) * 80 / profileSpan}`).join(" ");
  const seedMarker = proposedSeed ? sliceSeedMarkerAtPoint(slice, proposedSeed) : null;
  const regionCorners = overlayRegion?.normalAxis === slice.normalAxis &&
    Math.abs(overlayRegion.fixedCoordinate - slice.fixedCoordinate) < 1e-9 ?
    overlayRegion.bounds.map((_, local) => local) : null;
  const regionMarkers = regionCorners ? [0, 1].map(end => {
    const point = [0, 0, 0] as [number, number, number];
    point[slice.normalAxis] = slice.fixedCoordinate;
    point[first] = Math.max(slice.coordinates[0][0]!, Math.min(
      slice.coordinates[0].at(-1)!, overlayRegion!.bounds[0][end]!));
    point[second] = Math.max(slice.coordinates[1][0]!, Math.min(
      slice.coordinates[1].at(-1)!, overlayRegion!.bounds[1][end]!));
    return sliceSeedMarkerAtPoint(slice, point);
  }) : null;
  const pendingRegionMarker = regionFirstCorner ? sliceSeedMarkerAtPoint(slice, regionFirstCorner) : null;
  const crosshairCoordinate = (coordinates: readonly number[], value: number,
    start: number, cell: number) => {
    if (value < coordinates[0]! - 1e-9 || value > coordinates.at(-1)! + 1e-9) return null;
    const upper = coordinates.findIndex(item => item >= value - 1e-9);
    if (upper <= 0) return start + cell / 2;
    const lower = upper - 1;
    const fraction = (value - coordinates[lower]!) /
      (coordinates[upper]! - coordinates[lower]!);
    return start + (lower + .5 + fraction) * cell;
  };
  const crosshairX = probeOnPlane ? crosshairCoordinate(slice.coordinates[0], probe[first],
    left, cellWidth) : null;
  const crosshairYFromBottom = probeOnPlane ? crosshairCoordinate(slice.coordinates[1],
    probe[second], 0, cellHeight) : null;
  const crosshairY = crosshairYFromBottom === null ? null : top + height - crosshairYFromBottom;
  const graphFocusMatches = !!linkedRegionFocus && !!overlayRegion &&
    linkedRegionFocus.documentId === document.identity.id &&
    linkedRegionFocus.sourceHash === document.identity.structuralHash &&
    linkedRegionFocus.recipeHash === structuralHash({
      scalarOverlay: document.workspace?.scalarOverlay ?? null,
      complexOverlay: document.workspace?.complexOverlay ?? null,
      sliceChannel: document.workspace?.sliceChannel ?? "component" }) &&
    canonicalJsonStringify(linkedRegionFocus.region) === canonicalJsonStringify(overlayRegion) &&
    linkedRegionFocus.region.normalAxis === slice.normalAxis &&
    Math.abs(linkedRegionFocus.region.fixedCoordinate - slice.fixedCoordinate) < 1e-9;
  const focusLow = graphFocusMatches ? Math.max(linkedRegionFocus.xBounds[0],
    slice.coordinates[0][0]!) : 0;
  const focusHigh = graphFocusMatches ? Math.min(linkedRegionFocus.xBounds[1],
    slice.coordinates[0].at(-1)!) : 0;
  const focusX0 = focusLow < focusHigh ? crosshairCoordinate(slice.coordinates[0],
    focusLow, left, cellWidth) : null;
  const focusX1 = focusLow < focusHigh ? crosshairCoordinate(slice.coordinates[0],
    focusHigh, left, cellWidth) : null;
  return <figure className="vector-field3d-slice" aria-label={`${firstAxis.label.toUpperCase()}${secondAxis.label.toUpperCase()} field slice`}>
    <figcaption>{firstAxis.label.toUpperCase()}{secondAxis.label.toUpperCase()} plane ·
      {" "}{normalAxis.label} = {slice.fixedCoordinate} {slice.fixedUnit} · {slice.shape.join(" × ")} bounded samples</figcaption>
    {overlayStatus && <p role={overlayStatus.includes("withheld") ? "alert" : "status"}
      data-testid="scientific-slice-overlay-status">{overlayStatus}</p>}
    {contourStatus && <p role={contourStatus.includes("withheld") ? "alert" : "status"}
      data-testid="scientific-slice-contour-status">{contourStatus}</p>}
    {onSeedPlacementToggle && <button type="button"
      aria-label={`Place seed on ${firstAxis.label.toUpperCase()}${secondAxis.label.toUpperCase()} slice`}
      aria-pressed={seedPlacementActive} disabled={seedPlacementDisabled}
      onClick={onSeedPlacementToggle}>
      {seedPlacementActive ? "Click the map to propose a seed" : "Place seed on this slice"}</button>}
    {onZoomChange && <div className="vector-field3d-slice-camera" aria-label={`${firstAxis.label}${secondAxis.label} camera controls`}>
      <button type="button" aria-label={`Zoom ${firstAxis.label}${secondAxis.label} out`}
        disabled={zoom <= 1} onClick={() => onZoomChange(zoom / 1.5)}>−</button>
      <span role="status">{zoom.toPrecision(2)}×</span>
      <button type="button" aria-label={`Zoom ${firstAxis.label}${secondAxis.label} in`}
        disabled={zoom >= 8} onClick={() => onZoomChange(zoom * 1.5)}>+</button>
      <button type="button" aria-label={`Reset ${firstAxis.label}${secondAxis.label} zoom`}
        onClick={() => { onZoomChange(1); onCenterChange?.([0.5, 0.5]); }}>Reset</button>
      {onCenterChange && <>
        {([ ["left", -1, 0], ["right", 1, 0], ["up", 0, -1],
          ["down", 0, 1] ] as const).map(([name, dx, dy]) =>
          <button key={name} type="button" aria-label={`Pan ${firstAxis.label}${secondAxis.label} ${name}`}
            disabled={zoom <= 1} onClick={() => onCenterChange([
              center[0] + dx * 0.15 / zoom, center[1] + dy * 0.15 / zoom])}>
            {name}</button>)}
      </>}
    </div>}
    <svg viewBox={`${640 * center[0] - 320 / zoom} ${560 * center[1] - 280 / zoom} ${640 / zoom} ${560 / zoom}`}
      role="img" aria-label={`${slice.channel} map from ${slice.min.toPrecision(4)} to ${slice.max.toPrecision(4)} ${slice.unit}; ${slice.rejected} invalid samples`}
      onClick={event => {
        if (graphSelectionMode && overlayRegion && onFocusRegionInGraphs) {
          const transform = event.currentTarget.getScreenCTM();
          const local = transform ? new DOMPoint(event.clientX, event.clientY)
            .matrixTransform(transform.inverse()) : null;
          if (!local || local.x < left || local.x > left + width ||
              local.y < top || local.y > top + height) {
            setGraphSelectionError("Click inside the saved physical rectangle."); return;
          }
          const x = slice.coordinates[0][0]! + (local.x - left) / width *
            (slice.coordinates[0].at(-1)! - slice.coordinates[0][0]!);
          const y = slice.coordinates[1][0]! + (top + height - local.y) / height *
            (slice.coordinates[1].at(-1)! - slice.coordinates[1][0]!);
          if (x < overlayRegion.bounds[0][0] - 1e-9 ||
              x > overlayRegion.bounds[0][1] + 1e-9 ||
              y < overlayRegion.bounds[1][0] - 1e-9 ||
              y > overlayRegion.bounds[1][1] + 1e-9) {
            setGraphSelectionError("Click inside the saved physical rectangle."); return;
          }
          const physicalX = Math.max(overlayRegion.bounds[0][0],
            Math.min(overlayRegion.bounds[0][1], x));
          setGraphSelectionError("");
          if (graphSelectionMode === "interval" && graphSelectionFirstX === null) {
            setGraphSelectionFirstX(physicalX); return;
          }
          const physical = graphSelectionMode === "point" ?
            { kind: "point" as const, x: physicalX } : { kind: "interval" as const,
              min: Math.min(graphSelectionFirstX!, physicalX),
              max: Math.max(graphSelectionFirstX!, physicalX) };
          setGraphSelectionBusy(true);
          void onFocusRegionInGraphs(overlayRegion, physical).then(() => {
            setGraphSelectionMode(null); setGraphSelectionFirstX(null);
          }).catch(cause => setGraphSelectionError(cause instanceof Error ? cause.message :
            String(cause))).finally(() => setGraphSelectionBusy(false));
          return;
        }
        if (regionSelecting && onOverlayRegionChange &&
            (document.workspace?.scalarOverlay?.visible || document.workspace?.complexOverlay?.visible)) {
          const transform = event.currentTarget.getScreenCTM();
          const local = transform ? new DOMPoint(event.clientX, event.clientY)
            .matrixTransform(transform.inverse()) : null;
          const point = local ? sliceSeedPointAtSvgPosition(slice, local.x, local.y) : null;
          if (!point) return;
          if (!regionFirstCorner) { setRegionFirstCorner(point); return; }
          const bounds = slice.planeAxes.map(axis => [Math.min(regionFirstCorner[axis], point[axis]),
            Math.max(regionFirstCorner[axis], point[axis])]) as
            [[number, number], [number, number]];
          if (bounds.some(([low, high]) => high - low < 1e-10)) return;
          onOverlayRegionChange({ normalAxis: slice.normalAxis,
            fixedCoordinate: slice.fixedCoordinate, bounds,
            vectorChannel: overlayRegion?.vectorChannel ?? "speed", visible: true });
          setRegionFirstCorner(null); setRegionSelecting(false);
          return;
        }
        if (!seedPlacementActive || !onSeedPropose) return;
        const transform = event.currentTarget.getScreenCTM();
        if (!transform) { onSeedPropose(null); return; }
        const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
        onSeedPropose(sliceSeedPointAtSvgPosition(slice, local.x, local.y));
      }}>
      <rect x={left} y={top} width={width} height={height} fill="#0d1726" />
      {(scalarOverlay || contourOverlay) && <defs><marker id={arrowMarkerId} markerWidth="5" markerHeight="5"
        refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0 0L5 2.5L0 5Z" fill="#fff" /></marker></defs>}
      {slice.values.map((value, index) => {
        const x = Math.floor(index / slice.shape[1]), y = index % slice.shape[1];
        const clipped = clipBounds && (slice.fixedCoordinate < clipBounds[slice.normalAxis]![0] ||
          slice.fixedCoordinate > clipBounds[slice.normalAxis]![1] ||
          slice.coordinates[0][x]! < clipBounds[first]![0] ||
          slice.coordinates[0][x]! > clipBounds[first]![1] ||
          slice.coordinates[1][y]! < clipBounds[second]![0] ||
          slice.coordinates[1][y]! > clipBounds[second]![1]);
        const scalarValue = scalarOverlay?.values[index];
        return <rect key={index} data-probe-cell={`${x}-${y}`}
          x={left + x * cellWidth} y={top + (slice.shape[1] - 1 - y) * cellHeight}
          width={cellWidth + .3} height={cellHeight + .3}
          fill={scalarOverlay ? scalarValue !== null && scalarValue !== undefined ?
            scalarOverlay.mode === "complex-phase" ? phaseColor(scalarValue) :
              color(scalarValue, scalarOverlay.min, scalarOverlay.max) : "#334155" :
            color(value, slice.min, slice.max)}
          opacity={clipped ? .2 : scalarOverlay ? scalarOverlay.opacity : 1}
          style={{ cursor: seedPlacementActive || onProbeSelect ? "crosshair" : undefined }} onClick={() => {
            if (!onProbeSelect || seedPlacementActive || graphSelectionMode ||
                (regionSelecting && (document.workspace?.scalarOverlay?.visible ||
                  document.workspace?.complexOverlay?.visible))) return;
            const point = [0, 0, 0] as [number, number, number];
            point[slice.normalAxis] = slice.fixedCoordinate;
            point[first] = slice.coordinates[0][x]!;
            point[second] = slice.coordinates[1][y]!;
            onProbeSelect(point);
          }} />;
      })}
      {contourOverlay && <g data-testid="scientific-slice-contour-gaps" pointerEvents="none"
        fill="none" stroke="#fbbf24" strokeOpacity="0.55" strokeWidth="1"
        strokeDasharray="3 3">
        {contourOverlay.values.map((value, index) => value === null ? <rect key={index}
          x={left + Math.floor(index / slice.shape[1]) * cellWidth}
          y={top + (slice.shape[1] - 1 - index % slice.shape[1]) * cellHeight}
          width={cellWidth} height={cellHeight} /> : null)}
      </g>}
      {contourOverlay && <g data-testid="scientific-slice-phase-contours"
        pointerEvents="none" stroke="#fbbf24" strokeWidth="2.4"
        strokeLinecap="round" opacity={contourOverlay.opacity}>
        {contours.map((segment, index) => <line key={index}
          data-phase-level={segment.level.toPrecision(4)}
          x1={left + (segment.from[0] + .5) * cellWidth}
          y1={top + (slice.shape[1] - segment.from[1] - .5) * cellHeight}
          x2={left + (segment.to[0] + .5) * cellWidth}
          y2={top + (slice.shape[1] - segment.to[1] - .5) * cellHeight} />)}
      </g>}
      {(scalarOverlay || contourOverlay) && <g data-testid="scientific-slice-overlay-arrows" pointerEvents="none"
        stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        {overlayArrows.map((arrow, index) => {
          const magnitude = Math.hypot(arrow.firstComponent, arrow.secondComponent);
          const cx = left + (arrow.firstIndex + .5) * cellWidth;
          const cy = top + (slice.shape[1] - arrow.secondIndex - .5) * cellHeight;
          if (magnitude <= 1e-12) return <g key={index}
            data-normal-component={arrow.normalComponent > 0 ? "positive" : "negative"}>
            <circle cx={cx} cy={cy} r={Math.min(cellWidth, cellHeight) * .26}
              fill="#0d1726" stroke="#fff" />
            <text x={cx} y={cy + 3} textAnchor="middle" fill="#fff"
              stroke="none" fontSize="11" fontWeight="bold">{arrow.normalComponent > 0 ? "+" : "−"}</text>
          </g>;
          const dx = arrow.firstComponent / magnitude * cellWidth * .32;
          const dy = -arrow.secondComponent / magnitude * cellHeight * .32;
          return <line key={index} x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy}
            markerEnd={`url(#${arrowMarkerId})`} />;
        })}
      </g>}
      {regionMarkers?.[0] && regionMarkers?.[1] && overlayRegion?.visible &&
        <rect data-testid="scientific-overlay-region-marker" pointerEvents="none"
          x={Math.min(regionMarkers[0][0], regionMarkers[1][0])}
          y={Math.min(regionMarkers[0][1], regionMarkers[1][1])}
          width={Math.abs(regionMarkers[1][0] - regionMarkers[0][0])}
          height={Math.abs(regionMarkers[1][1] - regionMarkers[0][1])}
          fill="#38bdf8" fillOpacity="0.14" stroke="#38bdf8" strokeWidth="2" />}
      {scalarOverlay && overlayVectorPlane && regionMarkers?.[0] && regionMarkers?.[1] &&
        focusX0 !== null && focusX1 !== null && <rect
          data-testid="scientific-region-graph-focus-marker" pointerEvents="none"
          x={Math.min(focusX0, focusX1)}
          y={Math.min(regionMarkers[0][1], regionMarkers[1][1])}
          width={Math.abs(focusX1 - focusX0)}
          height={Math.abs(regionMarkers[1][1] - regionMarkers[0][1])}
          fill="#facc15" fillOpacity="0.28" stroke="#facc15" strokeWidth="2" />}
      {pendingRegionMarker && regionSelecting && <circle
        data-testid="scientific-overlay-region-first-corner" pointerEvents="none"
        cx={pendingRegionMarker[0]} cy={pendingRegionMarker[1]} r="7"
        fill="#38bdf8" stroke="#fff" strokeWidth="2" />}
      {crosshairX !== null && crosshairY !== null && <g data-testid="vector-field3d-slice-crosshair"
        stroke="#fff" strokeWidth="2" pointerEvents="none">
        <line x1={crosshairX} y1="16"
          x2={crosshairX} y2={16 + height}
          stroke={profileDirection === 1 ? "#fde047" : "#fff"} />
        <line x1="58" y1={crosshairY}
          x2={58 + width} y2={crosshairY}
          stroke={profileDirection === 0 ? "#fde047" : "#fff"} />
      </g>}
      {seedMarker && <g data-testid="vector-field3d-proposed-seed-marker" pointerEvents="none">
        <circle cx={seedMarker[0]} cy={seedMarker[1]} r="8" fill="#f59e0b"
          stroke="#fff" strokeWidth="2" />
        <circle cx={seedMarker[0]} cy={seedMarker[1]} r="2" fill="#0d1726" />
      </g>}
      <rect x="58" y="16" width={width} height={height} fill="none" stroke="#dbeafe" />
      <g fill="#dbeafe" fontSize="14" fontFamily="system-ui, sans-serif">
        <text x="58" y="520">{slice.coordinates[0][0]?.toPrecision(4)}</text>
        <text x="618" y="520" textAnchor="end">{slice.coordinates[0].at(-1)?.toPrecision(4)}</text>
        <text x="340" y="545" textAnchor="middle">{firstAxis.label} ({firstAxis.unit})</text>
        <text x="47" y="495" textAnchor="end">{slice.coordinates[1][0]?.toPrecision(4)}</text>
        <text x="47" y="27" textAnchor="end">{slice.coordinates[1].at(-1)?.toPrecision(4)}</text>
        <text x="15" y="280" transform="rotate(-90 15 280)" textAnchor="middle">{secondAxis.label} ({secondAxis.unit})</text>
      </g>
    </svg>
    {scalarOverlay && <p data-testid="scientific-slice-overlay-provenance">
      {scalarOverlay.mode?.startsWith("complex-") ? "Complex" : "Scalar"}
      {" "}{scalarOverlay.title}: {scalarOverlay.covered}/{scalarOverlay.values.length} cells ·
      {" "}{scalarOverlay.values.length - scalarOverlay.covered} coverage gaps ·
      {" "}{scalarOverlay.min.toPrecision(4)}–{scalarOverlay.max.toPrecision(4)} {scalarOverlay.unit}.
      {" "}Source {scalarOverlay.source}; verified sample SHA-256 {scalarOverlay.sampleSha256}.
      {scalarOverlay.verifiedComponents?.length ? ` Components ${scalarOverlay.verifiedComponents.map(part =>
        `${part.name}: ${part.sampleSha256}`).join(" · ")}.` : ""}
      {" "}{overlayArrows.length} vector glyphs sampled on this plane; +/− marks the signed normal component.
      {slice.sourceHash && ` Vector source ${slice.sourceHash}.`}
      {overlayVectorSamples.length ? ` Verified arrow samples ${overlayVectorSamples.map(part =>
        `${part.name}: ${part.sampleSha256}`).join(" · ")}.` :
        " Authored expression vectors on this plane."}</p>}
    {contourOverlay && <p data-testid="scientific-slice-contour-provenance">
      Complex phase contours {contourOverlay.title}: {contourOverlay.covered}/{
        contourOverlay.values.length} cells covered; {contourOverlay.values.length -
        contourOverlay.covered} coverage gaps · {contours.length} contour segments ·
      {" "}phase −π to π {contourOverlay.unit}. Source {contourOverlay.source};
      {" "}verified real and imaginary samples {contourOverlay.verifiedComponents?.map(part =>
        `${part.name}: ${part.sampleSha256}`).join(" · ")}.
    </p>}
    <div className="vector-field3d-slice-legend" role="img"
      aria-label={`Color legend, ${(scalarOverlay?.min ?? slice.min).toPrecision(4)} to ${(scalarOverlay?.max ?? slice.max).toPrecision(4)} ${scalarOverlay?.unit ?? slice.unit}`}>
      <span>{(scalarOverlay?.min ?? slice.min).toPrecision(4)}</span><span className="vector-field3d-slice-legend-bar"
        style={scalarOverlay?.mode === "complex-phase" ? { background:
          "linear-gradient(90deg, #f15353, #e9e74e, #50d7aa, #5f9ff0, #f15353)" } : undefined} />
      <span>{(scalarOverlay?.max ?? slice.max).toPrecision(4)} {scalarOverlay?.unit ?? slice.unit}</span>
    </div>
    <p role="status">{slice.channel} {slice.min.toPrecision(4)}–{slice.max.toPrecision(4)} {slice.unit};
      {" "}{slice.rejected} invalid of {slice.evaluated} samples. Dimmed cells lie outside the display clip;
      clipping and camera changes do not alter these values.
      {slice.method && ` Approximate · ${slice.method}${slice.stencilGrid === "source" ?
        " on the source grid" : " on the bounded preview grid"}; ${slice.boundarySamples} boundary stencils have reduced accuracy.`}</p>
    {slice.verifiedSamples && <details aria-label="Slice sample provenance"><summary>Verified slice samples</summary>
      <p>Source <code>{slice.sourceHash}</code>.</p>
      <ul>{slice.verifiedSamples.map(part => <li key={part.name}>{part.name}: <code>{part.sampleSha256}</code> ·
        {part.verifiedTiles !== undefined ?
          ` ${part.verifiedTiles} of ${part.totalTiles} source tiles verified` :
          part.verifiedChunks !== undefined ?
            ` ${part.verifiedChunks} of ${part.totalChunks} source chunks verified` :
            " complete source resource verified"}</li>)}</ul>
    </details>}
    {profile.length > 0 && !(linkedLineProfile?.normalAxis === slice.normalAxis &&
      linkedLineProfile.visible && (document.workspace?.scalarOverlay?.visible ||
        document.workspace?.complexOverlay?.visible)) &&
      <section className="vector-field3d-line-profile" aria-label="Line profile through probe">
      <label>Line direction <select aria-label="Line profile direction" value={profileDirection}
        onChange={event => setProfileDirection(Number(event.target.value) as 0 | 1)}>
        <option value="0">Vary {firstAxis.label}</option>
        <option value="1">Vary {secondAxis.label}</option>
      </select></label>
      <p>{slice.channel} along {document.source.axes[slice.planeAxes[profileDirection]].label};
        {" "}{document.source.axes[slice.planeAxes[1 - profileDirection]].label} fixed at
        {" "}{probe![slice.planeAxes[1 - profileDirection]]} {document.source.axes[slice.planeAxes[1 - profileDirection]].unit};
        {" "}{normalAxis.label} fixed at {slice.fixedCoordinate} {normalAxis.unit}.</p>
      <svg viewBox="0 0 320 130" role="img" aria-label={`${slice.channel} line profile, ${
        finiteProfile.length} finite of ${profile.length} samples; ${
        Number.isFinite(profileMin) ? profileMin.toPrecision(4) : "no finite minimum"} to ${
        Number.isFinite(profileMax) ? profileMax.toPrecision(4) : "no finite maximum"} ${slice.unit}`}>
        <rect x="0" y="0" width="320" height="130" fill="#13243b" rx="6" />
        <path d="M24 24V104H296" fill="none" stroke="#94a3b8" />
        <path d={profilePath} fill="none" stroke="#fde047" strokeWidth="2" />
      </svg>
      <small>Current slice preview · document revision {slice.source.revision} ·
        {" "}{profile.length} bounded samples · {slice.unit} against
        {" "}{document.source.axes[slice.planeAxes[profileDirection]].unit}.
        {slice.sourceHash && ` Source ${slice.sourceHash}.`}</small>
      {document.source.field.kind === "expressions" && onSendLineToGraphs &&
        slice.channel !== "divergence" && !slice.channel.startsWith("curl-") &&
        !slice.channel.startsWith("grad-speed") && slice.channel !== "laplacian-speed" && <button type="button"
        onClick={() => onSendLineToGraphs(slice.channel === "magnitude" ? "speed" :
          slice.channel as "p" | "q" | "r",
          slice.planeAxes[profileDirection] as 0 | 1 | 2, probe as [number, number, number])}>
        Send analytic line to Graphs</button>}
      {document.source.field.kind === "scientific-bundle" && onSendDerivedLineToGraphs &&
        ["divergence", "curl-x", "curl-y", "curl-z", "grad-speed-x", "grad-speed-y",
          "grad-speed-z", "grad-speed-magnitude", "laplacian-speed"].includes(slice.channel) &&
        <button type="button" data-testid="vector-field3d-send-derived-line"
          disabled={derivedLineBusy} onClick={() => onSendDerivedLineToGraphs(slice,
            slice.planeAxes[profileDirection] as 0 | 1 | 2,
            probe![slice.planeAxes[1 - profileDirection]])}>
          {derivedLineBusy ? "Verifying derived line…" : "Send derived line to Graphs"}</button>}
    </section>}
    {onLinkedLineProfileChange && <LinkedOverlayProfileView document={document} slice={slice}
      probe={probe ?? null} profile={linkedLineProfile} vectorPlane={overlayVectorPlane}
      scalarVolume={scalarOverlayVolume} complexVolumes={complexOverlayVolumes}
      vectorSamples={overlayVectorSamples}
      status={overlayStatus} mismatch={linkedProfileMismatch}
      onChange={onLinkedLineProfileChange} onSendToGraphs={onSendLinkedLineToGraphs}
      sendBusy={linkedLineBusy} />}
    {onOverlayRegionChange && <OverlayRegionView document={document} slice={slice}
      region={overlayRegion} vectorPlane={overlayVectorPlane ?? null}
      linkedRegionFocus={graphFocusMatches ? linkedRegionFocus : null}
      scalarVolume={scalarOverlayVolume ?? null} vectorSamples={overlayVectorSamples}
      complexVolumes={complexOverlayVolumes ?? null}
      savedResults={savedRegionResults} resultStatuses={regionResultStatuses}
      onSaveResult={onSaveRegionResult}
      onSendToGraphs={onSendRegionToGraphs}
      onSendCombinedToGraphs={onSendCombinedRegionToGraphs} regionBusy={regionBusy}
      graphSelectionMode={graphSelectionMode} graphSelectionFirstX={graphSelectionFirstX}
      graphSelectionBusy={graphSelectionBusy} graphSelectionError={graphSelectionError}
      onGraphSelectionMode={onFocusRegionInGraphs ? mode => {
        setRegionSelecting(false); setRegionFirstCorner(null);
        setGraphSelectionMode(mode); setGraphSelectionFirstX(null); setGraphSelectionError("");
      } : undefined}
      status={overlayStatus} onChange={onOverlayRegionChange}
      vectorStatus={vectorStatus} scalarStatus={scalarStatus} complexStatus={complexStatus}
      selecting={regionSelecting} onStartSelection={() => {
        setGraphSelectionMode(null); setGraphSelectionFirstX(null);
        setRegionSelecting(!regionSelecting); setRegionFirstCorner(null);
      }} />}
  </figure>;
}
