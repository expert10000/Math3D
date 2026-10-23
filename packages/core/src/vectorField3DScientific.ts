import { canonicalJsonStringify } from "./documentIdentity";
import { createGraph2DFieldReference } from "./graph2dFieldReference";
import { verifyGraph2DScientificVolume, type Graph2DScientificVolume } from "./graph2dScientificDataset";
import { parseScientificSceneManifest } from "./scientificSceneManifest";
import { normalizeVectorField3DDocument, type VectorField3DArrowArtifact,
  type VectorField3DDocument } from "./vectorField3DDocument";

export type VectorField3DVolumes = readonly [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];

/** The host must re-open and verify one bundle for this complete transfer before calling this function. */
export function verifyVectorField3DVolumes(document: VectorField3DDocument, manifestJson: string,
  fingerprint: string, volumes: VectorField3DVolumes): VectorField3DVolumes {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific bundle vector field.");
  const manifest = parseScientificSceneManifest(manifestJson);
  if (!manifest.ok) throw new TypeError(manifest.errors.join(" "));
  const dataset = manifest.value.datasets.find(item => item.id === field.references[0].datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 || dataset.components?.length !== 3 ||
      volumes.length !== 3 || field.references.some(reference => reference.sceneFingerprint !== fingerprint))
    throw new TypeError("Scientific source is not the saved complete 3D vector field.");
  field.references.forEach((saved, index) => {
    const fresh = createGraph2DFieldReference(manifestJson, fingerprint, saved.locator,
      saved.datasetId, saved.component);
    if (canonicalJsonStringify(saved) !== canonicalJsonStringify(fresh))
      throw new TypeError(`Scientific source changed for component ${saved.component}.`);
    const volume = verifyGraph2DScientificVolume(manifestJson, fingerprint, volumes[index]);
    if (volume.datasetId !== saved.datasetId || volume.component !== saved.component ||
        volume.resourceSha256 !== saved.resourceSha256 ||
        volume.sourceShape.some((size, axis) => size !== saved.shape[axis]))
      throw new TypeError(`Scientific volume changed for component ${saved.component}.`);
  });
  const sampleShape = volumes[0].sampleShape;
  if (volumes.some(volume => volume.sampleShape.some((size, axis) => size !== sampleShape[axis])))
    throw new TypeError("Scientific vector components have incompatible sample lattices.");
  return volumes;
}

/** Samples only the checked transfer lattice; no interpolation or unverified source reads occur here. */
export function sampleVectorField3DScientificArrows(document: VectorField3DDocument, manifestJson: string,
  fingerprint: string, volumes: VectorField3DVolumes): VectorField3DArrowArtifact {
  const checked = verifyVectorField3DVolumes(document, manifestJson, fingerprint, volumes);
  const source = document.source, field = source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific bundle vector field.");
  const density = source.display.density;
  const evaluated = density[0] * density[1] * density[2];
  if (evaluated > source.display.maxGlyphs || density.some((size, axis) => size > checked[0].sampleShape[axis]!))
    throw new TypeError("3D arrow density exceeds the verified sample lattice or glyph budget.");
  const arrows: VectorField3DArrowArtifact["arrows"][number][] = [];
  let stationary = 0;
  for (let i = 0; i < density[0]; i++) for (let j = 0; j < density[1]; j++) for (let k = 0; k < density[2]; k++) {
    const sampled = [i, j, k].map((index, axis) =>
      Math.round(index * (checked[0].sampleShape[axis]! - 1) / (density[axis]! - 1)));
    const index = (sampled[0]! * checked[0].sampleShape[1] + sampled[1]!) * checked[0].sampleShape[2] + sampled[2]!;
    const position = sampled.map((sampleIndex, axis) => {
      const referenceAxis = field.references[0].axes[axis]!;
      const sourceIndex = Math.round(sampleIndex * (checked[0].sourceShape[axis]! - 1) /
        (checked[0].sampleShape[axis]! - 1));
      return referenceAxis.origin + sourceIndex * referenceAxis.spacing;
    }) as [number, number, number];
    const vector = checked.map(volume => volume.values[index]!) as [number, number, number];
    const magnitude = Math.hypot(...vector);
    if (!Number.isFinite(magnitude)) throw new TypeError("Scientific vector magnitude is non-finite.");
    const kind = magnitude === 0 ? "stationary" : "arrow";
    if (kind === "stationary") stationary++;
    arrows.push({ position, vector, magnitude, kind });
  }
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash }, density, evaluated, accepted: arrows.length,
    rejected: 0, stationary, arrows, coordinateUnits: source.axes.map(axis => axis.unit) as [string, string, string],
    componentUnits: field.componentUnits, timeUnit: source.timeUnit,
    magnitudeScale: source.display.magnitudeScale, colorBy: source.display.colorBy };
}
