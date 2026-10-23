import { MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES, MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES,
  normalizeVectorField3DDocument, parseScientificSceneManifest, sampleVectorField3DArrows,
  sampleVectorField3DScientificArrows, sha256Checksum, type Graph2DScientificVolume,
  type VectorField3DArrowArtifact, type VectorField3DDocument } from "@math3d/core";

export const MOBILE_VECTOR_FIELD_MAX_DISPLAY_GLYPHS = 512;
export type MobileScientificFileReader = (name: string) => Promise<Uint8Array | null>;

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const requireBytes = async (read: MobileScientificFileReader, name: string, limit: number) => {
  const bytes = await read(name);
  if (!bytes || bytes.byteLength < 1 || bytes.byteLength > limit)
    throw new TypeError(`Scientific bundle file missing or over budget: ${name}.`);
  return bytes;
};

/** Re-read manifest and every declared resource before publishing a source-bound arrow artifact. */
export async function verifyMobileVectorField3DBundle(document: VectorField3DDocument,
  read: MobileScientificFileReader): Promise<VectorField3DArrowArtifact> {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific vector bundle.");
  const envelopeBytes = await requireBytes(read, "bundle.json", 8192);
  const envelope = JSON.parse(decode(envelopeBytes)) as Record<string, unknown> | null;
  const descriptor = envelope?.manifest as Record<string, unknown> | undefined;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(",") !== "manifest,schema" ||
      envelope.schema !== "scientific-scene-bundle/v1" || !descriptor ||
      typeof descriptor !== "object" || Array.isArray(descriptor) ||
      Object.keys(descriptor).sort().join(",") !== "bytes,path,sha256" ||
      descriptor.path !== "manifest.json" || !Number.isSafeInteger(descriptor.bytes) ||
      Number(descriptor.bytes) < 1 || Number(descriptor.bytes) > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES ||
      typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256))
    throw new TypeError("Invalid scientific bundle manifest reference.");
  const manifestBytes = await requireBytes(read, "manifest.json", MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES);
  const fingerprint = sha256Checksum(manifestBytes).slice(7);
  if (manifestBytes.byteLength !== descriptor.bytes || fingerprint !== descriptor.sha256 ||
      fingerprint !== field.references[0].sceneFingerprint)
    throw new TypeError("Scientific manifest changed or failed verification.");
  const manifestJson = decode(manifestBytes);
  const parsed = parseScientificSceneManifest(manifestJson);
  if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
  const manifest = parsed.value;
  const dataset = manifest.datasets.find(item => item.id === field.references[0].datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || field.references.some(reference =>
        !dataset.components?.some(component => component.name === reference.component)))
    throw new TypeError("The saved complete 3D vector dataset is unavailable.");

  const selected = new Map<string, Uint8Array>();
  let total = 0;
  for (const resource of manifest.resources) {
    total += resource.bytes;
    if (total > MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES)
      throw new TypeError("Scientific bundle exceeds the mobile resource budget.");
    const bytes = await requireBytes(read, resource.path, MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES);
    if (bytes.byteLength !== resource.bytes || sha256Checksum(bytes).slice(7) !== resource.sha256)
      throw new TypeError(`Scientific resource changed or failed verification: ${resource.id}.`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.byteLength; offset += 8)
      if (!Number.isFinite(view.getFloat64(offset, true)))
        throw new TypeError(`Scientific resource contains an undefined value: ${resource.id}.`);
    if (dataset.components.some(component => component.resource === resource.id)) selected.set(resource.id, bytes);
  }

  const shape = dataset.shape as [number, number, number];
  const sampleShape = shape.map(size => Math.min(size, 32)) as [number, number, number];
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(index * (shape[axis]! - 1) / (count - 1))));
  const volumes = field.references.map(reference => {
    const component = dataset.components!.find(item => item.name === reference.component)!;
    const resource = manifest.resources.find(item => item.id === component.resource)!;
    const bytes = selected.get(resource.id);
    if (!bytes || bytes.byteLength !== shape[0] * shape[1] * shape[2] * 8)
      throw new TypeError(`Verified vector component is missing: ${reference.component}.`);
    const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values: number[] = [];
    const sampleBytes = new Uint8Array(sampleShape[0] * sampleShape[1] * sampleShape[2] * 8);
    const sampleView = new DataView(sampleBytes.buffer);
    for (const first of positions[0]!) for (const second of positions[1]!) for (const third of positions[2]!) {
      const value = source.getFloat64(((first * shape[1] + second) * shape[2] + third) * 8, true);
      sampleView.setFloat64(values.length * 8, value, true);
      values.push(value);
    }
    return { fingerprint, datasetId: dataset.id, component: reference.component,
      sourceShape: shape, sampleShape, resourceSha256: resource.sha256,
      sampleSha256: sha256Checksum(sampleBytes).slice(7), values } satisfies Graph2DScientificVolume;
  }) as unknown as [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];
  return sampleVectorField3DScientificArrows(checked.value, manifestJson, fingerprint, volumes);
}

export function sampleMobileVectorField3DExpressions(document: VectorField3DDocument): VectorField3DArrowArtifact {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  if (checked.value.source.field.kind !== "expressions")
    throw new TypeError("Scientific fields require a freshly verified bundle.");
  return sampleVectorField3DArrows(checked.value);
}

/** Uniformly show the verified domain, including its first and last samples, within the mobile GPU cap. */
export function mobileVectorField3DDisplayArrows(artifact: VectorField3DArrowArtifact) {
  const arrows = artifact.arrows;
  if (arrows.length <= MOBILE_VECTOR_FIELD_MAX_DISPLAY_GLYPHS) return arrows;
  return Array.from({ length: MOBILE_VECTOR_FIELD_MAX_DISPLAY_GLYPHS }, (_, index) =>
    arrows[Math.round(index * (arrows.length - 1) / (MOBILE_VECTOR_FIELD_MAX_DISPLAY_GLYPHS - 1))]!);
}
