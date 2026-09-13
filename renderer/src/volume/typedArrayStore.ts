import type { VolumeStorageRef } from "./contracts";

export type ManagedVolumeArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array;

type StoredArray = { data: ManagedVolumeArray; owners: Set<string> };

export class VolumeTypedArrayStore {
  private readonly entries = new Map<string, StoredArray>();
  private readonly handlesByOwner = new Map<string, Set<string>>();

  bind(ownerId: string, storage: VolumeStorageRef, data: ManagedVolumeArray): void {
    if (storage.byteLength !== data.byteLength || storage.elementCount !== data.length) {
      throw new Error(`Volume storage ${storage.handle} does not match its typed-array payload.`);
    }
    const previousHandles = this.handlesByOwner.get(ownerId) ?? new Set<string>();
    for (const handle of previousHandles) {
      if (handle !== storage.handle) this.release(handle, ownerId);
    }
    const existing = this.entries.get(storage.handle);
    if (existing && existing.data !== data && existing.data.byteLength !== data.byteLength) {
      throw new Error(`Volume storage handle collision: ${storage.handle}.`);
    }
    const entry = existing ?? { data, owners: new Set<string>() };
    entry.data = data;
    entry.owners.add(ownerId);
    this.entries.set(storage.handle, entry);
    this.handlesByOwner.set(ownerId, new Set([storage.handle]));
  }

  get<TArray extends ManagedVolumeArray = ManagedVolumeArray>(storage: VolumeStorageRef | string): TArray | null {
    const handle = typeof storage === "string" ? storage : storage.handle;
    return (this.entries.get(handle)?.data as TArray | undefined) ?? null;
  }

  has(storage: VolumeStorageRef | string): boolean {
    return this.entries.has(typeof storage === "string" ? storage : storage.handle);
  }

  release(handle: string, ownerId?: string): boolean {
    const entry = this.entries.get(handle);
    if (!entry) return false;
    if (ownerId) entry.owners.delete(ownerId);
    else entry.owners.clear();
    if (entry.owners.size === 0) this.entries.delete(handle);
    if (ownerId) {
      const ownerHandles = this.handlesByOwner.get(ownerId);
      ownerHandles?.delete(handle);
      if (!ownerHandles?.size) this.handlesByOwner.delete(ownerId);
    } else {
      for (const [owner, handles] of this.handlesByOwner) {
        handles.delete(handle);
        if (!handles.size) this.handlesByOwner.delete(owner);
      }
    }
    return true;
  }

  releaseOwner(ownerId: string): void {
    const handles = [...(this.handlesByOwner.get(ownerId) ?? [])];
    for (const handle of handles) this.release(handle, ownerId);
  }

  clear(): void {
    this.entries.clear();
    this.handlesByOwner.clear();
  }

  summary(): { handles: number; byteLength: number; owners: number } {
    let byteLength = 0;
    for (const entry of this.entries.values()) byteLength += entry.data.byteLength;
    return { handles: this.entries.size, byteLength, owners: this.handlesByOwner.size };
  }
}

export const createVolumeTypedArrayStore = (): VolumeTypedArrayStore => new VolumeTypedArrayStore();
