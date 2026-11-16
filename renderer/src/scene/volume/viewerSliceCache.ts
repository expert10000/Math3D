import type { VolumeGrid } from "../datasets";
import type { Image2D } from "../renderPrimitives";
import { buildSliceImage, getSliceInfo, sliceVolumeData, type SliceAxis, type VolumeSliceData } from "./sliceVolume";

// Navigation recreates the four Volume panes. Keep only the small, recently
// viewed CPU slices; never retain the source grid or its full scalar buffer.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 24;
type Entry = { data: VolumeSliceData; metadata: string; images: Map<string, Image2D>; bytes: number };
const entries = new Map<string, Entry>();
const gridIds = new WeakMap<VolumeGrid, number>();
let nextGridId = 1;
let cachedBytes = 0;

function touch(key: string, entry: Entry): void {
  entries.delete(key);
  entries.set(key, entry);
}

function removeOldest(): void {
  const oldest = entries.keys().next().value;
  if (oldest === undefined) return;
  cachedBytes -= entries.get(oldest)!.bytes;
  entries.delete(oldest);
}

function trim(): void {
  while (cachedBytes > MAX_BYTES || entries.size > MAX_ENTRIES) removeOldest();
}

function sourceStillMatches(grid: VolumeGrid, data: VolumeSliceData): boolean {
  const [nx, ny] = grid.dims;
  for (let h = 0; h < data.height; h++) {
    for (let w = 0; w < data.width; w++) {
      const x = data.axis === "x" ? data.sliceIndex : w;
      const y = data.axis === "y" ? data.sliceIndex : data.axis === "x" ? w : h;
      const z = data.axis === "z" ? data.sliceIndex : h;
      if (!Object.is(grid.scalars[x + nx * (y + ny * z)] ?? 0, data.values[h * data.width + w])) return false;
    }
  }
  return true;
}

export function viewerSliceData(grid: VolumeGrid, axis: SliceAxis, index: number): VolumeSliceData {
  let gridId = gridIds.get(grid);
  if (gridId === undefined) { gridId = nextGridId++; gridIds.set(grid, gridId); }
  const info = getSliceInfo(grid, axis, index);
  const key = `${gridId}:${axis}:${info.sliceIndex}`;
  const metadata = JSON.stringify([grid.dims, grid.spacing, grid.origin, grid.direction, grid.centering]);
  const existing = entries.get(key);
  if (existing && existing.metadata === metadata && existing.data.width === info.width &&
      existing.data.height === info.height && sourceStillMatches(grid, existing.data)) {
    touch(key, existing);
    return existing.data;
  }
  if (existing) { cachedBytes -= existing.bytes; entries.delete(key); }
  const data = sliceVolumeData(grid, axis, index);
  const bytes = data.values.byteLength + data.stats.histogram.byteLength;
  if (bytes <= MAX_BYTES) {
    const entry = { data, metadata, images: new Map<string, Image2D>(), bytes };
    entries.set(key, entry);
    cachedBytes += bytes;
    trim();
  }
  return data;
}

export function viewerSliceImage(data: VolumeSliceData, window?: { low: number; high: number }): Image2D {
  let key: string | undefined;
  let entry: Entry | undefined;
  for (const [candidateKey, candidate] of entries) {
    if (candidate.data === data) { key = candidateKey; entry = candidate; break; }
  }
  if (!entry || key === undefined) return buildSliceImage(data, window);
  const windowKey = window ? `${window.low}:${window.high}` : "default";
  const image = entry.images.get(windowKey);
  if (image) { touch(key, entry); return image; }
  const created = buildSliceImage(data, window);
  if (entry.bytes + created.data.byteLength <= MAX_BYTES) {
    // A moving display window must not accumulate every intermediate image.
    if (entry.images.size >= 2) {
      const oldestWindow = entry.images.keys().next().value!;
      entry.bytes -= entry.images.get(oldestWindow)!.data.byteLength;
      cachedBytes -= entry.images.get(oldestWindow)!.data.byteLength;
      entry.images.delete(oldestWindow);
    }
    entry.images.set(windowKey, created);
    entry.bytes += created.data.byteLength;
    cachedBytes += created.data.byteLength;
    touch(key, entry);
    trim();
  }
  return created;
}
