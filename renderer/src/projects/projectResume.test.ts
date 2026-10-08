import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, serializeMath3DProject } from "@math3d/core";
import { PROJECT_RESUME_KEY, projectResumeDocument, rememberProjectDocument, projectUiPreferences, selectProjectDocument } from "./projectResume";

describe("Project document resume", () => {
  const project = instantiateMath3DProjectTemplate("catenary-study", "resume-contract");
  const surface = project.workspace.entries.find(entry => entry.module === "surface")!;
  it("keeps document selection outside scientific project bytes", () => {
    const before = serializeMath3DProject(project), values = new Map<string, string>();
    rememberProjectDocument({ setItem: (key, value) => { values.set(key, value); } }, project, surface.expected.id);
    expect(projectResumeDocument(project, values.get(PROJECT_RESUME_KEY)!)).toBe(surface);
    expect(serializeMath3DProject(project)).toBe(before);
  });
  it("ignores malformed, foreign and missing document selections", () => {
    for (const raw of [null, "{", JSON.stringify({ projectId: "other", documentId: surface.expected.id }),
      JSON.stringify({ projectId: project.identity.id, documentId: "missing" })]) expect(projectResumeDocument(project, raw)).toBeNull();
  });
  it("does not persist a document outside this Project", () => {
    const writes: string[] = [];
    rememberProjectDocument({ setItem: key => { writes.push(key); } }, project, "missing");
    expect(writes).toEqual([]);
  });
  it("does not let optional storage failure prevent scientific saving", () => {
    expect(() => rememberProjectDocument({ setItem: () => { throw new Error("Storage full"); } }, project, surface.expected.id)).not.toThrow();
  });
  it("defaults resume on and recovers invalid presentation preferences", () => {
    expect(projectUiPreferences("{")).toEqual({ resumeEnabled: true, placement: "left" });
    expect(projectUiPreferences(JSON.stringify({ resumeEnabled: false, placement: "right" }))).toEqual({ resumeEnabled: false, placement: "right" });
  });
  it("recovers stale selection deterministically with an explanation", () => {
    const before = serializeMath3DProject(project);
    const choice = selectProjectDocument(project, JSON.stringify({ projectId: project.identity.id, documentId: "missing" }));
    expect(choice.selected.module).toBe("surface");
    expect(choice.recovery).toContain("unavailable");
    expect(selectProjectDocument(project, JSON.stringify({ projectId: "another-project", documentId: "missing" })).recovery).toBeNull();
    expect(serializeMath3DProject(project)).toBe(before);
  });
});
