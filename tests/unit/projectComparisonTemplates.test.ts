import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, inspectProjectCompositionAvailability, parseMath3DProject,
  qualifyProjectOverlayCoordinates, readProjectCoordinateFrame, serializeMath3DProject,
  type GeometryDocument, type SurfaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../../renderer/src/kernel/mixedWorkspaceReplay";
import { compatibleCompositionParameterChart, resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";

describe("PC03/PC05 built-in comparison starters", () => {
  it("provides matching, mismatched and missing coordinate declarations with immutable saved overlays", () => {
    const project = instantiateMath3DProjectTemplate("coordinate-overlay-study", "coordinate-fixture");
    const restored = parseMath3DProject(serializeMath3DProject(project));
    expect(restored.workspace.entries).toHaveLength(4);
    expect(restored.compositions?.map(item => item.title)).toEqual(["Unverified A/D overlay", "Verified A/B overlay"]);
    const [a, b, mismatch, legacy] = restored.workspace.entries.map(entry => entry.checkpoint as GeometryDocument);
    const frames = [a, b, mismatch, legacy].map(readProjectCoordinateFrame);
    expect(frames.map(item => item.status)).toEqual(["declared", "declared", "declared", "missing"]);
    const alignment = { frame: "laboratory xyz", unit: "mm" };
    expect(qualifyProjectOverlayCoordinates(frames[0]!, frames[1]!, alignment)).toBe("verified");
    expect(qualifyProjectOverlayCoordinates(frames[0]!, frames[2]!, alignment)).toBe("mismatch");
    expect(qualifyProjectOverlayCoordinates(frames[0]!, frames[3]!, alignment)).toBe("asserted");
    expect(restored.compositions!.every(composition => inspectProjectCompositionAvailability(composition, restored.workspace)
      .every(status => status === "current"))).toBe(true);
    const changed = JSON.parse(serializeMath3DProject(restored));
    changed.workspace.entries[0].checkpoint.source.extensions.math3dCoordinateFrame.unit = "cm";
    expect(() => parseMath3DProject(JSON.stringify(changed))).toThrow();
  });

  it("replays the exact before/after Surface and resolves its linked chart after serialization", () => {
    const project = instantiateMath3DProjectTemplate("surface-generation-study", "surface-fixture");
    const restored = parseMath3DProject(serializeMath3DProject(project));
    const entry = restored.workspace.entries[0]!, composition = restored.compositions![0]!;
    const current = verifyMixedWorkspaceReplay(restored.workspace).get(entry.expected.id) as SurfaceDocument;
    expect(entry.checkpoint.identity.revision).toBe(1);
    expect(current.identity.revision).toBe(2);
    expect(current.source.definition.expressions?.z).toBe("0.2*(u*u-v*v)");
    expect(inspectProjectCompositionAvailability(composition, restored.workspace)).toEqual(["retained-checkpoint", "current"]);
    const members = composition.members.map(member => resolveProjectCompositionMember(restored, member, () => null));
    expect(members.map(member => member.param?.z)).toEqual(["0.2*(u*u+v*v)", "0.2*(u*u-v*v)"]);
    expect(compatibleCompositionParameterChart(members)).toBe(true);
    const another = instantiateMath3DProjectTemplate("surface-generation-study", "another-copy");
    expect(another.identity.id).not.toBe(project.identity.id);
    expect(another.workspace.entries[0]!.expected.id).not.toBe(entry.expected.id);
  });
});
