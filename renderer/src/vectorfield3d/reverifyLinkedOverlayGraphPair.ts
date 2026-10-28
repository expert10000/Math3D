import { canonicalJsonStringify, createGraph2DFieldReference,
  inspectGraph2DFieldReference, parseVectorField3DDocument, scientificCoordinateIndex,
  sampleVectorField3DSlice, structuralHash,
  verifyGraph2DScientificVolume, verifyVectorField3DSparseSamples,
  verifyVectorField3DVolumes, type Graph2DLinkedOverlayOrigin,
  type Graph2DScientificVolume, type VectorField3DLinkedLineProfile } from "@math3d/core";
import { cachedVerifiedVectorField3DSlice, type VerifiedVectorTransfer } from "./verifiedDerivedResultCache";
import { sampleLinkedOverlayLineProfile, sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewVectorSamples" | "previewVectorVolume" |
  "previewGraphVolume" | "closeGraphDataset">;

/** Recheck both saved resources and the exact vector slice samples backing a Graphs pair. */
export async function reverifyLinkedOverlayGraphPair(origin: Graph2DLinkedOverlayOrigin,
  scalarOrigin: Graph2DLinkedOverlayOrigin,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<void> {
  if (!bridge?.openGraphDatasetReference || !bridge.previewGraphVolume ||
      !bridge.closeGraphDataset) throw new TypeError("Linked Graphs lines need the desktop source verifier.");
  const document = parseVectorField3DDocument(origin.vectorDocumentJson);
  const field = document.source.field;
  const overlay = document.workspace?.scalarOverlay;
  const linkedRecipe = document.workspace?.linkedLineProfile;
  if (!overlay || !linkedRecipe || origin.series !== "vector" || scalarOrigin.series !== "scalar" ||
      origin.pairId !== scalarOrigin.pairId ||
      canonicalJsonStringify(overlay.reference) !== canonicalJsonStringify(origin.scalarReference) ||
      overlay.unit !== scalarOrigin.yUnit ||
      canonicalJsonStringify(linkedRecipe) !== canonicalJsonStringify(origin.profile) ||
      structuralHash({ vector: field, scalar: origin.scalarReference, profile: origin.profile,
        vectorSamples: origin.vectorSamples, scalarSampleSha256: origin.scalarSampleSha256 }) !== origin.pairId)
    throw new TypeError("Saved linked Graphs source or physical line recipe changed.");
  let vectorTransfer: VerifiedVectorTransfer | undefined;
  if (field.kind === "scientific-bundle") {
    const refs = field.references;
    const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
      sceneFingerprint: refs[0].sceneFingerprint });
    if (!opened.ok) throw new Error(`Saved vector source ${opened.status}: ${opened.error}`);
    try {
      for (const ref of refs) {
        const fresh = createGraph2DFieldReference(opened.source.manifestJson,
          opened.source.fingerprint, ref.locator, ref.datasetId, ref.component);
        if (canonicalJsonStringify(ref) !== canonicalJsonStringify(fresh))
          throw new TypeError(`Saved vector source changed for ${ref.component}.`);
      }
      const schema = JSON.parse(opened.source.manifestJson).schema;
      let samples: readonly Readonly<{ name: string; sampleSha256: string }>[];
      if (schema === "scientific-scene/v1") {
        if (!bridge.previewVectorVolume) throw new TypeError("Vector volume verifier is unavailable.");
        const volumes = await bridge.previewVectorVolume({ fingerprint: opened.source.fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string] });
        const checked = verifyVectorField3DVolumes(document, opened.source.manifestJson,
          opened.source.fingerprint, volumes);
        samples = checked.map(part => ({ name: part.component, sampleSha256: part.sampleSha256 }));
        vectorTransfer = { manifestJson: opened.source.manifestJson,
          fingerprint: opened.source.fingerprint, volumes };
      } else {
        if (!bridge.previewVectorSamples) throw new TypeError("Vector slice verifier is unavailable.");
        const axis = origin.profile.normalAxis;
        const fixedIndex = scientificCoordinateIndex({ ...refs[0].axes[axis]!, count: refs[0].shape[axis]! },
          origin.profile.point[axis]!);
        const sparse = await bridge.previewVectorSamples({ fingerprint: opened.source.fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string],
          selection: { kind: "slice", normalAxis: axis, fixedIndex } });
        const checked = verifyVectorField3DSparseSamples(document, opened.source.manifestJson,
          opened.source.fingerprint, sparse);
        samples = checked.components.map(part => ({ name: part.name, sampleSha256: part.sampleSha256 }));
        vectorTransfer = { manifestJson: opened.source.manifestJson,
          fingerprint: opened.source.fingerprint, samples: sparse };
      }
      if (canonicalJsonStringify(samples) !== canonicalJsonStringify(origin.vectorSamples))
        throw new TypeError("Saved vector slice samples changed.");
    } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
  } else if (origin.vectorSamples.length !== 0)
    throw new TypeError("Analytic vector line has unexpected scientific samples.");
  const ref = origin.scalarReference;
  const opened = await bridge.openGraphDatasetReference({ locator: ref.locator,
    sceneFingerprint: ref.sceneFingerprint });
  if (!opened.ok) throw new Error(`Saved scalar source ${opened.status}: ${opened.error}`);
  let scalarVolume: Graph2DScientificVolume;
  try {
    if (inspectGraph2DFieldReference(ref, opened.source.manifestJson) !== "current")
      throw new TypeError("Saved scalar source metadata or resource hash changed.");
    const volume = await bridge.previewGraphVolume({ fingerprint: opened.source.fingerprint,
      datasetId: ref.datasetId, component: ref.component });
    const checked = verifyGraph2DScientificVolume(opened.source.manifestJson,
      opened.source.fingerprint, volume);
    if (checked.sampleSha256 !== origin.scalarSampleSha256)
      throw new TypeError("Saved scalar samples changed.");
    scalarVolume = checked;
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
  const profile = origin.profile as VectorField3DLinkedLineProfile;
  const axis = profile.normalAxis, fixedCoordinate = profile.point[axis];
  const slice = field.kind === "expressions" ? sampleVectorField3DSlice(document, axis, fixedCoordinate) :
    cachedVerifiedVectorField3DSlice(document, axis, fixedCoordinate, "component", vectorTransfer!);
  const plane = sampleSliceOverlayVectorPlane(document, slice, vectorTransfer);
  const line = sampleLinkedOverlayLineProfile(document, slice, profile, plane,
    ref, scalarVolume, scalarOrigin.yUnit);
  const rows = (series: "vector" | "scalar") => line.rows.map((row, index) => ({
    id: `row_${index + 1}`, x: row.coordinate, y: row[series] }));
  if (line.vectorSourceHash !== origin.vectorSourceHash ||
      line.vectorUnit !== origin.yUnit || line.scalarUnit !== scalarOrigin.yUnit ||
      line.coordinateUnit !== origin.xUnit || line.coordinateUnit !== scalarOrigin.xUnit ||
      structuralHash(rows("vector")) !== origin.rowsSha256 ||
      structuralHash(rows("scalar")) !== scalarOrigin.rowsSha256)
    throw new TypeError("Saved linked Graphs rows differ from the verified sources.");
}
