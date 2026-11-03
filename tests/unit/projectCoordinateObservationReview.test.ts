import { describe, expect, it } from "vitest";
import { upsertMath3DProjectNote } from "@math3d/core";
import { instantiateMeshComparisonStarter } from "../../renderer/src/projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";
import { createProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { buildProjectCoordinateObservationReview } from "../../renderer/src/projects/projectCoordinateObservationReview";

describe("PC26 coordinate observation review", () => {
  it("lists several exact Notes and keeps unavailable evidence visible without authored coordinates", () => {
    const made = instantiateMeshComparisonStarter("pc26-review", "mesh-geometry-probe");
    const read = (item: Parameters<typeof made.resources.bytes>[0]) => made.resources.bytes(item);
    const composition = made.project.compositions![0]!;
    const members = composition.members.map((member, slot) => ({ ...resolveProjectCompositionMember(made.project, member, read), slot: slot as 0 | 1 }));
    let project = made.project;
    for (const [index, sourceSlot] of [0, 1, 0] .entries()) {
      const source = members[sourceSlot as 0 | 1]!;
      const probe = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision,
        hash: source.hash, point: { x: index / 10, y: 0.2, z: 0 } })!;
      project = upsertMath3DProjectNote(project, createProjectComparisonNote(project, composition, read,
        `Position ${index}`, `Observation ${index}`, index + 1, `pc26-${index}`, probe));
    }
    const rows = buildProjectCoordinateObservationReview(project, read);
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.sourceSlot)).toEqual(["A", "B", "A"]);
    expect(rows.map(row => row.status)).toEqual(["current", "current", "current"]);
    expect(rows[1]).toMatchObject({ frame: "local", unit: "m", body: "Observation 1", point: [0.1, 0.2, 0] });
    const unavailable = buildProjectCoordinateObservationReview(project, () => null);
    expect(unavailable).toHaveLength(3);
    expect(unavailable.every(row => row.status === "missing" && row.point === null && row.body === null)).toBe(true);
    expect(unavailable[0]?.sources.map(source => source.hash)).toEqual(composition.members.map(member => member.expected.structuralHash));
  });
});
