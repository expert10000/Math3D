export type ChartGridDiagnosticCell = {
  id: string;
  area: number;
  seamU?: boolean;
  seamV?: boolean;
};

export type ChartGridDiagnostics = {
  validCells: number;
  seamUCells: number;
  seamVCells: number;
  maskedCells: number;
  skippedNonFinite: number;
  skippedDegenerate: number;
  invalidCells: number;
  minArea: number | null;
  maxArea: number | null;
  avgArea: number | null;
};

export function buildChartCellId(i: number, j: number): string {
  return `${i}:${j}`;
}

export function computeChartGridDiagnostics(params: {
  cells: ChartGridDiagnosticCell[];
  maskedIds?: ReadonlySet<string> | null;
  skippedNonFinite?: number;
  skippedDegenerate?: number;
}): ChartGridDiagnostics {
  const {
    cells,
    maskedIds = null,
    skippedNonFinite = 0,
    skippedDegenerate = 0,
  } = params;
  let seamUCells = 0;
  let seamVCells = 0;
  let maskedCells = 0;
  let minArea = Number.POSITIVE_INFINITY;
  let maxArea = Number.NEGATIVE_INFINITY;
  let areaSum = 0;
  let areaCount = 0;

  for (const cell of cells) {
    if (cell.seamU) seamUCells += 1;
    if (cell.seamV) seamVCells += 1;
    if (maskedIds?.has(cell.id)) maskedCells += 1;
    const area = cell.area;
    if (Number.isFinite(area) && area > 0) {
      minArea = Math.min(minArea, area);
      maxArea = Math.max(maxArea, area);
      areaSum += area;
      areaCount += 1;
    }
  }

  const skippedNF = Number.isFinite(skippedNonFinite) ? Math.max(0, Math.round(skippedNonFinite)) : 0;
  const skippedDeg = Number.isFinite(skippedDegenerate) ? Math.max(0, Math.round(skippedDegenerate)) : 0;

  return {
    validCells: cells.length,
    seamUCells,
    seamVCells,
    maskedCells,
    skippedNonFinite: skippedNF,
    skippedDegenerate: skippedDeg,
    invalidCells: skippedNF + skippedDeg + maskedCells,
    minArea: areaCount ? minArea : null,
    maxArea: areaCount ? maxArea : null,
    avgArea: areaCount ? areaSum / areaCount : null,
  };
}
