import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
type SourceScene = {
  provenance: { model: string; runId: string; resultSha256: string; engine: string; engineVersion: string;
    parameters?: Record<string, number | string> };
  bands?: { labels: string[]; bulkGap: number; energyUnit: string; kind: string };
  objects?: { id: string; label: string; scalars?: string }[];
  datasets?: { id: string; unit: string }[];
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

const sameNumericalResult = (left: SourceScene, right: SourceScene) =>
  left.provenance.runId === right.provenance.runId &&
  left.provenance.resultSha256 === right.provenance.resultSha256 &&
  left.provenance.engine === right.provenance.engine &&
  left.provenance.engineVersion === right.provenance.engineVersion &&
  JSON.stringify(parameterEntries(left.provenance.parameters)) === JSON.stringify(parameterEntries(right.provenance.parameters));

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
  if (!sameNumericalResult(a, b))
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

export function sshSceneRole(opened: Opened): "bands" | "chain" | null {
  const scene = source(opened);
  if (scene?.provenance.model?.toLowerCase() !== "ssh") return null;
  if (scene.bands?.kind === "path" && scene.bands.labels.length > 0) return "bands";
  if (scene.objects?.some(item => item.id === "edge-density") &&
    scene.topology?.invariants.some(item => item.id === "winding")) return "chain";
  return null;
}

/** Preserve the two original SSH datasets as separate read-only views. */
export function reviewedSshPair(chain: Opened, bands: Opened) {
  if (sshSceneRole(chain) !== "chain" || sshSceneRole(bands) !== "bands")
    throw new TypeError("SSH study requires supplied finite-chain and band-path views.");
  const a = source(chain)!, b = source(bands)!;
  if (!sameNumericalResult(a, b))
    throw new TypeError("SSH views do not identify the same exact source run and result.");
  if (chain.reference.sceneFingerprint === bands.reference.sceneFingerprint)
    throw new TypeError("SSH views must be distinct verified bundles.");
  const density = a.objects!.find(item => item.id === "edge-density")!;
  return {
    runId: a.provenance.runId, resultSha256: a.provenance.resultSha256,
    chainLabels: a.objects!.filter(item => ["ssh-t1-bonds", "ssh-t2-bonds"].includes(item.id)).map(item => item.label),
    densityLabel: density.label, densityDataset: density.scalars,
    densityUnit: a.datasets?.find(item => item.id === density.scalars)?.unit ?? "not supplied",
    bandLabels: b.bands!.labels, bulkGap: b.bands!.bulkGap, energyUnit: b.bands!.energyUnit,
    invariants: a.topology!.invariants.filter(item => item.id === "winding"),
  };
}
