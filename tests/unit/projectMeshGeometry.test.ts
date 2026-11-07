import { describe, expect, it } from "vitest";
import { createMath3DProject, createMeshDocument, createMixedWorkspaceDocument,
  deriveProjectMeshGeometry, encodeMeshBuffers, parseMath3DProject, projectOpenInActions,
  projectOpenInReturn, serializeMath3DProject, sha256Checksum } from "@math3d/core";

const fixture = () => {
  const bytes = encodeMeshBuffers({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: null });
  const mesh = createMeshDocument({ stableKey: "open-in-mesh", label: "Triangle", source: {
    objectId: "triangle", origin: { kind: "test" }, resource: { id: "triangle-buffers",
      checksum: sha256Checksum(bytes), vertexCount: 3, indexCount: 0,
      hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" } } });
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: mesh,
    expected: mesh.identity, replay: null }], activeDocumentIds: [mesh.identity.id],
    constructions: [], results: [], artifacts: [], relations: [], committedSelection: null });
  return { bytes, mesh, project: createMath3DProject(workspace, { stableKey: "open-in-mesh-project", title: "Mesh" }) };
};

describe("Project Mesh → Geometry Open in", () => {
  it("checks host buffers, creates a bounded copy, and returns to exact Mesh after reopen", () => {
    const { bytes, mesh, project } = fixture();
    expect(projectOpenInActions(project, mesh.identity.id)).toMatchObject([{ enabled: false,
      disabledReason: expect.stringContaining("buffers") }]);
    const action = projectOpenInActions(project, mesh.identity.id, { meshGeometry: { available: true, reason: null } })[0]!;
    expect(action).toMatchObject({ id: "mesh.promote-geometry", enabled: true });
    const made = deriveProjectMeshGeometry(project, action.source, bytes);
    expect(made.existing).toBe(false);
    expect(deriveProjectMeshGeometry(made.project, action.source, bytes).existing).toBe(true);
    const reopened = parseMath3DProject(serializeMath3DProject(made.project));
    const geometry = reopened.workspace.entries.find(item => item.expected.id === made.targetDocumentId)!;
    expect(geometry.module).toBe("geometry");
    if (geometry.checkpoint.format !== "math3d.geometry-document") throw new Error("Expected Geometry document.");
    expect(geometry.checkpoint.source.geometry?.triangles).toHaveLength(1);
    expect(projectOpenInReturn(reopened, made.targetDocumentId)).toMatchObject({
      sourceDocumentId: mesh.identity.id, sourceModule: "mesh", exact: true });
  });

  it("refuses changed source generations and missing or altered buffers", () => {
    const { bytes, mesh, project } = fixture();
    const source = projectOpenInActions(project, mesh.identity.id,
      { meshGeometry: { available: true, reason: null } })[0]!.source;
    const original = serializeMath3DProject(project);
    expect(() => deriveProjectMeshGeometry(project, { ...source, generation: source.generation + 1 }, bytes)).toThrow(/changed/);
    expect(() => deriveProjectMeshGeometry(project, source, bytes.slice(0, -1))).toThrow(/checksum/);
    expect(serializeMath3DProject(project)).toBe(original);
  });

  it("disables oversized copies and refuses in-range checksums with out-of-range triangle indices", () => {
    const { bytes, mesh, project } = fixture();
    const oversized = createMeshDocument({ stableKey: "oversized-open-in-mesh", label: "Oversized",
      source: { ...mesh.source, resource: { ...mesh.source.resource, indexCount: 4097 * 3 } } });
    const oversizedWorkspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: [{ module: "mesh", checkpoint: oversized, expected: oversized.identity, replay: null }],
      activeDocumentIds: [oversized.identity.id] });
    const oversizedProject = createMath3DProject(oversizedWorkspace, { stableKey: "oversized-open-in-project", title: "Oversized" });
    expect(projectOpenInActions(oversizedProject, oversized.identity.id,
      { meshGeometry: { available: true, reason: null } })).toMatchObject([{
        enabled: false, disabledReason: expect.stringContaining("4096") }]);

    const malformed = encodeMeshBuffers({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 99]) });
    const bad = createMeshDocument({ stableKey: "invalid-index-open-in-mesh", label: "Bad indices",
      source: { ...mesh.source, resource: { ...mesh.source.resource,
        checksum: sha256Checksum(malformed), indexCount: 3 } } });
    const badWorkspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: [{ module: "mesh", checkpoint: bad, expected: bad.identity, replay: null }],
      activeDocumentIds: [bad.identity.id] });
    const badProject = createMath3DProject(badWorkspace, { stableKey: "invalid-index-open-in-project", title: "Invalid indices" });
    const source = projectOpenInActions(badProject, bad.identity.id,
      { meshGeometry: { available: true, reason: null } })[0]!.source;
    expect(() => deriveProjectMeshGeometry(badProject, source, malformed)).toThrow(/valid indices/);
    expect(() => deriveProjectMeshGeometry(badProject, source, bytes)).toThrow(/checksum/);
    expect(badProject.workspace.relations).toHaveLength(0);
  });
});
