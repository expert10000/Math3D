import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { captureProjectResources, createGraph2DFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createVectorField3DDocument, defaultVectorField3DWorkspace,
  exportProjectPackage, parseMath3DProject, reviseVectorField3DWorkspace, sha256Checksum,
  createStableDocumentId, upsertProjectScientificSelection,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

/** Real component bytes, with a deliberately unavailable original host path. */
export function portableScientificProjectFixture() {
  // Both the repository Playwright command and `npm --prefix renderer test` use this fixture.
  const fixtures = [resolve("tests/fixtures"), resolve("../tests/fixtures")].find(root =>
    existsSync(join(root, "graph-field/gf23-bundled-profile.math3d")));
  if (!fixtures) throw new Error("Run scientific Project tests from the repository or renderer directory.");
  const directory = join(fixtures, "scientific-scene/vortex-volume.sscene");
  const manifestBytes = new Uint8Array(readFileSync(join(directory, "manifest.json")));
  const manifestJson = new TextDecoder().decode(manifestBytes), fingerprint = sha256Checksum(manifestBytes).slice(7);
  const legacy = parseMath3DProject(readFileSync(join(fixtures, "graph-field/gf23-bundled-profile.math3d"), "utf8"));
  const original = legacy.workspace.entries[0]!.checkpoint as VectorField3DDocument;
  if (original.source.field.kind !== "scientific-bundle") throw new Error("Expected the vector fixture.");
  const relink = (reference: typeof original.source.field.references[number]) => createGraph2DFieldReference(
    manifestJson, fingerprint, { kind: "directory", value: "Z:/unavailable-source-machine/vortex.sscene" },
    reference.datasetId, reference.component);
  const references = [relink(original.source.field.references[0]), relink(original.source.field.references[1]),
    relink(original.source.field.references[2])] as const;
  const field = createVectorField3DDocument({ ...original.source,
    field: { ...original.source.field, references } }, { stableKey: "portable-scientific-source-A" });
  const document = reviseVectorField3DWorkspace(field, { ...defaultVectorField3DWorkspace(field.source),
    selectedLayer: "xy", probe: [0, 0, 0] });
  const base = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
    constructions: [], committedSelection: null }), { stableKey: "portable-scientific-project", title: "Portable vortex field" });
  const project = upsertProjectScientificSelection(base, {
    format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "authored", id: createStableDocumentId("scientific-selection", "portable-axis-line") },
    role: "analysis", source: { kind: "document", documentId: document.identity.id,
      checkpoint: { revision: document.identity.revision, structuralHash: document.identity.structuralHash } },
    frame: { kind: "cartesian", axes: document.source.axes.map(axis => ({ name: axis.label, unit: axis.unit })) },
    geometry: { kind: "axis-line", varyingAxis: 0, fixedCoordinates: [null, 0, 0], extent: [-4, 4] },
  });
  const bytes = new Map<string, Uint8Array>([[`scientific-manifest:${fingerprint}`, manifestBytes]]);
  for (const resource of JSON.parse(manifestJson).resources) bytes.set(`scientific-component:${resource.sha256}`,
    new Uint8Array(readFileSync(join(directory, resource.path))));
  const read = (item: { kind: string; id: string }) => bytes.get(`${item.kind}:${item.id}`)?.slice() ?? null;
  const resourcesFor = (owner: Math3DProject) => captureProjectResources(owner, read);
  const resources = resourcesFor(project);
  return { project, document, read, resourcesFor, resources, raw: exportProjectPackage(project, resources) };
}
