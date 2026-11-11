import { describe, expect, it } from "vitest";
import { createResearchReference, inspectResearchReference, normalizeResearchReference,
  researchResourcePins, viewerSourceFromDocument, createProjectStudyFromDocuments,
  createStudyPaneResearchReference, renameProjectStudy,
  createStableDocumentId } from "@math3d/core";
import { instantiateNotebookStarter } from "../projects/notebookStarters";

describe("shared research reference", () => {
  const fixture = () => instantiateNotebookStarter("edge-path-evidence", "research-reference");

  it("pins exact source, result and resource descriptors without copying their bytes", () => {
    const { project, resources } = fixture();
    const entry = project.workspace.entries.find(item => item.module === "mesh")!;
    const source = viewerSourceFromDocument({ identity: entry.expected });
    const pins = researchResourcePins(project, source.documentId);
    expect(pins.length).toBeGreaterThan(0);
    const ref = createResearchReference({ projectId: project.identity.id, kind: "document",
      targetId: source.documentId, source, targetHash: entry.expected.structuralHash, resources: pins });
    expect(normalizeResearchReference(JSON.parse(JSON.stringify(ref)))).toEqual(ref);
    expect(inspectResearchReference(project, ref, item => resources.bytes(item))).toMatchObject({
      status: "current", resourceStatus: "verified",
    });
    expect(JSON.stringify(ref)).not.toContain('"data"');
    expect(normalizeResearchReference({ ...ref, extra: true })).toBeNull();
    expect(normalizeResearchReference({ ...ref, resources: [...pins, pins[0]] })).toBeNull();
  });

  it("separates historical target, missing source, and unavailable sidecar", () => {
    const { project, resources } = fixture();
    const entry = project.workspace.entries.find(item => item.module === "mesh")!;
    const ref = createResearchReference({ projectId: project.identity.id, kind: "document",
      targetId: entry.expected.id, source: viewerSourceFromDocument({ identity: entry.expected }),
      targetHash: entry.expected.structuralHash, resources: researchResourcePins(project, entry.expected.id) });
    expect(inspectResearchReference(project, ref, item => resources.bytes(item)).status).toBe("current");
    expect(inspectResearchReference(project, ref, () => null)).toMatchObject({ status: "historical", resourceStatus: "missing" });
    const absentId = createStableDocumentId("mesh", "absent-research-target");
    const missingRef = createResearchReference({ ...ref, targetId: absentId,
      source: { ...ref.source, documentId: absentId } });
    expect(inspectResearchReference(project, missingRef).status).toBe("missing");
  });

  it("projects a saved Study pane through the same resource-qualified reference", () => {
    const { project: base, resources } = fixture();
    const mesh = base.workspace.entries.find(item => item.module === "mesh")!;
    const project = createProjectStudyFromDocuments(base, "pane-reference", "Mesh evidence", [mesh.expected.id]);
    const study = project.workspace.studies![0]!;
    const pane = createStudyPaneResearchReference(project, study, study.layout.panes[0]!.paneId);
    expect(study.paneReferences?.[0]?.reference).toEqual(pane);
    expect(pane.source.revision).toBe(mesh.expected.revision);
    expect(pane.resources.length).toBeGreaterThan(0);
    expect(inspectResearchReference(project, pane, item => resources.bytes(item)).status).toBe("current");
    expect(inspectResearchReference(project, pane, () => null).resourceStatus).toBe("missing");
    const renamed = renameProjectStudy(project, study.id, "Revised narrative");
    expect(inspectResearchReference(renamed, pane).status).toBe("current");
  });
});
