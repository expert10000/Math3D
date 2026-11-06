import { describe, expect, it } from "vitest";
import { createDocumentIdentity, createMixedWorkspaceDocument, createSurfaceDocument, inspectProjectCompositionAvailability, parseMath3DProject,
  readProjectCoordinateFrame, replaceMath3DProjectWorkspace, retainedGeometryGenerationDocuments,
  retainedSurfaceGenerationDocuments, serializeMath3DProject, upsertMath3DProjectComposition,
  type MeshDocument, type ProjectComposition, type ProjectCoordinateFrame } from "@math3d/core";
import { createProjectComparisonTemplate } from "../../../packages/core/src/projectComparisonTemplates";
import { mobileMixedProjectFixture } from "../../../tests/fixtures/unified-projects/mobileProjects";
import { projectFreezeFixture } from "../../../tests/fixtures/unified-projects/projectFreeze";
import { createProjectComparisonEvidence } from "./projectComparisonEvidence";
import { declareLegacyGeometryCoordinateFrame, declareLegacyMeshCoordinateFrame,
  declareLegacySurfaceCoordinateFrame } from "./projectLegacyCoordinateFrame";
import { resolveProjectCompositionMember } from "../components/ProjectCompositionView";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { MIXED_REPLAY_FORMATS } from "../kernel/mixedWorkspaceReplay";
import { GeometryDocumentAdapter } from "../geometry/geometryDocumentAdapter";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { resolveLinkedCoordinateProbe } from "./projectLinkedCoordinateProbe";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";

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
    expect(() => declareLegacyGeometryCoordinateFrame(revised, asserted, 1, frame)).toThrow(/current replay-verified/i);
  });

  it("retains a current Geometry revision beyond its checkpoint before declaring the frame", () => {
    const original = createProjectComparisonTemplate("coordinate-overlay-study", "pc03-geometry-r2");
    const asserted = original.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    const entry = original.workspace.entries.find(item => item.expected.id === asserted.members[1].documentId)!;
    const adapter = new GeometryDocumentAdapter(entry.checkpoint as never);
    const r2 = adapter.commitSource({ ...adapter.document().source,
      parameters: { ...adapter.document().source.parameters, authoredOffset: 1 } });
    const replay = adapter.exportReplay();
    const workspace = createMixedWorkspaceDocument({ ...original.workspace, entries: original.workspace.entries.map(item =>
      item === entry ? { ...item, expected: r2.identity,
        replay: { format: MIXED_REPLAY_FORMATS.geometry, payload: replay as never } } : item) });
    const current = replaceMath3DProjectWorkspace(original, workspace);
    const comparison: ProjectComposition = { ...asserted, id: "pc03-geometry-r2-comparison",
      members: [asserted.members[0], { ...asserted.members[1], expected: r2.identity }] };
    const saved = upsertMath3DProjectComposition(current, comparison);
    expect(inspectProjectCompositionAvailability(comparison, saved.workspace)[1]).toBe("current");
    const next = declareLegacyGeometryCoordinateFrame(saved, comparison, 1, frame);
    const reopened = parseMath3DProject(serializeMath3DProject(next.project));
    const revisedEntry = reopened.workspace.entries.find(item => item.expected.id === r2.identity.id)!;
    expect(retainedGeometryGenerationDocuments(revisedEntry).map(document => document.identity)).toContainEqual(r2.identity);
    expect(inspectProjectCompositionAvailability(comparison, reopened.workspace)[1]).toBe("retained-geometry");
    expect(inspectProjectCompositionAvailability(next.comparison, reopened.workspace)[1]).toBe("current");
    expect(resolveProjectCompositionMember(reopened, comparison.members[1], () => null).coordinates.status).toBe("missing");
    expect(resolveProjectCompositionMember(reopened, next.comparison.members[1], () => null).coordinates.value).toEqual(frame);
    expect(createProjectComparisonEvidence(reopened, comparison, () => null).alignment).toBe("operator assertion");
    expect(createProjectComparisonEvidence(reopened, next.comparison, () => null).alignment).toBe("source-declared match");
    const forged = { ...revisedEntry, replay: { ...revisedEntry.replay!, payload: {
      ...(revisedEntry.replay!.payload as object), transactions: (revisedEntry.replay!.payload as any).transactions.map((item: any) =>
        item.retainedBefore ? { ...item, retainedBefore: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } : item),
    } } };
    expect(() => retainedGeometryGenerationDocuments(forged)).toThrow(/marker/i);
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

describe("PC05 legacy Surface frame declaration", () => {
  it("revises the owning Surface and reopens both exact comparisons", () => {
    const { project: starter, resources } = instantiateMeshComparisonStarter("legacy-surface", "surface-mesh-probe");
    const originalComparison = starter.compositions![0]!;
    const entry = starter.workspace.entries[0]!;
    const old = entry.checkpoint;
    if (old.format !== "math3d.surface-document") throw new TypeError("Expected Surface starter.");
    const source = { ...old.source, orientation: {} };
    const legacy = createSurfaceDocument({ ...old, source,
      identity: createDocumentIdentity(old.identity.id, source, old.identity.revision) });
    const workspace = createMixedWorkspaceDocument({ ...starter.workspace, entries: starter.workspace.entries.map(item =>
      item === entry ? { ...item, checkpoint: legacy, expected: legacy.identity } : item) });
    const base = replaceMath3DProjectWorkspace(starter, workspace);
    const comparison: ProjectComposition = { ...originalComparison, members: [
      { ...originalComparison.members[0], expected: legacy.identity }, originalComparison.members[1]] };
    const project = upsertMath3DProjectComposition(base, comparison);
    const declared: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m",
      axes: ["x", "y", "z"], handedness: "right" };
    expect(() => declareLegacySurfaceCoordinateFrame(project, comparison, 0, { ...declared, unit: "cm" })).toThrow(/unit/i);
    expect(() => declareLegacySurfaceCoordinateFrame(project, comparison, 0, { ...declared, handedness: "left" })).toThrow(/handedness/i);
    const next = declareLegacySurfaceCoordinateFrame(project, comparison, 0, declared);
    const reopened = parseProjectPackage(exportProjectPackage(next.project, resources));
    const revised = reopened.project.workspace.entries[0]!;
    expect(revised.checkpoint.identity).toEqual(legacy.identity);
    expect(revised.expected).toEqual(next.comparison.members[0].expected);
    expect(inspectProjectCompositionAvailability(comparison, reopened.project.workspace)[0]).toBe("retained-checkpoint");
    expect(inspectProjectCompositionAvailability(next.comparison, reopened.project.workspace)[0]).toBe("current");
    const read = (item: Parameters<typeof resources.bytes>[0]) => reopened.resources.bytes(item);
    expect(resolveProjectCompositionMember(reopened.project, comparison.members[0], read).coordinates.status).toBe("missing");
    expect(resolveProjectCompositionMember(reopened.project, next.comparison.members[0], read).coordinates.value).toEqual(declared);
    expect(readProjectCoordinateFrame(verifyMixedWorkspaceReplay(reopened.project.workspace).get(legacy.identity.id)!).value).toEqual(declared);
    const members = next.comparison.members.map((member, slot) => ({ ...resolveProjectCompositionMember(reopened.project, member, read), slot: slot as 0 | 1 }));
    expect(resolveLinkedCoordinateProbe(members, { memberId: members[0]!.id, revision: members[0]!.revision,
      hash: members[0]!.hash, point: { x: 0.25, y: 0.25, z: 0.04 } })?.target.id).toBe(members[1]!.id);
    expect(() => declareLegacySurfaceCoordinateFrame(next.project, comparison, 0, declared)).toThrow(/current replay-verified/i);
  });

  it("retains an edited current Surface revision before the metadata edit", () => {
    const { project: starter, resources } = instantiateMeshComparisonStarter("legacy-surface-r2", "surface-mesh-probe");
    const original = starter.compositions![0]!, entry = starter.workspace.entries[0]!;
    const surface = entry.checkpoint;
    if (surface.format !== "math3d.surface-document") throw new TypeError("Expected Surface starter.");
    const source = { ...surface.source, orientation: {} };
    const legacy = createSurfaceDocument({ ...surface, source,
      identity: createDocumentIdentity(surface.identity.id, source, surface.identity.revision) });
    const adapter = new SurfaceDocumentAdapter(legacy);
    const r2 = adapter.commitSource({ ...legacy.source, definition: { ...legacy.source.definition,
      expressions: { x: "u", y: "v", z: "0.4*(u*u+v*v)" } } });
    const replay = adapter.replayBundle();
    const workspace = createMixedWorkspaceDocument({ ...starter.workspace, entries: starter.workspace.entries.map(item =>
      item === entry ? { ...item, checkpoint: replay.checkpoint, expected: r2.identity,
        replay: { format: MIXED_REPLAY_FORMATS.surface, payload: replay as never } } : item) });
    const base = replaceMath3DProjectWorkspace(starter, workspace);
    const comparison: ProjectComposition = { ...original, id: "pc05-legacy-surface-r2",
      members: [{ ...original.members[0], expected: r2.identity }, original.members[1]] };
    const project = upsertMath3DProjectComposition(base, comparison);
    expect(retainedSurfaceGenerationDocuments(project.workspace.entries[0]!)).toEqual([]);
    const declared: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m",
      axes: ["x", "y", "z"], handedness: "right" };
    const next = declareLegacySurfaceCoordinateFrame(project, comparison, 0, declared);
    const restored = parseProjectPackage(exportProjectPackage(next.project, resources));
    const revised = restored.project.workspace.entries[0]!;
    expect(revised.checkpoint.identity).toEqual(legacy.identity);
    expect(revised.expected.revision).toBe(r2.identity.revision + 1);
    expect(retainedSurfaceGenerationDocuments(revised).map(document => document.identity)).toContainEqual(r2.identity);
    expect(inspectProjectCompositionAvailability(comparison, restored.project.workspace)[0]).toBe("retained-surface");
    expect(inspectProjectCompositionAvailability(next.comparison, restored.project.workspace)[0]).toBe("current");
    const read = (item: Parameters<typeof resources.bytes>[0]) => restored.resources.bytes(item);
    expect(resolveProjectCompositionMember(restored.project, comparison.members[0], read).coordinates.status).toBe("missing");
    expect(resolveProjectCompositionMember(restored.project, next.comparison.members[0], read).coordinates.value).toEqual(declared);
    const restoredAdapter = SurfaceDocumentAdapter.fromReplayBundle(revised.replay!.payload as never);
    restoredAdapter.commitSource({ ...restoredAdapter.document().source,
      parameters: { ...restoredAdapter.document().source.parameters, temporary: 1 } });
    const undone = restoredAdapter.undo(), withRedo = restoredAdapter.replayBundle();
    const redoEntry = { ...revised, checkpoint: withRedo.checkpoint, expected: undone.identity,
      replay: { format: MIXED_REPLAY_FORMATS.surface, payload: withRedo as never } };
    expect(retainedSurfaceGenerationDocuments(redoEntry).map(document => document.identity)).toContainEqual(r2.identity);
    const forged = { ...revised, replay: { ...revised.replay!, payload: {
      ...(revised.replay!.payload as object), transactions: (revised.replay!.payload as any).transactions.map((item: any) =>
        item.retainedBefore ? { ...item, retainedBefore: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } : item),
    } } };
    expect(() => retainedSurfaceGenerationDocuments(forged)).toThrow(/marker/i);
  });
});
