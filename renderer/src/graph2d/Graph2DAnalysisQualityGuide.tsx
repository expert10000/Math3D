import { GRAPH2D_ANALYSIS_QUALITIES, GRAPH2D_ANALYSIS_QUALITY_MEANINGS } from "@math3d/core";

export function Graph2DAnalysisQualityGuide() {
  return <details className="graph2d-analysis-quality-guide">
    <summary>Analysis quality levels</summary>
    <dl>{GRAPH2D_ANALYSIS_QUALITIES.map(quality => <div key={quality}>
      <dt>{quality[0]!.toUpperCase() + quality.slice(1)}</dt>
      <dd>{GRAPH2D_ANALYSIS_QUALITY_MEANINGS[quality]}</dd>
    </div>)}</dl>
    <p>These root and intersection scans can report Approximate, Refined, or Incomplete.
      They do not currently establish Certified or Symbolic solutions.</p>
  </details>;
}
