import { structuralHash } from "../documentIdentity";
import type { Graph2DPreset } from "../graph2dPresets";
import type { Graph2DDocument } from "../graph2dDocument";
import type { Graph2DPointRow } from "../graph2dPointSeries";
import { sampleGraph2DScene } from "../graph2dSceneSampling";
import { graph2DWorldToScreen, resolveGraph2DViewport } from "../graph2dViewport";
import type { Graph2DRegionArtifact } from "../graph2dInequality";
import type { Graph2DPiecewiseArtifact } from "../graph2dPiecewise";
import type { Graph2DPointSeriesArtifact } from "../graph2dPointSeries";
import type { Graph2DPhasePortraitArtifact } from "../graph2dPhasePortrait";

export const GRAPH2D_PREVIEW_RECIPE = Object.freeze({ version: 2, width: 320, height: 180, maxSamples: 1024,
  phaseSamples: 2048, maxDepth: 12, tolerancePx: .75, theme: "light" });
export const graph2DPresetPreviewKey = (preset: Graph2DPreset) => structuralHash({ digest: preset.digest, recipe: GRAPH2D_PREVIEW_RECIPE });
const escape = (text: string) => text.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
const n = (v: number) => { if (!Number.isFinite(v)) throw new TypeError("Non-finite preview coordinate."); return Number(v.toFixed(3)); };

/** Bounded read-only preview for an inspected personal project or built-in preset. */
export const renderGraph2DDocumentPreview = (source: Graph2DDocument, title: string,
  pointTables: Readonly<Record<string, readonly Graph2DPointRow[] | null>> = {}) => {
  const size = GRAPH2D_PREVIEW_RECIPE, viewport = source.display.viewport;
  const sampleLimit = source.source.objects.some(object => object.kind === "phase-portrait") ? size.phaseSamples : size.maxSamples;
  const document = { ...source, display: { ...source.display, sampling: {
    maxSamples: sampleLimit, maxDepth: size.maxDepth, tolerancePx: size.tolerancePx } } };
  const series = sampleGraph2DScene({ document, viewport, width: size.width, height: size.height, interaction: false,
    pointTables, timeBudgetMs: 1500 });
  if (series.some(s => s.artifact.diagnostics.some(d => d.code === "deadline"))) throw new Error("Graph preview deadline exceeded.");
  const screen = (p: { x: number; y: number }) => graph2DWorldToScreen(viewport, size, p);
  const bounds = resolveGraph2DViewport(viewport, size), origin = screen({ x: 0, y: 0 });
  const elements: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, color: string) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}"/>`;
  if (document.display.axes.grid) {
    if (document.display.axes.gridMode === "polar") {
      const radius = Math.max(bounds.xMax-bounds.xMin, bounds.yMax-bounds.yMin)/2;
      for (let i=1;i<=6;i++) { const p=screen({ x: radius*i/6, y: 0 }); elements.push(`<circle cx="${n(origin.x)}" cy="${n(origin.y)}" r="${n(Math.abs(p.x-origin.x))}" fill="none" stroke="#e2e8f0"/>`); }
      for (let i=0;i<12;i++) { const p=screen({ x: radius*2*Math.cos(i*Math.PI/6), y: radius*2*Math.sin(i*Math.PI/6) }); elements.push(line(origin.x,origin.y,p.x,p.y,"#e2e8f0")); }
    } else {
      const step = (span: number) => { const base = 10**Math.floor(Math.log10(span/8)); return [1,2,5,10].find(k => k*base >= span/8)!*base; };
      const sx=step(bounds.xMax-bounds.xMin), sy=step(bounds.yMax-bounds.yMin);
      for (let x=Math.ceil(bounds.xMin/sx)*sx;x<=bounds.xMax;x+=sx) { const p=screen({ x,y:0 }); elements.push(line(p.x,0,p.x,size.height,"#e2e8f0")); }
      for (let y=Math.ceil(bounds.yMin/sy)*sy;y<=bounds.yMax;y+=sy) { const p=screen({ x:0,y }); elements.push(line(0,p.y,size.width,p.y,"#e2e8f0")); }
    }
  }
  if (document.display.axes.x) elements.push(line(0,origin.y,size.width,origin.y,"#94a3b8"));
  if (document.display.axes.y) elements.push(line(origin.x,0,origin.x,size.height,"#94a3b8"));
  for (const s of series) {
    const a=s.artifact, color=s.style.color, dash=s.style.lineStyle === "dashed" ? ' stroke-dasharray="6 4"' : s.style.lineStyle === "dotted" ? ' stroke-dasharray="2 4"' : "";
    const path = (segments: typeof a.segments, strict = false) => {
      const d = segments.map(seg => seg.points.map((p,i) => { const q=screen(p); return `${i ? "L" : "M"}${n(q.x)},${n(q.y)}`; }).join(" ")).join(" ");
      if (d) elements.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"${strict ? ' stroke-dasharray="6 4"' : dash}/>`);
    };
    if ("kind" in a && a.kind === "inequality-region") {
      const region=a as Graph2DRegionArtifact;
      for (const f of region.fills) { const p=screen({ x:f.xMin,y:f.yMax }), q=screen({ x:f.xMax,y:f.yMin }); elements.push(`<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(q.x-p.x)}" height="${n(q.y-p.y)}" fill="${color}" opacity="0.18"/>`); }
      for (const b of region.boundaries) path(b.segments,b.strict);
    } else path(a.segments);
    if ("kind" in a && a.kind === "phase-portrait") {
      const phase = a as Graph2DPhasePortraitArtifact;
      for (const segment of phase.fieldSegments) {
        const start = segment.points[0], end = segment.points[1];
        if (!start || !end) continue;
        const p = screen(start), q = screen(end), angle = Math.atan2(q.y - p.y, q.x - p.x);
        elements.push(`<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(q.x)}" y2="${n(q.y)}" stroke="${color}" opacity="0.45"/>`);
        for (const offset of [-0.55, 0.55]) elements.push(`<line x1="${n(q.x - 3 * Math.cos(angle + offset))}" y1="${n(q.y - 3 * Math.sin(angle + offset))}" x2="${n(q.x)}" y2="${n(q.y)}" stroke="${color}" opacity="0.45"/>`);
      }
      for (const [segments, stroke, pattern] of [[phase.nullclines.x, "#ea580c", "5 3"],
        [phase.nullclines.y, "#0891b2", "2 3"]] as const) {
        const d = segments.map(seg => seg.points.map((point, i) => { const q = screen(point); return `${i ? "L" : "M"}${n(q.x)},${n(q.y)}`; }).join(" ")).join(" ");
        if (d) elements.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${pattern}"/>`);
      }
      for (const equilibrium of phase.equilibria) {
        const q = screen(equilibrium);
        elements.push(`<circle cx="${n(q.x)}" cy="${n(q.y)}" r="4" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>`);
      }
    }
    const circle = (p: { x:number;y:number }, open = false) => { const q=screen(p); elements.push(`<circle cx="${n(q.x)}" cy="${n(q.y)}" r="3" fill="${open ? "#ffffff" : color}" stroke="${color}" stroke-width="1.5"/>`); };
    if ("kind" in a && a.kind === "piecewise") for (const p of (a as Graph2DPiecewiseArtifact).endpoints) circle(p,p.open);
    if ("kind" in a && a.kind === "point-series") for (const p of (a as Graph2DPointSeriesArtifact).points) circle(p);
  }
  if (elements.length > 4096) throw new Error("Graph preview exceeds its element budget.");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img"><title>${escape(title)}</title><defs><clipPath id="plot"><rect width="320" height="180"/></clipPath></defs><rect width="320" height="180" fill="#f8fafc"/><g clip-path="url(#plot)">${elements.join("")}</g></svg>`;
  if (new TextEncoder().encode(svg).length > 128*1024) throw new Error("Graph preview exceeds its byte limit.");
  return { svg, samples: series.reduce((v,s) => v+s.artifact.samplesEvaluated,0),
    diagnostics: series.flatMap(s => s.artifact.diagnostics.map(d => ({ objectId:s.objectId,...d }))) };
};

/** Derived thumbnail geometry only; the same sampler and transforms power the live Graph. */
export const renderGraph2DPresetPreview = (preset: Graph2DPreset) => ({
  key: graph2DPresetPreviewKey(preset),
  ...renderGraph2DDocumentPreview(preset.template, preset.title, Object.fromEntries(preset.sidecars.map(s => [s.id, s.rows]))),
});
