import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { prepareCuratedStudyBundle } from "./curatedStudyProject";
import { projectOpenBackup } from "./projectOpenBackup";

describe("backup before opening another guided Project", () => {
  it("retains Study ownership and the connected Workbook and Note", () => {
    const guided = prepareCuratedStudyBundle({ project: instantiateMath3DProjectTemplate("catenary-study", "backup-study") },
      "catenary-study", "backup-study").project;
    const backup = parseMath3DProject(serializeMath3DProject(projectOpenBackup(guided.workspace, guided)));
    expect(backup.identity.id).toBe(guided.identity.id);
    expect(backup.workspace.studies?.[0]?.projectId).toBe(guided.identity.id);
    expect(backup.workbooks).toEqual(guided.workbooks);
    expect(backup.notes).toEqual(guided.notes);
  });

  it("adopts a workspace only when there is no active Project owner", () => {
    const ordinary = instantiateMath3DProjectTemplate("derivative-study", "backup-unowned");
    expect(projectOpenBackup(ordinary.workspace).identity.id).toMatch(/^math3d:project:/);
  });
});
