export const MOBILE_MESH_CACHE_MAX_ENTRIES = 20;
export const MOBILE_MESH_CACHE_MAX_ENTRY_BYTES = 12 * 1024 * 1024;

export type MobileMeshCacheCandidate = {
  key: string;
  encodedBytes: number;
  updatedAt: number;
};

export const admitMobileMeshCacheCandidate = (
  current: MobileMeshCacheCandidate[],
  candidate: MobileMeshCacheCandidate
): MobileMeshCacheCandidate[] => {
  if (!Number.isFinite(candidate.encodedBytes) || candidate.encodedBytes < 0 ||
      candidate.encodedBytes > MOBILE_MESH_CACHE_MAX_ENTRY_BYTES) return current;
  return [candidate, ...current.filter((entry) => entry.key !== candidate.key)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MOBILE_MESH_CACHE_MAX_ENTRIES);
};
