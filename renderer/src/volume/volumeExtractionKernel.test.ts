import { createMath3DProject, createMixedWorkspaceDocument, inspectProjectStudyMembers,
  inspectResearchReference, parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, sha256Checksum } from "@math3d/core";
import { inspectProjectCompatibility } from "../projects/projectTransfer";
import { readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "../projects/projectResources";
import { projectStudyWorkbookReferences } from "../projects/projectStudyReferences";
import { prepareVolumeMeshStudy, volumeMeshJourneyOptions } from "../projects/volumeMeshStudy";
import { describe, expect, it } from "vitest";
import { adaptAnalyticVolume } from "./infrastructure";
import { createVolumeJobRequest, executeVolumeJobRequest, type VolumeWorkerInbound, type VolumeWorkerOutbound } from "./computation";
import { VolumeWorkerCoordinator, type VolumeWorkerLike } from "./workerCoordinator";
import { VolumeDocumentAdapter, volumeDocumentFromLegacyObject } from "./volumeDocumentAdapter";
import { VolumeExtractionKernelBridge, locateVolumeExtractionVertex, parseVolumeExtraction, promoteVolumeExtraction, serializeVolumeExtraction, volumeExtractionStatus } from "./volumeExtractionKernel";
import { VolumeIsosurfaceScientificJob, VOLUME_ISOSURFACE_OPERATION } from "./volumeScientificJob";
import { computeVolumeIsosurfaceNormals } from "./isosurface";
import { createVolumeWorkspaceDocument, parseVolumeWorkspace, serializeVolumeWorkspace, type VolumeWorkspaceViewState } from "./persistence";
import { getVolumeTransferPreset } from "./transferFunction";

const grid = {
  dims: [5, 5, 5] as [number, number, number], origin: [-2, -2, -2] as [number, number, number], spacing: [1, 1, 1] as [number, number, number],
  scalars: Float32Array.from({ length: 125 }, (_, index) => {
    const x = index % 5 - 2, y = Math.floor(index / 5) % 5 - 2, z = Math.floor(index / 25) - 2;
    return x * x + y * y + z * z - 2.25;
  }),
};
const dataset = { kind: "volume" as const, grid };
const volume = adaptAnalyticVolume({ id: "volume-gk15", label: "Sphere", presetId: "sphere", expression: "x*x+y*y+z*z-2.25", dataset, grid, tracker: new Map(), now: 10 });
const view: VolumeWorkspaceViewState = {
  layout: "quad", viewMode: "slices", paneIndices: { x: 2, y: 2, z: 2 }, crosshair: null, orientation: "scientific",
  linkedNavigation: true, voxelSnap: true, renderMode: "dvr", renderQuality: "balanced", textureSampling: "linear",
  transferFunction: getVolumeTransferPreset("viridis"), renderWindow: [-3, 3], isoValue: 0, crop: null, camera: null,
};

class InlineWorker implements VolumeWorkerLike {
  readonly listeners = new Set<(event: MessageEvent<VolumeWorkerOutbound>) => void>();
  readonly cancelled = new Set<string>();
  postMessage(message: VolumeWorkerInbound) {
    if (message.type === "cancel") { this.cancelled.add(message.requestId); return; }
    void executeVolumeJobRequest(message.request, (value) => this.emit(value), () => this.cancelled.has(message.request.requestId))
      .then((value) => this.emit(value));
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { /* no-op */ }
  emit(value: VolumeWorkerOutbound) { queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: value } as MessageEvent<VolumeWorkerOutbound>))); }
}

describe("GK15 Volume extraction kernel", () => {
  it("routes extraction through the broker and publishes a revision-bound Surface, artifact and GK01 lineage", async () => {
    const adapter = new VolumeDocumentAdapter(volumeDocumentFromLegacyObject(volume));
    const bridge = new VolumeExtractionKernelBridge(() => adapter);
    const coordinator = new VolumeWorkerCoordinator(() => new InlineWorker(), undefined, () => ({ volumeRevision: volume.identity.volumeRevision, sampledGridRevision: volume.identity.sampledGridRevision }));
    const jobs = new VolumeIsosurfaceScientificJob(() => adapter, coordinator);
    expect((await jobs.capabilities()).some((backend) => backend.operations.some((operation) => operation.operationType === VOLUME_ISOSURFACE_OPERATION))).toBe(true);
    expect((await jobs.executionCapabilities()).find((capability) => capability.operation.id === VOLUME_ISOSURFACE_OPERATION)?.availableBackends.map((backend) => backend.backendId)).toEqual(["volume-native-worker"]);
    const request = createVolumeJobRequest({ requestId: "volume-gk15-extract", operation: "marchingCubes", volume, grid, parameters: { isoValue: 0 }, backend: "native-worker", algorithmVersion: "marching-cubes-v1" });
    const source = adapter.sourceGeneration();
    const outcome = await jobs.submit(request).promise;
    expect(outcome.broker.ok).toBe(true);
    const artifact = outcome.artifact!;
    expect(artifact.meshResourceId).toMatch(/^m3d:/);
    expect(jobs.resources()).toHaveLength(1);
    expect(artifact.output.positions!.length).toBeGreaterThan(0);
    const geometry = { positions: artifact.output.positions!, indices: artifact.output.indices!, normals: computeVolumeIsosurfaceNormals(volume, grid, artifact.output.positions!).normals };
    const record = bridge.publish(request, artifact, geometry, source, "iso:volume-gk15:1:0")!;
    expect(record.surface.source.representation).toBe("mesh-backed");
    expect(record.result.status).toBe("numerical");
    expect(record.relations).toHaveLength(4);
    expect(record.mesh?.source.resource.id).toBe(record.surface.source.definition.meshId);
    expect(bridge.meshResources().bytes(record.mesh!.source.resource)).not.toBeNull();
    expect(record.relations.every((relation) => relation.sources[0].structuralHash === source.structuralHash)).toBe(true);
    expect(locateVolumeExtractionVertex(record, geometry, 0)).toMatchObject({ state: "mapped", source });
    expect(bridge.artifacts().resolve(record.result.artifacts[0], source).ok).toBe(true);
    expect(JSON.stringify(record)).not.toContain("scalars");
    expect(parseVolumeExtraction(serializeVolumeExtraction(record))).toEqual(record);
    const workspace = createVolumeWorkspaceDocument({ volume, kernelDocument: adapter.document(), view, extractions: [record],
      artifacts: [{ id: record.artifactId, role: "derived-result", storage: "content-addressed", uri: `artifact:${record.artifactId}`,
        contentHash: record.contentHash, byteLength: record.byteLength, scalarType: "triangle-mesh", components: 3 }] });
    expect(parseVolumeWorkspace(serializeVolumeWorkspace(workspace)).extractions).toEqual([record]);
    expect(volumeExtractionStatus(record, source)).toBe("current");
    expect(volumeExtractionStatus(record, source, false)).toBe("unavailable");
    const snapshot = promoteVolumeExtraction(record, "iso:volume-gk15:1:0:snapshot");
    adapter.commitSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: "x+y+z" } });
    bridge.invalidate();
    expect(jobs.resources()).toEqual([]);
    // Historical geometry uses normal Mesh sidecars, never stale analysis bytes.
    let saved = createMath3DProject(createMixedWorkspaceDocument({
      entries: [
        { module: "volume", checkpoint: record.sourceDocument, expected: record.sourceDocument.identity, replay: null },
        { module: "surface", checkpoint: record.surface, expected: record.surface.identity, replay: null },
        { module: "mesh", checkpoint: record.mesh!, expected: record.mesh!.identity, replay: null },
      ], activeDocumentIds: [record.sourceDocument.identity.id], results: [record.result],
      artifacts: [{ handle: record.result.artifacts[0], contentHash: record.contentHash, byteLength: record.byteLength }],
      relations: [...record.relations], constructions: [], committedSelection: null,
    }), { stableKey: "volume-extraction-reopen" });
    expect(volumeMeshJourneyOptions(saved)).toEqual([expect.objectContaining({
      volumeId: record.sourceDocument.identity.id, meshId: record.mesh!.identity.id,
      resultId: record.result.resultId, isoValue: 0 })]);
    const prepared = prepareVolumeMeshStudy(saved, record.result.resultId);
    saved = prepared.project;
    expect(() => prepareVolumeMeshStudy(saved, record.result.resultId)).toThrow(/already has a saved Study/);
    const changedProject = replaceMath3DProjectWorkspace(saved, createMixedWorkspaceDocument({
      ...saved.workspace, entries: saved.workspace.entries.map(entry => entry.expected.id === record.sourceDocument.identity.id
        ? { ...entry, checkpoint: adapter.document(), expected: adapter.document().identity, replay: null }
        : entry),
    }));
    expect(volumeMeshJourneyOptions(changedProject)).toEqual([]);
    expect(inspectProjectStudyMembers(changedProject, changedProject.workspace.studies![0]!)[0]!.status)
      .toBe("changed");
    expect(inspectProjectCompatibility(saved).canOpenWorkspace).toBe(false);
    const retainedBytes = bridge.meshResources().bytes(record.mesh!.source.resource)!;
    expect(sha256Checksum(retainedBytes)).toBe(record.mesh!.source.resource.checksum);
    const volumeBytes = new Uint8Array(grid.scalars.buffer, grid.scalars.byteOffset, grid.scalars.byteLength);
    const resources = captureProjectResources(saved, item => item.kind === "mesh-buffers" ? retainedBytes :
      item.kind === "volume-payload" ? volumeBytes :
      item.kind === "workbook-payload" && item.id === prepared.workbookId ? prepared.workbookBytes : null);
    const transferred = parseProjectPackage(exportProjectPackage(saved, resources));
    expect(transferred.project).toEqual(parseMath3DProject(serializeMath3DProject(saved)));
    expect(inspectProjectCompatibility(transferred.project, { resources: transferred.resources }).canOpenWorkspace).toBe(true);
    expect(transferred.resources.bytes({ kind: "mesh-buffers", id: record.mesh!.source.resource.id })).toEqual(retainedBytes);
    const reopenedStudy = transferred.project.workspace.studies![0]!;
    expect(inspectProjectStudyMembers(transferred.project, reopenedStudy).map(member => member.status))
      .toEqual(["current-reference", "current-reference"]);
    const paneStates = reopenedStudy.paneReferences!.map(pane => inspectResearchReference(transferred.project,
      pane.reference, item => transferred.resources.bytes(item)));
    expect(paneStates).toEqual([expect.objectContaining({ status: "current" }),
      expect.objectContaining({ status: "current" })]);
    const workbookReference = saved.workbooks!.find(item => item.id === prepared.workbookId)!;
    const reopenedWorkbook = readProjectWorkbook(transferred.resources.bytes({ kind: "workbook-payload",
      id: prepared.workbookId })!, workbookReference);
    expect(reopenedWorkbook.stages[1]!.blocks).toHaveLength(2);
    expect(projectStudyWorkbookReferences(transferred.project, reopenedStudy,
      id => transferred.resources.bytes({ kind: "workbook-payload", id })))
      .toEqual([expect.objectContaining({ status: "current", workbookId: prepared.workbookId })]);
    const meshPane = reopenedStudy.paneReferences!.find(pane => pane.reference.targetId === record.mesh!.identity.id)!;
    expect(inspectResearchReference(transferred.project, meshPane.reference, () => null).status).not.toBe("current");
    const volumePane = reopenedStudy.paneReferences!.find(pane => pane.reference.targetId === record.sourceDocument.identity.id)!;
    expect(inspectResearchReference(transferred.project, volumePane.reference,
      item => item.kind === "volume-payload" ? null : transferred.resources.bytes(item)).status).not.toBe("current");
    const corrupt = retainedBytes.slice(); corrupt[corrupt.length - 1] ^= 1;
    expect(() => captureProjectResources(saved, item => item.kind === "mesh-buffers" ? corrupt :
      item.kind === "volume-payload" ? volumeBytes :
      item.kind === "workbook-payload" ? prepared.workbookBytes : null)).toThrow();
    const legacy = { ...record }; delete legacy.mesh;
    expect(parseVolumeExtraction(serializeVolumeExtraction(legacy))).toEqual(legacy);
    expect(volumeExtractionStatus(record, adapter.sourceGeneration())).toBe("stale");
    expect(volumeExtractionStatus(snapshot, adapter.sourceGeneration())).toBe("snapshot");
    expect(bridge.artifacts().resolve(record.result.artifacts[0], source).ok).toBe(false);
    jobs.dispose();
    expect(jobs.resources()).toEqual([]);
  });

  it("rejects unsafe memory plans before scheduling the worker", () => {
    const adapter = new VolumeDocumentAdapter(volumeDocumentFromLegacyObject(volume));
    const jobs = new VolumeIsosurfaceScientificJob(() => adapter, new VolumeWorkerCoordinator(() => { throw new Error("Worker should not start."); }));
    const request = createVolumeJobRequest({ requestId: "unsafe-volume", operation: "marchingCubes", volume, grid, parameters: { isoValue: 0 } });
    expect(() => jobs.submit({ ...request, dimensions: [10_000, 10_000, 10_000] })).toThrow();
    jobs.dispose();
  });
});
