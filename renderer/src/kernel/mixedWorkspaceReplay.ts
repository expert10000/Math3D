import {
  replayMixedWorkspaceDocument,
  type MixedWorkspaceDocument, type MixedWorkspaceEntry, type MixedWorkspaceReplayAdapters,
} from "@math3d/core";
import { CurveDocumentAdapter, type CurveReplayBundle } from "../curveAnalysis/curveDocumentAdapter";
import { SurfaceDocumentAdapter, type SurfaceReplayBundle } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { VolumeDocumentAdapter, type VolumeReplayBundle } from "../volume/volumeDocumentAdapter";
import { TopologyDiagramCommandAdapter } from "../topology/topologyCommandAdapter";
import { ComplexAnalysisCommandAdapter } from "../math/complexCommandAdapter";
import { GeometryDocumentAdapter, type GeometryReplayBundle } from "../geometry/geometryDocumentAdapter";
import type { TopologyReplayBundle, ComplexReplayBundle } from "@math3d/core";

export const MIXED_REPLAY_FORMATS = {
  geometry: "math3d.geometry-replay.v1",
  curve: "math3d.curve-replay.v1", surface: "math3d.surface-replay.v1", volume: "math3d.volume-replay.v1",
  topology: "math3d.topology-replay.v1", complex: "math3d.complex-replay.v1",
} as const;

const requireFormat = (entry: MixedWorkspaceEntry, expected: string): void => {
  if (entry.replay?.format !== expected) throw new TypeError(`Unsupported ${entry.module} replay format.`);
};

export const mixedWorkspaceReplayAdapters: MixedWorkspaceReplayAdapters = {
  geometry: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.geometry); return GeometryDocumentAdapter.restore(entry.replay!.payload as GeometryReplayBundle).document(); },
  curve: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.curve); return CurveDocumentAdapter.fromReplayBundle(entry.replay!.payload as CurveReplayBundle).document(); },
  surface: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.surface); return SurfaceDocumentAdapter.fromReplayBundle(entry.replay!.payload as SurfaceReplayBundle).document(); },
  volume: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.volume); return VolumeDocumentAdapter.fromReplayBundle(entry.replay!.payload as VolumeReplayBundle).document(); },
  topology: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.topology); return TopologyDiagramCommandAdapter.restore(entry.replay!.payload as TopologyReplayBundle).document(); },
  complex: (entry) => { requireFormat(entry, MIXED_REPLAY_FORMATS.complex); return ComplexAnalysisCommandAdapter.restore(entry.replay!.payload as ComplexReplayBundle).document(); },
};

export const verifyMixedWorkspaceReplay = (document: MixedWorkspaceDocument) =>
  replayMixedWorkspaceDocument(document, mixedWorkspaceReplayAdapters);
