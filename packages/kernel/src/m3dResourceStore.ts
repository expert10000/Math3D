import {
  verifyM3DMeshResource,
  type M3DMeshResource,
  type M3DResourceDescriptor,
} from "@math3d/core";

export const M3D_RESOURCE_STORE_SCHEMA_VERSION = 1 as const;

export type M3DResourceId = `m3d:${string}`;
export type M3DResourceMetadata = Readonly<{
  schemaVersion: typeof M3D_RESOURCE_STORE_SCHEMA_VERSION;
  resourceId: M3DResourceId;
  descriptor: M3DResourceDescriptor;
  owners: readonly string[];
  leaseCount: number;
}>;

export type M3DResourceLease = Readonly<{
  resourceId: M3DResourceId;
  descriptor: M3DResourceDescriptor;
  /** Immutable-by-contract view; do not mutate transferred resource bytes. */
  bytes: Uint8Array;
  release: () => void;
}>;

type StoredResource = {
  resource: M3DMeshResource;
  owners: Set<string>;
  leaseCount: number;
};

const OWNER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const resourceIdFor = (resource: M3DMeshResource): M3DResourceId => `m3d:${resource.descriptor.checksum.slice("sha256:".length)}`;

/**
 * Owns transferred M3D buffers after a worker completes. Resources are
 * deduplicated by checksum and removed as soon as their final owner and lease
 * are released. No browser, process, or transport details live here.
 */
export class InMemoryM3DResourceStore {
  readonly #resources = new Map<M3DResourceId, StoredResource>();

  retain(ownerId: string, resource: M3DMeshResource): M3DResourceMetadata {
    if (!OWNER.test(ownerId)) throw new TypeError("M3D resource ownerId must be an ID-safe string.");
    if (!verifyM3DMeshResource(resource)) throw new TypeError("M3D resource failed integrity verification.");
    const resourceId = resourceIdFor(resource);
    const existing = this.#resources.get(resourceId);
    if (existing) {
      existing.owners.add(ownerId);
      return this.#metadata(resourceId, existing);
    }
    this.#resources.set(resourceId, { resource, owners: new Set([ownerId]), leaseCount: 0 });
    return this.#metadata(resourceId, this.#resources.get(resourceId)!);
  }

  acquire(resourceId: M3DResourceId): M3DResourceLease | null {
    const stored = this.#resources.get(resourceId);
    if (!stored) return null;
    stored.leaseCount += 1;
    let active = true;
    return Object.freeze({
      resourceId,
      descriptor: stored.resource.descriptor,
      bytes: stored.resource.bytes,
      release: () => {
        if (!active) return;
        active = false;
        const current = this.#resources.get(resourceId);
        if (!current) return;
        current.leaseCount -= 1;
        this.#collect(resourceId, current);
      },
    });
  }

  releaseOwner(ownerId: string): readonly M3DResourceId[] {
    const removed: M3DResourceId[] = [];
    for (const [resourceId, stored] of this.#resources) {
      if (!stored.owners.delete(ownerId)) continue;
      if (this.#collect(resourceId, stored)) removed.push(resourceId);
    }
    return Object.freeze(removed);
  }

  metadata(resourceId: M3DResourceId): M3DResourceMetadata | null {
    const stored = this.#resources.get(resourceId);
    return stored ? this.#metadata(resourceId, stored) : null;
  }

  list(): readonly M3DResourceMetadata[] {
    return Object.freeze([...this.#resources.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([resourceId, stored]) => this.#metadata(resourceId, stored)));
  }

  #collect(resourceId: M3DResourceId, stored: StoredResource): boolean {
    if (stored.owners.size > 0 || stored.leaseCount > 0) return false;
    this.#resources.delete(resourceId);
    return true;
  }

  #metadata(resourceId: M3DResourceId, stored: StoredResource): M3DResourceMetadata {
    return Object.freeze({
      schemaVersion: M3D_RESOURCE_STORE_SCHEMA_VERSION,
      resourceId,
      descriptor: stored.resource.descriptor,
      owners: Object.freeze([...stored.owners].sort()),
      leaseCount: stored.leaseCount,
    });
  }
}

export const createInMemoryM3DResourceStore = (): InMemoryM3DResourceStore => new InMemoryM3DResourceStore();
