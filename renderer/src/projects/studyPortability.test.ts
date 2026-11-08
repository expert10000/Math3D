import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate,
  parseMath3DProject } from "@math3d/core";
import { addQualifiedStudyGraphCurveLink, qualifyStudyGraphCurveLink } from "./studyGraphCurveLink";
import { resolveStudyPane } from "./studyPaneResolution";
import { captureProjectResources, exportProjectPackage, projectResourceInventory } from "./projectResources";
import { exportProjectCheckpointFile, exportProjectFile, previewProjectImport } from "./projectTransfer";

const template = instantiateMath3DProjectTemplate("derivative-study", "portable-project-study");
const saved = createProjectStudyFromDocuments(template, "portable-pair", "Portable graph question",
  template.workspace.entries.slice(0, 2).map(entry => entry.expected.id));
const project = addQualifiedStudyGraphCurveLink(saved, saved.workspace.studies![0]!.id);
const study = project.workspace.studies![0]!;

describe("M3D20-04 portable Study and unavailable source gates", () => {
  it("round-trips the exact Study and link through project, checkpoint and offline package", () => {
    expect(projectResourceInventory(project)).toEqual([]);
    const resources = captureProjectResources(project, () => { throw Error("No external source may be requested."); });
    for (const bytes of [exportProjectFile(project), exportProjectCheckpointFile(project),
      exportProjectPackage(project, resources)]) {
      const imported = previewProjectImport(bytes);
      expect(imported.canOpenWorkspace).toBe(true);
      expect(imported.project.workspace.studies).toEqual([study]);
      expect(imported.project.workspace.studies![0]!.members.map(member => member.expected))
        .toEqual(study.members.map(member => member.expected));
      expect(qualifyStudyGraphCurveLink(imported.project, imported.project.workspace.studies![0]!))
        .toMatchObject({ objectId: "profile" });
      for (const pane of study.layout.panes) {
        const resolved = resolveStudyPane(imported.project, study, pane.paneId);
        expect(resolved.status).toBe("ready");
      }
    }
    expect(parseMath3DProject(exportProjectFile(project)).workspace.studies).toEqual([study]);
  });
  it("withholds a missing member and never silently rebinds its Study link", () => {
    const missingId = study.members[0]!.documentId;
    const missing = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(entry => entry.expected.id !== missingId) } };
    expect(resolveStudyPane(missing, study, "pane-1")).toMatchObject({ status: "withheld",
      reason: expect.stringContaining("missing") });
    expect(qualifyStudyGraphCurveLink(missing, study)).toBeNull();
    expect(() => addQualifiedStudyGraphCurveLink(missing, study.id)).toThrow(/no current/);
    expect(missing.workspace.studies).toEqual([study]);
  });
});
