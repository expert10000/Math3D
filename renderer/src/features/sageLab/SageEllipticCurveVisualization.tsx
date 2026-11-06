import { useState } from "react";
import { enumerateFiniteEllipticCurve, parseRational, realEllipticTangent,
  sampleRealEllipticCurve, type AlgebraObjectRecord, type Math3DProject,
  type SageEllipticCurveResult } from "@math3d/core";

type Props = { project: Math3DProject; curve: AlgebraObjectRecord };
const numeric = (value: string) => { const [numerator, denominator] = parseRational(value);
  return Number(numerator) / Number(denominator); };

export default function SageEllipticCurveVisualization({ project, curve }: Props) {
  const [evidenceId, setEvidenceId] = useState("");
  const [leftDraft, setLeftDraft] = useState("-3");
  const [rightDraft, setRightDraft] = useState("3");
  const [range, setRange] = useState<readonly [number, number]>([-3, 3]);
  const [message, setMessage] = useState("");
  if (curve.definition.kind !== "elliptic-curve") return null;
  const definition = curve.definition;
  const parent = project.algebraObjects?.find((entry) => entry.id === definition.baseField.objectId)
    ?.revisions[definition.baseField.revision - 1];
  if (!parent || (parent.definition.kind !== "rational-field" && parent.definition.kind !== "finite-field")) return null;
  const studies = (project.algebraEvidence ?? []).filter((item) =>
    item.request.operation === "sage.ellipticCurve.dossier" && item.request.target.objectId === curve.id &&
    item.request.target.revision === curve.revision);
  const selected = studies.find((item) => item.id === evidenceId) ?? studies.at(-1);
  const result = selected?.result as SageEllipticCurveResult | undefined;
  const sampleSelector = studies.length ? <label style={{ fontSize: 12 }}>Saved point calculation
    <select aria-label="Saved curve point calculation" value={selected?.id ?? ""}
      onChange={(event) => setEvidenceId(event.target.value)} style={{ display: "block", maxWidth: "100%" }}>
      {studies.map((item) => <option key={item.id} value={item.id}>
        Sage {item.runtime.version} · {item.result && (item.result as SageEllipticCurveResult).point?.join(", ") || "invariants only"}</option>)}</select>
  </label> : <small>Run the saved curve dossier with an integer point to show its group-law witness.</small>;

  if (parent.definition.kind === "rational-field") {
    const view = sampleRealEllipticCurve(definition, range[0], range[1]);
    const tangent = result?.point ? realEllipticTangent(definition, result.point) : null;
    const xTo = (x: number) => 52 + (x - view.xMin) * 456 / (view.xMax - view.xMin);
    const yTo = (y: number) => 176 - y * 145 / view.yMax;
    const path = (segment: readonly (readonly [number, number])[]) => segment.map(([x, y], index) =>
      `${index ? "L" : "M"}${xTo(x).toFixed(2)},${yTo(y).toFixed(2)}`).join(" ");
    const clipId = `elliptic-real-${curve.id.slice(-12)}`;
    const mark = (label: string, point: readonly [string, string], fill: string) => {
      const x = numeric(point[0]), y = numeric(point[1]);
      if (x < view.xMin || x > view.xMax || Math.abs(y) > view.yMax) return null;
      return <g key={label}><circle cx={xTo(x)} cy={yTo(y)} r="5" fill={fill} stroke="#fff" strokeWidth="1.2" />
        <text x={xTo(x) + 7} y={yTo(y) - 7} fontSize="13" fill={fill}>{label}</text></g>;
    };
    return <section data-testid="cas-elliptic-real-view" aria-label="Real elliptic curve visualization"
      style={{ display: "grid", gap: 9, border: "1px solid #b9cce3", borderRadius: 8, padding: 12 }}>
      <strong>Real-coordinate curve · numerical sample</strong>
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", fontSize: 12 }}>
        <label>x minimum<input aria-label="Real curve x minimum" value={leftDraft}
          onChange={(event) => setLeftDraft(event.target.value)} style={{ display: "block", width: 80 }} /></label>
        <label>x maximum<input aria-label="Real curve x maximum" value={rightDraft}
          onChange={(event) => setRightDraft(event.target.value)} style={{ display: "block", width: 80 }} /></label>
        <button type="button" onClick={() => { try {
          const left = Number(leftDraft), right = Number(rightDraft);
          if (!leftDraft.trim() || !rightDraft.trim()) throw new TypeError("Enter both x limits.");
          sampleRealEllipticCurve(definition, left, right);
          setRange([left, right]); setMessage("");
        } catch (error) { setMessage(String((error as Error).message ?? error)); } }}>Draw real view</button>
      </div>
      {message && <div role="alert">{message}</div>}
      {sampleSelector}
      <figure style={{ margin: 0, maxWidth: 620 }}>
        <svg role="img" aria-label="Real elliptic curve branches with optional tangent and reflected double point"
          viewBox="0 0 560 352" style={{ width: "100%", background: "#f7fbff", border: "1px solid #b9cce3",
            borderRadius: 8 }}>
          <defs><clipPath id={clipId}><rect x="52" y="28" width="456" height="296" /></clipPath></defs>
          <rect x="52" y="28" width="456" height="296" fill="none" stroke="#cbd5e1" />
          {view.xMin <= 0 && view.xMax >= 0 && <line x1={xTo(0)} x2={xTo(0)} y1="28" y2="324" stroke="#a6b5c9" />}
          <line x1="52" x2="508" y1={yTo(0)} y2={yTo(0)} stroke="#a6b5c9" />
          <g clipPath={`url(#${clipId})`}>
            {view.segments.map((segment, index) => <path key={index} d={path(segment)}
              fill="none" stroke="#155eab" strokeWidth="2.2" />)}
            {tangent && (tangent.rule === "vertical-to-infinity" ?
              <line x1={xTo(Number(tangent.point[0]))} x2={xTo(Number(tangent.point[0]))}
                y1="28" y2="324" stroke="#bf5a26" strokeDasharray="6 4" strokeWidth="1.7" /> : (() => {
                const x = numeric(tangent.point[0]), y = numeric(tangent.point[1]), slope = numeric(tangent.slope!);
                return <line x1={xTo(view.xMin)} x2={xTo(view.xMax)}
                  y1={yTo(y + slope * (view.xMin - x))} y2={yTo(y + slope * (view.xMax - x))}
                  stroke="#bf5a26" strokeDasharray="6 4" strokeWidth="1.7" />;
              })())}
            {tangent && mark("P", tangent.point, "#8a3415")}
            {tangent?.thirdIntersection && mark("R", tangent.thirdIntersection, "#a44a12")}
            {tangent?.doublePoint && mark("2P", tangent.doublePoint, "#673ab7")}
          </g>
          <text x="52" y="343" fontSize="11" fill="#475569">x {view.xMin} … {view.xMax}</text>
          <text x="420" y="343" fontSize="11" fill="#475569">y in ℝ</text>
        </svg>
        <figcaption style={{ fontSize: 12, color: "#475569" }}>
          Bounded real numerical sample ({view.sampleCount} x positions). Curve branches are not an exact point enumeration.
        </figcaption>
      </figure>
      {tangent && <div data-testid="cas-elliptic-real-tangent" style={{ fontSize: 12 }}>
        {tangent.rule === "vertical-to-infinity" ?
          `P=(${tangent.point.join(", ")}); vertical tangent; 2P is the point at infinity.` :
          `P=(${tangent.point.join(", ")}); tangent slope ${tangent.slope}; third intersection ` +
          `R=(${tangent.thirdIntersection?.join(", ")}); reflect across the x-axis to 2P=(${tangent.doublePoint?.join(", ")}).`}
      </div>}
    </section>;
  }

  const p = parent.definition.characteristic;
  if (p > 31) return <section data-testid="cas-elliptic-finite-limit" role="status"
    style={{ border: "1px solid #b9cce3", borderRadius: 8, padding: 12 }}>
    <strong>Discrete GF({p}) curve</strong><p>Complete finite-field diagrams are bounded to p ≤ 31.
      The saved curve and exact arithmetic remain available in Structures and Operations.</p></section>;
  const view = enumerateFiniteEllipticCurve(definition, p);
  const xTo = (x: number) => 57 + x * 320 / Math.max(1, p - 1);
  const yTo = (y: number) => 370 - y * 320 / Math.max(1, p - 1);
  const selectedPoint = result?.point ? result.point.map(Number) : null;
  const doublePoint = result?.doublePoint ? result.doublePoint.map(Number) : null;
  const tickStep = p <= 11 ? 1 : 5;
  return <section data-testid="cas-elliptic-finite-view" aria-label="Finite-field elliptic curve visualization"
    style={{ display: "grid", gap: 9, border: "1px solid #b9cce3", borderRadius: 8, padding: 12 }}>
    <strong>Discrete GF({p}) coordinate diagram · complete enumeration</strong>
    {sampleSelector}
    <figure style={{ margin: 0, maxWidth: 520 }}>
      <svg role="img" aria-label={`Discrete GF(${p}) elliptic curve points; no continuous chord geometry`}
        viewBox="0 0 430 420" style={{ width: "100%", background: "#fbf9ff", border: "1px solid #d1c6e8",
          borderRadius: 8 }}>
        <rect x="47" y="40" width="340" height="340" fill="none" stroke="#9d8bb9" />
        {Array.from({ length: p }, (_, index) => index).filter((value) => value % tickStep === 0).map((value) =>
          <g key={value}><text x={xTo(value) - 4} y="399" fontSize="10" fill="#4b4262">{value}</text>
            <text x="23" y={yTo(value) + 3} fontSize="10" fill="#4b4262">{value}</text></g>)}
        {view.points.map(([x, y]) => {
          const isP = selectedPoint?.[0] === x && selectedPoint?.[1] === y;
          const isDouble = doublePoint?.[0] === x && doublePoint?.[1] === y;
          return <circle key={`${x}:${y}`} cx={xTo(x)} cy={yTo(y)} r={p <= 11 ? 5 : 3}
            fill={isP ? "#c04d21" : isDouble ? "#6e38b3" : "#314aa0"}>
            <title>({x}, {y}){isP ? " · P" : ""}{isDouble ? " · 2P" : ""}</title></circle>;
        })}
        <text x="49" y="18" fontSize="12" fill="#4b4262">y residue</text>
        <text x="319" y="415" fontSize="12" fill="#4b4262">x residue</text>
      </svg>
      <figcaption style={{ fontSize: 12, color: "#475569" }}>
        {view.points.length} affine points plus the point at infinity O; group order {view.groupOrder}.
        Every plotted coordinate is an exact residue modulo {p}.
      </figcaption>
    </figure>
    <div data-testid="cas-elliptic-finite-rule" style={{ fontSize: 12 }}>
      Point addition is algebraic modulo {p}. This diagram does not draw real chords or tangents.
      {result?.point && ` P=(${result.point.join(", ")}); 2P=${result.doublePoint ?
        `(${result.doublePoint.join(", ")})` : "O"}.`}
    </div>
    <details><summary>Exact finite points</summary><div style={{ maxHeight: 160, overflowY: "auto", fontSize: 12 }}>
      O; {view.points.map(([x, y]) => `(${x},${y})`).join("; ")}</div></details>
  </section>;
}
