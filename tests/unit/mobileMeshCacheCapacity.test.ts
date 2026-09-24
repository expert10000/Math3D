import { describe, expect, it } from "vitest";
import {
  admitMobileMeshCacheCandidate,
  MOBILE_MESH_CACHE_MAX_ENTRIES,
  MOBILE_MESH_CACHE_MAX_ENTRY_BYTES,
} from "../../apps/mobile/src/models/mobileMeshCacheCapacity";

describe("mobile mesh cache capacity", () => {
  it("drops oversized entries without disturbing the usable cache", () => {
    const current = [{ key: "safe", encodedBytes: 10, updatedAt: 1 }];
    expect(admitMobileMeshCacheCandidate(current, {
      key: "too-large",
      encodedBytes: MOBILE_MESH_CACHE_MAX_ENTRY_BYTES + 1,
      updatedAt: 2,
    })).toBe(current);
  });

  it("keeps the newest bounded entries when the cache is full", () => {
    const current = Array.from({ length: MOBILE_MESH_CACHE_MAX_ENTRIES }, (_, index) => ({
      key: `entry-${index}`,
      encodedBytes: 10,
      updatedAt: index,
    }));
    const next = admitMobileMeshCacheCandidate(current, { key: "newest", encodedBytes: 10, updatedAt: 100 });
    expect(next).toHaveLength(MOBILE_MESH_CACHE_MAX_ENTRIES);
    expect(next[0].key).toBe("newest");
    expect(next.some((entry) => entry.key === "entry-0")).toBe(false);
  });
});
