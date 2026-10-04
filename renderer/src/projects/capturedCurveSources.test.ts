import { exportProjectPackage } from "./projectResources";
import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, replaceMath3DProjectWorkspace } from "@math3d/core";
import { mobileSurfaceProjectFixture } from "../../../tests/fixtures/unified-projects/mobileSurfaces";
import { MobileProjectGraphSessions } from "../../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../../apps/mobile/src/models/mobileProjectPreview";
import { capturedCurveSources } from "./capturedCurveSources";
import { additionalRepresentationView } from "./additionalProjectRepresentations";
import { previewProjectImport } from "./projectTransfer";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

describe("PRJ30 captured construction sources on mobile return", () => {
  it("reopens Graph-promoted Surfaces from embedded captured profiles, independently of the current Graph", () => {
    const fixture = mobileSurfaceProjectFixture(), documents = verifyMixedWorkspaceReplay(fixture.project.workspace);
    for (const id of fixture.graphSurfaceRelationIds) {
      const relation = fixture.project.workspace.relations.find(item => item.relationId === id)!;
      if (relation.target.type !== "document") throw new Error("Target");
      const surface = documents.get(relation.target.generation.documentId)!;
      if (surface.format !== "math3d.surface-document") throw new Error("Surface");
      expect(additionalRepresentationView(surface, { documents: new Map() }).qualification).toContain("captured profile");
    }
  });
  it("reopens historical Surface geometry with exact prior Curve source after edit/undo/redo", () => {
    const fixture = mobileSurfaceProjectFixture(), original = verifyMixedWorkspaceReplay(fixture.project.workspace);
    const relation = fixture.project.workspace.relations.find(item => item.relationId === fixture.curveSurfaceRelationIds[0])!;
    if (relation.target.type !== "document") throw new Error("Target");
    const surface = original.get(relation.target.generation.documentId)!;
    if (surface.format !== "math3d.surface-document") throw new Error("Surface");
    const before = additionalRepresentationView(surface, { documents: original }).meshes[0]!.positions;
    const stored = importMobileProjectPreview(fixture.raw, [], "mobile.json"), sessions = new MobileProjectGraphSessions(stored), curve = sessions.curve(fixture.helixId);
    curve.commitSource({ ...curve.document().source, definition: { ...curve.document().source.definition,
      expressions: { x: "cos(t)", y: "sin(t)", z: "t/2" } } }); curve.undo(); curve.redo();
    const project = readMobilePreviewProject(sessions.snapshot(fixture.helixId)), documents = verifyMixedWorkspaceReplay(project.workspace);
    expect(() => additionalRepresentationView(surface, { documents })).toThrow("generation");
    const view = additionalRepresentationView(surface, { documents, capturedCurves: capturedCurveSources(project.workspace) });
    expect(view.meshes[0]!.positions).toEqual(before);
    expect(previewProjectImport(exportProjectPackage(project, fixture.resources)).canOpenWorkspace).toBe(true);
    // No retained source recipe means no speculative substitution of the current Curve.
    const checkpointed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(entry => entry.expected.id === fixture.helixId ? { ...entry, checkpoint: curve.document(), replay: null } : entry) }));
    expect(previewProjectImport(exportProjectPackage(checkpointed, fixture.resources)).canOpenWorkspace).toBe(false);
  });
});
