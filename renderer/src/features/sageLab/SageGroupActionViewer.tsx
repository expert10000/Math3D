import { useState } from "react";
import type { ProjectAlgebraEvidence, SageGroupActionResult } from "@math3d/core";

type Generator = { name: string; images: readonly number[] };
const colors = ["#2563eb", "#dc2626", "#059669"];

/** A discrete graph of the exact saved generator action; no layout geometry has mathematical meaning. */
export default function SageGroupActionViewer({ evidence }: { evidence: ProjectAlgebraEvidence }) {
  const result = evidence.result as SageGroupActionResult;
  const definition = evidence.request.params.definition as {
    representation: "permutation" | "abelian"; generators: readonly (Generator | string)[];
    invariantFactors?: readonly number[] };
  const [selected, setSelected] = useState(result.point);
  const degree = result.actionDegree;
  const generators: Generator[] = definition.representation === "permutation"
    ? definition.generators as Generator[]
    : definition.generators.map((name, index) => {
      const offset = definition.invariantFactors!.slice(0, index).reduce((sum, item) => sum + item, 0);
      const factor = definition.invariantFactors![index];
      return { name: name as string, images: Array.from({ length: degree }, (_, position) =>
        position >= offset && position < offset + factor
          ? offset + ((position - offset + 1) % factor) + 1 : position + 1) };
    });
  const points = Array.from({ length: degree }, (_, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / degree;
    return { id: index + 1, x: 210 + 125 * Math.cos(angle), y: 160 + 115 * Math.sin(angle) };
  });
  return <section data-testid="cas-group-action-viewer" aria-label="Group action on finite points"
    style={{ marginTop: 10, border: "1px solid #c7d9ed", borderRadius: 8, padding: 10, background: "#f8fbff" }}>
    <strong>Natural permutation action · {degree} points</strong>
    <p style={{ margin: "5px 0", fontSize: 11 }}>An arrow i → g(i) shows a saved generator. The computed orbit of point {result.point} is highlighted; click a point to inspect its images.</p>
    <svg data-testid="cas-group-action-scene" viewBox="0 0 420 320" role="group"
      aria-label={`Group action on ${degree} discrete points`} style={{ width: "100%", maxWidth: 420, background: "#fff" }}>
      <defs>{generators.map((_, index) => <marker key={index} id={`group-action-arrow-${index}`}
        markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
        <path d="M0 0 L7 3.5 L0 7 Z" fill={colors[index % colors.length]} />
      </marker>)}</defs>
      {generators.flatMap((generator, generatorIndex) => points.map((from) => {
        const to = points[generator.images[from.id - 1] - 1];
        const d = from.id === to.id
          ? `M${from.x - 12},${from.y - 10} C${from.x - 42},${from.y - 45} ${from.x + 42},${from.y - 45} ${from.x + 12},${from.y - 10}`
          : `M${from.x},${from.y} L${to.x},${to.y}`;
        return <path key={`${generatorIndex}-${from.id}`} data-testid="cas-group-action-edge" d={d}
          fill="none" stroke={colors[generatorIndex % colors.length]} strokeWidth="1.5"
          markerEnd={`url(#group-action-arrow-${generatorIndex})`} />;
      }))}
      {points.map((point) => <g key={point.id} role="button" tabIndex={0}
        aria-label={`Point ${point.id}${result.orbit.includes(point.id) ? ", in selected orbit" : ""}`}
        aria-pressed={selected === point.id} onClick={() => setSelected(point.id)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); setSelected(point.id);
        } }} style={{ cursor: "pointer" }}>
        <circle cx={point.x} cy={point.y} r="18" stroke="#1d4ed8"
          fill={selected === point.id ? "#bfdbfe" : result.orbit.includes(point.id) ? "#dbeafe" : "#fff"} />
        <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="12" fill="#17365d">{point.id}</text>
      </g>)}
    </svg>
    <div style={{ fontSize: 11 }}>{generators.map((generator, index) => <span key={index}
      style={{ marginRight: 12, color: colors[index % colors.length] }}>● {generator.name}</span>)}</div>
    <div data-testid="cas-group-action-selection" style={{ fontSize: 11, marginTop: 6 }}>
      Point {selected}: {generators.map((generator) => `${generator.name} → ${generator.images[selected - 1]}`).join(" · ")}
    </div>
  </section>;
}
