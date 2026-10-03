import { additionalReplayEditable } from "./additionalProjectSession";
import { captureProjectResources, projectResourceInventory, verifyProjectResourceBytes, parseProjectPackage, MAX_PROJECT_PACKAGE_BYTES, type VerifiedProjectResources } from "./projectResources";
import { meshReplayEditable } from "./nativeMeshRestore";
import type { MeshReplayBundle } from "../mesh/meshReplay";
import { geometryDocumentEditable, projectConstructionsEditable } from "./nativeGeometryRestore";
import { nativeDocumentEditable } from "./nativeProjectRestore";
import { scientificDocumentEditable } from "./nativeScientificRestore";
import { volumeDocumentEditable, volumePayloadRequired, validateNativeVolumeReplay } from "./nativeVolumeRestore";
import type { VolumeReplayBundle } from "../volume/volumeDocumentAdapter";
import { adoptMixedWorkspaceProject, createMixedWorkspaceDocument, matchesScientificSourceGeneration, viewerSourceFromDocument, MAX_MATH3D_PROJECT_BYTES, parseMath3DProject,
  parseMixedWorkspaceDocument, parseWorkspaceProjectHandoff, serializeMath3DProject, replaceMath3DProjectWorkspace, type Graph2DPointTableReference,
  mergeGraph2DHandoffCheckpoint,
  type Math3DProject, type MixedWorkspaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export const MAX_PROJECT_IMPORT_BYTES = MAX_MATH3D_PROJECT_BYTES + 64 * 1024;
export type ProjectCompatibilityOptions = {
  resources?: VerifiedProjectResources;
  artifactAvailable?: (id: string, hash: string | null) => boolean;
  tableAvailable?: (reference: Graph2DPointTableReference) => boolean;
};
type Resource = { id: string; kind: string; checksum: string | null; byteLength: number | null; requiredForSource: boolean; available: boolean };
const promotions = new Set(["graph2d.promote-curve", "graph2d.revolve-surface", "graph2d.extrude-surface"]);

/** Every module is replay-verified; native editing is qualified by its supported source adapter. */
export const inspectProjectCompatibility = (project: Math3DProject, options: ProjectCompatibilityOptions = {}) => {
  const canonical = parseMath3DProject(serializeMath3DProject(project)), resolved = verifyMixedWorkspaceReplay(canonical.workspace);
  const reasons: string[] = [], resources = new Map<string, Resource>();
  const add = (resource: Omit<Resource, "available">, availableOverride?: boolean) => {
    let available = false;
    try { available = availableOverride ?? (resource.checksum !== null && (options.artifactAvailable?.(resource.id, resource.checksum) ?? false)); } catch { /* unknown bytes remain unavailable */ }
    const key = `${resource.kind}:${resource.id}`, old = resources.get(key);
    if (old && old.checksum !== resource.checksum) throw new TypeError("Conflicting external resource checksums.");
    resources.set(key, { ...resource, requiredForSource: resource.requiredForSource || (old?.requiredForSource ?? false), available });
  };
  for (const artifact of canonical.workspace.artifacts) add({ id: artifact.handle.artifactId, kind: `analysis-${artifact.handle.kind}`,
    checksum: artifact.contentHash, byteLength: artifact.byteLength, requiredForSource: false });
  const requiredCapabilities = new Set<string>();
  for (const document of resolved.values()) {
    if (document.format === "math3d.graph2d-document") {
      document.requiredCapabilities.forEach((capability) => requiredCapabilities.add(capability));
      for (const object of document.source.objects) if (object.kind === "point-series") {
        let available = false; try { available = options.tableAvailable?.(object.table) ?? false; } catch { /* table unavailable */ }
        add({ id: object.table.id, kind: "graph-point-table", checksum: object.table.checksum, byteLength: null, requiredForSource: true }, available);
      }
    } else if (document.format === "math3d.mesh-document") add({ id: document.source.resource.id, kind: "mesh-buffers", checksum: document.source.resource.checksum, byteLength: null, requiredForSource: true });
    else if (document.format === "math3d.volume-document" && document.source.payload) add({ id: document.source.payload.handle, kind: "volume-payload", checksum: null, byteLength: document.source.payload.byteLength, requiredForSource: volumePayloadRequired(document) });
    else if (document.format === "math3d.surface-document" && document.source.definition.meshId && !resolved.has(document.source.definition.meshId)) {
      const id = document.source.definition.meshId, mesh = [...resolved.values()].find((item) => item.format === "math3d.mesh-document" && item.source.resource.id === id);
      add({ id, kind: "mesh-buffers", checksum: mesh?.format === "math3d.mesh-document" ? mesh.source.resource.checksum : null, byteLength: null, requiredForSource: true });
    }
  }
  for (const item of projectResourceInventory(canonical)) {
    const bytes = options.resources?.bytes(item);
    if (bytes) verifyProjectResourceBytes(item, bytes);
    const available = !!bytes || (item.kind === "graph-point-table" && (options.tableAvailable?.(item.reference as Graph2DPointTableReference) ?? false));
    add({ id: item.id, kind: item.kind, checksum: item.checksum, byteLength: bytes?.length ?? (item.kind === "volume-payload" ? (item.reference as { byteLength: number }).byteLength : null), requiredForSource: item.required }, available);
  }
  if (!canonical.workspace.entries.length) reasons.push("The project has no documents to open.");
  const documents = canonical.workspace.entries.map((entry) => {
    let editable = entry.module === "graph2d";
    if (entry.module === "curve" || entry.module === "surface") {
      const parents = canonical.workspace.relations.filter((relation) => promotions.has(relation.operation) && relation.target.type === "document" && relation.target.generation.documentId === entry.expected.id);
      const graph = parents.length === 1 ? resolved.get(parents[0]!.sources[0]?.documentId ?? "") : null;
      editable = graph?.format === "math3d.graph2d-document" && parents.length === 1 && parents[0]!.sources.length === 1 && parents[0]!.sources[0]!.documentId === graph.identity.id &&
        matchesScientificSourceGeneration(parents[0]!.sources[0]!, viewerSourceFromDocument(graph)) && parents[0]!.target.type === "document" &&
        matchesScientificSourceGeneration(parents[0]!.target.generation, viewerSourceFromDocument({ identity: entry.expected })) &&
        typeof (parents[0]!.parameters as Record<string, unknown>).sourceObjectId === "string" &&
        graph.source.objects.some((object) => object.id === (parents[0]!.parameters as Record<string, unknown>).sourceObjectId);
    }
    const document = resolved.get(entry.expected.id)!;
    if ((document.format === "math3d.curve-document" || document.format === "math3d.surface-document") && nativeDocumentEditable(document)) editable = true;
    if (document.format === "math3d.mesh-document" && meshReplayEditable(document, entry.replay?.payload as unknown as MeshReplayBundle | undefined)) editable = true;
    if (document.format === "math3d.geometry-document" && geometryDocumentEditable(document)) editable = true;
    if (document.format === "math3d.volume-document" && volumeDocumentEditable(document)) {
      try { validateNativeVolumeReplay(document, entry.replay?.payload as unknown as VolumeReplayBundle | undefined, options.resources); editable = true; }
      catch { editable = false; }
    }
    if ((document.format === "math3d.topology-document" || document.format === "math3d.complex-analysis-document") && scientificDocumentEditable(document)) editable = true;
    if (!editable && additionalReplayEditable(entry, document, { documents: resolved, resources: options.resources })) editable = true;
    if (canonical.metadata.documents?.[entry.expected.id]?.archived) editable = false;
    if (!editable) reasons.push(`${entry.module}: this document has verified preview support; its editor state cannot be fully restored by this host adapter.`);
    return { id: entry.expected.id, module: entry.module, revision: entry.expected.revision, replayVerified: true, editable };
  });
  if (!projectConstructionsEditable(canonical.workspace)) reasons.push("Saved construction/script state has preview support; the active editor adapters do not restore it.");
  const sidecars = [...resources.values()];
  if (sidecars.some((resource) => resource.requiredForSource && !resource.available)) reasons.push("Required source sidecars are missing or unverified on this computer.");
  const engines = [...new Map(canonical.workspace.results.map((result) => [`${result.provenance.engine.name}@${result.provenance.engine.version}`, result.provenance.engine])).values()];
  const checkpoint = createMixedWorkspaceDocument({ ...canonical.workspace, entries: canonical.workspace.entries.map((entry) => ({ ...entry, checkpoint: resolved.get(entry.expected.id)!, replay: null })) });
  return { project: canonical, checkpoint, documents, requiredCapabilities: [...requiredCapabilities].sort(), sidecars, engines, reasons, canOpenWorkspace: reasons.length === 0 };
};
export type ProjectCompatibility = ReturnType<typeof inspectProjectCompatibility>;

export const previewProjectImport = (raw: string, options: ProjectCompatibilityOptions = {}) => {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_PACKAGE_BYTES) throw new TypeError("Project import exceeds its size limit.");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Unsupported project file.");
  if (value.format === "math3d.project-package") {
    const { project, resources } = parseProjectPackage(raw);
    return { ...inspectProjectCompatibility(project, { ...options, resources }), resources, inputKind: "Project with verified source resources" };
  }
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_IMPORT_BYTES) throw new TypeError("Project import exceeds its size limit.");
  let project: Math3DProject, inputKind: string;
  if (value.format === "math3d.project") { project = parseMath3DProject(raw); inputKind = "Named project"; }
  else if (value.format === "math3d.mixed-workspace") { project = adoptMixedWorkspaceProject(parseMixedWorkspaceDocument(raw), "Imported workspace"); inputKind = "Legacy mixed workspace (explicit adoption)"; }
  else if (value.format === "math3d.project-handoff" && value.version === 2) {
    const handoff = parseWorkspaceProjectHandoff(raw); project = adoptMixedWorkspaceProject(handoff.project, "Imported Graph workspace"); inputKind = "Graph workspace handoff (explicit adoption)";
  } else throw new TypeError("Unsupported project format or future version.");
  // Host caches may belong to another project. Rebuild only this project's
  // descriptors/owners; unrelated source bytes never enter its staged archive.
  const resources = options.resources ? captureProjectResources(project, (item) => options.resources!.bytes(item), true) : undefined;
  return { ...inspectProjectCompatibility(project, { ...options, resources }), resources, inputKind };
};
export const exportProjectFile = (project: Math3DProject): string => {
  const bytes = serializeMath3DProject(project); verifyMixedWorkspaceReplay(project.workspace); return bytes;
};
export const projectCheckpoint = (workspace: MixedWorkspaceDocument): MixedWorkspaceDocument => {
  const resolved = verifyMixedWorkspaceReplay(workspace);
  return createMixedWorkspaceDocument({ ...workspace, entries: workspace.entries.map((entry) => ({ ...entry, checkpoint: resolved.get(entry.expected.id)!, replay: null })) });
};
/** Explicit portable snapshots retain scientific generations; only command replay is resolved. */
export const exportProjectCheckpointFile = (project: Math3DProject): string =>
  exportProjectFile(replaceMath3DProjectWorkspace(project, projectCheckpoint(project.workspace)));
/** Retain imported analysis/companions while live source commands advance their own identities and replay. */
export const mergeProjectLiveWorkspace = (retained: MixedWorkspaceDocument, live: MixedWorkspaceDocument): MixedWorkspaceDocument => {
  const previousGraphs = retained.entries.filter((entry) => entry.module === "graph2d"), liveGraphs = live.entries.filter((entry) => entry.module === "graph2d");
  if (previousGraphs.length !== 1 || liveGraphs.length !== 1 || previousGraphs[0]!.expected.id !== liveGraphs[0]!.expected.id) return live;
  const merged = mergeGraph2DHandoffCheckpoint(projectCheckpoint(retained), projectCheckpoint(live));
  const entries = new Map([...retained.entries, ...live.entries].map((entry) => [entry.expected.id, entry]));
  return createMixedWorkspaceDocument({ ...merged, constructions: live.constructions, entries: merged.entries.map((entry) => entries.get(entry.expected.id)!) });
};
