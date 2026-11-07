import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorkspaceProjectHandoff, parseMath3DProject, prepareProjectMigration,
  serializeMath3DProject, serializeWorkspaceProjectHandoff, structuralHash } from "@math3d/core";

const corpus = (name: string) => readFileSync(new URL(`../fixtures/migration-1x/${name}`, import.meta.url), "utf8");

describe("M3D20-11 old-version migration corpus", () => {
  it("adopts a historical 1.x workspace without changing source bytes, identities or results", () => {
    const original = corpus("workspace-v1.json"), before = structuralHash(original);
    const first = prepareProjectMigration(original, "Historical Graph");
    const second = prepareProjectMigration(original, "Historical Graph");
    expect(first).toEqual(second);
    expect(first.originalBytes).toBe(original);
    expect(structuralHash(original)).toBe(before);
    expect(first.project.workspace).toEqual(JSON.parse(original));
    expect(first.project.workspace.entries[0]!.expected).toMatchObject({
      id: "math3d:graph2d:23855f379cf9645dcdd9c438324791de",
      structuralHash: "sha256:b3ab30f0b3c05026b885f84f03c4225266f3785d35d14157c536b300dcf21081",
    });
    expect(parseMath3DProject(serializeMath3DProject(first.project))).toEqual(first.project);
  });

  it("verifies the version 2 Graph handoff before adopting its workspace", () => {
    const workspace = JSON.parse(corpus("workspace-v1.json"));
    const handoff = createWorkspaceProjectHandoff(workspace, { producer: { platform: "legacy", name: "Math3D", version: "1.7.0" } });
    const original = serializeWorkspaceProjectHandoff(handoff);
    const result = prepareProjectMigration(original, "Graph handoff");
    expect(result).toMatchObject({ sourceFormat: "math3d.project-handoff", sourceVersion: 2, originalBytes: original });
    expect(result.project.workspace).toEqual(workspace);
    expect(() => prepareProjectMigration(JSON.stringify({ ...handoff, projectRevision: structuralHash("forged") }))).toThrow();
  });

  it.each(["truncated.json", "missing-entries.json", "future-workspace-v2.json"])("refuses %s", (name) => {
    expect(() => prepareProjectMigration(corpus(name))).toThrow();
  });

  it("refuses future named Projects, unknown fields and missing document content", () => {
    const migrated = prepareProjectMigration(corpus("workspace-v1.json")).project;
    for (const candidate of [
      { ...migrated, schemaVersion: 2 },
      { ...migrated, futureData: { important: true } },
      { ...migrated, workspace: { ...migrated.workspace, entries: [] } },
    ]) expect(() => parseMath3DProject(JSON.stringify(candidate))).toThrow();
  });
});
