import { canonicalJsonStringify, createGraph2DFieldReference,
  inspectGraph2DFieldReference, parseVectorField3DDocument,
  sampleVectorField3DSlice, scientificCoordinateIndex, sha256Checksum,
  verifyGraph2DScientificVolume,
  verifyVectorField3DSparseSamples, verifyVectorField3DVolumes,
  type Graph2DLinkedRegionOrigin, type Graph2DScientificVolume } from "@math3d/core";
import { cachedVerifiedVectorField3DSlice, type VerifiedVectorTransfer } from
  "./verifiedDerivedResultCache";
import { sampleOverlayRegion, sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";
import { linkedOverlayRegionGraphPair } from "./linkedOverlayRegionGraphPair";

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference" | "openGraphDatasetReference" |
  "previewVectorSamples" | "previewVectorVolume" | "previewGraphVolume" |
  "closeGraphDataset">;

/** Recompute both saved column profiles from fully checked sources and pinned point rows. */
export async function reverifyLinkedOverlayRegionGraphPair(vectorOrigin: Graph2DLinkedRegionOrigin,
  overlayOrigin: Graph2DLinkedRegionOrigin,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<void> {
  if (!bridge?.checkGraphDatasetReference || !bridge.openGraphDatasetReference ||
      !bridge.previewGraphVolume || !bridge.closeGraphDataset)
    throw new TypeError("Linked region Graphs profiles need the desktop source verifier.");
  if (vectorOrigin.series !== "vector" ||
      overlayOrigin.series !== (vectorOrigin.kind === "vector-complex-linked-region/v1" ?
        "complex" : "scalar") || vectorOrigin.kind !== overlayOrigin.kind ||
      vectorOrigin.pairId !== overlayOrigin.pairId ||
      canonicalJsonStringify({ ...vectorOrigin, series: "vector", yUnit: "", rowsSha256: "" }) !==
        canonicalJsonStringify({ ...overlayOrigin, series: "vector", yUnit: "", rowsSha256: "" }))
    throw new TypeError("Saved linked region pair is incomplete or misaligned.");
  const document = parseVectorField3DDocument(vectorOrigin.vectorDocumentJson);
  const field = document.source.field, region = document.workspace?.overlayRegion;
  if (!region || canonicalJsonStringify(region) !== canonicalJsonStringify(vectorOrigin.region))
    throw new TypeError("Saved linked region physical bounds changed.");
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = document.workspace?.complexOverlay?.visible ? document.workspace.complexOverlay : null;
  if (vectorOrigin.kind === "vector-scalar-linked-region/v1" ?
      !scalar || !!complex || canonicalJsonStringify(scalar.reference) !==
        canonicalJsonStringify(vectorOrigin.scalarReference) :
      !complex || !!scalar || complex.mode !== vectorOrigin.mode ||
        canonicalJsonStringify(complex.real) !== canonicalJsonStringify(vectorOrigin.realReference) ||
        canonicalJsonStringify(complex.imaginary) !==
          canonicalJsonStringify(vectorOrigin.imaginaryReference))
    throw new TypeError("Saved linked region overlay recipe changed.");
  const checkSource = async (reference: { locator: import("@math3d/core").Graph2DFieldLocator;
    sceneFingerprint: string }) => {
    const checked = await bridge.checkGraphDatasetReference({ locator: reference.locator,
      sceneFingerprint: reference.sceneFingerprint, verifyResources: true });
    if (!checked.ok) throw new Error(`Saved linked region source ${checked.status}: ${checked.error}`);
  };
  let vectorTransfer: VerifiedVectorTransfer | undefined;
  let sliceTransfer: VerifiedVectorTransfer | undefined;
  if (field.kind === "scientific-bundle") {
    const refs = field.references;
    await checkSource(refs[0]);
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
        const verified = verifyVectorField3DVolumes(document, opened.source.manifestJson,
          opened.source.fingerprint, volumes);
        samples = verified.map(part => ({ name: part.component, sampleSha256: part.sampleSha256 }));
        vectorTransfer = { manifestJson: opened.source.manifestJson,
          fingerprint: opened.source.fingerprint, volumes };
        sliceTransfer = vectorTransfer;
      } else {
        if (!bridge.previewVectorSamples) throw new TypeError("Vector slice verifier is unavailable.");
        const axis = region.normalAxis;
        const fixedIndex = scientificCoordinateIndex({ ...refs[0].axes[axis]!,
          count: refs[0].shape[axis]! }, region.fixedCoordinate);
        const arrowSamples = await bridge.previewVectorSamples({ fingerprint: opened.source.fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string],
          selection: { kind: "slice", normalAxis: axis, fixedIndex } });
        const verified = verifyVectorField3DSparseSamples(document, opened.source.manifestJson,
          opened.source.fingerprint, arrowSamples);
        samples = verified.components.map(part => ({ name: part.name,
          sampleSha256: part.sampleSha256 }));
        vectorTransfer = { manifestJson: opened.source.manifestJson,
          fingerprint: opened.source.fingerprint, samples: arrowSamples };
        const channel = document.workspace?.sliceChannel ?? "component";
        if (channel === "component") sliceTransfer = vectorTransfer;
        else {
          const stencil = await bridge.previewVectorSamples({ fingerprint: opened.source.fingerprint,
            datasetId: refs[0].datasetId,
            components: refs.map(ref => ref.component) as [string, string, string],
            selection: { kind: schema === "scientific-scene/v3" ?
              "source-stencil-slice" : "stencil-slice", normalAxis: axis, fixedIndex } });
          verifyVectorField3DSparseSamples(document, opened.source.manifestJson,
            opened.source.fingerprint, stencil);
          sliceTransfer = { manifestJson: opened.source.manifestJson,
            fingerprint: opened.source.fingerprint, samples: stencil };
        }
      }
      if (canonicalJsonStringify(samples) !== canonicalJsonStringify(vectorOrigin.vectorSamples))
        throw new TypeError("Saved linked region vector samples changed.");
    } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
  } else if (vectorOrigin.vectorSamples.length)
    throw new TypeError("Analytic linked region has unexpected vector samples.");
  const reference = vectorOrigin.kind === "vector-scalar-linked-region/v1" ?
    vectorOrigin.scalarReference : vectorOrigin.realReference;
  await checkSource(reference);
  const opened = await bridge.openGraphDatasetReference({ locator: reference.locator,
    sceneFingerprint: reference.sceneFingerprint });
  if (!opened.ok) throw new Error(`Saved overlay source ${opened.status}: ${opened.error}`);
  let volume: Graph2DScientificVolume;
  let imaginaryVolume: Graph2DScientificVolume | null = null;
  try {
    if (inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current")
      throw new TypeError("Saved linked region overlay source changed.");
    volume = verifyGraph2DScientificVolume(opened.source.manifestJson,
      opened.source.fingerprint, await bridge.previewGraphVolume({
        fingerprint: opened.source.fingerprint, datasetId: reference.datasetId,
        component: reference.component }));
    if (vectorOrigin.kind === "vector-complex-linked-region/v1") {
      const imaginary = vectorOrigin.imaginaryReference;
      if (inspectGraph2DFieldReference(imaginary, opened.source.manifestJson) !== "current")
        throw new TypeError("Saved linked region imaginary source changed.");
      imaginaryVolume = verifyGraph2DScientificVolume(opened.source.manifestJson,
        opened.source.fingerprint, await bridge.previewGraphVolume({
          fingerprint: opened.source.fingerprint, datasetId: imaginary.datasetId,
          component: imaginary.component }));
      if (volume.sampleSha256 !== vectorOrigin.realSampleSha256 ||
          imaginaryVolume.sampleSha256 !== vectorOrigin.imaginarySampleSha256 ||
          sha256Checksum(new TextEncoder().encode(
            `${volume.sampleSha256}:${imaginaryVolume.sampleSha256}`)).slice(7) !==
            vectorOrigin.scalarSampleSha256)
        throw new TypeError("Saved linked region complex samples changed.");
    } else if (volume.sampleSha256 !== vectorOrigin.scalarSampleSha256)
      throw new TypeError("Saved linked region scalar samples changed.");
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
  const slice = field.kind === "expressions" ?
    sampleVectorField3DSlice(document, region.normalAxis, region.fixedCoordinate) :
    cachedVerifiedVectorField3DSlice(document, region.normalAxis,
      region.fixedCoordinate, document.workspace?.sliceChannel ?? "component", sliceTransfer!);
  const plane = sampleSliceOverlayVectorPlane(document, slice, vectorTransfer);
  const summary = sampleOverlayRegion(document, slice, region, plane, reference, volume!,
    complex?.mode === "phase" ? "rad" : complex?.unit ?? scalar!.unit,
    complex && imaginaryVolume ? { imaginaryReference: complex.imaginary,
      imaginaryVolume, mode: complex.mode } : undefined);
  const fresh = linkedOverlayRegionGraphPair(document, region, summary,
    vectorOrigin.vectorSamples,
    vectorOrigin.kind === "vector-complex-linked-region/v1" ? [
      { name: "real", sampleSha256: vectorOrigin.realSampleSha256 },
      { name: "imaginary", sampleSha256: vectorOrigin.imaginarySampleSha256 }] :
      [{ name: reference.component, sampleSha256: volume!.sampleSha256 }],
    complex?.title ?? scalar!.title);
  if (canonicalJsonStringify(fresh[0].origin) !== canonicalJsonStringify(vectorOrigin) ||
      canonicalJsonStringify(fresh[1].origin) !== canonicalJsonStringify(overlayOrigin))
    throw new TypeError("Saved linked region profiles differ from verified source samples or bounds.");
}
