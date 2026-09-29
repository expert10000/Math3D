import { canonicalJsonStringify, structuralHash, type DocumentIdentity } from "./documentIdentity";
import { parseGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { quantizeGraph2DParameterValue } from "./graph2dParameterTypes";
import { previewGraph2DParameterValues } from "./graph2dParameters";
import { createGraph2DPublication, escapeGraph2DPublicationText as escape, graph2DPublicationCSVCell,
  GRAPH2D_PUBLICATION_LIMITS, renderGraph2DPublicationSVG,
  type Graph2DPublicationRequest } from "./graph2dPublication";
import type { Graph2DPublicationArtifact } from "./graph2dPublicationArtifact";

export const GRAPH2D_ANIMATION_LIMITS = Object.freeze({ frames: 60, fps: 30 });
export type Graph2DAnimationDraft = Readonly<{ parameter: string; from: number; to: number; frames: number; fps: number }>;
export type Graph2DAnimationPlan = Readonly<Graph2DAnimationDraft & { format: "math3d.graph2d-animation.v1"; base: DocumentIdentity; displayHash: string }>;
export const graph2DParameterSessionKey = (document: Graph2DDocument) => structuralHash({ identity: document.identity, display: document.display });
export const createGraph2DAnimationPlan = (document: Graph2DDocument, draft: Graph2DAnimationDraft): Graph2DAnimationPlan => {
  const parameter = document.source.variables.find(p => p.name === draft.parameter), control = parameter?.control;
  if (!control || ![draft.from, draft.to].every(v => Number.isFinite(v) && v >= control.min && v <= control.max) ||
    !Number.isSafeInteger(draft.frames) || draft.frames < 2 || draft.frames > GRAPH2D_ANIMATION_LIMITS.frames ||
    !Number.isSafeInteger(draft.fps) || draft.fps < 1 || draft.fps > GRAPH2D_ANIMATION_LIMITS.fps)
    throw new TypeError("Choose a configured parameter, in-range endpoints, 2–60 frames and 1–30 fps.");
  return Object.freeze({ format: "math3d.graph2d-animation.v1", parameter: draft.parameter, from: draft.from, to: draft.to,
    frames: draft.frames, fps: draft.fps, base: Object.freeze({ ...document.identity }), displayHash: structuralHash(document.display) });
};
export const graph2DAnimationFrame = (document: Graph2DDocument, plan: Graph2DAnimationPlan, index: number) => {
  const checked = createGraph2DAnimationPlan(document, plan);
  if (plan.format !== checked.format || structuralHash(plan.base) !== structuralHash(checked.base) || plan.displayHash !== checked.displayHash)
    throw new TypeError("Animation source or view changed; create a new plan.");
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.frames) throw new TypeError("Invalid animation frame index.");
  const control = document.source.variables.find(p => p.name === plan.parameter)!.control!;
  const value = quantizeGraph2DParameterValue(control, index === plan.frames - 1 ? plan.to : plan.from + (plan.to - plan.from) * index / (plan.frames - 1));
  return { index, time: index / plan.fps, value, document: previewGraph2DParameterValues(document, { [plan.parameter]: value }) };
};

/** Index-driven, one frame in flight. Scheduling changes timing, never frame values. */
export class Graph2DAnimationPlayer {
  private timer: unknown = null;
  private running = false;
  private index = -1;
  private epoch = 0;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  constructor(schedule: (callback: () => void, ms: number) => unknown, cancel: (handle: unknown) => void) {
    // Do not invoke browser-native timer functions as methods of this player.
    this.schedule = (callback, ms) => schedule(callback, ms); this.cancel = handle => cancel(handle);
  }
  start(plan: Graph2DAnimationPlan, publish: (index: number) => void, done: () => void) {
    this.stop(); this.running = true; this.index = 0;
    this.plan = plan; this.publish = publish; this.done = done; publish(0);
  }
  private plan: Graph2DAnimationPlan | null = null;
  private publish: ((index: number) => void) | null = null;
  private done: (() => void) | null = null;
  settled(index: number) {
    if (!this.running || !this.plan || index !== this.index || this.timer !== null) return;
    if (index === this.plan.frames - 1) { const done = this.done; this.stop(); done?.(); return; }
    const epoch = this.epoch;
    this.timer = this.schedule(() => { if (epoch !== this.epoch) return; this.timer = null; if (!this.running) return; this.index++; this.publish?.(this.index); }, 1000 / this.plan.fps);
  }
  stop() { this.epoch++; this.running = false; if (this.timer !== null) this.cancel(this.timer); this.timer = null; this.plan = null; this.publish = null; this.done = null; }
}

export type Graph2DAnimationExportRequest = Readonly<{ publication: Graph2DPublicationRequest; plan: Graph2DAnimationPlan }>;
/** One fresh shared publication per step; hosts yield/cancel between steps (desktop also terminates its worker). */
export class Graph2DAnimationExportBuilder {
  private readonly request: Graph2DAnimationExportRequest;
  readonly snapshotId: ReturnType<typeof structuralHash>;
  private readonly figures: string[] = [];
  private readonly rows: (string | number | null)[][] = [["frame", "time_seconds", "parameter", "value", "unit", "source_hash", "snapshot", "diagnostics", "recipe", "sequence_snapshot"]];
  private bytes = 0;
  constructor(request: Graph2DAnimationExportRequest) {
    const serialized = canonicalJsonStringify(request);
    if (new TextEncoder().encode(serialized).length > 2 * 1024 * 1024) throw new TypeError("Animation input exceeds its snapshot budget.");
    this.request = JSON.parse(serialized);
    this.snapshotId = structuralHash(this.request);
    parseGraph2DDocument(JSON.stringify(this.request.publication.document));
    graph2DAnimationFrame(this.request.publication.document, this.request.plan, 0);
    if (request.publication.viewport && structuralHash(request.publication.viewport) !== structuralHash(request.publication.document.display.viewport))
      throw new TypeError("Animation export uses the committed viewport.");
  }
  get progress() { return this.figures.length; }
  get complete() { return this.progress === this.request.plan.frames; }
  appendNext() {
    if (this.complete) throw new TypeError("All animation frames are already exported.");
    const { publication: recipe, plan } = this.request, frame = graph2DAnimationFrame(recipe.document, plan, this.progress);
    // Never carry a committed analysis/probe forward under a different parameter value.
    const publication = createGraph2DPublication({ ...recipe, document: frame.document, analyses: [], deterministic: true,
      analysisNotes: ["Animation export does not run analysis. Committed analysis tables are omitted."] });
    const unit = recipe.document.source.variables.find(p => p.name === plan.parameter)!.control!.unit || "unspecified";
    const diagnostics = publication.metadata.objects.map(o => ({ objectId: o.objectId, converged: o.converged, diagnostics: o.diagnostics }));
    const figure = `<section><h2>Frame ${frame.index + 1} / ${plan.frames}</h2><p>t=${frame.time} seconds · ${escape(plan.parameter)}=${frame.value} (${escape(unit)}) · source ${frame.document.identity.structuralHash}</p>${renderGraph2DPublicationSVG(publication, `frame-${frame.index}`)}<details><summary>Warnings and diagnostics</summary><pre>${escape(JSON.stringify({ warnings: publication.metadata.warnings, diagnostics }, null, 2))}</pre></details></section>`;
    this.bytes += new TextEncoder().encode(figure).length;
    if (this.bytes > GRAPH2D_PUBLICATION_LIMITS.maxBytes - 512 * 1024) throw new TypeError("Frame sequence exceeds 8 MiB. Reduce frames, image size or visible objects.");
    this.figures.push(figure);
    this.rows.push([frame.index, frame.time, plan.parameter, frame.value, unit, frame.document.identity.structuralHash, publication.snapshotId, JSON.stringify(diagnostics), frame.index === 0 ? canonicalJsonStringify(this.request) : null, this.snapshotId]);
    return frame;
  }
  finish(): readonly Graph2DPublicationArtifact[] {
    if (!this.complete) throw new TypeError("Cannot publish an incomplete animation sequence.");
    const snapshotId = this.snapshotId, recipe = escape(JSON.stringify(this.request, null, 2));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Graph animation frames</title><style>body{font:16px/1.5 system-ui;max-width:900px;margin:auto;padding:24px;color:#172033;background:white}svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{section{break-inside:avoid}}</style></head><body><main><h1>Graph animation frame sequence</h1><p>Ordered static SVG frames, not video or an editable project. Frame values are quantized index-based interpolation; fps defines nominal time, not a wall-clock guarantee. Approximate shared sampling; gaps and diagnostics are retained. Unit labels do not imply unit conversion. Analysis is not recomputed.</p><details><summary>Frozen base source and reproduction recipe</summary><pre>${recipe}</pre></details>${this.figures.join("")}</main></body></html>`;
    const csv = this.rows.map(row => row.map(graph2DPublicationCSVCell).join(",")).join("\r\n") + "\r\n";
    return ([{ format: "html", text: html, mimeType: "text/html", uti: "public.html" },
      { format: "csv", text: csv, mimeType: "text/csv", uti: "public.comma-separated-values-text" }] as const).map(output => {
      const bytes = new TextEncoder().encode(output.text);
      if (bytes.length > GRAPH2D_PUBLICATION_LIMITS.maxBytes) throw new TypeError("Animation output exceeds 8 MiB.");
      return { format: output.format, fileName: `graph-animation-${snapshotId.replace(/[^a-zA-Z0-9]/g, "").slice(-16)}.${output.format}`, mimeType: output.mimeType, uti: output.uti, snapshotId, bytes };
    });
  }
}
