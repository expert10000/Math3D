import { describe, expect, it } from "vitest";
import { instantiateMeshComparisonStarter } from "../projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "./ProjectCompositionView";
import { compositionCursorDraft, compositionCursorProbe } from "./compositionCursor";
import { ScientificCursorBus } from "./scientificCursor";

const { project, resources } = instantiateMeshComparisonStarter("composition-cursor", "surface-mesh-probe");
const members = project.compositions![0]!.members.map((member, slot) => ({
  ...resolveProjectCompositionMember(project, member, item => resources.bytes(item)), slot: slot as 0 | 1,
}));
const pick = (index: number) => ({ memberId: members[index]!.id, revision: members[index]!.revision,
  hash: members[index]!.hash, point: { x: 0.25, y: 0.25, z: 0.04 } });

describe("M3D20-03 composition cursor", () => {
  it("publishes exact current Surface and Mesh picks with source and Mesh buffer identities", () => {
    for (const index of [0, 1]) {
      const draft = compositionCursorDraft(project, members, pick(index), "project-composition");
      expect(draft.ok).toBe(true);
      if (!draft.ok) continue;
      expect(draft.value.frame).toMatchObject({ kind: "cartesian", frameId: "local",
        axes: [{ name: "x", unit: "m" }, { name: "y", unit: "m" }, { name: "z", unit: "m" }] });
      expect(draft.value.sourceModule).toBe(index === 0 ? "surface" : "mesh");
      const document = project.workspace.entries[index]!.checkpoint;
      expect(draft.value.resourceSha256).toBe(document.format === "math3d.mesh-document" ?
        document.source.resource.checksum.slice(7) : null);
      const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
      expect(compositionCursorProbe(project, members, cursor)?.target.id).toBe(members[1 - index]!.id);
    }
  });
  it("refuses a retained generation, mismatched frame and stale source", () => {
    expect(compositionCursorDraft(project, members, { ...pick(0), revision: pick(0).revision + 1 },
      "project-composition").ok).toBe(false);
    expect(compositionCursorDraft(project, [{ ...members[0]!, coordinates: { status: "missing" } }, members[1]!],
      pick(0), "project-composition").ok).toBe(false);
    const draft = compositionCursorDraft(project, members, pick(1), "project-composition");
    if (!draft.ok) throw Error(draft.errors.join(" "));
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(compositionCursorProbe(project, members, { ...cursor, source: { ...cursor.source,
      generation: cursor.source.generation + 1 } })).toBeNull();
    expect(compositionCursorProbe(project, members, { ...cursor, resourceSha256: null })).toBeNull();
    expect(compositionCursorProbe(project, members, { ...cursor, frame: { ...cursor.frame, frameId: "guessed" } })).toBeNull();
    expect(compositionCursorProbe(project, [{ ...members[0]!, coordinates: { status: "missing" } }, members[1]!],
      cursor)).toBeNull();
  });
});
