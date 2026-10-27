export const GRAPH2D_ANALYSIS_BUDGETS = [2000, 6000, 12000] as const;
export type Graph2DAnalysisBudget = typeof GRAPH2D_ANALYSIS_BUDGETS[number];
export const GRAPH2D_ANALYSIS_ROW_BUDGETS = [2000, 6000, 10000] as const;
export type Graph2DAnalysisRowBudget = typeof GRAPH2D_ANALYSIS_ROW_BUDGETS[number];

/** Limits one mathematical analysis; changing it never changes scene or editor-preview sampling. */
export function Graph2DAnalysisBudgetControl({ label, value, onChange }: Readonly<{
  label: string;
  value: Graph2DAnalysisBudget;
  onChange: (value: Graph2DAnalysisBudget) => void;
}>) {
  return <label className="graph2d-analysis-budget">{label}
    <select aria-label={label} value={value}
      onChange={event => onChange(Number(event.target.value) as Graph2DAnalysisBudget)}>
      <option value={2000}>Quick · 2,000</option>
      <option value={6000}>Standard · 6,000</option>
      <option value={12000}>Thorough · 12,000</option>
    </select>
  </label>;
}

/** Maximum original checked rows accepted by a fit or transform. Never downsamples. */
export function Graph2DAnalysisRowBudgetControl({ label, value, onChange }: Readonly<{
  label: string;
  value: Graph2DAnalysisRowBudget;
  onChange: (value: Graph2DAnalysisRowBudget) => void;
}>) {
  return <label className="graph2d-analysis-budget">{label}
    <select aria-label={label} value={value}
      onChange={event => onChange(Number(event.target.value) as Graph2DAnalysisRowBudget)}>
      <option value={2000}>Quick · 2,000 rows</option>
      <option value={6000}>Standard · 6,000 rows</option>
      <option value={10000}>Full · 10,000 rows</option>
    </select>
  </label>;
}
