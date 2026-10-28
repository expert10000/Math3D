import { canonicalJsonStringify, inspectGraph2DFieldReference,
  isGraph2DFieldReference, matchesScientificSourceGeneration,
  reverifyVectorField3DRegionResult,
  viewerSourceFromDocument, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DFieldReference,
  type VectorField3DDocument, type VectorField3DRegionSummary,
  type VectorField3DRegionSampleDigest } from "@math3d/core";

export type SavedRegionSourceStatus = "checking" | "source-current" | "missing" | "changed" | "error";
type Bridge = Pick<NonNullable<typeof window.scientificScenes>, "checkGraphDatasetReference">;

/** Read-only Project reopen check, including every pinned source resource. */
export async function checkSavedRegionResultSources(result: AnalysisResultEnvelope,
  document: VectorField3DDocument, bridge: Bridge | undefined): Promise<SavedRegionSourceStatus> {
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
          parameters.overlayMode !== document.workspace.complexOverlay.mode)) ||
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
