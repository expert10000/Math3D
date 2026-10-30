import { canonicalJsonStringify, createCombinedVectorField3DRegionResult,
  createCombinedVectorField3DRegionResultWithDivergence,
  createCombinedVectorField3DRegionResultWithCurl,
  createVectorDerivedRegionResult,
  inspectGraph2DFieldReference,
  isGraph2DFieldReference, matchesScientificSourceGeneration,
  reverifyVectorField3DRegionResult,
  viewerSourceFromDocument, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DFieldReference,
  type CombinedRegionSummary, type CombinedDerivedRegionSummary,
  type CombinedCurlRegionSummary,
  type VectorDerivedRegionSummary,
  type VectorField3DDocument,
  type VectorField3DRegionSummary,
  type VectorField3DRegionSampleDigest } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedDivergenceRegionProfile,
  verifiedVectorRegionProfile,
  type DivergenceSourceBridge } from
  "./derivedCombinedRegionProfile";

export type SingleRegionSourceStatus = "checking" | "source-current" | "missing" | "changed" | "error";
export type CombinedRegionSourceStatus = Readonly<{ kind: "combined";
  vector: SingleRegionSourceStatus; scalar: SingleRegionSourceStatus;
  complex: SingleRegionSourceStatus; divergence?: SingleRegionSourceStatus;
  curlMagnitude?: SingleRegionSourceStatus }>;
export type VectorDerivedRegionSourceStatus = Readonly<{ kind: "vector-derived";
  vector: SingleRegionSourceStatus; divergence: SingleRegionSourceStatus;
  curlMagnitude: SingleRegionSourceStatus }>;
export type SavedRegionSourceStatus = SingleRegionSourceStatus | CombinedRegionSourceStatus |
  VectorDerivedRegionSourceStatus;
type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference"> & DivergenceSourceBridge;

/** Read-only Project reopen check, including every pinned source resource. */
export async function checkSavedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined): Promise<SavedRegionSourceStatus> {
  if (result.provenance.operation.type === VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE)
    return checkSavedCombinedRegionResultSources(result, document, bridge);
  if (result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE)
    return checkSavedVectorDerivedRegionResultSources(result, document, bridge);
  if (result.provenance.operation.type !== VECTOR_FIELD3D_REGION_RESULT_TYPE ||
      !matchesScientificSourceGeneration(result.provenance.source, viewerSourceFromDocument(document)) ||
      !bridge?.checkGraphDatasetReference) return "error";
  const parameters = result.provenance.operation.parameters;
  const vector = parameters.vectorReferences;
  const overlay = parameters.overlayReferences;
  const validDigests = (value: unknown): value is VectorField3DRegionSampleDigest[] =>
    Array.isArray(value) && value.every(item => !!item && typeof item === "object" &&
      typeof item.name === "string" && typeof item.sampleSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(item.sampleSha256));
  if (!Array.isArray(vector) || !Array.isArray(overlay) ||
      !vector.every(isGraph2DFieldReference) || !overlay.every(isGraph2DFieldReference) ||
      !parameters.region || !document.workspace?.overlayRegion ||
      canonicalJsonStringify(parameters.region) !==
        canonicalJsonStringify(document.workspace.overlayRegion) ||
      (document.source.field.kind === "scientific-bundle" &&
        canonicalJsonStringify(vector) !== canonicalJsonStringify(document.source.field.references)) ||
      (document.source.field.kind === "expressions" && vector.length !== 0) ||
      (parameters.overlayKind === "scalar" &&
        canonicalJsonStringify(overlay) !== canonicalJsonStringify(
          document.workspace?.scalarOverlay ? [document.workspace.scalarOverlay.reference] : [])) ||
      (parameters.overlayKind === "scalar" &&
        (!document.workspace?.scalarOverlay?.visible || parameters.overlayMode !== "scalar")) ||
      (parameters.overlayKind === "complex" &&
        canonicalJsonStringify(overlay) !== canonicalJsonStringify(
          document.workspace?.complexOverlay ? [document.workspace.complexOverlay.real,
            document.workspace.complexOverlay.imaginary] : [])) ||
      (parameters.overlayKind === "complex" &&
        (!document.workspace?.complexOverlay?.visible ||
          parameters.overlayMode !== (document.workspace.complexOverlay.mode ===
            "phase-contours" ? "phase" : document.workspace.complexOverlay.mode))) ||
      !["scalar", "complex"].includes(String(parameters.overlayKind)) ||
      !validDigests(parameters.vectorSamples) || !validDigests(parameters.overlaySamples))
    return "changed";
  try { reverifyVectorField3DRegionResult(result, document, document.workspace.overlayRegion,
    result.summary as unknown as VectorField3DRegionSummary,
    parameters.vectorSamples, parameters.overlaySamples); }
  catch { return "changed"; }
  const references = [...vector, ...overlay] as Graph2DFieldReference[];
  const groups = new Map<string, Graph2DFieldReference[]>();
  for (const reference of references) {
    const key = `${reference.locator.kind}:${reference.locator.value}:${reference.sceneFingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), reference]);
  }
  for (const refs of groups.values()) {
    const reference = refs[0]!;
    try {
      const opened = await bridge.checkGraphDatasetReference({ locator: reference.locator,
        sceneFingerprint: reference.sceneFingerprint, verifyResources: true });
      if (!opened.ok) return opened.status;
      if (refs.some(ref => inspectGraph2DFieldReference(ref,
        opened.source.manifestJson) !== "current")) return "changed";
    } catch { return "error"; }
  }
  return "source-current";
}

async function checkSavedVectorDerivedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined):
  Promise<VectorDerivedRegionSourceStatus> {
  const all = (status: SingleRegionSourceStatus): VectorDerivedRegionSourceStatus =>
    ({ kind: "vector-derived", vector: status, divergence: status,
      curlMagnitude: status });
  const parameters = result.provenance.operation.parameters;
  const region = document.workspace?.overlayRegion;
  const refs = document.source.field.kind === "scientific-bundle" ?
    document.source.field.references : [];
  const validSamples = (value: unknown) => Array.isArray(value) &&
    value.length === refs.length && value.every(item => item && typeof item === "object" &&
      typeof item.name === "string" && /^[a-f0-9]{64}$/.test(String(item.sampleSha256)));
  if (result.provenance.operation.algorithmVersion !== "17x17-v1" || !region ||
      !matchesScientificSourceGeneration(result.provenance.source,
        viewerSourceFromDocument(document)) ||
      canonicalJsonStringify(parameters.region) !== canonicalJsonStringify(region) ||
      canonicalJsonStringify(parameters.vectorReferences) !== canonicalJsonStringify(refs) ||
      parameters.method !== "bounded-finite-difference" ||
      !validSamples(parameters.vectorSamples) || !validSamples(parameters.derivedSamples))
    return all("changed");
  try {
    const fresh = createVectorDerivedRegionResult(document, region,
      result.summary as unknown as VectorDerivedRegionSummary,
      parameters.vectorSamples as VectorField3DRegionSampleDigest[],
      parameters.derivedSamples as VectorField3DRegionSampleDigest[]);
    if (fresh.resultId !== result.resultId ||
        canonicalJsonStringify(fresh.provenance.operation) !==
          canonicalJsonStringify(result.provenance.operation) ||
        canonicalJsonStringify(fresh.summary) !== canonicalJsonStringify(result.summary))
      return all("changed");
  } catch { return all("changed"); }
  if (refs.length) {
    if (!bridge?.checkGraphDatasetReference) return all("error");
    const first = refs[0]!;
    try {
      const checked = await bridge.checkGraphDatasetReference({ locator: first.locator,
        sceneFingerprint: first.sceneFingerprint, verifyResources: true });
      if (!checked.ok) return all(checked.status);
      if (refs.some(ref => inspectGraph2DFieldReference(ref,
        checked.source.manifestJson) !== "current")) return all("changed");
    } catch { return all("error"); }
  }
  const summary = result.summary as unknown as VectorDerivedRegionSummary;
  const matches = (value: { count: number; gaps: number; mean: number | null;
    min: number | null; max: number | null }, saved: typeof summary.vector) =>
    canonicalJsonStringify({ count: value.count, gaps: value.gaps, mean: value.mean,
      min: value.min, max: value.max }) === canonicalJsonStringify(saved);
  let vector: SingleRegionSourceStatus = "source-current";
  let divergence: SingleRegionSourceStatus = "source-current";
  let curlMagnitude: SingleRegionSourceStatus = "source-current";
  try {
    const speed = await verifiedVectorRegionProfile(document, region, bridge);
    vector = speed.unit === summary.vectorUnit &&
      matches(speed.statistics, summary.vector) &&
      canonicalJsonStringify(speed.samples) ===
        canonicalJsonStringify(parameters.vectorSamples) ? "source-current" : "changed";
  } catch { vector = "error"; }
  try {
    const derived = await verifiedCombinedDerivedRegionProfiles(document, region, bridge);
    divergence = derived.divergence.unit === summary.divergenceUnit &&
      matches(derived.divergence, summary.divergence) &&
      canonicalJsonStringify(derived.samples) ===
        canonicalJsonStringify(parameters.derivedSamples) ? "source-current" : "changed";
    curlMagnitude = derived.curlMagnitude.unit === summary.curlMagnitudeUnit &&
      matches(derived.curlMagnitude, summary.curlMagnitude) &&
      canonicalJsonStringify(derived.samples) ===
        canonicalJsonStringify(parameters.derivedSamples) ? "source-current" : "changed";
  } catch { divergence = "error"; curlMagnitude = "error"; }
  return { kind: "vector-derived", vector, divergence, curlMagnitude };
}

async function checkSavedCombinedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined):
  Promise<CombinedRegionSourceStatus> {
  const version = result.provenance.operation.algorithmVersion;
  const curl = version === "17x17-v4";
  const derived = version === "17x17-v3" || curl;
  const all = (status: SingleRegionSourceStatus): CombinedRegionSourceStatus =>
    ({ kind: "combined", vector: status, scalar: status, complex: status,
      ...(derived ? { divergence: status } : {}),
      ...(curl ? { curlMagnitude: status } : {}) });
  if (version !== "17x17-v2" && !derived) return all("changed");
  if (!matchesScientificSourceGeneration(result.provenance.source,
      viewerSourceFromDocument(document)) || !bridge?.checkGraphDatasetReference)
    return all("error");
  const parameters = result.provenance.operation.parameters;
  const vectorRefs = parameters.vectorReferences;
  const scalarRef = parameters.scalarReference;
  const realRef = parameters.realReference;
  const imaginaryRef = parameters.imaginaryReference;
  const region = document.workspace?.overlayRegion;
  const hashes = [parameters.scalarSampleSha256, parameters.realSampleSha256,
    parameters.imaginarySampleSha256];
  if (!region || canonicalJsonStringify(parameters.region) !== canonicalJsonStringify(region) ||
      !Array.isArray(vectorRefs) || !vectorRefs.every(isGraph2DFieldReference) ||
      !isGraph2DFieldReference(scalarRef) || !isGraph2DFieldReference(realRef) ||
      !isGraph2DFieldReference(imaginaryRef) ||
      !Array.isArray(parameters.vectorSamples) ||
      parameters.vectorSamples.some(item => !item || typeof item !== "object" ||
        typeof (item as { sampleSha256?: unknown }).sampleSha256 !== "string") ||
      curl && parameters.curlMagnitudeMethod !== "bounded-finite-difference" ||
      derived && (parameters.divergenceMethod !== "bounded-finite-difference" ||
        !Array.isArray(parameters.divergenceSamples) ||
        parameters.divergenceSamples.length !==
          (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
        parameters.divergenceSamples.some(item => !item || typeof item !== "object" ||
          typeof (item as { name?: unknown }).name !== "string" ||
          !/^[a-f0-9]{64}$/.test(String((item as { sampleSha256?: unknown }).sampleSha256)))) ||
      hashes.some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)))
    return all("changed");
  try {
    const vectorSamples = parameters.vectorSamples as unknown as VectorField3DRegionSampleDigest[];
    const fresh = curl ? createCombinedVectorField3DRegionResultWithCurl(
      document, region, result.summary as unknown as CombinedCurlRegionSummary,
      vectorSamples, hashes[0] as string, hashes[1] as string, hashes[2] as string,
      parameters.divergenceSamples as unknown as VectorField3DRegionSampleDigest[]) :
      derived ? createCombinedVectorField3DRegionResultWithDivergence(
      document, region, result.summary as unknown as CombinedDerivedRegionSummary,
      vectorSamples, hashes[0] as string, hashes[1] as string, hashes[2] as string,
      parameters.divergenceSamples as unknown as VectorField3DRegionSampleDigest[]) :
      createCombinedVectorField3DRegionResult(document, region,
        result.summary as unknown as CombinedRegionSummary, vectorSamples,
        hashes[0] as string, hashes[1] as string, hashes[2] as string);
    if (fresh.resultId !== result.resultId ||
        canonicalJsonStringify(fresh.provenance.operation) !==
          canonicalJsonStringify(result.provenance.operation) ||
        canonicalJsonStringify(fresh.summary) !== canonicalJsonStringify(result.summary))
      return all("changed");
  } catch { return all("changed"); }
  const check = async (refs: readonly Graph2DFieldReference[]):
    Promise<SingleRegionSourceStatus> => {
    const groups = new Map<string, Graph2DFieldReference[]>();
    for (const reference of refs) {
      const key = `${reference.locator.kind}:${reference.locator.value}:${reference.sceneFingerprint}`;
      groups.set(key, [...(groups.get(key) ?? []), reference]);
    }
    for (const members of groups.values()) {
      const first = members[0]!;
      try {
        const checked = await bridge.checkGraphDatasetReference({ locator: first.locator,
          sceneFingerprint: first.sceneFingerprint, verifyResources: true });
        if (!checked.ok) return checked.status;
        if (members.some(ref => inspectGraph2DFieldReference(ref,
          checked.source.manifestJson) !== "current")) return "changed";
      } catch { return "error"; }
    }
    return "source-current";
  };
  const vector = canonicalJsonStringify(vectorRefs) === canonicalJsonStringify(
    document.source.field.kind === "scientific-bundle" ? document.source.field.references : []) ?
    check(vectorRefs as Graph2DFieldReference[]) : Promise.resolve("changed" as const);
  const scalar = canonicalJsonStringify(scalarRef) === canonicalJsonStringify(
    document.workspace?.scalarOverlay?.reference) ? check([scalarRef]) :
    Promise.resolve("changed" as const);
  const complex = canonicalJsonStringify([realRef, imaginaryRef]) === canonicalJsonStringify(
    document.workspace?.complexOverlay ? [document.workspace.complexOverlay.real,
      document.workspace.complexOverlay.imaginary] : []) ?
    check([realRef, imaginaryRef]) : Promise.resolve("changed" as const);
  const [vectorStatus, scalarStatus, complexStatus] = await Promise.all([vector, scalar, complex]);
  let divergenceStatus: SingleRegionSourceStatus = vectorStatus;
  let curlStatus: SingleRegionSourceStatus = vectorStatus;
  if (derived && vectorStatus === "source-current") {
    try {
      const both = curl ? await verifiedCombinedDerivedRegionProfiles(document, region, bridge) :
        null;
      const fresh = both ? { ...both.divergence, samples: both.samples } :
        await verifiedDivergenceRegionProfile(document, region, bridge);
      const saved = result.summary as unknown as CombinedDerivedRegionSummary;
      divergenceStatus = fresh.unit === saved.divergenceUnit &&
        canonicalJsonStringify({ count: fresh.count, gaps: fresh.gaps,
          mean: fresh.mean, min: fresh.min, max: fresh.max }) ===
          canonicalJsonStringify(saved.divergence) &&
        canonicalJsonStringify(fresh.samples) ===
          canonicalJsonStringify(parameters.divergenceSamples) ?
          "source-current" : "changed";
      if (both) {
        const savedCurl = result.summary as unknown as CombinedCurlRegionSummary;
        curlStatus = both.curlMagnitude.unit === savedCurl.curlMagnitudeUnit &&
          canonicalJsonStringify({ count: both.curlMagnitude.count,
            gaps: both.curlMagnitude.gaps, mean: both.curlMagnitude.mean,
            min: both.curlMagnitude.min, max: both.curlMagnitude.max }) ===
            canonicalJsonStringify(savedCurl.curlMagnitude) &&
          canonicalJsonStringify(both.samples) ===
            canonicalJsonStringify(parameters.divergenceSamples) ?
            "source-current" : "changed";
      }
    } catch { divergenceStatus = "error"; curlStatus = "error"; }
  }
  return { kind: "combined", vector: vectorStatus, scalar: scalarStatus,
    complex: complexStatus, ...(derived ? { divergence: divergenceStatus } : {}),
    ...(curl ? { curlMagnitude: curlStatus } : {}) };
}
