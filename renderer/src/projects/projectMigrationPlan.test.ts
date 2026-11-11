import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff,
  getGraph2DPresetCatalog, instantiateGraph2DPreset, parseMath3DProject,
  serializeMixedWorkspaceDocument, sha256Checksum } from "@math3d/core";
import { planProjectMigration } from "./projectMigrationPlan";
import { previewProjectImport } from "./projectTransfer";

const specimen = () => readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url));

describe("M3D20-11 deterministic Project migration plan", () => {
  it("preserves the raw file hash and all named Project generations", () => {
    const bytes = specimen(), first = planProjectMigration(bytes), second = planProjectMigration(bytes);
    expect(first).toEqual(second);
    expect(first.source.sha256).toBe(sha256Checksum(bytes));
    expect(first.source.byteLength).toBe(bytes.length);
    expect(first.requiresCopy).toBe(false);
    expect(first.project).toEqual(parseMath3DProject(bytes.toString("utf8")));
    expect(previewProjectImport(bytes).migration?.source.sha256).toBe(first.source.sha256);
  });

  it("adopts exact mixed and handoff workspaces with stable independent identities", () => {
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "migration-plan").document;
    const workspace = createGraph2DWorkspaceProject(graph);
    const mixed = planProjectMigration(serializeMixedWorkspaceDocument(workspace));
    const handoff = createWorkspaceProjectHandoff(workspace, { producer: { platform: "legacy", name: "migration fixture", version: "unclaimed" } });
    const fromHandoff = planProjectMigration(canonicalJsonStringify(handoff));
    for (const plan of [mixed, fromHandoff]) {
      expect(plan.requiresCopy).toBe(true);
      expect(plan.project.workspace).toEqual(workspace);
      expect(plan.project.workspace.entries[0]!.expected).toEqual(graph.identity);
      expect(plan.project.identity.id).toBe(mixed.project.identity.id);
    }
    expect(mixed.steps[0]?.code).toBe("adopt-workspace");
    expect(fromHandoff.steps[0]?.code).toBe("adopt-handoff");
  });

  it("refuses future envelopes, damaged evidence and invalid UTF-8", () => {
    const original = JSON.parse(specimen().toString("utf8"));
    expect(() => planProjectMigration(JSON.stringify({ ...original, schemaVersion: 2 }))).toThrow("future Project schema");
    expect(() => planProjectMigration(JSON.stringify({ ...original, format: "math3d.future" }))).toThrow("future version");
    original.workspace.entries[0].expected.structuralHash = "sha256:" + "0".repeat(64);
    expect(() => planProjectMigration(JSON.stringify(original))).toThrow();
    expect(() => planProjectMigration(Uint8Array.of(0xff, 0xfe))).toThrow();
  });
});
