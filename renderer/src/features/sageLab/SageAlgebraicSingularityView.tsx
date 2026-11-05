import type { ExactLocusTerm, SageAlgebraicSingularityScene } from "@math3d/core";

const expression = (terms: readonly ExactLocusTerm[], variables: readonly string[]) => {
  if (!terms.length) return "0";
  return terms.map(({ coefficient, powers }) => {
    const factors = powers.flatMap((power, index) => power === 0 ? [] :
      [power === 1 ? variables[index] : `${variables[index]}^${power}`]);
    return factors.length ? `${coefficient}·${factors.join("·")}` : coefficient;
  }).join(" + ").replace(/\+ -/g, "− ");
};

export default function SageAlgebraicSingularityView({ analysis }: { analysis: SageAlgebraicSingularityScene }) {
  const variables = analysis.scene.domain.bounds.map((bound) => bound.variable);
  const localVariables = variables.map((name) => `Δ${name}`);
  const directions = analysis.local.realTangentDirections.map(([dx, dy]) => {
    const norm = Math.hypot(dx, dy) || 1;
    return [dx / norm, dy / norm];
  });
  const status = analysis.local.classification === "ordinary-real-node" ? "Ordinary real node · two tangents" :
    analysis.local.classification === "ordinary-cusp" ? "Ordinary cusp · repeated tangent" :
    analysis.local.classification === "smooth" ? "Smooth at this point" :
    analysis.local.classification === "off-locus" ? "Point is outside the exact locus" :
    "Singular at this point · type unresolved";
  return <section data-testid="cas-singularity-view" style={{ display: "grid", gap: 6,
    border: "1px solid #b9cce3", borderRadius: 8, padding: 10 }}>
    <strong>Tangent and singular-locus view</strong>
    <div><strong>Point:</strong> ({analysis.point.join(", ")}) · {status}</div>
    <div><strong>Exact source:</strong> {analysis.scene.source.target.label}@{analysis.scene.source.target.revision} · {analysis.scene.sceneHash}</div>
    <div><strong>Singular-locus equations (unsolved):</strong> {analysis.singularLocus.equations.map((terms, index) =>
      <div key={index}>{index === 0 ? "f" : `∂f/∂${variables[index - 1]}`} = {expression(terms, variables)} = 0</div>)}</div>
    <div><strong>Jacobian at point:</strong> [{analysis.local.jacobian.join(", ")}] · rank {analysis.local.jacobianRank}</div>
    <div><strong>Tangent space:</strong> {analysis.local.onLocus
      ? analysis.local.jacobianRank === 1
        ? `${analysis.local.jacobian.map((coefficient, index) => `${coefficient}·${localVariables[index]}`).join(" + ")} = 0`
        : "Full ambient tangent space (zero Jacobian)"
      : "Unavailable off the locus"}</div>
    <div><strong>Multiplicity:</strong> {analysis.local.multiplicity ?? "unresolved"}</div>
    <div><strong>Leading tangent cone:</strong> {analysis.local.tangentCone.length
      ? `${expression(analysis.local.tangentCone, localVariables)} = 0` : "Unavailable off the locus"}</div>
    {variables.length === 2 && analysis.local.onLocus && <svg role="img"
      aria-label={`Local tangent view at (${analysis.point.join(", ")}); ${status.toLowerCase()}`}
      viewBox="0 0 320 260" style={{ width: "100%", maxWidth: 400, height: 260,
        background: "#f7faff", border: "1px solid #dbe2ea" }}>
      <path d="M 12 130 H 308 M 160 12 V 248" stroke="#d2dfed" fill="none" />
      {directions.map(([dx, dy], index) => <line key={index}
        x1={160 - dx * 105} y1={130 + dy * 105} x2={160 + dx * 105} y2={130 - dy * 105}
        stroke={index === 0 ? "#075ca1" : "#ce6638"} strokeWidth="3" />)}
      <circle cx="160" cy="130" r="5" fill="#233b5d" />
      <text x="294" y="147" fontSize="12" fill="#475569">{localVariables[0]}</text>
      <text x="166" y="18" fontSize="12" fill="#475569">{localVariables[1]}</text>
    </svg>}
    {analysis.warnings.map((warning) => <div key={warning} style={{ color: "#6b4e19" }}>{warning}</div>)}
  </section>;
}
