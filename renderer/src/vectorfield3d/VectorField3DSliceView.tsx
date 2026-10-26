import { useState } from "react";
import type { VectorField3DDocument, VectorField3DSliceArtifact,
  VectorField3DClipBounds } from "@math3d/core";
import { sliceSeedMarkerAtPoint, sliceSeedPointAtSvgPosition, slicePlot } from "./sliceSeedPlacement";

const color = (value: number | null, min: number, max: number) => {
  if (value === null) return "#64748b";
  const t = max === min ? .5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `rgb(${Math.round(35 + 212 * t)}, ${Math.round(105 + 110 * (1 - Math.abs(2 * t - 1)))}, ${Math.round(224 - 184 * t)})`;
};

export function VectorField3DSliceView({ document, slice, probe, clipBounds, zoom = 1,
  center = [0.5, 0.5], onZoomChange, onCenterChange, onProbeSelect, onSendLineToGraphs,
  onSendDerivedLineToGraphs, derivedLineBusy, seedPlacementActive = false,
  seedPlacementDisabled = false, onSeedPlacementToggle, onSeedPropose, proposedSeed }: {
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
  onSendLineToGraphs?: (component: "p" | "q" | "r" | "speed", varyingAxis: 0 | 1 | 2,
    point: readonly [number, number, number]) => void;
  onSendDerivedLineToGraphs?: (slice: VectorField3DSliceArtifact, varyingAxis: 0 | 1 | 2,
    profileFixedCoordinate: number) => void;
  derivedLineBusy?: boolean;
}) {
  const [profileDirection, setProfileDirection] = useState<0 | 1>(0);
  const [first, second] = slice.planeAxes;
  const { left, top, width, height } = slicePlot;
  const cellWidth = width / slice.shape[0], cellHeight = height / slice.shape[1];
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
  return <figure className="vector-field3d-slice" aria-label={`${firstAxis.label.toUpperCase()}${secondAxis.label.toUpperCase()} field slice`}>
    <figcaption>{firstAxis.label.toUpperCase()}{secondAxis.label.toUpperCase()} plane ·
      {" "}{normalAxis.label} = {slice.fixedCoordinate} {slice.fixedUnit} · {slice.shape.join(" × ")} bounded samples</figcaption>
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
        if (!seedPlacementActive || !onSeedPropose) return;
        const transform = event.currentTarget.getScreenCTM();
        if (!transform) { onSeedPropose(null); return; }
        const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
        onSeedPropose(sliceSeedPointAtSvgPosition(slice, local.x, local.y));
      }}>
      <rect x={left} y={top} width={width} height={height} fill="#0d1726" />
      {slice.values.map((value, index) => {
        const x = Math.floor(index / slice.shape[1]), y = index % slice.shape[1];
        const clipped = clipBounds && (slice.fixedCoordinate < clipBounds[slice.normalAxis]![0] ||
          slice.fixedCoordinate > clipBounds[slice.normalAxis]![1] ||
          slice.coordinates[0][x]! < clipBounds[first]![0] ||
          slice.coordinates[0][x]! > clipBounds[first]![1] ||
          slice.coordinates[1][y]! < clipBounds[second]![0] ||
          slice.coordinates[1][y]! > clipBounds[second]![1]);
        return <rect key={index} data-probe-cell={`${x}-${y}`}
          x={left + x * cellWidth} y={top + (slice.shape[1] - 1 - y) * cellHeight}
          width={cellWidth + .3} height={cellHeight + .3} fill={color(value, slice.min, slice.max)}
          opacity={clipped ? .2 : 1}
          style={{ cursor: seedPlacementActive || onProbeSelect ? "crosshair" : undefined }} onClick={() => {
            if (!onProbeSelect || seedPlacementActive) return;
            const point = [0, 0, 0] as [number, number, number];
            point[slice.normalAxis] = slice.fixedCoordinate;
            point[first] = slice.coordinates[0][x]!;
            point[second] = slice.coordinates[1][y]!;
            onProbeSelect(point);
          }} />;
      })}
      {probeFirst >= 0 && probeSecond >= 0 && <g data-testid="vector-field3d-slice-crosshair"
        stroke="#fff" strokeWidth="2" pointerEvents="none">
        <line x1={58 + (probeFirst + .5) * cellWidth} y1="16"
          x2={58 + (probeFirst + .5) * cellWidth} y2={16 + height}
          stroke={profileDirection === 1 ? "#fde047" : "#fff"} />
        <line x1="58" y1={16 + (slice.shape[1] - probeSecond - .5) * cellHeight}
          x2={58 + width} y2={16 + (slice.shape[1] - probeSecond - .5) * cellHeight}
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
    <div className="vector-field3d-slice-legend" role="img"
      aria-label={`Color legend, ${slice.min.toPrecision(4)} to ${slice.max.toPrecision(4)} ${slice.unit}`}>
      <span>{slice.min.toPrecision(4)}</span><span className="vector-field3d-slice-legend-bar" />
      <span>{slice.max.toPrecision(4)} {slice.unit}</span>
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
    {profile.length > 0 && <section className="vector-field3d-line-profile" aria-label="Line profile through probe">
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
  </figure>;
}
