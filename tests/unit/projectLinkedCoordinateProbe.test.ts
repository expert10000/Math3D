import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, parseMath3DProject, serializeMath3DProject,
  type GeometryDocument } from "@math3d/core";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";

const sources = () => {
  const project = parseMath3DProject(serializeMath3DProject(
    instantiateMath3DProjectTemplate("coordinate-overlay-study", "linked-probe")));
  const composition = project.compositions!.find(item => item.title === "Verified A/B overlay")!;
  const members = composition.members.map((member, slot) =>
    ({ ...resolveProjectCompositionMember(project, member, () => null), slot: slot as 0 | 1 }));
  return { project, members };
};

describe("PC24 linked coordinate probe", () => {
  it("keeps an exact source generation and element ID while linking only the coordinate", () => {
    const { members } = sources();
    const pick = { memberId: members[0]!.id, revision: members[0]!.revision, hash: members[0]!.hash,
      meshKey: `${members[0]!.id}/box`, faceIndex: 3, point: { x: 0.25, y: -0.5, z: 0.75 } };
    expect(resolveLinkedCoordinateProbe(members, pick)).toEqual({
      source: { id: members[0]!.id, revision: 1, hash: members[0]!.hash, slot: 0, meshKey: pick.meshKey, faceIndex: 3 },
      target: { id: members[1]!.id, revision: 1, hash: members[1]!.hash, slot: 1 },
      point: pick.point, frame: "laboratory xyz", unit: "mm", axes: ["x", "y", "z"], handedness: "right",
    });
    const opposite = { ...pick, memberId: members[1]!.id, hash: members[1]!.hash };
    expect(resolveLinkedCoordinateProbe(members, opposite)?.target.slot).toBe(0);
    expect(resolveLinkedCoordinateProbe(members, { ...pick, hash: "changed" })).toBeNull();
    expect(resolveLinkedCoordinateProbe(members, { ...pick, point: { ...pick.point, x: Number.NaN } })).toBeNull();
  });

  it("refuses undeclared, mismatched, hidden and changed sources after reopen", () => {
    const { project, members } = sources();
    const pick = { memberId: members[0]!.id, revision: members[0]!.revision, hash: members[0]!.hash,
      point: { x: 0, y: 0, z: 0 } };
    const mismatch = { ...members[1]!, coordinates: { status: "declared" as const,
      value: { ...members[1]!.coordinates.value!, unit: "cm" } } };
    expect(resolveLinkedCoordinateProbe([members[0]!, mismatch], pick)).toBeNull();
    expect(resolveLinkedCoordinateProbe([members[0]!], pick)).toBeNull();
    expect(resolveLinkedCoordinateProbe([members[0]!, { ...members[1]!, coordinates: { status: "missing" } }], pick)).toBeNull();
    const tampered = JSON.parse(serializeMath3DProject(project));
    (tampered.workspace.entries[0].checkpoint as GeometryDocument).source.extensions.math3dCoordinateFrame.unit = "cm";
    expect(() => parseMath3DProject(JSON.stringify(tampered))).toThrow();
  });
});
