import { useMemo } from "react";
import type { Graph2DScientificPlane, ScientificCoordinateSystem } from "@math3d/core";
import { buildScientificVectorGlyphs, SCIENTIFIC_VECTOR_GLYPH_LIMIT } from "./scientificVectorGlyphs";

const format = (value: number) => Number(value.toPrecision(4)).toString();

export function ScientificFieldVectorPlane({ planes, coordinate, label, unit }: {
  planes: readonly [Graph2DScientificPlane, Graph2DScientificPlane];
  coordinate: ScientificCoordinateSystem; label: string; unit: string;
}) {
  const preview = useMemo(() => buildScientificVectorGlyphs(planes, coordinate), [planes, coordinate]);
  const [horizontal, vertical] = planes;
  const xAxis = coordinate.axes[0]!, yAxis = coordinate.axes[1]!;
  const xLabel = xAxis.name + " (" + xAxis.unit + ")", yLabel = yAxis.name + " (" + yAxis.unit + ")";
  const color = (magnitude: number) => {
    const fraction = preview.maximum === preview.minimum ? 0.5 :
      (magnitude - preview.minimum) / (preview.maximum - preview.minimum);
    return "hsl(" + (215 - 185 * fraction) + " 72% 42%)";
  };
  return <figure className="graph2d-scientific-field graph2d-scientific-vector"
    aria-label={"Verified 2D vector field for " + label}>
    <figcaption>{label} · {horizontal.component} → {xAxis.name}, {vertical.component} → {yAxis.name} ·
      {" "}{horizontal.shape.join(" × ")} samples</figcaption>
    <svg viewBox="0 0 600 430" role="img" style={{ width: "100%", maxWidth: 650, height: "auto" }}
      aria-label={label + " vector arrows; " + horizontal.component + " along " + xLabel +
        " horizontally and " + vertical.component + " along " + yLabel + " vertically; magnitude " +
        format(preview.minimum) + " to " + format(preview.maximum) + " " + unit}>
      <rect x="58" y="18" width="510" height="350" fill="#f8fbff" stroke="#8ba6c4" />
      {[0.25, 0.5, 0.75].map(fraction => <g key={fraction} stroke="#dce8f6" strokeWidth="1">
        <line x1={58 + fraction * 510} x2={58 + fraction * 510} y1="18" y2="368" />
        <line x1="58" x2="568" y1={18 + fraction * 350} y2={18 + fraction * 350} />
      </g>)}
      {preview.glyphs.map((glyph, index) => {
        const x = 58 + glyph.x * 510, y = 18 + glyph.y * 350;
        if (glyph.magnitude === 0) return <circle key={index} cx={x} cy={y} r="2" fill="#63758c" />;
        const length = 11 * glyph.magnitude / preview.maximum;
        const dx = glyph.vx / glyph.magnitude, dy = -glyph.vy / glyph.magnitude;
        const tipX = x + dx * length, tipY = y + dy * length;
        const backX = tipX - dx * Math.min(4, length * 0.5);
        const backY = tipY - dy * Math.min(4, length * 0.5);
        const shade = color(glyph.magnitude);
        return <g key={index} fill={shade} stroke={shade} strokeWidth="1.5">
          <line x1={x - dx * length} y1={y - dy * length} x2={tipX} y2={tipY} />
          <path d={"M " + tipX + " " + tipY + " L " + (backX - dy * 2.5) + " " + (backY + dx * 2.5) +
            " L " + (backX + dy * 2.5) + " " + (backY - dx * 2.5) + " Z"} />
        </g>;
      })}
      <text x="58" y="386" fontSize="12" fill="#28435d">{format(preview.xRange[0])}</text>
      <text x="568" y="386" textAnchor="end" fontSize="12" fill="#28435d">{format(preview.xRange[1])}</text>
      <text x="48" y="368" textAnchor="end" fontSize="12" fill="#28435d">{format(preview.yRange[0])}</text>
      <text x="48" y="29" textAnchor="end" fontSize="12" fill="#28435d">{format(preview.yRange[1])}</text>
      <text x="313" y="413" textAnchor="middle" fontSize="14" fill="#173553">{xLabel}</text>
      <text x="17" y="193" textAnchor="middle" transform="rotate(-90 17 193)" fontSize="14" fill="#173553">{yLabel}</text>
    </svg>
    <div className="graph2d-scientific-vector-legend"
      aria-label={"Magnitude legend " + format(preview.minimum) + " to " + format(preview.maximum) + " " + unit}>
      <span>Magnitude ({unit})</span><span>{format(preview.minimum)}</span>
      <span className="graph2d-scientific-vector-scale" aria-hidden="true" />
      <span>{format(preview.maximum)}</span>
    </div>
    <p>{preview.glyphs.length} arrows or stationary points shown (limit {SCIENTIFIC_VECTOR_GLYPH_LIMIT}) ·
      {" "}{horizontal.component} is horizontal, {vertical.component} is vertical.</p>
    <small>Verified components: {horizontal.component} {horizontal.planeSha256}; {vertical.component} {vertical.planeSha256}
      {" "}· source resources {horizontal.resourceSha256}, {vertical.resourceSha256}</small>
  </figure>;
}
