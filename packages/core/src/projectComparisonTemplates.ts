import { createCommandEnvelope, projectCommandTransaction } from "./commands";
import { createGeometryDocument } from "./geometryDocument";
import { createMath3DProject, updateMath3DProjectMetadata, upsertMath3DProjectComposition } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import type { ProjectComposition, ProjectCoordinateFrame } from "./projectComposition";
import { createSurfaceDocument } from "./surfaceDocument";
import { SURFACE_COMMAND_TYPES, surfaceCommandDefinitions } from "./surfaceCommands";

/** Built-in comparison sources are ordinary hashed documents, not simulated viewer data. */
export const createProjectComparisonTemplate = (id: "coordinate-overlay-study" | "surface-generation-study", instanceKey: string) => {
  const stableKey = ["project-template", id, 1, instanceKey];
  const member = (document: { identity: ProjectComposition["members"][number]["expected"] }, color: string) => ({
    documentId: document.identity.id, expected: document.identity, visible: true, color, opacity: 0.8,
  });
  if (id === "coordinate-overlay-study") {
    const frame: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: "laboratory xyz", unit: "mm",
      axes: ["x", "y", "z"], handedness: "right" };
    const geometry = (name: string, objectId: string, x: number, coordinate?: ProjectCoordinateFrame) =>
      createGeometryDocument({ stableKey: [...stableKey, name], metadata: { title: name }, source: {
        geometry: null, objects: [{ id: objectId, type: objectId === "sphere" ? "sphere" : "box",
          params: objectId === "sphere" ? { radius: 0.8 } : { width: 1.5, height: 1.2, depth: 1 },
          transform: { position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }],
        surfaces: [], constructions: [], relationships: [], parameters: {},
        extensions: coordinate ? { math3dCoordinateFrame: coordinate } : {},
      }, display: { objects: { [objectId]: { name, visible: true, material: { color: objectId === "sphere" ? 0xe8793a : 0x3976d7, opacity: 1 } } } } });
    const a = geometry("A · declared mm box", "box", -0.65, frame);
    const b = geometry("B · matching mm sphere", "sphere", 0.65, frame);
    const mismatch = geometry("C · mismatched cm box", "box", 0.65, { ...frame, unit: "cm" });
    const legacy = geometry("D · undeclared sphere", "sphere", 0.65);
    const documents = [a, b, mismatch, legacy];
    const workspace = createMixedWorkspaceDocument({ entries: documents.map(document => ({ module: "geometry" as const,
      checkpoint: document, expected: document.identity, replay: null })), activeDocumentIds: [a.identity.id],
      constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
    let project = createMath3DProject(workspace, { stableKey, title: "Coordinate Overlay Verification" });
    project = updateMath3DProjectMetadata(project, { ...project.metadata,
      description: "Compare matching, mismatched, and undeclared Geometry coordinates without modifying their source documents.",
      tags: ["starter", id, "geometry", "comparison", "template-v1"],
      documents: Object.fromEntries(documents.map(document => [document.identity.id, { title: document.metadata.title }])) });
    for (const [name, second] of [["Verified A/B overlay", b], ["Unverified A/D overlay", legacy]] as const) {
      project = upsertMath3DProjectComposition(project, { id: `${id}:${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        title: name, mode: "overlay", alignment: { frame: frame.frame, unit: frame.unit },
        members: [member(a, "#3976d7"), member(second, "#e8793a")] });
    }
    return project;
  }
  const source = { representation: "parametric" as const,
    domain: { kind: "parameter", u: { min: -1.5, max: 1.5, periodic: false }, v: { min: -1.5, max: 1.5, periodic: false } },
    units: { length: "unitless" }, orientation: { sign: 1 }, parameters: {}, branchPolicy: null,
    definition: { familyId: "literal", expressions: { x: "u", y: "v", z: "0.2*(u*u+v*v)" } } };
  const before = createSurfaceDocument({ stableKey: [...stableKey, "surface"], metadata: { title: "Bowl → saddle" }, source });
  const afterSource = { ...source, definition: { ...source.definition, expressions: { ...source.definition.expressions, z: "0.2*(u*u-v*v)" } } };
  const forward = createCommandEnvelope({ commandId: "surface/edit/1/forward", origin: { kind: "interactive", sourceId: "surface-workspace" },
    command: { type: SURFACE_COMMAND_TYPES.replaceSource, payload: afterSource } });
  const inverse = createCommandEnvelope({ commandId: "surface/edit/1/inverse", origin: { kind: "system", sourceId: "surface-undo" },
    command: { type: SURFACE_COMMAND_TYPES.replaceSource, payload: source } });
  const projection = projectCommandTransaction(before, [forward], surfaceCommandDefinitions, "replay");
  if (!projection.ok) throw new TypeError("Built-in Surface generation could not be replayed.");
  const after = projection.state;
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: before, expected: after.identity,
    replay: { format: "math3d.surface-replay.v1", payload: { checkpoint: before, transactions: [{ forward, inverse }], cursor: 1 } } }],
    activeDocumentIds: [before.identity.id], constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
  let project = createMath3DProject(workspace, { stableKey, title: "Surface Generation Comparison" });
  project = updateMath3DProjectMetadata(project, { ...project.metadata,
    description: "Compare a retained bowl checkpoint with the current saddle using the same verified parameter chart.",
    tags: ["starter", id, "surface", "comparison", "template-v1"], documents: { [before.identity.id]: { title: "Bowl → saddle" } } });
  return upsertMath3DProjectComposition(project, { id: `${id}:before-after`, title: "Before / after · linked u,v", mode: "side-by-side",
    members: [member(before, "#3976d7"), member(after, "#e8793a")] });
};
