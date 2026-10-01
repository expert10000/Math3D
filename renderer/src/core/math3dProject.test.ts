import { describe, expect, it } from "vitest";
import { adoptMixedWorkspaceProject, createEmptyGraph2DDocument, createGraph2DWorkspaceProject,
  createMath3DProject, normalizeMath3DProject, parseMath3DProject, renameMath3DProject,
  replaceMath3DProjectWorkspace, serializeMath3DProject, structuralHash,
  createMixedWorkspaceDocument, promoteGraph2DToCurve } from "@math3d/core";
import fixture from "../../../tests/fixtures/post-1.6.0/graph-gallery-upgrade-storage.json";

const workspace = () => createGraph2DWorkspaceProject(createEmptyGraph2DDocument("project-contract"));
describe("PRJ01 named project container", () => {
  it("round-trips a named container without changing document identities or legacy bytes", () => {
    const bytes = fixture.storage["math3d.mixed-workspace.v1"];
    const legacy = JSON.parse(bytes), project = adoptMixedWorkspaceProject(legacy, "Minimal Surface Study");
    expect(parseMath3DProject(serializeMath3DProject(project))).toEqual(project);
    expect(project.workspace).toEqual(legacy);
    expect(project.workspace.entries.map((entry) => entry.expected)).toEqual(legacy.entries.map((entry: any) => entry.expected));
    expect(fixture.storage["math3d.mixed-workspace.v1"]).toBe(bytes);
    expect(adoptMixedWorkspaceProject(legacy).identity.id).toBe(project.identity.id);
  });
  it("retains archived analysis, artifact references and lineage inside the container", () => {
    const key = `math3d.mixed-workspace.v1.gallery-checkpoint.${fixture.originalId}` as keyof typeof fixture.storage;
    const legacy = JSON.parse(fixture.storage[key]).workspace;
    const promoted = promoteGraph2DToCurve(legacy.entries[0].checkpoint, legacy.entries[0].checkpoint.source.objects[0].id);
    const withLineage = createMixedWorkspaceDocument({ ...legacy,
      entries: [...legacy.entries, { module: "curve", checkpoint: promoted.document, expected: promoted.document.identity, replay: null }],
      relations: [promoted.relation], artifacts: [{ handle: { artifactId: "external-curve", kind: "binary", role: "sampled-curve" }, contentHash: structuralHash("external"), byteLength: 2048 }] });
    const saved = parseMath3DProject(serializeMath3DProject(adoptMixedWorkspaceProject(withLineage)));
    expect(saved.workspace.results).toEqual(legacy.results);
    expect(saved.workspace.results).toHaveLength(1);
    expect(saved.workspace.artifacts).toEqual(withLineage.artifacts);
    expect(saved.workspace.relations).toEqual([promoted.relation]);
    expect(saved.workspace.entries).toEqual(withLineage.entries);
  });
  it("separates title edits from project content revisions and domain identities", () => {
    const project = createMath3DProject(workspace(), { stableKey: "study", title: "Study" });
    const renamed = renameMath3DProject(project, "  Named study  ");
    expect(renamed.metadata.title).toBe("Named study");
    expect(renamed.identity).toEqual(project.identity);
    expect(renamed.workspace).toEqual(project.workspace);
    expect(replaceMath3DProjectWorkspace(renamed, renamed.workspace).identity).toEqual(project.identity);
    const next = { ...project.workspace, activeDocumentIds: [] };
    const updated = replaceMath3DProjectWorkspace(renamed, next);
    expect(updated.identity.id).toBe(project.identity.id);
    expect(updated.identity.revision).toBe(project.identity.revision + 1);
    expect(updated.identity.structuralHash).toBe(structuralHash(next));
    expect(updated.workspace.entries[0]!.expected).toEqual(project.workspace.entries[0]!.expected);
  });
  it("rejects future schemas, forged content, invalid names and extra fields", () => {
    const project = createMath3DProject(workspace(), { stableKey: "invalid" });
    for (const invalid of [{ ...project, schemaVersion: 2 }, { ...project, extra: true },
      { ...project, metadata: { title: "" } }, { ...project, metadata: { title: "x".repeat(161) } },
      { ...project, workspace: { ...project.workspace, activeDocumentIds: [] } }]) {
      expect(normalizeMath3DProject(invalid).ok).toBe(false);
      expect(() => parseMath3DProject(JSON.stringify(invalid))).toThrow();
    }
    expect(() => parseMath3DProject(JSON.stringify(workspace()))).toThrow();
  });
  it("does not share caller-owned mutable source arrays", () => {
    const source = structuredClone(workspace());
    const project = createMath3DProject(source, { stableKey: "detached" });
    (source.activeDocumentIds as string[]).splice(0);
    expect(project.workspace.activeDocumentIds).toHaveLength(1);
    expect(normalizeMath3DProject(project).ok).toBe(true);
  });
});
