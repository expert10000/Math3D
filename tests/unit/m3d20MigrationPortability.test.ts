import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { prepareCuratedStudyBundle } from "../../renderer/src/projects/curatedStudyProject";
import { previewProjectImport } from "../../renderer/src/projects/projectTransfer";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { duplicateMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";

const taggedProject = () => readFileSync(new URL("../../docs/evidence/projects-local-share-2026-10-03/received.math3d.project.json", import.meta.url), "utf8");

describe("M3D20-11 desktop/mobile/desktop supported-subset transfer", () => {
  it("preserves a tagged 1.7 Project byte for byte through mobile preview and back to desktop", () => {
    const raw = taggedProject();
    const desktop = previewProjectImport(raw).project;
    const mobile = importMobileProjectPreview(raw, [], "tagged-1.7.json", "desktop", 100);
    const restarted = JSON.parse(JSON.stringify(mobile));
    const returned = serializeMobileProjectHandoff(restarted);
    expect(returned).toBe(raw);
    expect(readMobilePreviewProject(restarted)).toEqual(desktop);
    expect(previewProjectImport(returned).project).toEqual(desktop);
    expect(desktop.workspace.results.length).toBeGreaterThan(0);
    expect(buildMobileProjectExplorer(raw).results.length).toBe(desktop.workspace.results.length);
  });

  it("retains current Study, Workbook and Note pins while marking unsupported editors as preview", () => {
    const original = prepareCuratedStudyBundle({ project: instantiateMath3DProjectTemplate("catenary-study", "portability-gate") },
      "catenary-study", "portability-gate").project;
    const raw = serializeMath3DProject(original);
    const mobile = importMobileProjectPreview(raw, [], "narrative.json", "desktop", 100);
    const returned = previewProjectImport(serializeMobileProjectHandoff(JSON.parse(JSON.stringify(mobile)))).project;
    expect(returned.workspace.studies).toEqual(original.workspace.studies);
    expect(returned.workbooks).toEqual(original.workbooks);
    expect(returned.notes).toEqual(original.notes);
    expect(returned.identity).toEqual(original.identity);
    const explorer = buildMobileProjectExplorer(raw);
    expect(explorer.workbooks.length).toBeGreaterThan(0);
    expect(explorer.notes.length).toBeGreaterThan(0);
    expect(explorer.groups.flatMap(group => group.documents).some(document => document.editing === "Saved preview")).toBe(true);
    expect(duplicateMobileProject(mobile, [mobile])).toMatchObject({ ok: false });
  });

  it("refuses future schema and unknown extensions before saving, preserving existing mobile work", () => {
    const raw = taggedProject(), existing = importMobileProjectPreview(raw, [], "existing.json");
    const before = JSON.stringify(existing), project = JSON.parse(raw);
    expect(() => importMobileProjectPreview(JSON.stringify({ ...project, schemaVersion: 2 }), [existing], "future.json"))
      .toThrow();
    expect(() => importMobileProjectPreview(JSON.stringify({ ...project, futureExtension: { pinned: true } }), [existing], "extension.json"))
      .toThrow();
    expect(() => parseMath3DProject(JSON.stringify({ ...project, futureExtension: { pinned: true } }))).toThrow();
    expect(JSON.stringify(existing)).toBe(before);
  });
});
