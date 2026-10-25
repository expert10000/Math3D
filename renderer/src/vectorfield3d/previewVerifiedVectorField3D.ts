import { sampleVectorField3DScientificArrows, type VectorField3DArrowArtifact,
  type VectorField3DDocument,
  type VectorField3DVolumes } from "@math3d/core";

type PreviewBridge = Pick<NonNullable<Window["scientificScenes"]>, "previewVectorVolume">;
type VerifiedPreview = Readonly<{ artifact: VectorField3DArrowArtifact;
  volumes: VectorField3DVolumes }>;

/** The first transfer is limited by the authored glyph density; every stage is verified before display. */
export async function previewVerifiedVectorField3D(document: VectorField3DDocument,
  manifestJson: string, fingerprint: string, bridge: PreviewBridge,
  onInitial: (preview: VerifiedPreview) => void,
  yieldForPaint: () => Promise<void> = () => Promise.resolve()): Promise<VerifiedPreview> {
  if (document.source.field.kind !== "scientific-bundle")
    throw new TypeError("Progressive preview requires a scientific vector bundle.");
  const references = document.source.field.references;
  const sampleLimit = Math.max(8, ...document.source.display.density);
  const request = { fingerprint, datasetId: references[0].datasetId,
    components: references.map(reference => reference.component) as [string, string, string] };
  const initialVolumes = await bridge.previewVectorVolume({ ...request, sampleLimit });
  const initial = { artifact: sampleVectorField3DScientificArrows(document,
    manifestJson, fingerprint, initialVolumes), volumes: initialVolumes };
  const needsRefinement = references[0].shape.some(size => Math.min(size, 32) > sampleLimit);
  if (!needsRefinement) return initial;
  onInitial(initial);
  await yieldForPaint();
  const volumes = await bridge.previewVectorVolume(request);
  const artifact = sampleVectorField3DScientificArrows(document, manifestJson, fingerprint, volumes);
  if (artifact.verifiedSamples?.sourceHash !== initial.artifact.verifiedSamples?.sourceHash)
    throw new Error("Scientific field source changed during preview refinement.");
  return { artifact, volumes };
}
