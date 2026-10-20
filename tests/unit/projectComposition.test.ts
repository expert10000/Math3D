import { describe, expect, it } from "vitest";
import {
  inspectProjectComposition, parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, upsertMath3DProjectComposition, validProjectComposition,
  type ProjectComposition,
} from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { mobileSurfaceProjectFixture } from "../fixtures/unified-projects/mobileSurfaces";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { projectResourceInventory } from "../../renderer/src/projects/projectResources";

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
});
