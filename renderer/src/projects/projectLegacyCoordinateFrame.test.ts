import { describe, expect, it } from "vitest";
import { inspectProjectCompositionAvailability, parseMath3DProject,
  readProjectCoordinateFrame, serializeMath3DProject, upsertMath3DProjectComposition,
  type MeshDocument, type ProjectComposition, type ProjectCoordinateFrame } from "@math3d/core";
import { createProjectComparisonTemplate } from "../../../packages/core/src/projectComparisonTemplates";
import { mobileMixedProjectFixture } from "../../../tests/fixtures/unified-projects/mobileProjects";
import { projectFreezeFixture } from "../../../tests/fixtures/unified-projects/projectFreeze";
import { createProjectComparisonEvidence } from "./projectComparisonEvidence";
import { declareLegacyGeometryCoordinateFrame, declareLegacyMeshCoordinateFrame } from "./projectLegacyCoordinateFrame";
import { resolveProjectCompositionMember } from "../components/ProjectCompositionView";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

const frame: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: "laboratory xyz",
  unit: "mm", axes: ["x", "y", "z"], handedness: "right" };

describe("PC03 legacy Geometry frame declaration", () => {
  it("revises the owning source, retains its old checkpoint, and pins a new exact overlay", () => {
    const original = createProjectComparisonTemplate("coordinate-overlay-study", "pc03-frame-declaration");
    const asserted = original.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    const { project: next, comparison } = declareLegacyGeometryCoordinateFrame(original, asserted, 1, frame);
    const reopened = parseMath3DProject(serializeMath3DProject(next));
    const entry = reopened.workspace.entries.find(item => item.expected.id === asserted.members[1].documentId)!;
    expect(entry.checkpoint.identity).toEqual(asserted.members[1].expected);
    expect(entry.expected).toEqual(comparison.members[1].expected);
    expect(entry.expected.revision).toBe(entry.checkpoint.identity.revision + 1);
    expect(readProjectCoordinateFrame(entry.checkpoint).status).toBe("missing");
    expect(inspectProjectCompositionAvailability(asserted, reopened.workspace)).toEqual(["current", "retained-checkpoint"]);
    expect(inspectProjectCompositionAvailability(comparison, reopened.workspace)).toEqual(["current", "current"]);
    expect(createProjectComparisonEvidence(reopened, asserted, () => null).alignment).toBe("operator assertion");
    expect(createProjectComparisonEvidence(reopened, comparison, () => null).alignment).toBe("source-declared match");
    expect(resolveProjectCompositionMember(reopened, asserted.members[1], () => null).coordinates.status).toBe("missing");
    expect(resolveProjectCompositionMember(reopened, comparison.members[1], () => null).coordinates.value).toEqual(frame);
    expect(original.workspace).not.toEqual(next.workspace);
  });

  it("refuses an unsaved, incompatible, repeated, or invalid declaration", () => {
    const project = createProjectComparisonTemplate("coordinate-overlay-study", "pc03-frame-refusal");
    const asserted = project.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    expect(() => declareLegacyGeometryCoordinateFrame(project, { ...asserted, title: "edited" }, 1, frame)).toThrow(/exact overlay/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, unit: "cm" })).toThrow(/exact overlay/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 0, frame)).toThrow(/already declares/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, axes: ["x", "x", "z"] })).toThrow(/invalid/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, handedness: "left" })).toThrow(/handedness/i);
    const { project: revised } = declareLegacyGeometryCoordinateFrame(project, asserted, 1, frame);
    expect(() => declareLegacyGeometryCoordinateFrame(revised, asserted, 1, frame)).toThrow(/exact replay checkpoint/i);
  });
});

describe("PC03 legacy Mesh frame declaration", () => {
  it("retains exact Mesh bytes while revising origin metadata and pinning a new overlay", () => {
    const { project: base, resources } = mobileMixedProjectFixture();
    const entries = ["mesh", "geometry"].map(module => base.workspace.entries.find(item => item.module === module)!);
    const composition: ProjectComposition = { id: "pc03-mesh-frame", title: "Unverified Mesh / Geometry", mode: "overlay",
      alignment: { frame: "local xyz", unit: "unitless" }, members: entries.map((entry, index) => ({
        documentId: entry.expected.id, expected: entry.expected, visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1,
      })) as unknown as ProjectComposition["members"] };
    const project = upsertMath3DProjectComposition(base, composition);
    const meshFrame: ProjectCoordinateFrame = { ...frame, frame: "local xyz", unit: "unitless" };
    const next = declareLegacyMeshCoordinateFrame(project, composition, 0, meshFrame, item => resources.bytes(item));
    const restored = parseProjectPackage(exportProjectPackage(next.project, resources));
    const read = (item: Parameters<typeof resources.bytes>[0]) => restored.resources.bytes(item);
    const entry = restored.project.workspace.entries.find(item => item.expected.id === entries[0].expected.id)!;
    expect(entry.checkpoint.identity).toEqual(entries[0].expected);
    expect(entry.expected).toEqual(next.comparison.members[0].expected);
    expect(readProjectCoordinateFrame(entry.checkpoint).status).toBe("missing");
    expect(resolveProjectCompositionMember(restored.project, next.comparison.members[0], read).coordinates.value).toEqual(meshFrame);
    expect(createProjectComparisonEvidence(restored.project, composition, read).members[0].structuralHash).toBe(entries[0].expected.structuralHash);
    expect(createProjectComparisonEvidence(restored.project, next.comparison, read).members[0].structuralHash).toBe(entry.expected.structuralHash);
    const oldDocument = entry.checkpoint as MeshDocument;
    const newDocument = verifyMixedWorkspaceReplay(restored.project.workspace).get(entry.expected.id) as MeshDocument;
    expect(newDocument.source.resource).toEqual(oldDocument.source.resource);
    const oldMesh = resolveProjectCompositionMember(restored.project, composition.members[0], read).meshes[0]!;
    const newMesh = resolveProjectCompositionMember(restored.project, next.comparison.members[0], read).meshes[0]!;
    expect(newMesh.positions).toEqual(oldMesh.positions);
  });

  it("marks a current Mesh beyond its checkpoint as a retained pre-declaration snapshot", () => {
    const fixture = projectFreezeFixture();
    const { project: base, resources } = parseProjectPackage(fixture.raw);
    const entries = [fixture.targets.mesh, fixture.targets.geometry].map(id =>
      base.workspace.entries.find(item => item.expected.id === id)!);
    const comparison: ProjectComposition = { id: "pc03-mesh-r2", title: "Legacy Mesh r2", mode: "overlay",
      alignment: { frame: "local xyz", unit: "unitless" }, members: entries.map((entry, index) => ({
        documentId: entry.expected.id, expected: entry.expected, visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1,
      })) as unknown as ProjectComposition["members"] };
    const project = upsertMath3DProjectComposition(base, comparison);
    expect(entries[0].checkpoint.identity.revision).toBeLessThan(entries[0].expected.revision);
    const next = declareLegacyMeshCoordinateFrame(project, comparison, 0,
      { ...frame, frame: "local xyz", unit: "unitless" }, item => resources.bytes(item));
    expect(inspectProjectCompositionAvailability(comparison, next.project.workspace)[0]).toBe("retained-mesh");
    expect(inspectProjectCompositionAvailability(next.comparison, next.project.workspace)[0]).toBe("current");
    const restored = parseProjectPackage(exportProjectPackage(next.project, resources));
    expect(resolveProjectCompositionMember(restored.project, comparison.members[0], item => restored.resources.bytes(item)).revision)
      .toBe(entries[0].expected.revision);
  });
});
