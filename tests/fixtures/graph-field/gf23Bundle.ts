import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendProjectDerivedField, createGraph2DFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createStableDocumentId, createVectorField3DDocument,
  sha256Checksum, upsertProjectScientificSelection,
  type Graph2DFieldReference, type Graph2DFieldLocator, type VectorField3DSource,
  type VectorField3DVolumes, type VerifiedVectorFieldTransfer,
} from "../../../packages/core/src/index";

const root = fileURLToPath(new URL("../scientific-scene/vortex-volume.sscene/", import.meta.url));
export const gf23ManifestJson = readFileSync(resolve(root, "manifest.json"), "utf8");
export const gf23Fingerprint = sha256Checksum(new TextEncoder().encode(gf23ManifestJson)).slice(7);
const manifest = JSON.parse(gf23ManifestJson) as { resources: readonly Readonly<{
  id: string; path: string; sha256: string }> [] };
const names = ["east", "north", "up"] as const;
const shape = [21, 21, 17] as const;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const gf23Transfer = (): VerifiedVectorFieldTransfer => ({
  manifestJson: gf23ManifestJson, fingerprint: gf23Fingerprint,
  volumes: names.map(name => {
    const resource = manifest.resources.find(item => item.id === name)!;
    const bytes = readFileSync(resolve(root, resource.path));
    if (hash(bytes) !== resource.sha256) throw new TypeError("Bundled fixture resource changed.");
    const values = Array.from({ length: bytes.byteLength / 8 }, (_, i) => bytes.readDoubleLE(i * 8));
    return { fingerprint: gf23Fingerprint, datasetId: "field", component: name,
      sourceShape: shape, sampleShape: shape, resourceSha256: resource.sha256,
      sampleSha256: hash(bytes), values };
  }) as unknown as VectorField3DVolumes,
});
const references = names.map(name => createGraph2DFieldReference(gf23ManifestJson,
  gf23Fingerprint, { kind: "preset", value: "vortexVolume" }, "field", name)) as
  [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
const source: VectorField3DSource = {
  axes: (["x", "y", "z"] as const).map((role, index) => ({ role, label: role,
    unit: "m", min: index === 2 ? -3 : -4, max: index === 2 ? 3 : 4 })) as
    unknown as VectorField3DSource["axes"],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
    maxSteps: 1000, maxTime: 1 },
};
export const gf23Ids = {
  magnitude: createStableDocumentId("derived-field", "gf23-magnitude"),
  slice: createStableDocumentId("derived-field", "gf23-slice"),
  profile: createStableDocumentId("derived-field", "gf23-profile"),
};
export function createGf23Project(locator: Graph2DFieldLocator =
  { kind: "preset", value: "vortexVolume" }) {
  const referencesForLocator = names.map(name => createGraph2DFieldReference(gf23ManifestJson,
    gf23Fingerprint, locator, "field", name)) as
    [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
  const currentSource = { ...source, field: { ...source.field,
    references: referencesForLocator } } as VectorField3DSource;
  const document = createVectorField3DDocument(currentSource, { stableKey: "gf23-bundled-vortex" });
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d", checkpoint: document,
    expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id],
    constructions: [], results: [], relations: [], artifacts: [], committedSelection: null });
  const base = createMath3DProject(workspace, { stableKey: "gf23-bundled-project" });
  const verified = () => true;
  const magnitude = appendProjectDerivedField(base, document.identity.id,
    { kind: "vector-magnitude" }, { stableKey: "gf23-magnitude", title: "Speed" }, verified);
  const slice = appendProjectDerivedField(magnitude, gf23Ids.magnitude,
    { kind: "plane-slice", normalAxis: 2, coordinate: 0, interpolation: "linear" },
    { stableKey: "gf23-slice", title: "Speed at z = 0 m" }, verified);
  const profile = appendProjectDerivedField(slice, gf23Ids.slice,
    { kind: "line-profile", varyingAxis: 0, fixedCoordinate: 0,
      extent: [-4, 4], samples: 21, interpolation: "linear" },
    { stableKey: "gf23-profile", title: "Vortex speed along x" }, verified);
  return upsertProjectScientificSelection(profile, {
    format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "authored", id: createStableDocumentId("scientific-selection",
      "gf23-bundled-line") }, role: "analysis",
    source: { kind: "document", documentId: document.identity.id,
      checkpoint: { revision: document.identity.revision,
        structuralHash: document.identity.structuralHash } },
    frame: { kind: "cartesian", axes: source.axes.map(axis =>
      ({ name: axis.label, unit: axis.unit })) },
    geometry: { kind: "axis-line", varyingAxis: 0,
      fixedCoordinates: [null, 0, 0], extent: [-4, 4] },
  });
}
