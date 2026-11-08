import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate } from "@math3d/core";
import { resolveStudyPane } from "./studyPaneResolution";

const base = instantiateMath3DProjectTemplate("derivative-study", "study-pane-resolution");
const saved = createProjectStudyFromDocuments(base, "pair", "Graph and Curve",
  base.workspace.entries.slice(0, 2).map(entry => entry.expected.id));
const study = saved.workspace.studies![0]!;

describe("Study pane source resolution", () => {
  it("replays and verifies only the pinned generation before hosting", () => {
    const pane = resolveStudyPane(saved, study, "pane-1");
    expect(pane.status).toBe("ready");
    if (pane.status === "ready") expect(pane.document.identity).toEqual(study.members[0]!.expected);
    expect(resolveStudyPane(saved, study, "missing").status).toBe("withheld");
  });
  it("withholds a changed or missing document without rebasing the Study", () => {
    const id = study.members[0]!.documentId;
    const changed = { ...saved, workspace: { ...saved.workspace, entries: saved.workspace.entries.map(entry =>
      entry.expected.id === id ? { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(resolveStudyPane(changed, study, "pane-1")).toMatchObject({ status: "withheld",
      reason: expect.stringContaining("changed") });
    const missing = { ...saved, workspace: { ...saved.workspace, entries: saved.workspace.entries.filter(entry =>
      entry.expected.id !== id) } };
    expect(resolveStudyPane(missing, study, "pane-1")).toMatchObject({ status: "withheld",
      reason: expect.stringContaining("missing") });
  });
  it("withholds unsupported replay instead of displaying a checkpoint as current", () => {
    const id = study.members[0]!.documentId;
    const broken = { ...saved, workspace: { ...saved.workspace, entries: saved.workspace.entries.map(entry =>
      entry.expected.id === id ? { ...entry, replay: { format: "future.study-replay", payload: {} } } : entry) } };
    expect(resolveStudyPane(broken, study, "pane-1")).toMatchObject({ status: "withheld",
      reason: expect.stringContaining("replay") });
  });
});
