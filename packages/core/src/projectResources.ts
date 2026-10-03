import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import type { CommandEnvelope } from "./commands";
import { Graph2DPointTableStore } from "./graph2dPointSeries";
import { GRAPH2D_COMMAND_TYPES } from "./graph2dCommands";
import { MESH_COMMAND_TYPES } from "./meshCommands";
import { parseMath3DProject, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { replayMixedWorkspaceDocument, type MixedWorkspaceDocument, type KernelWorkspaceDocument } from "./mixedWorkspace";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import type { MeshResourceReference } from "./meshDocument";
import type { VolumeDocument } from "./volumeDocument";
import { decodeMeshBuffers } from "./meshBufferCodec";
type ResourceHistory = { transactions: readonly { commands: readonly CommandEnvelope[]; inverseCommands: readonly CommandEnvelope[] }[] };

export type ProjectResourceContext = { resolveWorkspace?: (workspace: MixedWorkspaceDocument) => ReadonlyMap<string, KernelWorkspaceDocument>; volumePayloadRequired?: (document: VolumeDocument) => boolean };
export const MAX_PROJECT_RESOURCE_BYTES = 64 * 1024 * 1024;
export const MAX_PROJECT_PACKAGE_BYTES = 112 * 1024 * 1024;
export type ProjectResourceKind = "mesh-buffers" | "graph-point-table" | "volume-payload";
export type ProjectResourceRequirement = {
  id: string; kind: ProjectResourceKind; checksum: string | null; encoding: string; shape: readonly number[];
  owners: string[]; required: boolean; reference: MeshResourceReference | Graph2DPointTableReference | NonNullable<VolumeDocument["source"]["payload"]>;
};
export type ProjectResourceSidecar = Omit<ProjectResourceRequirement, "required" | "reference"> & { checksum: string; byteLength: number; data: string };
const key = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;
const scalarBytes: Record<string, number> = { float32: 4, float64: 8, int32: 4, uint32: 4, int16: 2, uint16: 2, int8: 1, uint8: 1 };

/** Include undo/redo inputs as authoritative resources, not just the visible source. */
export const projectResourceInventory = (project: Math3DProject, context: ProjectResourceContext = {}): ProjectResourceRequirement[] => {
  const resolved = (context.resolveWorkspace ?? replayMixedWorkspaceDocument)(project.workspace), inventory = new Map<string, ProjectResourceRequirement>();
  const add = (owner: string, item: Omit<ProjectResourceRequirement, "owners">) => {
    const old = inventory.get(key(item));
    if (old && (old.checksum !== item.checksum || old.encoding !== item.encoding || canonicalJsonStringify(old.shape) !== canonicalJsonStringify(item.shape))) throw new TypeError("Conflicting source resource references.");
    inventory.set(key(item), { ...item, required: item.required || !!old?.required, owners: [...new Set([...(old?.owners ?? []), owner])].sort() });
  };
  for (const entry of project.workspace.entries) {
    const documents = [entry.checkpoint, resolved.get(entry.expected.id)!];
    if (entry.module === "graph2d" && entry.replay) {
      const replay = entry.replay.payload as unknown as ResourceHistory;
      for (const transaction of replay.transactions) for (const command of [...transaction.commands, ...transaction.inverseCommands]) if (command.command.type === GRAPH2D_COMMAND_TYPES.replaceScene) {
        const source = (command.command.payload as unknown as { source: Graph2DDocument["source"] }).source;
        documents.push({ ...entry.checkpoint, source } as Graph2DDocument);
      }
    }
    if (entry.module === "mesh" && entry.replay) {
      const replay = entry.replay.payload as unknown as ResourceHistory;
      for (const transaction of replay.transactions) for (const command of [...transaction.commands, ...transaction.inverseCommands]) if (command.command.type === MESH_COMMAND_TYPES.commitResource) {
        const reference = (command.command.payload as unknown as { source: { resource: MeshResourceReference } }).source.resource;
        add(entry.expected.id, { id: reference.id, kind: "mesh-buffers", checksum: reference.checksum, encoding: reference.encoding, shape: [reference.vertexCount, reference.indexCount, Number(reference.hasNormals), Number(reference.hasUvs)], reference, required: true });
      }
    }
    // Volume command payloads contain references; historical payloads must also transfer.
    if (entry.module === "volume" && entry.replay) {
      const replay = entry.replay.payload as unknown as { transactions: { forward: { command: { type: string; payload: VolumeDocument["source"] } }; inverse: { command: { type: string; payload: VolumeDocument["source"] } } }[] };
      for (const transaction of replay.transactions) for (const command of [transaction.forward, transaction.inverse]) if (command.command.type === "volume.source.replace") {
        const source = command.command.payload;
        documents.push({ ...documents[0]!, source } as VolumeDocument);
      }
    }
    for (const document of documents) {
      if (document.format === "math3d.mesh-document") {
        const reference = document.source.resource;
        add(entry.expected.id, { id: reference.id, kind: "mesh-buffers", checksum: reference.checksum, encoding: reference.encoding, shape: [reference.vertexCount, reference.indexCount, Number(reference.hasNormals), Number(reference.hasUvs)], reference, required: true });
      } else if (document.format === "math3d.graph2d-document") {
        for (const object of document.source.objects) if (object.kind === "point-series") add(entry.expected.id, { id: object.table.id, kind: "graph-point-table", checksum: object.table.checksum, encoding: object.table.encoding, shape: [object.table.rowCount, 2], reference: object.table, required: true });
      } else if (document.format === "math3d.volume-document" && document.source.payload) {
        const reference = document.source.payload;
        add(entry.expected.id, { id: reference.handle, kind: "volume-payload", checksum: null, encoding: `math3d.volume-${reference.scalarType}.le.v1`, shape: [...document.source.spatial.dimensions, reference.components], reference, required: (context.volumePayloadRequired ?? (() => true))(document) });
      }
    }
  }
  return [...inventory.values()].sort((a, b) => key(a).localeCompare(key(b)));
};
export const encodeProjectResourceBytes = (bytes: Uint8Array): string => {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
};
const decode = (value: ProjectResourceSidecar) => {
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 0 || value.byteLength > MAX_PROJECT_RESOURCE_BYTES || typeof value.data !== "string" ||
    value.data.length !== 4 * Math.ceil(value.byteLength / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new TypeError("Invalid or oversized resource bytes.");
  const bytes = Uint8Array.from(atob(value.data), (char) => char.charCodeAt(0));
  if (bytes.length !== value.byteLength || sha256Checksum(bytes) !== value.checksum) throw new TypeError("Resource checksum or byte length does not match.");
  return bytes;
};
export const verifyProjectResourceBytes = (item: ProjectResourceRequirement, bytes: Uint8Array): void => {
  if (bytes.length > MAX_PROJECT_RESOURCE_BYTES || item.checksum && sha256Checksum(bytes) !== item.checksum) throw new TypeError("Source resource checksum does not match.");
  if (item.kind === "mesh-buffers") {
    const mesh = decodeMeshBuffers(bytes), reference = item.reference as MeshResourceReference;
    if (mesh.positions.length !== reference.vertexCount * 3 || (mesh.indices?.length ?? 0) !== reference.indexCount || reference.indexCount % 3 ||
      !mesh.indices && reference.vertexCount % 3 || (mesh.normals?.length ?? 0) !== (reference.hasNormals ? reference.vertexCount * 3 : 0) ||
      (mesh.uvs?.length ?? 0) !== (reference.hasUvs ? reference.vertexCount * 2 : 0) ||
      !mesh.positions.every(Number.isFinite) || !mesh.normals?.every(Number.isFinite) && reference.hasNormals || !mesh.uvs?.every(Number.isFinite) && reference.hasUvs ||
      mesh.indices?.some((index) => index >= reference.vertexCount)) throw new TypeError("Mesh buffer shape or values do not match the source reference.");
  } else if (item.kind === "graph-point-table") {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes), store = new Graph2DPointTableStore();
    const rows = JSON.parse(content);
    if (!Array.isArray(rows) || !rows.every((row) => row && Object.keys(row).sort().join() === "id,x,y")) throw new TypeError("Point table rows contain unsupported fields.");
    const reference = store.publish(rows);
    if (canonicalJsonStringify(reference) !== canonicalJsonStringify(item.reference) || canonicalJsonStringify(rows) !== content) throw new TypeError("Point table shape or encoding does not match.");
  } else {
    const reference = item.reference as NonNullable<VolumeDocument["source"]["payload"]>;
    if (!item.shape.every((value) => Number.isSafeInteger(value) && value > 0)) throw new TypeError("Volume dimensions and components must be positive integers.");
    const expected = item.shape.reduce((product, value) => product * value, 1) * (scalarBytes[reference.scalarType] ?? 0);
    if (!expected || !Number.isSafeInteger(expected) || expected !== bytes.length || reference.byteLength !== bytes.length) throw new TypeError("Volume payload dimensions, components or scalar encoding do not match.");
  }
};

/** Detached, fully validated staging area; preview never writes to a host store. */
export class VerifiedProjectResources {
  readonly #bytes = new Map<string, Uint8Array>();
  readonly #sidecars: ProjectResourceSidecar[];
  constructor(project: Math3DProject, sidecars: readonly ProjectResourceSidecar[] = [], context: ProjectResourceContext = {}) {
    const inventory = new Map(projectResourceInventory(project, context).map((item) => [key(item), item]));
    if (!Array.isArray(sidecars) || sidecars.length > 1024) throw new TypeError("Too many resource sidecars.");
    let total = 0;
    for (const sidecar of sidecars) {
      if (!sidecar || Object.keys(sidecar).sort().join() !== ["id", "kind", "checksum", "encoding", "shape", "owners", "byteLength", "data"].sort().join()) throw new TypeError("Unsupported resource descriptor.");
      const item = inventory.get(key(sidecar));
      if (!item || this.#bytes.has(key(sidecar)) || sidecar.encoding !== item.encoding || canonicalJsonStringify(sidecar.shape) !== canonicalJsonStringify(item.shape) ||
        canonicalJsonStringify(sidecar.owners) !== canonicalJsonStringify(item.owners)) throw new TypeError("Resource ownership, shape or encoding does not match the project.");
      const bytes = decode(sidecar); total += bytes.length;
      if (total > MAX_PROJECT_RESOURCE_BYTES) throw new TypeError("Project source resources exceed 64 MiB.");
      verifyProjectResourceBytes(item, bytes); this.#bytes.set(key(sidecar), bytes);
    }
    this.#sidecars = JSON.parse(JSON.stringify(sidecars));
  }
  bytes(item: { kind: string; id: string }): Uint8Array | null { return this.#bytes.get(key(item))?.slice() ?? null; }
  sidecars(): ProjectResourceSidecar[] { return JSON.parse(JSON.stringify(this.#sidecars)); }

}
export type ProjectResourceReader = (item: ProjectResourceRequirement) => Uint8Array | null;
export const captureProjectResources = (project: Math3DProject, reader: ProjectResourceReader, allowMissing = false, context: ProjectResourceContext = {}): VerifiedProjectResources => {
  const sidecars: ProjectResourceSidecar[] = [];
  for (const item of projectResourceInventory(project, context)) {
    const bytes = reader(item);
    if (!bytes) { if (item.required && !allowMissing) throw new TypeError(`Missing source resource '${item.id}'.`); continue; }
    verifyProjectResourceBytes(item, bytes);
    sidecars.push({ id: item.id, kind: item.kind, checksum: sha256Checksum(bytes), byteLength: bytes.length, encoding: item.encoding, shape: item.shape, owners: item.owners, data: encodeProjectResourceBytes(bytes) });
  }
  return new VerifiedProjectResources(project, sidecars, context);
};
export const exportProjectPackage = (project: Math3DProject, resources: VerifiedProjectResources, context: ProjectResourceContext = {}): string => {
  const checked = parseMath3DProject(serializeMath3DProject(project));
  const sidecars = new VerifiedProjectResources(checked, resources.sidecars(), context).sidecars();
  const raw = JSON.stringify({ format: "math3d.project-package", schemaVersion: 1, project: checked, resources: sidecars });
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_PACKAGE_BYTES) throw new TypeError("Project package exceeds its size limit.");
  return raw;
};
export const parseProjectPackage = (raw: string, context: ProjectResourceContext = {}) => {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_PACKAGE_BYTES) throw new TypeError("Project package exceeds its size limit.");
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).sort().join() !== ["format", "schemaVersion", "project", "resources"].sort().join() || value.format !== "math3d.project-package" || value.schemaVersion !== 1) throw new TypeError("Unsupported project package.");
  const project = parseMath3DProject(JSON.stringify(value.project));
  return { project, resources: new VerifiedProjectResources(project, value.resources, context) };
};
