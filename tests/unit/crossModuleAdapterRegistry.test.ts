import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCrossModuleAdapterRegistry, createPlatformCapabilitySnapshot,
  listProjectScientificSelections, migrateProjectScientificSelections,
  normalizeCrossModuleAdapter, normalizeMixedWorkspaceDocument,
  normalizeViewerCommittedSelection, parseMath3DProject,
  qualifyCrossModuleAdapter, referenceFromScientificSelection,
  referenceFromViewerCommittedSelection, serializeMath3DProject,
  viewerSourceFromDocument, PLATFORM_FACILITIES,
} from "@math3d/core";

const loadJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const currentAdapter = loadJson("../../packages/core/fixtures/cross-module/current-v1.json");
const legacyRaw = readFileSync(new URL("../fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const platform = createPlatformCapabilitySnapshot({
  runtime: "desktop", adapterId: "test-host", adapterVersion: "1",
  facilities: Object.fromEntries(PLATFORM_FACILITIES.map(key => [key, { available: true, reason: null }])) as
    Parameters<typeof createPlatformCapabilitySnapshot>[0]["facilities"],
});
const registry = createCrossModuleAdapterRegistry([currentAdapter]);

const boundSelection = () => {
  const project = migrateProjectScientificSelections(parseMath3DProject(legacyRaw));
  const legacySelection = listProjectScientificSelections(project).find(item => item.geometry.kind === "point" &&
    item.source?.kind === "document");
  const saved = legacySelection;
  if (!saved || saved.source?.kind !== "document") throw new Error("Fixture lacks a pinned point selection.");
  const entry = project.workspace.entries.find(item => item.expected.id === saved.source!.documentId);
  if (!entry) throw new Error("Fixture source is missing.");
  const source = viewerSourceFromDocument(entry.checkpoint);
  const pinned = { ...saved, source: { ...saved.source, checkpoint: {
    revision: source.revision, structuralHash: source.structuralHash,
  } } } as typeof saved;
  const reference = referenceFromScientificSelection(pinned, source, entry.module, currentAdapter.sourceFrame, "point");
  if (!reference.ok) throw new Error(reference.errors.join(" "));
  return { project, saved, pinned, source, reference: reference.value };
};

const qualification = (overrides: Partial<Parameters<typeof qualifyCrossModuleAdapter>[1]> = {}) => {
  const { source, reference } = boundSelection();
  return qualifyCrossModuleAdapter(registry, {
    adapterId: currentAdapter.id, selection: reference, targetModule: "graph2d", currentSource: source,
    targetFrame: currentAdapter.targetFrame, platform,
    operationAvailable: () => true, mappingAvailable: () => true,
    ...overrides,
  });
};

describe("M3D20-01 cross-module adapter compatibility", () => {
  it("accepts the v1 descriptor and rejects future, duplicate, and undeclared definitions", () => {
    expect(normalizeCrossModuleAdapter(currentAdapter).ok).toBe(true);
    expect(normalizeCrossModuleAdapter(loadJson("../../packages/core/fixtures/cross-module/invalid-future-version.json")).ok).toBe(false);
    expect(() => createCrossModuleAdapterRegistry([currentAdapter, currentAdapter])).toThrow(/Duplicate adapter/);
    expect(normalizeCrossModuleAdapter({ ...currentAdapter, workerOperationId: "invented.compute" }).ok).toBe(false);
    expect(normalizeCrossModuleAdapter({ ...currentAdapter, sourceFrame: {
      ...currentAdapter.sourceFrame, axes: [currentAdapter.sourceFrame.axes[0], currentAdapter.sourceFrame.axes[0]],
    } }).ok).toBe(false);
  });

  it("reads a 1.x Project, migrates selections, and reopens the current serializer without changed IDs", () => {
    const legacy = parseMath3DProject(legacyRaw);
    const current = migrateProjectScientificSelections(legacy);
    const reopened = parseMath3DProject(serializeMath3DProject(current));
    expect(reopened.identity.id).toBe(legacy.identity.id);
    expect(listProjectScientificSelections(reopened).map(item => item.identity))
      .toEqual(listProjectScientificSelections(current).map(item => item.identity));
    expect(boundSelection().reference.source.structuralHash).toBe(boundSelection().source.structuralHash);
  });

  it("rejects invalid Project hashes and workspace checkpoint divergence", () => {
    const project = JSON.parse(legacyRaw);
    project.identity.structuralHash = "sha256:" + "0".repeat(64);
    expect(() => parseMath3DProject(JSON.stringify(project))).toThrow();
    const workspace = structuredClone(parseMath3DProject(legacyRaw).workspace);
    workspace.entries[0].expected.structuralHash = "sha256:" + "0".repeat(64);
    expect(normalizeMixedWorkspaceDocument(workspace).ok).toBe(false);
  });

  it("qualifies only a current source with matching frames and an available mapping", () => {
    expect(qualification().enabled).toBe(true);
    expect(qualification({ currentSource: null }).disabled.map(item => item.code)).toContain("source-unavailable");
    const { source } = boundSelection();
    expect(qualification({ currentSource: { ...source, generation: source.generation + 1 } }).disabled.map(item => item.code))
      .toContain("stale-source");
    expect(qualification({ targetFrame: { ...currentAdapter.targetFrame, frameId: "reciprocal-k" } }).disabled.map(item => item.code))
      .toContain("target-frame-mismatch");
    expect(qualification({ targetModule: "mesh" }).disabled.map(item => item.code)).toContain("wrong-module");
    expect(qualification({ targetFrame: { ...currentAdapter.targetFrame, axes: [
      { name: "x", dimension: "length", unit: "cm" }, currentAdapter.targetFrame.axes[1],
    ] } }).disabled.map(item => item.code)).toContain("target-frame-mismatch");
    expect(qualification({ mappingAvailable: undefined }).disabled.map(item => item.code)).toContain("mapping-unavailable");
    expect(qualification({ operationAvailable: undefined }).disabled.map(item => item.code)).toContain("operation-unavailable");
    expect(qualification({ platform: { ...platform, schemaVersion: 2 } as typeof platform }).disabled.map(item => item.code))
      .toContain("facility-unavailable");
  });

  it("keeps absent resource and host facility reasons explicit", () => {
    const { reference } = boundSelection();
    const hash = "a".repeat(64);
    const result = qualification({ selection: { ...reference, resourceSha256: hash }, resourceAvailable: () => false });
    expect(result.disabled.map(item => item.code)).toContain("resource-unavailable");
    const facilityRegistry = createCrossModuleAdapterRegistry([{ ...currentAdapter, requiredFacilities: ["network"] }]);
    const offline = createPlatformCapabilitySnapshot({ runtime: "browser", adapterId: "offline", adapterVersion: "1",
      facilities: Object.fromEntries(PLATFORM_FACILITIES.map(key => [key, key === "network" ?
        { available: false, reason: "offline" } : { available: true, reason: null }])) as
        Parameters<typeof createPlatformCapabilitySnapshot>[0]["facilities"],
    });
    const facility = qualifyCrossModuleAdapter(facilityRegistry, {
      adapterId: currentAdapter.id, selection: reference, targetModule: "graph2d", currentSource: reference.source,
      targetFrame: currentAdapter.targetFrame, platform: offline,
      mappingAvailable: () => true, operationAvailable: () => true,
    });
    expect(facility.disabled).toContainEqual({ code: "facility-unavailable", reason: "Facility 'network' is unavailable: offline." });
  });

  it("refuses unpinned saved selections and hover while adapting committed viewer entities", () => {
    const { saved, source } = boundSelection();
    expect(referenceFromScientificSelection({ ...saved, source: { ...saved.source, checkpoint: null } } as typeof saved,
      source, "vector3d", currentAdapter.sourceFrame, "point").ok).toBe(false);
    expect(normalizeViewerCommittedSelection({ state: "hover", source, entityIds: ["v1"] })).toBeNull();
    const committed = referenceFromViewerCommittedSelection({ state: "committed", source, entityIds: ["v1"] }, "mesh",
      currentAdapter.sourceFrame);
    expect(committed.ok && committed.value.kind).toBe("entity");
  });
});
