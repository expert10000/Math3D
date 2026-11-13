import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import { createGraph2DFieldReference, type Graph2DFieldReference } from "./graph2dFieldReference";
import { parseScientificSceneManifest, MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES } from "./scientificSceneManifest";
import { verifyVectorField3DVolumes } from "./vectorField3DScientific";
import type { Graph2DScientificVolume } from "./graph2dScientificDataset";
import type { VerifiedVectorFieldTransfer } from "./verifiedVectorFieldSampling";
import type { VectorField3DDocument } from "./vectorField3DDocument";
import type { Math3DProject } from "./math3dProject";

export type ScientificProjectResourceReader = (item: { kind: string; id: string }) => Uint8Array | null;
export const SCIENTIFIC_MANIFEST_ENCODING = "scientific-scene.manifest.v1.json.utf8";
export const SCIENTIFIC_COMPONENT_ENCODING = "scientific-scene.component.v1.f64le";
/** First portable slice: complete small v1 vector grids, not tiled/partial previews. */
export const PORTABLE_SCIENTIFIC_AXIS_LIMIT = 32;
export const scientificManifestResource = (reference: Graph2DFieldReference) =>
  ({ kind: "scientific-manifest" as const, id: reference.sceneFingerprint });
export const scientificComponentResource = (reference: Graph2DFieldReference) =>
  ({ kind: "scientific-component" as const, id: reference.resourceSha256 });

function smallReference(reference: Graph2DFieldReference) {
  if (reference.semanticType !== "vector-field" || reference.shape.length !== 3 ||
      reference.shape.some(size => size < 2 || size > PORTABLE_SCIENTIFIC_AXIS_LIMIT))
    throw new TypeError("Portable scientific packages support complete vector grids with 2–32 samples per axis.");
}

export function verifyScientificManifestResource(reference: Graph2DFieldReference, bytes: Uint8Array): string {
  smallReference(reference);
  if (bytes.length > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES ||
      sha256Checksum(bytes) !== `sha256:${reference.sceneFingerprint}`)
    throw new TypeError("Packaged scientific manifest checksum or size does not match its source.");
  const manifestJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = parseScientificSceneManifest(manifestJson);
  if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
  if (parsed.value.schema !== "scientific-scene/v1")
    throw new TypeError("Portable scientific packages currently support complete v1 vector bundles.");
  const fresh = createGraph2DFieldReference(manifestJson, reference.sceneFingerprint,
    reference.locator, reference.datasetId, reference.component);
  if (canonicalJsonStringify(fresh) !== canonicalJsonStringify(reference))
    throw new TypeError("Packaged scientific manifest differs from its pinned source.");
  return manifestJson;
}

export function verifyScientificComponentResource(reference: Graph2DFieldReference, bytes: Uint8Array): void {
  smallReference(reference);
  if (bytes.length !== reference.shape.reduce((n, size) => n * size, 8) ||
      sha256Checksum(bytes) !== `sha256:${reference.resourceSha256}`)
    throw new TypeError("Packaged scientific component checksum or shape does not match its source.");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length; i += 8) if (!Number.isFinite(data.getFloat64(i, true)))
    throw new TypeError("Packaged scientific component contains a non-finite value.");
}

function encodeValues(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, i) => view.setFloat64(i * 8, value, true));
  return bytes;
}

export function hasPackagedScientificField(document: VectorField3DDocument, reader: ScientificProjectResourceReader): boolean {
  const field = document.source.field;
  return field.kind === "scientific-bundle" && (!!reader(scientificManifestResource(field.references[0])) ||
    field.references.some(reference => !!reader(scientificComponentResource(reference))));
}

/** Rebuild the ordinary verified transfer from source bytes, never from a saved preview. */
export function readPackagedScientificField(document: VectorField3DDocument,
  reader: ScientificProjectResourceReader, sampleLimit = 32): VerifiedVectorFieldTransfer {
  const field = document.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("A scientific vector source is required.");
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 2 || sampleLimit > 32)
    throw new TypeError("Invalid scientific sample limit.");
  const references = field.references, fingerprint = references[0].sceneFingerprint;
  const manifestBytes = reader(scientificManifestResource(references[0]));
  if (!manifestBytes) throw new TypeError("Required packaged scientific manifest is missing.");
  const manifestJson = verifyScientificManifestResource(references[0], manifestBytes);
  const readVolume = (reference: Graph2DFieldReference): Graph2DScientificVolume => {
    verifyScientificManifestResource(reference, manifestBytes);
    const bytes = reader(scientificComponentResource(reference));
    if (!bytes) throw new TypeError(`Required packaged scientific component '${reference.component}' is missing.`);
    verifyScientificComponentResource(reference, bytes);
    const sourceShape = [...reference.shape] as [number, number, number];
    const sampleShape = sourceShape.map(size => Math.min(size, sampleLimit)) as [number, number, number];
    const values: number[] = [], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let x = 0; x < sampleShape[0]; x++) for (let y = 0; y < sampleShape[1]; y++) for (let z = 0; z < sampleShape[2]; z++) {
      const point = [x, y, z].map((index, axis) => Math.round(index * (sourceShape[axis]! - 1) / (sampleShape[axis]! - 1)));
      values.push(view.getFloat64(((point[0]! * sourceShape[1] + point[1]!) * sourceShape[2] + point[2]!) * 8, true));
    }
    return { fingerprint, datasetId: reference.datasetId, component: reference.component,
      sourceShape, sampleShape, sampleLimit, resourceSha256: reference.resourceSha256,
      sampleSha256: sha256Checksum(encodeValues(values)).slice(7), values } satisfies Graph2DScientificVolume;
  };
  const volumes: [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume] =
    [readVolume(references[0]), readVolume(references[1]), readVolume(references[2])];
  verifyVectorField3DVolumes(document, manifestJson, fingerprint, volumes);
  return { manifestJson, fingerprint, volumes };
}

/** Capture only whole verified source bytes; a decimated transfer is never exported as a source. */
export function captureScientificFieldBytes(document: VectorField3DDocument, transfer: VerifiedVectorFieldTransfer) {
  const field = document.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("A scientific vector source is required.");
  verifyVectorField3DVolumes(document, transfer.manifestJson, transfer.fingerprint, transfer.volumes);
  const manifestBytes = new TextEncoder().encode(transfer.manifestJson);
  verifyScientificManifestResource(field.references[0], manifestBytes);
  return [{ ...scientificManifestResource(field.references[0]), bytes: manifestBytes },
    ...field.references.map((reference, index) => {
      const volume = transfer.volumes[index];
      if (volume.sampleShape.some((size, axis) => size !== reference.shape[axis]))
        throw new TypeError("Portable export requires the complete scientific source, not a decimated preview.");
      const bytes = encodeValues(volume.values);
      verifyScientificComponentResource(reference, bytes);
      return { ...scientificComponentResource(reference), bytes };
    })];
}

export function projectHasScientificFields(project: Math3DProject): boolean {
  return project.workspace.entries.some(entry => entry.checkpoint.format === "math3d.vector-field3d-document" &&
    entry.checkpoint.source.field.kind === "scientific-bundle");
}

/** Portable package v2 promises all required scientific sources, including baseline checkpoints. */
export function assertScientificProjectResources(project: Math3DProject, reader: ScientificProjectResourceReader): void {
  for (const entry of project.workspace.entries) if (entry.checkpoint.format === "math3d.vector-field3d-document" &&
      entry.checkpoint.source.field.kind === "scientific-bundle") readPackagedScientificField(entry.checkpoint, reader);
}
