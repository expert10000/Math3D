import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject, updateProjectNote, upsertMath3DProjectNote } from "@math3d/core";
import { instantiateMeshComparisonStarter } from "../../renderer/src/projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { createProjectComparisonNote, inspectProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { createProjectComparisonEvidence, projectComparisonEvidenceHtml } from "../../renderer/src/projects/projectComparisonEvidence";
import { resolveLinkedCoordinateProbe, resolveSavedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";
import { exportProjectPackage, parseProjectPackage, projectResourceInventory } from "../../renderer/src/projects/projectResources";

const fixture = () => {
  const made = instantiateMeshComparisonStarter("saved-coordinate-note", "mesh-geometry-probe");
  const read = (item: Parameters<typeof made.resources.bytes>[0]) => made.resources.bytes(item);
  const composition = made.project.compositions![0]!;
  const members = composition.members.map((member, slot) => ({ ...resolveProjectCompositionMember(made.project, member, read), slot: slot as 0 | 1 }));
  const mesh = members[0]!;
  const probe = resolveLinkedCoordinateProbe(members, { memberId: mesh.id, revision: mesh.revision,
    hash: mesh.hash, meshKey: mesh.meshes[0]!.id, point: { x: 0.25, y: 0.25, z: 0 } })!;
  return { ...made, composition, read, probe };
};

describe("PC25 saved coordinate observations", () => {
  it("retains exact Mesh/Geometry evidence through a portable Project round trip and HTML export", () => {
    const { project: base, resources, composition, read, probe } = fixture();
    const note = createProjectComparisonNote(base, composition, read, "Shared position", "Inspect this coordinate in both panes.", 100, "pc25-note", probe);
    const project = upsertMath3DProjectNote(base, note);
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const saved = reopened.notes![0]!;
    const readReopened = (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item);
    expect(saved.anchor).toMatchObject({ kind: "comparison", members: composition.members.map(member => member.expected),
      coordinateProbe: { sourceSlot: "A", point: [0.25, 0.25, 0], coordinateFrame: { frame: "local", unit: "m" } } });
    expect(inspectProjectComparisonNote(reopened, saved, readReopened).status).toBe("current");
    const verified = composition.members.map((member, slot) => ({ ...resolveProjectCompositionMember(reopened, member, readReopened), slot: slot as 0 | 1 }));
    expect(resolveSavedCoordinateProbe(verified, saved.anchor as Extract<typeof saved.anchor, { kind: "comparison" }>)).toMatchObject({
      source: { id: probe.source.id }, target: { id: probe.target.id }, point: probe.point, unit: "m" });
    const evidence = createProjectComparisonEvidence(reopened, reopened.compositions![0]!, readReopened);
    expect(evidence.observations[0]?.coordinateProbe).toMatchObject({ sourceId: probe.source.id, point: probe.point, unit: "m" });
    expect(projectComparisonEvidenceHtml(evidence, ["data:image/jpeg;base64,AA==", "data:image/jpeg;base64,AA=="]))
      .toContain("No target element or measured value is inferred.");
  });

  it("refuses missing, tampered and mismatched evidence without a saved marker", () => {
    const { project: base, composition, read, resources, probe } = fixture();
    const note = createProjectComparisonNote(base, composition, read, "Probe", "A coordinate observation.", 100, "pc25-refusal", probe);
    const project = upsertMath3DProjectNote(base, note);
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers")!;
    const tamperedRead = (item: typeof requirement) => {
      const bytes = resources.bytes(item);
      if (!bytes) return null;
      if (item.id !== requirement.id) return bytes;
      const altered = bytes.slice(); altered[0] ^= 1; return altered;
    };
    expect(inspectProjectComparisonNote(project, note, () => null).status).toBe("missing");
    expect(inspectProjectComparisonNote(project, note, tamperedRead).status).toBe("missing");
    expect(() => createProjectComparisonEvidence(project, composition, tamperedRead)).toThrow();
    const invalid = { ...probe, unit: "cm" };
    expect(() => createProjectComparisonNote(base, composition, read, "Bad", "Mismatched.", 100, "pc25-bad", invalid))
      .toThrow(/matching exact comparison sources/);
    const anchor = note.anchor!;
    if (anchor.kind !== "comparison" || !anchor.coordinateProbe) throw new Error("Expected coordinate Note.");
    const changed = updateProjectNote(note, { anchor: { ...anchor, coordinateProbe: { ...anchor.coordinateProbe,
      coordinateFrame: { ...anchor.coordinateProbe.coordinateFrame, unit: "cm" } } } }, 101);
    expect(inspectProjectComparisonNote(upsertMath3DProjectNote(base, changed), changed, read).status).toBe("stale");
  });
});
