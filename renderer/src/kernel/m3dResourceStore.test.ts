import { describe, expect, it } from "vitest";
import { encodeM3DMeshResource } from "@math3d/core";
import { createInMemoryM3DResourceStore } from "@math3d/kernel";

describe("M3D resource store", () => {
  const resource = () => encodeM3DMeshResource({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  });

  it("deduplicates checksum-addressed resources and cleans them after owners and leases release", () => {
    const store = createInMemoryM3DResourceStore();
    const first = store.retain("mesh-job:one", resource());
    const second = store.retain("volume-job:two", resource());
    expect(second.resourceId).toBe(first.resourceId);
    const lease = store.acquire(first.resourceId)!;
    expect(lease.bytes.byteLength).toBe(first.descriptor.byteLength);
    expect(store.releaseOwner("mesh-job:one")).toEqual([]);
    expect(store.metadata(first.resourceId)).toMatchObject({ owners: ["volume-job:two"], leaseCount: 1 });
    lease.release();
    expect(store.metadata(first.resourceId)).not.toBeNull();
    expect(store.releaseOwner("volume-job:two")).toEqual([first.resourceId]);
    expect(store.metadata(first.resourceId)).toBeNull();
  });
});
