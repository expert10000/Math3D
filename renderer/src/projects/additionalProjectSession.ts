import { type CanonicalJsonValue, type MixedWorkspaceEntry } from "@math3d/core";
import { CurveDocumentAdapter, type CurveReplayBundle } from "../curveAnalysis/curveDocumentAdapter";
import { SurfaceDocumentAdapter, type SurfaceReplayBundle } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { GeometryDocumentAdapter, type GeometryReplayBundle } from "../geometry/geometryDocumentAdapter";
import { TopologyDiagramCommandAdapter } from "../topology/topologyCommandAdapter";
import type { TopologyReplayBundle } from "@math3d/core";
import { MIXED_REPLAY_FORMATS } from "../kernel/mixedWorkspaceReplay";
import { additionalRepresentationView, replaceAdditionalSource, type AdditionalDocument, type RepresentationContext, type RepresentationView } from "./additionalProjectRepresentations";

/** A source UI over the existing module adapters; no separate persistence format. */
export class AdditionalProjectSession {
  // Ephemeral editor text, retained across module navigation; excluded from replay.
  sourceDraft: string | null = null;
  presentation: "surface" | "sampled" = "surface";
  camera: import("../components/SurfaceViewer").CameraSyncState | null = null;
  wireframe = false;
  presentationLoaded = false;
  private cachedView: { generations: string; resources: RepresentationContext["resources"]; view: RepresentationView } | null = null;
  readonly adapter: CurveDocumentAdapter | SurfaceDocumentAdapter | GeometryDocumentAdapter | TopologyDiagramCommandAdapter;
  readonly original: MixedWorkspaceEntry;
  readonly context: () => RepresentationContext;
  constructor(entry: MixedWorkspaceEntry, current: AdditionalDocument, context: () => RepresentationContext) {
    this.original = entry; this.context = context;
    const replay = entry.replay?.payload;
    if (current.format === "math3d.curve-document") this.adapter = replay ? CurveDocumentAdapter.fromReplayBundle(replay as unknown as CurveReplayBundle) : new CurveDocumentAdapter(current);
    else if (current.format === "math3d.surface-document") this.adapter = replay ? SurfaceDocumentAdapter.fromReplayBundle(replay as unknown as SurfaceReplayBundle) : new SurfaceDocumentAdapter(current);
    else if (current.format === "math3d.geometry-document") this.adapter = replay ? GeometryDocumentAdapter.restore(replay as unknown as GeometryReplayBundle) : new GeometryDocumentAdapter(current);
    else this.adapter = replay ? TopologyDiagramCommandAdapter.restore(replay as unknown as TopologyReplayBundle) : TopologyDiagramCommandAdapter.fromDocument(current);
    this.view();
    // Every retained undo/redo source must have a qualified view before activation.
    if (replay) {
      const bundle = replay as any;
      this.preview((bundle.checkpoint.document ?? bundle.checkpoint).source);
      for (const transaction of bundle.transactions) for (const envelope of transaction.forward ? [transaction.forward, transaction.inverse] : [...transaction.commands, ...transaction.inverseCommands]) {
        if (["curve.source.replace", "surface.source.replace", "geometry.source.replace", "topology.source.replace"].includes(envelope.command.type)) this.preview(envelope.command.payload);
      }
    }
  }
  document(): AdditionalDocument { return this.adapter.document(); }
  view() {
    const document = this.document(), context = this.context();
    // Dependency changes must invalidate the sampled view, including retained parents.
    const generations = JSON.stringify([document.identity,
      [...context.documents].map(([id, value]) => [id, value.identity]).sort(([a], [b]) => String(a).localeCompare(String(b))),
      [...(context.capturedCurves ?? [])].map(([id, value]) => [id, value.identity]).sort(([a], [b]) => String(a).localeCompare(String(b)))]);
    if (this.cachedView?.generations === generations && this.cachedView.resources === context.resources) return this.cachedView.view;
    const view = additionalRepresentationView(document, context);
    this.cachedView = { generations, resources: context.resources, view };
    return view;
  }
  preview(source: CanonicalJsonValue) {
    const candidate = replaceAdditionalSource(this.document(), source);
    const context = this.context(), documents = new Map(context.documents); documents.set(candidate.identity.id, candidate);
    additionalRepresentationView(candidate, { ...context, documents });
    return candidate;
  }
  commit(source: CanonicalJsonValue) {
    const candidate = this.preview(source);
    // Candidate validation precedes the command boundary, preserving redo on failure.
    (this.adapter.commitSource as (source: any) => unknown)(candidate.source);
  }
  undo() { if (this.adapter instanceof TopologyDiagramCommandAdapter) this.adapter.undoSource(); else this.adapter.undo(); }
  redo() { if (this.adapter instanceof TopologyDiagramCommandAdapter) this.adapter.redoSource(); else this.adapter.redo(); }
  history() { return this.adapter instanceof TopologyDiagramCommandAdapter ? { undoDepth: this.adapter.historyState().undoCount, redoDepth: this.adapter.historyState().redoCount } : this.adapter.history(); }
  entry(): MixedWorkspaceEntry {
    const replay = "replayBundle" in this.adapter ? this.adapter.replayBundle() : this.adapter.exportReplay();
    const checkpoint = "document" in replay.checkpoint ? replay.checkpoint.document : replay.checkpoint;
    return { ...this.original, checkpoint, expected: this.document().identity, replay: { format: MIXED_REPLAY_FORMATS[this.original.module as "curve" | "surface" | "geometry" | "topology"], payload: replay as unknown as CanonicalJsonValue } };
  }
}

export const tryRestoreAdditionalProjectSession = (entry: MixedWorkspaceEntry, current: MixedWorkspaceEntry["checkpoint"], context: () => RepresentationContext) => {
  try {
    if (!["math3d.curve-document", "math3d.surface-document", "math3d.geometry-document", "math3d.topology-document"].includes(current.format)) return null;
    return new AdditionalProjectSession(entry, current as AdditionalDocument, context);
  } catch { return null; }
};
export const additionalReplayEditable = (entry: MixedWorkspaceEntry, current: MixedWorkspaceEntry["checkpoint"], context: RepresentationContext) => !!tryRestoreAdditionalProjectSession(entry, current, () => context);
