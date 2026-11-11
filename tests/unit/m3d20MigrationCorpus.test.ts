import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getGraph2DPresetCatalog, instantiateGraph2DPreset, createGraph2DWorkspaceProject,
  createMath3DProject, instantiateMath3DProjectTemplate, parseMath3DProject,
  serializeMath3DProject, type Math3DProject } from "@math3d/core";
import { exportProjectFile, previewProjectImport } from "../../renderer/src/projects/projectTransfer";
import { planProjectMigration } from "../../renderer/src/projects/projectMigrationPlan";
import { prepareCuratedStudyBundle } from "../../renderer/src/projects/curatedStudyProject";

type Corpus = { specimens: { release: string; path: string; sha256: string; tagBlob: string; kind: string;
  expected: "preserve" | "adopt-workspace" | "adopt-handoff" }[]; gaps: string[] };
const corpus = JSON.parse(readFileSync(new URL("../fixtures/migration-1x/manifest.json", import.meta.url), "utf8")) as Corpus;
const root = new URL("../../", import.meta.url);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const semanticState = (project: Math3DProject) => ({
  workspace: project.workspace,
  identity: project.identity,
  workbooks: project.workbooks,
  notes: project.notes,
  quantumScenes: project.quantumScenes,
  scientificScenes: project.scientificScenes,
  compositions: project.compositions,
  algebraObjects: project.algebraObjects,
  algebraEvidence: project.algebraEvidence,
});

describe("M3D20-11 hashed release-tree corpus", () => {
  for (const item of corpus.specimens) it(`${item.release}: ${item.kind ?? item.path}`, () => {
    const bytes = readFileSync(new URL(item.path, root));
    expect(sha256(bytes)).toBe(item.sha256);
    expect(item.tagBlob).toMatch(/^[a-f0-9]{40}$/);
    const plan = planProjectMigration(bytes), preview = previewProjectImport(bytes);
    expect(plan.steps[0]!.code).toBe(item.expected);
    expect(preview.migration?.source.sha256).toBe(`sha256:${item.sha256}`);
    expect(preview.project).toEqual(plan.project);
    const exported = exportProjectFile(plan.project), reopened = parseMath3DProject(exported);
    expect(semanticState(reopened)).toEqual(semanticState(plan.project));
    expect(semanticState(previewProjectImport(exported).project)).toEqual(semanticState(reopened));
    expect(Buffer.from(plan.originalBytes)).toEqual(bytes);
    if (item.expected === "preserve") expect(plan.project.identity.id).toBe(JSON.parse(bytes.toString("utf8")).identity.id);
    else expect(plan.project.workspace).toEqual(JSON.parse(bytes.toString("utf8")).project);
  });

  it("keeps current Study, Workbook and Note pins through a separate schema regression", () => {
    const guided = prepareCuratedStudyBundle({ project: instantiateMath3DProjectTemplate("catenary-study", "m3d20-migration-corpus") },
      "catenary-study", "m3d20-migration-corpus");
    const original = guided.project;
    expect(original.workspace.studies?.length).toBeGreaterThan(0);
    expect(original.workbooks?.length).toBeGreaterThan(0);
    expect(original.notes?.length).toBeGreaterThan(0);
    const imported = previewProjectImport(serializeMath3DProject(original));
    expect(imported.project.identity).toEqual(original.identity);
    expect(imported.project.workspace.studies).toEqual(original.workspace.studies);
    expect(imported.project.workbooks).toEqual(original.workbooks);
    expect(imported.project.notes).toEqual(original.notes);
  });

  it("refuses corrupt, future and missing source data without rewriting a saved value", () => {
    const bytes = readFileSync(new URL(corpus.specimens.find(item => item.expected === "preserve")!.path, root));
    const source = JSON.parse(bytes.toString("utf8"));
    const before = bytes.toString("utf8");
    expect(() => previewProjectImport(before.slice(0, -8))).toThrow();
    expect(() => previewProjectImport(JSON.stringify({ ...source, schemaVersion: 99 }))).toThrow("future Project schema");
    source.workspace.entries[0].expected.structuralHash = "sha256:" + "0".repeat(64);
    expect(() => previewProjectImport(JSON.stringify(source))).toThrow();
    expect(bytes.toString("utf8")).toBe(before);

    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "missing-migration-sidecar").document;
    const project = createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "missing-migration-sidecar" });
    const missing = previewProjectImport(serializeMath3DProject(project));
    expect(missing.sidecars.some(item => item.requiredForSource && !item.available)).toBe(true);
    expect(missing.canOpenWorkspace).toBe(false);
    expect(missing.project.workspace.results).toEqual(project.workspace.results);
    expect(missing.project.workspace.entries[0]!.expected).toEqual(graph.identity);
  });

  it("states the unavailable historical Project coverage explicitly", () => {
    expect(corpus.gaps.some(gap => gap.includes("v1.4.x") && gap.includes("v1.5.0"))).toBe(true);
    expect(corpus.gaps.some(gap => gap.includes("Notes or Workbooks"))).toBe(true);
  });
});
