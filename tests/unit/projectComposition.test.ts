import { describe, expect, it } from "vitest";
import {
  createMath3DProject, createMixedWorkspaceDocument, createSurfaceDocument,
  inspectProjectComposition, inspectProjectCompositionAvailability, qualifyProjectOverlayCoordinates,
  readProjectCoordinateFrame, sameProjectCoordinateFrame,
  parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, upsertMath3DProjectComposition, validProjectComposition,
  type ProjectComposition, type MeshDocument, type GeometryDocument,
} from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { mobileSurfaceProjectFixture } from "../fixtures/unified-projects/mobileSurfaces";
import { compatibleCompositionParameterChart, qualifyProjectCameraPair, resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { projectResourceInventory } from "../../renderer/src/projects/projectResources";
import { SurfaceDocumentAdapter } from "../../renderer/src/surfaceAnalysis/surfaceDocumentAdapter";
import { MIXED_REPLAY_FORMATS } from "../../renderer/src/kernel/mixedWorkspaceReplay";

const setup = () => {
  const fixture = mobileMixedProjectFixture(), { project } = fixture;
  const entries = ["mesh", "geometry"].map(module => project.workspace.entries.find(entry => entry.module === module)!);
  const composition: ProjectComposition = {
    id: "comparison:mesh-geometry", title: "Mesh / Geometry", mode: "side-by-side",
    members: [
      { documentId: entries[0].expected.id, expected: entries[0].expected, visible: true, color: "#3976d7", opacity: 1 },
      { documentId: entries[1].expected.id, expected: entries[1].expected, visible: true, color: "#e8793a", opacity: 0.7 },
    ],
  };
  return { ...fixture, composition };
};

describe("PC01–PC05 non-owning Project composition", () => {
  it("round-trips references without copying or changing either source", () => {
    const { project, composition } = setup();
    const saved = upsertMath3DProjectComposition(project, composition);
    expect(saved.workspace).toEqual(project.workspace);
    expect(saved.identity.structuralHash).not.toBe(project.identity.structuralHash);
    expect(parseMath3DProject(serializeMath3DProject(saved)).compositions).toEqual([composition]);
    expect(inspectProjectComposition(composition, saved.workspace)).toEqual(["current", "current"]);
    expect(replaceMath3DProjectWorkspace(saved, saved.workspace).compositions).toEqual([composition]);
  });

  it("reports historical and missing members rather than substituting a new generation", () => {
    const { project, composition } = setup();
    const first = project.workspace.entries.find(entry => entry.expected.id === composition.members[0].documentId)!;
    const changed = { ...project.workspace, entries: project.workspace.entries.map(entry => entry === first ?
      { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) };
    expect(inspectProjectComposition(composition, changed)).toEqual(["historical", "current"]);
    expect(inspectProjectComposition(composition, { ...project.workspace, entries: project.workspace.entries.filter(entry => entry !== first) })).toEqual(["missing", "current"]);
  });

  it("requires explicit overlay alignment and rejects tampered saved appearance", () => {
    const { project, composition } = setup();
    expect(validProjectComposition({ ...composition, mode: "overlay" })).toBe(false);
    const overlay: ProjectComposition = { ...composition, mode: "overlay", alignment: { frame: "laboratory xyz", unit: "mm" } };
    expect(validProjectComposition(overlay)).toBe(true);
    const saved = upsertMath3DProjectComposition(project, overlay);
    const bytes = JSON.parse(serializeMath3DProject(saved));
    bytes.compositions[0].members[0].color = "#ffffff";
    expect(() => parseMath3DProject(JSON.stringify(bytes))).toThrow(/hash/i);
    expect(project.compositions).toBeUndefined();
  });

  it("renders only replay-verified source generations and checksum-verified Mesh sidecars", () => {
    const { project, composition, resources } = setup();
    const mesh = composition.members[0];
    const inspected = resolveProjectCompositionMember(project, mesh, item => resources.bytes(item));
    expect(inspected.id).toBe(mesh.documentId);
    expect(inspected.meshes.some(item => item.positions.length > 0)).toBe(true);
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.owners.includes(mesh.documentId))!;
    const bytes = resources.bytes(requirement)!;
    const bad = bytes.slice(); bad[0] ^= 1;
    expect(() => resolveProjectCompositionMember(project, mesh, item => item.id === requirement.id ? bad : resources.bytes(item))).toThrow(/checksum/i);
    const historical = { ...mesh, expected: { ...mesh.expected, revision: mesh.expected.revision + 1 } };
    expect(() => resolveProjectCompositionMember(project, historical, item => resources.bytes(item))).toThrow(/different saved revision/i);
  });

  it("binds a saved parametric Surface for heterogeneous side-by-side viewing", () => {
    const { project, resources, surfaceId } = mobileSurfaceProjectFixture();
    const entry = project.workspace.entries.find(item => item.expected.id === surfaceId)!;
    const member: ProjectComposition["members"][number] = { documentId: surfaceId, expected: entry.expected, visible: true, color: "#3976d7", opacity: 1 };
    expect(resolveProjectCompositionMember(project, member, item => resources.bytes(item)).param).toMatchObject({
      x: "u", y: "v", z: "u*u-v*v", unit: "unitless", domain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    });
  });

  it("compares an exact retained Surface checkpoint with its replay-verified current generation", () => {
    const source = { representation: "parametric" as const,
      domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
      units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
      definition: { familyId: "history-test", expressions: { x: "u", y: "v", z: "0" } } };
    const original = createSurfaceDocument({ stableKey: "pc-retained", metadata: { title: "Edited Surface" }, source });
    const adapter = new SurfaceDocumentAdapter(original);
    adapter.commitSource({ ...source, definition: { ...source.definition, expressions: { ...source.definition.expressions, z: "u*v" } } });
    const replay = adapter.replayBundle();
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: replay.checkpoint,
      expected: adapter.document().identity, replay: { format: MIXED_REPLAY_FORMATS.surface, payload: replay as never } }],
      activeDocumentIds: [original.identity.id], constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
    const project = createMath3DProject(workspace, { stableKey: "pc-history", title: "Retained generation" });
    const old = { documentId: original.identity.id, expected: replay.checkpoint.identity, visible: true, color: "#3976d7", opacity: 1 };
    const current = { ...old, expected: adapter.document().identity };
    const comparison: ProjectComposition = { id: "pc-history", title: "Before and after", mode: "side-by-side", members: [old, current] };
    expect(validProjectComposition(comparison)).toBe(true);
    expect(parseMath3DProject(serializeMath3DProject(upsertMath3DProjectComposition(project, comparison))).compositions).toEqual([comparison]);
    expect(inspectProjectCompositionAvailability(comparison, workspace)).toEqual(["retained-checkpoint", "current"]);
    const oldView = resolveProjectCompositionMember(project, old, () => null);
    const currentView = resolveProjectCompositionMember(project, current, () => null);
    expect(oldView.param?.z).toBe("0");
    expect(currentView.param?.z).toBe("u*v");
    expect(compatibleCompositionParameterChart([oldView, currentView])).toBe(true);
    expect(qualifyProjectCameraPair([oldView, currentView])).toBe("shared-surface-axes");
    expect(compatibleCompositionParameterChart([oldView, { ...currentView, id: "unrelated-surface" }])).toBe(false);
    expect(qualifyProjectCameraPair([oldView, { ...currentView, param: { ...currentView.param!, x: "u+1" } }])).toBeNull();
    expect(compatibleCompositionParameterChart([oldView, { ...currentView, param: { ...currentView.param!, domain: { ...currentView.param!.domain!, uMax: 2 } } }])).toBe(false);
    const linkedCamera: ProjectComposition = { ...comparison, camera: { mode: "linked", leader: "A" } };
    expect(parseMath3DProject(serializeMath3DProject(upsertMath3DProjectComposition(project, linkedCamera))).compositions).toEqual([linkedCamera]);
    expect(validProjectComposition({ ...linkedCamera, mode: "overlay", alignment: { frame: "test", unit: "unitless" } })).toBe(false);
    expect(validProjectComposition({ ...linkedCamera, camera: { mode: "linked", leader: "C" } })).toBe(false);
    const unavailable = { ...old, expected: { ...old.expected, revision: old.expected.revision + 17 } };
    expect(inspectProjectCompositionAvailability({ ...comparison, members: [unavailable, current] }, workspace)).toEqual(["unavailable-generation", "current"]);
    expect(() => resolveProjectCompositionMember(project, unavailable, () => null)).toThrow(/no matching retained checkpoint/i);
  });

  it("checks independently stored Mesh and Geometry coordinate declarations without inferring missing metadata", () => {
    const { project, composition, resources } = setup();
    const mesh = project.workspace.entries.find(entry => entry.module === "mesh")!.checkpoint as MeshDocument;
    const geometry = project.workspace.entries.find(entry => entry.module === "geometry")!.checkpoint as GeometryDocument;
    const frame = { format: "math3d.coordinate-frame/v1", frame: "laboratory xyz", unit: "mm",
      axes: ["x", "y", "z"], handedness: "right" };
    const meshWith = { ...mesh, source: { ...mesh.source, origin: { math3dCoordinateFrame: frame } } } as MeshDocument;
    const geometryWith = { ...geometry, source: { ...geometry.source, extensions: { math3dCoordinateFrame: frame } } } as GeometryDocument;
    const first = readProjectCoordinateFrame(meshWith), second = readProjectCoordinateFrame(geometryWith);
    expect(first.status).toBe("declared"); expect(second.status).toBe("declared");
    expect(sameProjectCoordinateFrame(first.value!, second.value!)).toBe(true);
    expect(sameProjectCoordinateFrame(first.value!, { ...second.value!, unit: "cm" })).toBe(false);
    expect(qualifyProjectOverlayCoordinates(first, second, { frame: "laboratory xyz", unit: "mm" })).toBe("verified");
    const meshView = resolveProjectCompositionMember(project, composition.members[0], item => resources.bytes(item));
    const geometryView = resolveProjectCompositionMember(project, composition.members[1], item => resources.bytes(item));
    expect(qualifyProjectCameraPair([meshView, geometryView])).toBeNull();
    expect(qualifyProjectCameraPair([{ ...meshView, coordinates: first }, { ...geometryView, coordinates: second }])).toBe("declared-3d-frame");
    expect(qualifyProjectCameraPair([{ ...meshView, coordinates: first }, { ...geometryView, coordinates: { status: "missing" } }])).toBeNull();
    expect(qualifyProjectOverlayCoordinates(first, { status: "declared", value: { ...second.value!, unit: "cm" } },
      { frame: "laboratory xyz", unit: "mm" })).toBe("mismatch");
    expect(qualifyProjectOverlayCoordinates(first, second, { frame: "laboratory xyz", unit: "cm" })).toBe("mismatch");
    expect(qualifyProjectOverlayCoordinates(first, { status: "missing" }, { frame: "laboratory xyz", unit: "mm" })).toBe("asserted");
    expect(readProjectCoordinateFrame(mesh).status).toBe("missing");
    expect(readProjectCoordinateFrame({ ...meshWith, source: { ...meshWith.source, origin: { math3dCoordinateFrame: { ...frame, axes: ["x", "x", "z"] } } } }).status).toBe("invalid");
  });
});
