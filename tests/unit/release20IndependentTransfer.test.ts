import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { exportProjectFile, previewProjectImport } from "../../renderer/src/projects/projectTransfer";
import { exportProjectPackage, parseProjectPackage, projectResourceInventory } from "../../renderer/src/projects/projectResources";
import { meshResourceFixture, pointResourceFixture, scalarVolumeResourceFixture } from "../fixtures/unified-projects/meshResources";

const specimens = [
  ["mesh buffers", meshResourceFixture],
  ["Graph point table", pointResourceFixture],
  ["measured Volume", scalarVolumeResourceFixture],
] as const;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("M3D20-17b independent Project package transfer", () => {
  for (const [label, make] of specimens) {
    it(`retains ${label} bytes and scientific lineage across an independent import/export`, () => {
      const original = make();
      const first = previewProjectImport(original.raw);
      const archive = exportProjectPackage(first.project, first.resources!);
      const second = previewProjectImport(archive);
      const reopened = parseProjectPackage(archive);
      const required = projectResourceInventory(first.project).filter(item => item.required);

      expect(first.inputKind).toBe("Project with verified source resources");
      expect(required.length).toBeGreaterThan(0);
      expect(second.project.identity).toEqual(first.project.identity);
      expect(second.project.workspace.entries.map(entry => entry.expected))
        .toEqual(first.project.workspace.entries.map(entry => entry.expected));
      expect(second.project.workspace.results).toEqual(first.project.workspace.results);
      expect(second.project.workspace.relations).toEqual(first.project.workspace.relations);
      expect(second.canOpenWorkspace).toBe(first.canOpenWorkspace);
      for (const item of required) {
        const a = first.resources!.bytes(item), b = reopened.resources.bytes(item);
        expect(a).toBeDefined(); expect(b).toBeDefined();
        expect(sha256(b!)).toBe(sha256(a!));
        expect([...b!]).toEqual([...a!]);
      }
      const bare = previewProjectImport(exportProjectFile(first.project));
      expect(bare.sidecars.some(item => item.requiredForSource && !item.available)).toBe(true);
    });
  }

  it("rejects a changed source sidecar before preview or re-export", () => {
    const value = JSON.parse(meshResourceFixture().raw);
    expect(value.resources.length).toBeGreaterThan(0);
    value.resources[0].data = value.resources[0].data.slice(0, -4) + "AAAA";
    expect(() => previewProjectImport(JSON.stringify(value))).toThrow();
    expect(() => parseProjectPackage(JSON.stringify(value))).toThrow();
  });
});
