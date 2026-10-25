import type { VectorField3DDocument, VectorField3DSliceArtifact } from "@math3d/core";

const color = (value: number | null, min: number, max: number) => {
  if (value === null) return "#64748b";
  const t = max === min ? .5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `rgb(${Math.round(35 + 212 * t)}, ${Math.round(105 + 110 * (1 - Math.abs(2 * t - 1)))}, ${Math.round(224 - 184 * t)})`;
};

export function VectorField3DSliceView({ document, slice, probe, onProbeSelect }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  probe?: readonly [number, number, number] | null;
  onProbeSelect?: (point: readonly [number, number, number]) => void;
}) {
  const [first, second] = slice.planeAxes, width = 560, height = 480;
  const cellWidth = width / slice.shape[0], cellHeight = height / slice.shape[1];
  const firstAxis = document.source.axes[first], secondAxis = document.source.axes[second];
  const normalAxis = document.source.axes[slice.normalAxis];
  const probeOnPlane = probe && Math.abs(probe[slice.normalAxis] - slice.fixedCoordinate) < 1e-9;
  const probeFirst = probeOnPlane ? slice.coordinates[0].findIndex(value => Math.abs(value - probe[first]) < 1e-9) : -1;
  const probeSecond = probeOnPlane ? slice.coordinates[1].findIndex(value => Math.abs(value - probe[second]) < 1e-9) : -1;
  return <figure className="vector-field3d-slice" aria-label={`${firstAxis.label.toUpperCase()}${secondAxis.label.toUpperCase()} field slice`}>
    <figcaption>{firstAxis.label.toUpperCase()}{secondAxis.label.toUpperCase()} plane ·
      {" "}{normalAxis.label} = {slice.fixedCoordinate} {slice.fixedUnit} · {slice.shape.join(" × ")} bounded samples</figcaption>
    <svg viewBox="0 0 640 560" role="img" aria-label={`${slice.channel} map from ${slice.min.toPrecision(4)} to ${slice.max.toPrecision(4)} ${slice.unit}; ${slice.rejected} invalid samples`}>
      <rect x="58" y="16" width={width} height={height} fill="#0d1726" />
      {slice.values.map((value, index) => {
        const x = Math.floor(index / slice.shape[1]), y = index % slice.shape[1];
        return <rect key={index} data-probe-cell={`${x}-${y}`}
          x={58 + x * cellWidth} y={16 + (slice.shape[1] - 1 - y) * cellHeight}
          width={cellWidth + .3} height={cellHeight + .3} fill={color(value, slice.min, slice.max)}
          style={{ cursor: onProbeSelect ? "crosshair" : undefined }} onClick={() => {
            if (!onProbeSelect) return;
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
          x2={58 + (probeFirst + .5) * cellWidth} y2={16 + height} />
        <line x1="58" y1={16 + (slice.shape[1] - probeSecond - .5) * cellHeight}
          x2={58 + width} y2={16 + (slice.shape[1] - probeSecond - .5) * cellHeight} />
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
      {" "}{slice.rejected} invalid of {slice.evaluated} samples. Camera changes do not alter these values.</p>
  </figure>;
}
