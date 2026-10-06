import type { SavedStudySweepReport } from "./savedStudySweepReport";

/** Rasterize the actual selected SVG chart and append the retained run metadata. */
export const studySweepImage = async (report: SavedStudySweepReport, chart: SVGSVGElement): Promise<Blob> => {
  const svg = chart.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); svg.setAttribute("width", "1300"); svg.setAttribute("height", "560");
  svg.style.width = "1300px"; svg.style.height = "560px"; svg.style.maxWidth = "none";
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new TypeError("Unable to capture the sweep chart.")); image.src = url;
    });
    const canvas = document.createElement("canvas"); canvas.width = 1600;
    canvas.height = 840 + report.runs.length * 250 + report.excludedRuns.length * 90;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new TypeError("Image export is unavailable.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0f172a";
    const line = (text: string, y: number, font = "18px sans-serif") => { ctx.font = font; ctx.fillText(text, 32, y, 1536); };
    line(`Saved ${report.presetId} parameter sweep · ${report.chart.label}`, 42, "bold 30px sans-serif");
    line(`${report.parameter} · ${report.samplesPerAxis} samples/axis · length units: ${report.lengthUnits} · ${report.chart.label} units: ${report.chart.units}`, 78);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(150, 105, 1300, 560); ctx.drawImage(picture, 150, 105, 1300, 560); ctx.fillStyle = "#0f172a";
    let y = 705;
    for (const run of report.runs) {
      line(run.title, y, "bold 23px sans-serif");
      line(`${report.parameter}: ${run.parameterValue} · ${run.current ? "current source" : "historical source"} · ${run.samplesPerAxis} samples/axis · ${run.vertexCount} vertices`, y + 30);
      line(`${run.interior.count} interior / ${run.interior.excluded} excluded · mean |H|: ${run.interior.averageAbsH ?? "unavailable"} · average K: ${run.interior.averageK ?? "unavailable"}`, y + 58);
      line(`Average H: ${run.interior.averageH ?? "unavailable"} · max |H|: ${run.interior.maxAbsH ?? "unavailable"}`, y + 84);
      const sourceLine = (label: string, source: typeof run.meshSource | null) => source ? `${label}: ${source.documentId} · r${source.revision} · generation ${source.generation} · ${source.structuralHash}` : `${label}: unavailable`;
      line(sourceLine("Base Surface", run.baseSource), y + 112, "15px sans-serif");
      line(sourceLine("Variant Surface", run.surfaceSource), y + 137, "15px sans-serif");
      line(sourceLine("Mesh", run.meshSource), y + 162, "15px sans-serif");
      line(`Result: ${run.savedResult.resultId} · ${run.savedResult.status}`, y + 187, "15px sans-serif");
      line(`${run.savedResult.provenance.operation.algorithm} v${run.savedResult.provenance.operation.algorithmVersion} · ${run.savedResult.provenance.engine.name} v${run.savedResult.provenance.engine.version}`, y + 212, "15px sans-serif");
      y += 250;
    }
    for (const run of report.excludedRuns) {
      line(`Excluded: ${run.title} · parameter ${run.parameterValue}`, y, "bold 18px sans-serif");
      line(run.reason, y + 27, "16px sans-serif"); y += 90;
    }
    line("Interior discrete Mesh estimates; boundary/invalid vertices are excluded. K: inverse length²; H: inverse length.", y + 8, "17px sans-serif");
    line("Connecting sampled averages is not an error bound or proof of convergence/minimality. Historical runs retain their source generations.", y + 35, "17px sans-serif");
    line("Catenoid axial ranges scale with waist radius. Export JSON/CSV for complete sampling, result provenance and warnings.", y + 62, "17px sans-serif");
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new TypeError("PNG encoding failed.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
};
