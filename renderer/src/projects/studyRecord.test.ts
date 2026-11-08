import { describe, expect, it } from "vitest";
import { createStudyRecordV1, instantiateMath3DProjectTemplate, normalizeStudyRecordV1 } from "@math3d/core";

const project = instantiateMath3DProjectTemplate("derivative-study", "study-record-contract");
const [graph, curve] = project.workspace.entries;
const study = createStudyRecordV1(project.identity.id, "graph-curve", {
  title: "Graph and Curve", members: [
    { memberId: "graph", documentId: graph.expected.id, expected: graph.expected, role: "source" },
    { memberId: "curve", documentId: curve.expected.id, expected: curve.expected, role: "derived" },
  ], layout: { mode: "split-2", panes: [{ paneId: "left", memberId: "graph" },
    { paneId: "right", memberId: "curve" }] },
  links: [{ id: "parameter", kind: "cursor", sourcePaneId: "left", targetPaneId: "right",
    mappingId: "graph2d.promote-curve", direction: "two-way" }], pinnedSelectionIds: [],
});

describe("Study record v1", () => {
  it("saves only exact Project references, layout and link declarations", () => {
    expect(normalizeStudyRecordV1(study)).toEqual({ ok: true, value: study });
    expect(JSON.stringify(study)).not.toContain('"checkpoint"');
    expect(study.id).toMatch(/^math3d:study:/);
  });
  it("rejects malformed member and pane identity", () => {
    expect(normalizeStudyRecordV1({ ...study, members: [study.members[0], study.members[0]] }).ok).toBe(false);
    expect(normalizeStudyRecordV1({ ...study, layout: { ...study.layout, panes: [
      study.layout.panes[0], { paneId: "right", memberId: "missing" }] } }).ok).toBe(false);
    expect(normalizeStudyRecordV1({ ...study, links: [{ ...study.links[0], targetPaneId: "missing" }] }).ok).toBe(false);
  });
  it("rejects extra executable payloads and oversized metadata", () => {
    expect(normalizeStudyRecordV1({ ...study, executable: "run" }).ok).toBe(false);
    expect(normalizeStudyRecordV1({ ...study, description: "x".repeat(2001) }).ok).toBe(false);
  });
});
