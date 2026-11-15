import type { VectorField3DClipBounds, VectorField3DDocument } from "@math3d/core";
import type { FieldExplorerDifferenceSlice } from "./fieldExplorerDifferenceSlice";
import { slicePlot } from "./sliceSeedPlacement";

export function FieldExplorerDifferenceView({ document, slice, probe, clipBounds, onProbeSelect }: {
  document: VectorField3DDocument; slice: FieldExplorerDifferenceSlice;
  probe: readonly [number, number, number] | null; clipBounds: VectorField3DClipBounds;
  onProbeSelect: (point: readonly [number, number, number]) => void;
}) {
  const [first, second] = slice.planeAxes;
  const xAxis = document.source.axes[first]!, yAxis = document.source.axes[second]!;
  const { left, top, width, height } = slicePlot;
  const dx = width / slice.shape[0], dy = height / slice.shape[1];
  const magnitude = slice.channel === "magnitude";
  const extent = Math.max(Math.abs(slice.min), Math.abs(slice.max));
  const low = magnitude ? 0 : -extent, high = magnitude ? slice.max : extent;
  const title = magnitude ? "‖A−B‖ vector-difference magnitude" : `A−B signed ${slice.channel} component`;
  const pointAt = (x: number, y: number) => {
    const point: [number, number, number] = [0, 0, 0];
    point[slice.normalAxis] = slice.fixedCoordinate;
    point[first] = slice.coordinates[0][x]!; point[second] = slice.coordinates[1][y]!;
    return point;
  };
  const clipped = (point: readonly number[]) => point.some((value, axis) =>
    value < clipBounds[axis]![0] || value > clipBounds[axis]![1]);
  const select = (x: number, y: number) => { const point = pointAt(x, y);
    if (!clipped(point)) onProbeSelect(point); };
  const probeIndices = probe && Math.abs(probe[slice.normalAxis] - slice.fixedCoordinate) < 1e-9 ?
    slice.planeAxes.map((axis, local) => slice.coordinates[local]!
      .findIndex(value => Math.abs(value - probe[axis]!) < 1e-9)) : [-1, -1];
  const hasProbe = probeIndices.every(index => index >= 0);
  const color = (value: number) => {
    const t = extent ? Math.min(1, Math.abs(value) / extent) : 0;
    const target = !magnitude && value < 0 ? [47, 114, 219] : [220, 65, 70];
    return `rgb(${[241, 245, 249].map((base, i) => Math.round(base + (target[i]! - base) * t)).join(", ")})`;
  };
  return <section aria-label="Difference A−B" data-testid="field-difference-view">
    <h4>Difference · A−B</h4>
    <p>{title}. {magnitude ? "Magnitude of the vector difference; not the difference of magnitudes." :
      "Blue is negative, white is zero, red is positive."}</p>
    <figure className="vector-field3d-slice">
      <figcaption>{xAxis.label.toUpperCase()}{yAxis.label.toUpperCase()} plane ·
        {" "}{document.source.axes[slice.normalAxis].label} = {slice.fixedCoordinate} {slice.fixedUnit} ·
        {" "}{slice.shape.join(" × ")} matching samples</figcaption>
      <svg viewBox="0 0 650 555" role="img" tabIndex={0}
        aria-label={`${title} map from ${slice.min.toPrecision(4)} to ${slice.max.toPrecision(4)} ${slice.unit}. Arrow keys move the linked probe.`}
        onKeyDown={event => {
          const steps: Record<string, readonly [number, number]> = {
            ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1] };
          const step = steps[event.key]; if (!step) return;
          event.preventDefault(); event.stopPropagation();
          const current = hasProbe ? probeIndices : slice.shape.map(n => Math.floor(n / 2));
          select(Math.max(0, Math.min(slice.shape[0] - 1, current[0]! + step[0])),
            Math.max(0, Math.min(slice.shape[1] - 1, current[1]! + step[1])));
        }}>
        {slice.values.map((value, index) => {
          const x = Math.floor(index / slice.shape[1]), y = index % slice.shape[1];
          const point = pointAt(x, y), outside = clipped(point);
          return <rect key={index} data-difference-cell={`${x}-${y}`} data-value={value}
            x={left + x * dx} y={top + (slice.shape[1] - 1 - y) * dy}
            width={dx + .3} height={dy + .3} fill={color(value)} opacity={outside ? .2 : 1}
            style={{ cursor: outside ? "default" : "crosshair" }} onClick={() => select(x, y)}>
            <title>{point.map((v, i) => `${document.source.axes[i]!.label}=${v} ${document.source.axes[i]!.unit}`).join(", ")};
              {" "}{title} = {value.toPrecision(6)} {slice.unit}</title>
          </rect>;
        })}
        {hasProbe && <g data-testid="field-difference-probe" stroke="#fde047" strokeWidth="2" pointerEvents="none">
          <line x1={left + (probeIndices[0]! + .5) * dx} x2={left + (probeIndices[0]! + .5) * dx} y1={top} y2={top + height} />
          <line x1={left} x2={left + width} y1={top + (slice.shape[1] - probeIndices[1]! - .5) * dy}
            y2={top + (slice.shape[1] - probeIndices[1]! - .5) * dy} />
        </g>}
        <text x={left} y={top + height + 21} fill="currentColor">{slice.coordinates[0][0]}</text>
        <text x={left + width} y={top + height + 21} textAnchor="end" fill="currentColor">{slice.coordinates[0].at(-1)}</text>
        <text x={left + width / 2} y={top + height + 43} textAnchor="middle" fill="currentColor">{xAxis.label} ({xAxis.unit})</text>
        <text x={left - 7} y={top + height} textAnchor="end" fill="currentColor">{slice.coordinates[1][0]}</text>
        <text x={left - 7} y={top + 12} textAnchor="end" fill="currentColor">{slice.coordinates[1].at(-1)}</text>
        <text x={16} y={top + height / 2} fill="currentColor"
          transform={`rotate(-90 16 ${top + height / 2})`} textAnchor="middle">{yAxis.label} ({yAxis.unit})</text>
      </svg>
      <div className="vector-field3d-slice-legend" aria-label={`Difference color legend, ${low.toPrecision(4)} to ${high.toPrecision(4)} ${slice.unit}`}>
        <span>{low.toPrecision(4)}</span><span className="vector-field3d-slice-legend-bar" style={{ background: magnitude ?
          "linear-gradient(to right, #f1f5f9, #dc4146)" : "linear-gradient(to right, #2f72db, #f1f5f9, #dc4146)" }} />
        <span>{high.toPrecision(4)} {slice.unit}</span>
      </div>
      <p role="status" data-testid="field-difference-range">{title}: {slice.min.toPrecision(6)}–{slice.max.toPrecision(6)} {slice.unit};
        {" "}coverage {slice.values.length}/{slice.shape[0] * slice.shape[1]}. Native-grid samples; no cross-grid interpolation.</p>
    </figure>
    <details><summary>Difference source pair</summary>{slice.sources.map((source, i) =>
      <p key={i}>{i ? "B" : "A"}: {source.documentId} · revision {source.revision} · {source.structuralHash}</p>)}</details>
  </section>;
}
