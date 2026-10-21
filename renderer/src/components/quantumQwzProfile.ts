import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
type SourceScene = {
  provenance: { model: string; runId: string; resultSha256: string; engine: string; engineVersion: string;
    parameters?: Record<string, number | string> };
  bands?: { labels: string[]; bulkGap: number; energyUnit: string; kind: string };
  topology?: { quantities: { id: string; label: string; kind: string; dataset: string; convention: string }[];
    invariants: { id: string; label: string; value: number | null; status: string; method: string }[] };
};

const source = (opened: Opened): SourceScene | null => {
  const extension = (opened.document.extensions["quantum-scene/v2"] ?? opened.document.extensions["quantum-scene/v1"]) as
    { scene?: SourceScene } | undefined;
  return extension?.scene ?? null;
};

const parameterEntries = (parameters?: Record<string, number | string>) =>
  Object.entries(parameters ?? {}).sort(([left], [right]) => left.localeCompare(right));

export function qwzSceneRole(opened: Opened): "bands" | "curvature" | null {
  const scene = source(opened);
  if (scene?.provenance.model?.toLowerCase() !== "qwz") return null;
  if (scene.bands?.kind === "surface" && scene.bands.labels.length > 0) return "bands";
  if (scene.topology?.quantities.some(item => item.kind === "berry-curvature")) return "curvature";
  return null;
}

/** A pairing of independently admitted scenes; this never joins or derives their datasets. */
export function reviewedQwzPair(bands: Opened, curvature: Opened) {
  if (qwzSceneRole(bands) !== "bands" || qwzSceneRole(curvature) !== "curvature")
    throw new TypeError("QWZ study requires supplied band and Berry-curvature views.");
  const a = source(bands)!, b = source(curvature)!;
  if (a.provenance.runId !== b.provenance.runId || a.provenance.resultSha256 !== b.provenance.resultSha256 ||
    a.provenance.engine !== b.provenance.engine || a.provenance.engineVersion !== b.provenance.engineVersion ||
    JSON.stringify(parameterEntries(a.provenance.parameters)) !== JSON.stringify(parameterEntries(b.provenance.parameters)))
    throw new TypeError("QWZ views do not identify the same exact source run and result.");
  if (bands.reference.sceneFingerprint === curvature.reference.sceneFingerprint)
    throw new TypeError("QWZ views must be distinct verified bundles.");
  const berry = b.topology!.quantities.filter(item => item.kind === "berry-curvature");
  return {
    runId: a.provenance.runId, resultSha256: a.provenance.resultSha256,
    bandLabels: a.bands!.labels, bulkGap: a.bands!.bulkGap, energyUnit: a.bands!.energyUnit,
    curvature: berry.map(item => ({ label: item.label, dataset: item.dataset, convention: item.convention })),
    invariants: b.topology?.invariants ?? [],
  };
}
