import { canonicalJsonStringify, createCombinedVectorField3DRegionResult,
  createCombinedVectorField3DRegionResultWithDivergence,
  inspectGraph2DFieldReference,
  isGraph2DFieldReference, matchesScientificSourceGeneration,
  reverifyVectorField3DRegionResult,
  viewerSourceFromDocument, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DFieldReference,
  type CombinedRegionSummary, type CombinedDerivedRegionSummary,
  type VectorField3DDocument,
  type VectorField3DRegionSummary,
  type VectorField3DRegionSampleDigest } from "@math3d/core";

export type SingleRegionSourceStatus = "checking" | "source-current" | "missing" | "changed" | "error";
export type CombinedRegionSourceStatus = Readonly<{ kind: "combined";
  vector: SingleRegionSourceStatus; scalar: SingleRegionSourceStatus;
  complex: SingleRegionSourceStatus; divergence?: SingleRegionSourceStatus }>;
export type SavedRegionSourceStatus = SingleRegionSourceStatus | CombinedRegionSourceStatus;
type Bridge = Pick<NonNullable<typeof window.scientificScenes>, "checkGraphDatasetReference">;

/** Read-only Project reopen check, including every pinned source resource. */
export async function checkSavedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined): Promise<SavedRegionSourceStatus> {
  if (result.provenance.operation.type === VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE)
    return checkSavedCombinedRegionResultSources(result, document, bridge);
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

async function checkSavedCombinedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined):
  Promise<CombinedRegionSourceStatus> {
  const version = result.provenance.operation.algorithmVersion;
  const derived = version === "17x17-v3";
  const all = (status: SingleRegionSourceStatus): CombinedRegionSourceStatus =>
    ({ kind: "combined", vector: status, scalar: status, complex: status,
      ...(derived ? { divergence: status } : {}) });
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
    const fresh = derived ? createCombinedVectorField3DRegionResultWithDivergence(
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
  return { kind: "combined", vector: vectorStatus, scalar: scalarStatus,
    complex: complexStatus, ...(derived ? { divergence: vectorStatus } : {}) };
}
