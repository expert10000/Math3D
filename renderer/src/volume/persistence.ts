import type { SerializedVolumeObject, VolumeDerivedResult, VolumeObject, VolumeSource } from "./contracts";
import { normalizeVolumeDocument, type VolumeDocument } from "@math3d/core";
import { parseVolumeExtraction, type VolumeExtractionRecord } from "./volumeExtractionKernel";
import { restoreVolumeObject, serializeVolumeObject } from "./infrastructure";
import type { PinnedVolumeProbe, VolumeOrientationConvention } from "./probes";
import type {
  VolumeRenderMode,
  VolumeRenderQuality,
  VolumeTextureSampling,
  VolumeTransferFunction,
} from "./transferFunction";

export type VolumeArtifactReference = {
  id: string;
  role: "source-grid" | "mask" | "label-map" | "derived-result" | "comparison";
  storage: "external-file" | "content-addressed";
  uri: string;
  contentHash: string;
  byteLength: number;
  scalarType: string;
  components: number;
};

export type VolumeWorkspaceViewState = {
  layout: "quad" | "slices" | "3d" | "xy" | "xz" | "yz";
  viewMode: "slices" | "3d";
  paneIndices: Record<"x" | "y" | "z", number>;
  crosshair: [number, number, number] | null;
  orientation: VolumeOrientationConvention;
  linkedNavigation: boolean;
  voxelSnap: boolean;
  renderMode: VolumeRenderMode;
  renderQuality: VolumeRenderQuality;
  textureSampling: VolumeTextureSampling;
  transferFunction: VolumeTransferFunction;
  renderWindow: [number, number];
  isoValue: number;
  crop: { min: [number, number, number]; max: [number, number, number] } | null;
  camera: { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] } | null;
};

export type VolumeResultReference = {
  id: string;
  kind: "analysis" | "segmentation" | "isosurface" | "comparison" | "slice" | "gradient";
  label: string;
  sourceVolumeId: string;
  sourceVolumeRevision: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
  artifactId: string | null;
  state: "current" | "stale" | "snapshot" | "detached";
};

export type VolumeOperationKind = "source" | "sampling" | "sdf" | "segmentation" | "derived-result" | "view" | "import" | "export" | "compare";
export type VolumeOperationRecord = {
  id: string;
  kind: VolumeOperationKind;
  label: string;
  volumeRevision: number;
  sampledGridRevision: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
  artifactIds: readonly string[];
  createdAt: number;
};

export type VolumeWorkbookOperation = "sample" | "slice" | "render" | "analyze" | "segment" | "compare" | "export";
export type VolumeWorkbookBlock = {
  version: 1;
  id: string;
  operation: VolumeWorkbookOperation;
  title: string;
  sourceVolumeId: string;
  sourceVolumeRevision: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
  preview: { label: string; summary: string };
  artifactIds: readonly string[];
};

export type VolumeWorkspaceDocument = {
  kind: "math3d-volume-workspace";
  version: 1;
  savedAt: number;
  volume: SerializedVolumeObject;
  kernelDocument: VolumeDocument | null;
  sourceRecipe: VolumeSource;
  artifacts: VolumeArtifactReference[];
  view: VolumeWorkspaceViewState;
  probes: PinnedVolumeProbe[];
  results: VolumeResultReference[];
  extractions: VolumeExtractionRecord[];
  operations: VolumeOperationRecord[];
  workbookBlocks: VolumeWorkbookBlock[];
  handoff: { sourceModule: "surfaces" | "mesh" | "geometry" | "volume"; sourceObjectId: string | null; returnCamera: VolumeWorkspaceViewState["camera"] };
};

export type VolumeRestoreDiagnostic = {
  severity: "warning" | "error";
  code: "missing-artifact" | "hash-mismatch" | "invalid-reference";
  message: string;
  artifactId: string;
  recoverable: boolean;
};

export type RestoredVolumeWorkspace = {
  document: VolumeWorkspaceDocument;
  volume: VolumeObject;
  diagnostics: VolumeRestoreDiagnostic[];
  availableArtifactIds: string[];
  relinkRequired: boolean;
};

const isArtifactReference = (value: VolumeArtifactReference): boolean =>
  !!value?.id && !!value.uri?.trim() && !!value.contentHash?.trim() && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0 && value.components > 0;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const resultReferenceFromDerivedVolume = (result: VolumeDerivedResult, artifactId: string | null = null): VolumeResultReference => ({
  id: result.id,
  kind: result.kind,
  label: result.label,
  sourceVolumeId: result.sourceVolumeId,
  sourceVolumeRevision: result.sourceVolumeRevision,
  parameters: { ...result.parameters },
  artifactId,
  state: result.state,
});

export const createVolumeWorkspaceDocument = (input: {
  volume: VolumeObject;
  kernelDocument?: VolumeDocument | null;
  view: VolumeWorkspaceViewState;
  artifacts?: readonly VolumeArtifactReference[];
  probes?: readonly PinnedVolumeProbe[];
  results?: readonly VolumeResultReference[];
  extractions?: readonly VolumeExtractionRecord[];
  operations?: readonly VolumeOperationRecord[];
  workbookBlocks?: readonly VolumeWorkbookBlock[];
  handoff?: VolumeWorkspaceDocument["handoff"];
  savedAt?: number;
}): VolumeWorkspaceDocument => ({
  kind: "math3d-volume-workspace",
  version: 1,
  savedAt: input.savedAt ?? Date.now(),
  volume: serializeVolumeObject(input.volume),
  kernelDocument: input.kernelDocument ? clone(input.kernelDocument) : null,
  sourceRecipe: clone(input.volume.source),
  artifacts: input.artifacts?.map(clone) ?? [],
  view: clone(input.view),
  probes: input.probes?.map(clone) ?? [],
  results: input.results?.map(clone) ?? [],
  extractions: input.extractions?.map(clone) ?? [],
  operations: input.operations?.map(clone) ?? [],
  workbookBlocks: input.workbookBlocks?.map(clone) ?? [],
  handoff: clone(input.handoff ?? { sourceModule: "volume", sourceObjectId: null, returnCamera: input.view.camera }),
});

export const serializeVolumeWorkspace = (document: VolumeWorkspaceDocument): string => JSON.stringify(document);

export const parseVolumeWorkspace = (serialized: string): VolumeWorkspaceDocument => {
  const value = JSON.parse(serialized) as VolumeWorkspaceDocument;
  if (!value || value.kind !== "math3d-volume-workspace" || value.version !== 1) throw new Error("Unsupported Volume workspace document.");
  if (!value.volume || !value.sourceRecipe || !value.view || !Array.isArray(value.artifacts) || !Array.isArray(value.operations) || !Array.isArray(value.results)) {
    throw new Error("Incomplete Volume workspace document.");
  }
  restoreVolumeObject(value.volume);
  const kernelDocument = value.kernelDocument == null ? null : normalizeVolumeDocument(value.kernelDocument);
  if (kernelDocument && !kernelDocument.ok) throw new Error(kernelDocument.errors.join(" "));
  if (kernelDocument && kernelDocument.value.metadata.legacyVolumeId !== value.volume.identity.volumeId) throw new Error("Volume kernel document belongs to another source.");
  if (value.volume.source.kind !== value.sourceRecipe.kind) throw new Error("Volume source recipe does not match the canonical object.");
  if (!value.artifacts.every(isArtifactReference)) throw new Error("Invalid Volume artifact reference.");
  const ids = new Set<string>();
  for (const artifact of value.artifacts) {
    if (ids.has(artifact.id)) throw new Error(`Duplicate Volume artifact reference: ${artifact.id}.`);
    ids.add(artifact.id);
  }
  for (const result of value.results) {
    if (!result.id || !result.sourceVolumeId || result.sourceVolumeRevision < 1) throw new Error("Invalid Volume result reference.");
    if (result.artifactId && !ids.has(result.artifactId)) throw new Error(`Volume result ${result.id} references an unknown artifact.`);
  }
  if (value.extractions != null && !Array.isArray(value.extractions)) throw new Error("Invalid Volume extraction records.");
  const extractions = (value.extractions ?? []).map((record) => parseVolumeExtraction(JSON.stringify(record)));
  for (const operation of value.operations) {
    if (!operation.id || operation.volumeRevision < 1 || operation.sampledGridRevision < 1) throw new Error("Invalid Volume operation record.");
  }
  return clone({ ...value, kernelDocument: kernelDocument?.value ?? null, extractions, probes: value.probes ?? [], workbookBlocks: value.workbookBlocks ?? [] });
};

export const restoreVolumeWorkspace = (
  document: VolumeWorkspaceDocument,
  resolveArtifact: (reference: VolumeArtifactReference) => { exists: boolean; contentHash?: string } = () => ({ exists: false }),
): RestoredVolumeWorkspace => {
  const diagnostics: VolumeRestoreDiagnostic[] = [];
  const availableArtifactIds: string[] = [];
  for (const artifact of document.artifacts) {
    const resolved = resolveArtifact(artifact);
    if (!resolved.exists) {
      diagnostics.push({ severity: "warning", code: "missing-artifact", artifactId: artifact.id, recoverable: true, message: `${artifact.role} artifact is missing. Relink ${artifact.uri}.` });
    } else if (resolved.contentHash && resolved.contentHash !== artifact.contentHash) {
      diagnostics.push({ severity: "error", code: "hash-mismatch", artifactId: artifact.id, recoverable: true, message: `${artifact.role} artifact content changed. Choose the original file or accept a new revision.` });
    } else {
      availableArtifactIds.push(artifact.id);
    }
  }
  return { document: clone(document), volume: restoreVolumeObject(document.volume), diagnostics, availableArtifactIds, relinkRequired: diagnostics.length > 0 };
};

export const createVolumeWorkbookBlock = (input: Omit<VolumeWorkbookBlock, "version">): VolumeWorkbookBlock => ({ version: 1, ...clone(input) });

export const replayVolumeWorkbookBlock = (
  block: VolumeWorkbookBlock,
  active: VolumeObject,
  hasArtifact: (id: string) => boolean,
): { operation: VolumeWorkbookOperation; parameters: VolumeWorkbookBlock["parameters"] } => {
  if (block.sourceVolumeId !== active.identity.volumeId || block.sourceVolumeRevision !== active.identity.volumeRevision) {
    throw new Error(`Workbook block ${block.title} is stale for the active Volume revision.`);
  }
  const missing = block.artifactIds.find((id) => !hasArtifact(id));
  if (missing) throw new Error(`Workbook block ${block.title} requires missing artifact ${missing}.`);
  return { operation: block.operation, parameters: clone(block.parameters) };
};

export class VolumeWorkspaceHistory {
  private currentValue: VolumeWorkspaceDocument;
  private undoValues: VolumeWorkspaceDocument[] = [];
  private redoValues: VolumeWorkspaceDocument[] = [];
  private readonly limit: number;
  constructor(initial: VolumeWorkspaceDocument, limit = 32) { this.currentValue = clone(initial); this.limit = limit; }
  current(): VolumeWorkspaceDocument { return clone(this.currentValue); }
  push(next: VolumeWorkspaceDocument): void {
    this.undoValues.push(clone(this.currentValue));
    this.undoValues = this.undoValues.slice(-Math.max(1, this.limit));
    this.currentValue = clone(next);
    this.redoValues = [];
  }
  undo(canResolve: (artifactId: string) => boolean): VolumeWorkspaceDocument {
    const target = this.undoValues[this.undoValues.length - 1];
    if (!target) return this.current();
    this.assertResolvable(target, canResolve);
    this.undoValues.pop();
    this.redoValues.push(clone(this.currentValue));
    this.currentValue = clone(target);
    return this.current();
  }
  redo(canResolve: (artifactId: string) => boolean): VolumeWorkspaceDocument {
    const target = this.redoValues[this.redoValues.length - 1];
    if (!target) return this.current();
    this.assertResolvable(target, canResolve);
    this.redoValues.pop();
    this.undoValues.push(clone(this.currentValue));
    this.currentValue = clone(target);
    return this.current();
  }
  summary(): { undoDepth: number; redoDepth: number } { return { undoDepth: this.undoValues.length, redoDepth: this.redoValues.length }; }
  private assertResolvable(document: VolumeWorkspaceDocument, canResolve: (artifactId: string) => boolean): void {
    const required = new Set([
      ...document.results.map((result) => result.artifactId).filter((id): id is string => !!id),
      ...document.workbookBlocks.flatMap((block) => block.artifactIds),
    ]);
    const missing = [...required].find((id) => !canResolve(id));
    if (missing) throw new Error(`History restore requires missing artifact ${missing}; relink it before undo/redo.`);
  }
}
