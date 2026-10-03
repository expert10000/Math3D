import { describe, expect, it, vi } from "vitest";
import { canonicalJsonStringify, createMixedWorkspaceDocument, encodeProjectResourceBytes, parseProjectPackage, replaceMath3DProjectWorkspace, serializeMath3DProject, sha256Checksum } from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { attachMobileProjectResources, mobileProjectGraphTables, readMobileProjectResources } from "../../apps/mobile/src/models/mobileProjectResources";
import { createMobileHandoffExportName, serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { renameMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";
vi.mock("expo-file-system", () => ({ Paths: { document: "document" }, Directory: class {}, File: class {} }));
import { decodeMobileSceneStorage, MOBILE_SCENE_STORAGE_SCHEMA_VERSION } from "../../apps/mobile/src/services/mobileSceneStorage";

describe("PRJ22 complete mobile source resource packages", () => {
  it("retains checked Graph, Mesh and Volume bytes in one schema-4 library record and exports the desktop format", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json");
    expect(readMobilePreviewProject(stored)).toEqual(fixture.project);
    const state = readMobileProjectResources(stored);
    expect(new Set(state.inventory.map(item => item.kind))).toEqual(new Set(["graph-point-table", "mesh-buffers", "volume-payload"]));
    expect(state.inventory.every(item => item.available)).toBe(true);
    const restored = decodeMobileSceneStorage(JSON.stringify({ schemaVersion: MOBILE_SCENE_STORAGE_SCHEMA_VERSION, projects: [stored] }));
    expect(restored).toMatchObject({ ok: true, projects: [stored], migrated: false });
    const returned = parseProjectPackage(serializeMobileProjectHandoff(stored));
    expect(returned.project).toEqual(fixture.project); expect(returned.resources.sidecars()).toEqual(fixture.resources.sidecars());
    expect(createMobileHandoffExportName(stored)).toContain(".math3d.project-package.json");
    for (const entry of fixture.project.workspace.entries.filter(entry => entry.module === "graph2d"))
      for (const object of (entry.checkpoint as any).source.objects) if (object.kind === "point-series")
        expect(mobileProjectGraphTables(stored).resolve(object.table)).not.toBeNull();
  });
  it("shows missing bytes and attaches only a matching workspace; metadata-only rename keeps every sidecar", () => {
    const fixture = mobileMixedProjectFixture(), missing = importMobileProjectPreview(serializeMath3DProject(fixture.project), [], "plain.json");
    expect(buildMobileProjectExplorer(missing.serializedProject).resources.every(item => !item.available)).toBe(true);
    const attached = attachMobileProjectResources(missing, fixture.raw);
    expect(buildMobileProjectExplorer(attached.serializedProject, attached.projectResources).resources.every(item => item.available)).toBe(true);
    const renamed = renameMobileProject(attached, "Renamed retained package");
    if (!renamed.ok) throw new Error(renamed.error);
    expect(renamed.project.projectResources).toEqual(attached.projectResources);
    const other = JSON.parse(fixture.raw); other.project = replaceMath3DProjectWorkspace(fixture.project, createMixedWorkspaceDocument({ ...fixture.project.workspace, constructions: [] }));
    expect(() => attachMobileProjectResources(attached, JSON.stringify(other))).toThrow("different project version");
    expect(missing.projectResources).toBeUndefined();
  });
  it("rejects corrupt, unowned, oversized and conflicting resource bytes without changing existing work", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json"), before = canonicalJsonStringify(stored);
    for (const change of [(value: any) => value.resources[0].data = "AA==", (value: any) => value.resources[0].owners = ["foreign"],
      (value: any) => value.resources[0].byteLength = 100 * 1024 * 1024]) {
      const value = JSON.parse(fixture.raw); change(value); expect(() => attachMobileProjectResources(stored, JSON.stringify(value))).toThrow();
    }
    const value = JSON.parse(fixture.raw), volume = value.resources.find((item: any) => item.kind === "volume-payload");
    const bytes = Uint8Array.from(atob(volume.data), char => char.charCodeAt(0)); bytes[0] ^= 1;
    volume.data = encodeProjectResourceBytes(bytes); volume.checksum = sha256Checksum(bytes);
    expect(() => attachMobileProjectResources(stored, JSON.stringify(value))).toThrow("Conflicting resource bytes");
    expect(canonicalJsonStringify(stored)).toBe(before);
    expect(() => importMobileProjectPreview(fixture.raw, [stored], "same.json")).toThrow("already exists");
  });
  it("migrates schema 3 without inventing bytes and rejects corrupted persisted sidecars", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json");
    expect(decodeMobileSceneStorage(JSON.stringify({ schemaVersion: 3, projects: [stored] }))).toMatchObject({ ok: true, migrated: true });
    const damaged = JSON.parse(JSON.stringify(stored)); damaged.projectResources[0].checksum = "sha256:" + "0".repeat(64);
    expect(decodeMobileSceneStorage(JSON.stringify({ schemaVersion: 4, projects: [damaged] }))).toMatchObject({ ok: false });
  });
});
