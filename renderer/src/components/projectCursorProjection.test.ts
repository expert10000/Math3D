import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createCrossModuleAdapterRegistry, createPlatformCapabilitySnapshot,
  createStableDocumentId, structuralHash,
  PLATFORM_FACILITIES, type CrossModuleAdapter } from "@math3d/core";
import { ScientificCursorBus } from "./scientificCursor";
import { projectProjectCursor } from "./projectCursorProjection";

const adapter = JSON.parse(readFileSync(new URL("../../../packages/core/fixtures/cross-module/current-v1.json", import.meta.url), "utf8")) as CrossModuleAdapter;
const registry = createCrossModuleAdapterRegistry([adapter]);
const platform = createPlatformCapabilitySnapshot({ runtime: "desktop", adapterId: "test-host", adapterVersion: "1",
  facilities: Object.fromEntries(PLATFORM_FACILITIES.map(key => [key, { available: true, reason: null }])) as
    Parameters<typeof createPlatformCapabilitySnapshot>[0]["facilities"] });
const source = { documentId: createStableDocumentId("vector-field3d", { fixture: "cursor" }),
  revision: 2, structuralHash: structuralHash({ fixture: "cursor" }), generation: 2 };
const bus = new ScientificCursorBus();
const cursor = bus.publishProject({ source, sourceModule: "vector3d", frame: adapter.sourceFrame,
  position: [1, 2, 3], resourceSha256: null, mode: "locked", originViewId: "field" }, source);
const mapper = { id: adapter.mapping.id, version: adapter.mapping.version,
  map: (point: readonly number[]) => [point[0], 7] };
const input = { registry, adapterId: adapter.id, targetModule: adapter.targetModule,
  targetFrame: adapter.targetFrame, currentSource: source, platform, mapper,
  operationAvailable: () => true };

describe("M3D20-03 qualified Project cursor projection", () => {
  it("maps only through a declared implementation and preserves the source event sequence", () => {
    const result = projectProjectCursor(cursor, input);
    expect(result).toMatchObject({ status: "mapped", position: [1, 7],
      accuracy: "interpolated", sourceSequence: cursor.sequence });
    expect(bus.snapshot()).toEqual(cursor);
  });
  it("does not invoke a mapper when the source, frame, operation, or implementation fails qualification", () => {
    const map = vi.fn(mapper.map);
    const checked = { ...mapper, map };
    const cases = [
      { currentSource: { ...source, generation: 3 } },
      { targetFrame: { ...adapter.targetFrame, frameId: "other" } },
      { operationAvailable: () => false },
      { mapper: { ...checked, version: checked.version + 1 } },
    ];
    for (const change of cases) expect(projectProjectCursor(cursor, { ...input, mapper: checked, ...change }).status).toBe("disabled");
    expect(map).not.toHaveBeenCalled();
  });
  it("exposes outside and invalid mapping outputs without publishing a second cursor", () => {
    expect(projectProjectCursor(cursor, { ...input, mapper: { ...mapper, map: () => null } }).status).toBe("outside");
    expect(projectProjectCursor(cursor, { ...input, mapper: { ...mapper, map: () => [Infinity, 3] } }).status).toBe("invalid-mapping");
    expect(projectProjectCursor(cursor, { ...input, mapper: { ...mapper, map: () => { throw Error("offline"); } } }).status).toBe("invalid-mapping");
    expect(bus.snapshot()).toEqual(cursor);
  });
});
