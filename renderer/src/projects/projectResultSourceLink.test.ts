import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, viewerSourceFromDocument } from "@math3d/core";
import { projectResultSourceLink } from "./projectResultSourceLink";

const project = instantiateMath3DProjectTemplate("derivative-study", "result-source-link");
const entry = project.workspace.entries[0]!;
const source = viewerSourceFromDocument({ identity: entry.expected });

describe("saved result source navigation", () => {
  it("opens only the exact saved source generation", () => {
    expect(projectResultSourceLink(project, source)).toMatchObject({
      status: "current", module: entry.module });
    expect(projectResultSourceLink(project, { ...source, generation: source.generation + 1 }))
      .toMatchObject({ status: "historical", module: entry.module });
    expect(projectResultSourceLink(project, { ...source, structuralHash: `sha256:${"0".repeat(64)}` }))
      .toMatchObject({ status: "historical", module: entry.module });
  });

  it("does not offer current-document navigation for a missing source", () => {
    expect(projectResultSourceLink({ ...project, workspace: { ...project.workspace, entries: [] } }, source))
      .toMatchObject({ status: "missing", module: null });
  });
});
