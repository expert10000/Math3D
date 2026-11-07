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
});
