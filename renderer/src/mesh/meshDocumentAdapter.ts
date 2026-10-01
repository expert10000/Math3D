import {
  MESH_COMMAND_TYPES, projectCommandTransaction, structuralHash, immutableCanonicalJsonClone,
  createMeshDocument,
  createMeshCommandState,
  createCommandEnvelope,
  meshCommandDefinitions,
  normalizeMeshDocument,
  type CanonicalJsonValue,
  type CommandEnvelope,
  type CommandOrigin,
  type MeshDocument,
  type MeshDocumentSource,
  type MeshEditKind,
  type MeshCommandState,
  type ScientificSourceGeneration,
  type StructuralHash,
} from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "@math3d/kernel";
import type { SurfaceMeshData, SurfaceMeshSource } from "./surfaceMesh";
import { restoreMeshReplayKernel, type MeshReplayBundle } from "./meshReplay";
import { MeshResourceStore } from "./meshResourceStore";

export type MeshDocumentPackage = Readonly<{
  document: MeshDocument;
  /** Binary sidecar, intentionally separate from the JSON document and command log. */
  resourceBytes: Uint8Array;
}>;

export type MeshReplayTransaction = Readonly<{
  transactionId: string;
  commands: readonly CommandEnvelope[];
  inverseCommands: readonly CommandEnvelope[];
  stateHash: StructuralHash;
}>;

export type MeshReplayPackage = Readonly<{
  checkpoint: MeshCommandState;
  transactions: readonly MeshReplayTransaction[];
  cursor: number;
  resources: readonly Readonly<{ reference: MeshDocumentSource["resource"]; bytes: Uint8Array }>[];
}>;

const canonicalOrigin = (source: SurfaceMeshSource): CanonicalJsonValue =>
  JSON.parse(JSON.stringify(source)) as CanonicalJsonValue;

export class MeshDocumentAdapter {
  readonly resources: MeshResourceStore;
  #kernel: InMemoryDocumentKernel<MeshCommandState>;
  #checkpoint: MeshCommandState;
  #transactions: MeshReplayTransaction[] = [];
  #cursor = 0;
  #sequence = 0;
  #knownResources = new Map<string, MeshDocumentSource["resource"]>();

  constructor(document: MeshDocument, resources: MeshResourceStore) {
    const normalized = normalizeMeshDocument(document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    if (!resources.bytes(normalized.value.source.resource)) throw new TypeError("Mesh source buffer artifact is unavailable.");
    this.resources = resources;
    this.#checkpoint = createMeshCommandState(normalized.value);
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#checkpoint, commandDefinitions: meshCommandDefinitions, historyLimit: 100 });
    this.#knownResources.set(normalized.value.source.resource.id, normalized.value.source.resource);
  }

  static fromMesh(mesh: SurfaceMeshData, resources = new MeshResourceStore()): MeshDocumentAdapter {
    const resource = resources.publish(mesh);
    const stableKey = { resourceChecksum: resource.checksum, origin: canonicalOrigin(mesh.source) };
    const objectId = `mesh-object:${resource.checksum.slice(7, 39)}`;
    const importedFrom = mesh.source.kind === "import" ? mesh.source.filename ?? null : null;
    return new MeshDocumentAdapter(createMeshDocument({
      source: { objectId, resource, origin: canonicalOrigin(mesh.source) },
      stableKey,
      label: mesh.label,
      importedFrom,
    }), resources);
  }

  document(): MeshDocument { return this.#kernel.query((state) => state.document) as MeshDocument; }
  sourceGeneration(): ScientificSourceGeneration {
    const { id, revision, structuralHash } = this.document().identity;
    return { documentId: id, revision, structuralHash, generation: revision };
  }
  selection(): readonly string[] { return this.#kernel.query((state) => state.committedSelection.entityIds) as readonly string[]; }
  history() { return this.#kernel.historyStatus(); }

  mesh(): SurfaceMeshData {
    const document = this.document();
    const buffers = this.resources.resolve(document.source.resource);
    if (!buffers) throw new TypeError("Mesh source buffer artifact is unavailable.");
    return { ...buffers, label: document.metadata.label, source: document.source.origin as SurfaceMeshSource };
  }

  /** All committed edits are atomic kernel transactions containing references, not bulk buffers. */
  replaceMesh(mesh: SurfaceMeshData, kind: MeshEditKind = "replace", parameters: Readonly<Record<string, CanonicalJsonValue>> = {}): MeshDocument {
    const resource = this.resources.publish(mesh);
    const before = this.document();
    const source: MeshDocumentSource = {
      objectId: before.source.objectId,
      resource,
      origin: canonicalOrigin(mesh.source),
    };
    const commands: { type: string; payload: CanonicalJsonValue }[] = [{ type: MESH_COMMAND_TYPES.commitResource, payload: { source, operation: kind, parameters } as CanonicalJsonValue }];
    if (before.metadata.label !== mesh.label) commands.push({ type: MESH_COMMAND_TYPES.rename, payload: { label: mesh.label } });
    this.#transact(commands, [
      { type: MESH_COMMAND_TYPES.commitResource, payload: { source: before.source, operation: "replace", parameters: {} } },
      ...(before.metadata.label !== mesh.label ? [{ type: MESH_COMMAND_TYPES.rename, payload: { label: before.metadata.label } }] : []),
    ], { kind: "interactive", sourceId: "mesh-workspace" });
    this.#knownResources.set(resource.id, resource);
    return this.document();
  }

  commitSelection(entityIds: readonly string[]): readonly string[] {
    this.#transact(
      [{ type: MESH_COMMAND_TYPES.commitSelection, payload: { entityIds: [...entityIds] } }],
      [{ type: MESH_COMMAND_TYPES.commitSelection, payload: { entityIds: [...this.selection()] } }],
      { kind: "interactive", sourceId: "mesh-selection" }
    );
    return this.selection();
  }

  undo(): MeshDocument | null {
    const result = this.#kernel.undo();
    if (result.ok) this.#cursor = Math.max(0, this.#cursor - 1);
    return result.ok ? this.document() : null;
  }

  redo(): MeshDocument | null {
    const result = this.#kernel.redo();
    if (result.ok) this.#cursor = Math.min(this.#transactions.length, this.#cursor + 1);
    return result.ok ? this.document() : null;
  }

  exportPackage(): MeshDocumentPackage {
    const document = this.document();
    const resourceBytes = this.resources.bytes(document.source.resource);
    if (!resourceBytes) throw new TypeError("Mesh source buffer artifact is unavailable.");
    return { document, resourceBytes };
  }

  replayBundle(): MeshReplayBundle {
    this.#synchronizeReplay();
    return immutableCanonicalJsonClone({ checkpoint: this.#checkpoint, transactions: this.#transactions, cursor: this.#cursor }) as MeshReplayBundle;
  }

  exportReplay(): MeshReplayPackage {
    const bundle = this.replayBundle();
    const references = new Map<string, MeshDocumentSource["resource"]>();
    references.set(bundle.checkpoint.document.source.resource.id, bundle.checkpoint.document.source.resource);
    for (const transaction of bundle.transactions) for (const command of [...transaction.commands, ...transaction.inverseCommands]) {
      if (command.command.type === MESH_COMMAND_TYPES.commitResource) {
        const reference = (command.command.payload as unknown as { source: MeshDocumentSource }).source.resource;
        references.set(reference.id, reference);
      }
    }
    const resources = [...references.values()].map((reference) => {
      const bytes = this.resources.bytes(reference);
      if (!bytes) throw new TypeError(`Mesh replay resource '${reference.id}' is unavailable.`);
      return { reference, bytes };
    });
    return { ...bundle, resources };
  }

  static restoreReplay(bundle: MeshReplayPackage): MeshDocumentAdapter {
    const resources = new MeshResourceStore();
    for (const resource of bundle.resources) resources.import(resource.reference, resource.bytes);
    const kernel = restoreMeshReplayKernel(bundle);
    const adapter = new MeshDocumentAdapter(bundle.checkpoint.document, resources);
    adapter.#kernel = kernel;
    adapter.#checkpoint = createMeshCommandState(bundle.checkpoint.document, bundle.checkpoint.committedSelection);
    adapter.#transactions = JSON.parse(JSON.stringify(bundle.transactions));
    adapter.#cursor = bundle.cursor;
    adapter.#knownResources = new Map(bundle.resources.map(({ reference }) => [reference.id, reference]));
    adapter.#sequence = Math.max(0, ...bundle.transactions.flatMap((transaction) => transaction.commands.map((command) => Number(command.commandId.match(/mesh\/edit\/(\d+)\//)?.[1] ?? 0))));
    // Every historical source used by undo/redo must exist, not just the current mesh.
    adapter.exportReplay();
    return adapter;
  }

  static restore(pkg: MeshDocumentPackage, resources = new MeshResourceStore()): MeshDocumentAdapter {
    const normalized = normalizeMeshDocument(pkg.document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    resources.import(normalized.value.source.resource, pkg.resourceBytes);
    return new MeshDocumentAdapter(normalized.value, resources);
  }

  #transact(
    commands: readonly Readonly<{ type: string; payload: CanonicalJsonValue }>[],
    inverse: readonly Readonly<{ type: string; payload: CanonicalJsonValue }>[],
    origin: CommandOrigin
  ): void {
    this.#sequence += 1;
    const transactionId = `mesh/edit/${this.#sequence}`;
    const envelopes = commands.map((entry, index) => createCommandEnvelope({
      commandId: `${transactionId}/forward/${index + 1}`, origin, command: entry,
    }));
    const inverseCommands = inverse.map((entry, index) => createCommandEnvelope({
      commandId: `${transactionId}/inverse/${index + 1}`, origin: { kind: "system", sourceId: "mesh-undo" }, command: entry,
    }));
    const result = this.#kernel.transact({ transactionId, commands: envelopes, history: { kind: "reversible", inverseCommands } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ transactionId, commands: envelopes, inverseCommands, stateHash: result.event.stateHash });
    this.#cursor += 1;
    while (this.#transactions.length > 100) {
      const projected = projectCommandTransaction(this.#checkpoint, this.#transactions[0]!.commands, meshCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Could not advance Mesh replay checkpoint.");
      this.#checkpoint = projected.state; this.#transactions.shift(); this.#cursor -= 1;
    }
  }

  #synchronizeReplay(): void {
    const project = (initial: MeshCommandState, recordHashes: boolean) => {
      let state = initial;
      for (let index = 0; index < this.#transactions.length; index++) {
        const entry = this.#transactions[index]!;
        const result = projectCommandTransaction(state, entry.commands, meshCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Could not project Mesh history.");
        state = result.state;
        if (recordHashes) this.#transactions[index] = { ...entry, stateHash: structuralHash(state) };
      }
      for (let index = this.#transactions.length - 1; index >= this.#cursor; index--) {
        const result = projectCommandTransaction(state, this.#transactions[index]!.inverseCommands, meshCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Could not project Mesh cursor.");
        state = result.state;
      }
      return state;
    };
    const offset = this.document().identity.revision - project(this.#checkpoint, false).document.identity.revision;
    if (offset) this.#checkpoint = createMeshCommandState(createMeshDocument({ ...this.#checkpoint.document, identity: { ...this.#checkpoint.document.identity, revision: this.#checkpoint.document.identity.revision + offset }, label: this.#checkpoint.document.metadata.label, importedFrom: this.#checkpoint.document.metadata.importedFrom, visible: this.#checkpoint.document.display.visible }), this.#checkpoint.committedSelection);
    project(this.#checkpoint, true);
  }
}
