import { canonicalJsonStringify, createCombinedSubrectangleResult,
  inspectGraph2DFieldReference, parseVectorField3DDocument, structuralHash,
  vectorDerivedSubrectangleSelection, type AnalysisResultEnvelope,
  type CombinedSubrectangleProfileHashes,
  type CombinedSubrectangleSummary, type Graph2DDocument,
  type Graph2DFieldReference, type Graph2DLinkedCombinedRegionOrigin,
  type Graph2DPointRow, type Graph2DPointSeriesObject,
  type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DOverlayRegion } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import { sampleVerifiedComplexPoint, sampleVerifiedScalarPoint } from
  "./combinedFieldInspection";
import { summarizeCombinedSubrectangle, type CombinedSubrectangleCells } from
  "./combinedSubrectangle";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile,
  type DivergenceSourceBridge } from "./derivedCombinedRegionProfile";
import { checkCombinedRegionGraphSeries, combinedCurlRegionSeries,
  createCombinedRegionVerificationSession, isCombinedRegionOrigin } from
  "./linkedCombinedRegionGraphs";
import type { CombinedRegionSourceStatus, SingleRegionSourceStatus } from
  "./checkSavedRegionResultSources";

type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference" | "previewGraphVolume"> & DivergenceSourceBridge;
type Series = typeof combinedCurlRegionSeries[number];
type Ids = Readonly<{ columnPairId: string; rowPairId: string }>;
type Metadata = Readonly<{
  vectorSamples: readonly { name: string; sampleSha256: string }[];
  derivedSamples: readonly { name: string; sampleSha256: string }[];
  scalarSampleSha256: string; realSampleSha256: string;
  imaginarySampleSha256: string;
}>;
type Profile = Readonly<{ origin: Graph2DLinkedCombinedRegionOrigin;
  rows: readonly Graph2DPointRow[] }>;
type FieldStatus = Record<Series, SingleRegionSourceStatus>;

const statusTemplate = (): FieldStatus => ({ vector: "changed", scalar: "changed",
  "complex-magnitude": "changed", "complex-phase": "changed",
  divergence: "changed", "curl-magnitude": "changed" });
const publicStatus = (statuses: FieldStatus): CombinedRegionSourceStatus => ({
  kind: "combined", vector: statuses.vector, scalar: statuses.scalar,
  complex: statuses["complex-magnitude"] === statuses["complex-phase"] ?
    statuses["complex-magnitude"] : "changed",
  complexMagnitude: statuses["complex-magnitude"],
  complexPhase: statuses["complex-phase"],
  divergence: statuses.divergence, curlMagnitude: statuses["curl-magnitude"] });
const asStatus = (value: "current" | "missing" | "changed" | "error"):
  SingleRegionSourceStatus => value === "current" ? "source-current" : value;

function regionPoint(region: VectorField3DOverlayRegion, i: number, j: number):
  [number, number, number] {
  const axes = ([0, 1, 2] as const).filter(axis => axis !== region.normalAxis);
  const point: [number, number, number] = [0, 0, 0];
  point[region.normalAxis] = region.fixedCoordinate;
  point[axes[0]!] = region.bounds[0][0] +
    (region.bounds[0][1] - region.bounds[0][0]) * i / 16;
  point[axes[1]!] = region.bounds[1][0] +
    (region.bounds[1][1] - region.bounds[1][0]) * j / 16;
  return point;
}

async function readVolumes(refs: readonly Graph2DFieldReference[], bridge: Bridge):
  Promise<readonly Graph2DScientificVolume[]> {
  if (!bridge.openGraphDatasetReference || !bridge.closeGraphDataset)
    throw new Error("source-error");
  const first = refs[0]!;
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok) throw new Error(`source-${opened.status}`);
  try {
    if (refs.some(ref => ref.sceneFingerprint !== first.sceneFingerprint ||
        inspectGraph2DFieldReference(ref, opened.source.manifestJson) !== "current"))
      throw new Error("source-changed");
    return await Promise.all(refs.map(ref => bridge.previewGraphVolume({
      fingerprint: opened.source.fingerprint, datasetId: ref.datasetId,
      component: ref.component })));
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}

/** Recheck each of the twelve saved rows and compute source values by field. */
export async function inspectCombinedSubrectangle(field: VectorField3DDocument,
  graphs: readonly Graph2DDocument[], region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  ids: Ids, bridge: Bridge | undefined,
  saved?: AnalysisResultEnvelope): Promise<Readonly<{
    result?: AnalysisResultEnvelope; status: CombinedRegionSourceStatus }>> {
  vectorDerivedSubrectangleSelection(region, bounds);
  const scalar = field.workspace?.scalarOverlay;
  const complex = field.workspace?.complexOverlay;
  if (!scalar?.visible || !complex?.visible || !bridge ||
      canonicalJsonStringify(field.workspace?.overlayRegion) !==
        canonicalJsonStringify(region))
    throw new TypeError("A verified vector, scalar and complex rectangle is required.");
  const graph = graphs.find(item => item.source.objects.some(object =>
    object.kind === "point-series" &&
    isCombinedRegionOrigin(object.linkedOrigin) &&
    object.linkedOrigin.pairId === ids.columnPairId) &&
    item.source.objects.some(object => object.kind === "point-series" &&
      isCombinedRegionOrigin(object.linkedOrigin) &&
      object.linkedOrigin.pairId === ids.rowPairId));
  const find = (pairId: string, kind: Graph2DLinkedCombinedRegionOrigin["kind"],
    series: Series): Profile | null => {
    const object = graph?.source.objects.find((item): item is Graph2DPointSeriesObject =>
      item.kind === "point-series" && isCombinedRegionOrigin(item.linkedOrigin) &&
      item.linkedOrigin.kind === kind && item.linkedOrigin.pairId === pairId &&
      item.linkedOrigin.series === series);
    if (!object || !isCombinedRegionOrigin(object.linkedOrigin)) return null;
    const rows = pointTableStore.resolve(object.table);
    return rows ? { origin: object.linkedOrigin, rows } : null;
  };
  const column = combinedCurlRegionSeries.map(series => find(ids.columnPairId,
    "vector-scalar-complex-curl-linked-region/v4", series));
  const row = combinedCurlRegionSeries.map(series => find(ids.rowPairId,
    "vector-scalar-complex-curl-row-linked-region/v5", series));
  const base = column[0]?.origin;
  const parameters = saved?.provenance.operation.parameters;
  const metadata: Metadata | null = saved ? {
    vectorSamples: parameters?.vectorSamples as Metadata["vectorSamples"],
    derivedSamples: parameters?.derivedSamples as Metadata["derivedSamples"],
    scalarSampleSha256: parameters?.scalarSampleSha256 as string,
    realSampleSha256: parameters?.realSampleSha256 as string,
    imaginarySampleSha256: parameters?.imaginarySampleSha256 as string } :
    base ? { vectorSamples: base.vectorSamples,
      derivedSamples: base.derivedSamples ?? [],
      scalarSampleSha256: base.scalarSampleSha256,
      realSampleSha256: base.realSampleSha256,
      imaginarySampleSha256: base.imaginarySampleSha256 } : null;
  const expected = parameters?.profiles as CombinedSubrectangleProfileHashes | undefined;
  const statuses = statusTemplate();
  const session = createCombinedRegionVerificationSession();
  for (let index = 0; index < 6; index++) {
    const series = combinedCurlRegionSeries[index]!;
    const pair = [column[index], row[index]];
    if (!metadata || pair.some(item => !item)) continue;
    const fieldRefs = field.source.field.kind === "scientific-bundle" ?
      field.source.field.references : [];
    let valid = true;
    for (let axis = 0; axis < 2; axis++) {
      const profile = pair[axis]!;
      const origin = profile.origin;
      const coordinates = Array.from({ length: 17 }, (_, position) =>
        region.bounds[axis as 0 | 1][0] +
        (region.bounds[axis as 0 | 1][1] - region.bounds[axis as 0 | 1][0]) *
          position / 16);
      try {
        valid &&= origin.vectorSourceHash === field.identity.structuralHash &&
          parseVectorField3DDocument(origin.vectorDocumentJson).identity.id ===
            field.identity.id &&
          canonicalJsonStringify(origin.region) === canonicalJsonStringify(region) &&
          canonicalJsonStringify(origin.scalarReference) ===
            canonicalJsonStringify(scalar.reference) &&
          canonicalJsonStringify([origin.realReference, origin.imaginaryReference]) ===
            canonicalJsonStringify([complex.real, complex.imaginary]) &&
          canonicalJsonStringify(origin.vectorSamples) ===
            canonicalJsonStringify(metadata.vectorSamples) &&
          canonicalJsonStringify(origin.derivedSamples) ===
            canonicalJsonStringify(metadata.derivedSamples) &&
          origin.scalarSampleSha256 === metadata.scalarSampleSha256 &&
          origin.realSampleSha256 === metadata.realSampleSha256 &&
          origin.imaginarySampleSha256 === metadata.imaginarySampleSha256 &&
          (origin.profileAxis ?? 0) === axis &&
          profile.rows.length === 17 &&
          structuralHash(profile.rows) === origin.rowsSha256 &&
          (!expected || origin.rowsSha256 === (axis === 0 ?
            expected.columnRowsSha256[index] : expected.rowRowsSha256[index])) &&
          profile.rows.every((entry, position) =>
            Number.isFinite(entry.x) &&
            Math.abs(entry.x - coordinates[position]!) < 1e-9) &&
          (fieldRefs.length === 0 || fieldRefs.every(ref =>
            ref.sceneFingerprint === fieldRefs[0]!.sceneFingerprint));
      } catch { valid = false; }
    }
    if (!valid) continue;
    try {
      const checks = await Promise.all(pair.map(item =>
        checkCombinedRegionGraphSeries(item!.origin, bridge, session)));
      statuses[series] = asStatus(checks.find(status => status !== "current") ??
        "current");
    } catch { statuses[series] = "error"; }
  }
  const digest = (value: unknown): value is string =>
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const vectorCurrent = ["vector", "divergence", "curl-magnitude"].some(key =>
    statuses[key as Series] === "source-current");
  let speed: Awaited<ReturnType<typeof verifiedVectorRegionProfile>> | null = null;
  let derived: Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>> | null = null;
  if (vectorCurrent && metadata) {
    try {
      [speed, derived] = await Promise.all([
        verifiedVectorRegionProfile(field, region, bridge),
        verifiedCombinedDerivedRegionProfiles(field, region, bridge)]);
      if (canonicalJsonStringify(speed.samples) !==
            canonicalJsonStringify(metadata.vectorSamples) ||
          canonicalJsonStringify(derived.samples) !==
            canonicalJsonStringify(metadata.derivedSamples))
        for (const key of ["vector", "divergence", "curl-magnitude"] as const)
          statuses[key] = "changed";
    } catch {
      for (const key of ["vector", "divergence", "curl-magnitude"] as const)
        if (statuses[key] === "source-current") statuses[key] = "error";
    }
  }
  let scalarCells: readonly (number | null)[] | null = null;
  let magnitudeCells: readonly (number | null)[] | null = null;
  let phaseCells: readonly (number | null)[] | null = null;
  if (statuses.scalar === "source-current" && metadata) {
    try {
      const [volume] = await readVolumes([scalar.reference], bridge);
      if (!volume || !digest(metadata.scalarSampleSha256) ||
          volume.sampleSha256 !== metadata.scalarSampleSha256)
        statuses.scalar = "changed";
      else scalarCells = Array.from({ length: 289 }, (_, index) =>
        sampleVerifiedScalarPoint(scalar.reference, volume, field.source.axes,
          regionPoint(region, Math.floor(index / 17), index % 17),
          field.source.axes.map(axis => axis.unit)).value);
    } catch (cause) { statuses.scalar = cause instanceof Error &&
      cause.message === "source-missing" ? "missing" :
      cause instanceof Error && cause.message === "source-error" ? "error" : "changed"; }
  }
  if ((statuses["complex-magnitude"] === "source-current" ||
      statuses["complex-phase"] === "source-current") && metadata) {
    try {
      const volumes = await readVolumes([complex.real, complex.imaginary], bridge);
      if (volumes.length !== 2 || !digest(metadata.realSampleSha256) ||
          !digest(metadata.imaginarySampleSha256) ||
          volumes[0]!.sampleSha256 !== metadata.realSampleSha256 ||
          volumes[1]!.sampleSha256 !== metadata.imaginarySampleSha256) {
        statuses["complex-magnitude"] = "changed";
        statuses["complex-phase"] = "changed";
      } else {
        const points = Array.from({ length: 289 }, (_, index) =>
          sampleVerifiedComplexPoint(complex.real, complex.imaginary,
            volumes as [Graph2DScientificVolume, Graph2DScientificVolume],
            field.source.axes,
            regionPoint(region, Math.floor(index / 17), index % 17),
            field.source.axes.map(axis => axis.unit)));
        magnitudeCells = points.map(point => point.magnitude);
        phaseCells = points.map(point => point.phase);
      }
    } catch (cause) {
      const status = cause instanceof Error && cause.message === "source-missing" ?
        "missing" : cause instanceof Error && cause.message === "source-error" ?
          "error" : "changed";
      statuses["complex-magnitude"] = status;
      statuses["complex-phase"] = status;
    }
  }
  const blank = Array<number | null>(289).fill(null);
  const cells: CombinedSubrectangleCells = {
    vector: speed?.cells ?? blank, scalar: scalarCells ?? blank,
    complexMagnitude: magnitudeCells ?? blank, complexPhase: phaseCells ?? blank,
    divergence: derived?.divergence.cells ?? blank,
    curlMagnitude: derived?.curlMagnitude.cells ?? blank };
  const units = { vectorUnit: speed?.unit ??
    (field.source.field.kind === "scientific-bundle" ?
      field.source.field.componentUnits[0] : field.source.field.components[0].unit),
    scalarUnit: scalar.unit, complexUnit: complex.unit,
    divergenceUnit: derived?.divergence.unit ?? `1/${field.source.timeUnit}`,
    curlMagnitudeUnit: derived?.curlMagnitude.unit ?? `1/${field.source.timeUnit}` };
  const fresh = summarizeCombinedSubrectangle(region, bounds, cells, units);
  const mapping: Record<Series, keyof CombinedSubrectangleSummary> = {
    vector: "vector", scalar: "scalar", "complex-magnitude": "complexMagnitude",
    "complex-phase": "complexPhase", divergence: "divergence",
    "curl-magnitude": "curlMagnitude" };
  for (const series of combinedCurlRegionSeries) {
    if (statuses[series] !== "source-current") continue;
    const key = mapping[series];
    if (saved && canonicalJsonStringify(fresh[key]) !==
        canonicalJsonStringify(saved.summary[key])) statuses[series] = "changed";
  }
  if (saved) return { status: publicStatus(statuses) };
  if (combinedCurlRegionSeries.some(series => statuses[series] !== "source-current") ||
      !metadata || column.some(item => !item) || row.some(item => !item))
    throw new TypeError(`Combined subrectangle source checks: ${combinedCurlRegionSeries.map(
      series => `${series} ${statuses[series]}`).join(", ")}.`);
  const profiles: CombinedSubrectangleProfileHashes = {
    columnPairId: ids.columnPairId, rowPairId: ids.rowPairId,
    columnRowsSha256: column.map(item => item!.origin.rowsSha256) as unknown as
      CombinedSubrectangleProfileHashes["columnRowsSha256"],
    rowRowsSha256: row.map(item => item!.origin.rowsSha256) as unknown as
      CombinedSubrectangleProfileHashes["rowRowsSha256"] };
  const result = createCombinedSubrectangleResult(field, region, bounds, fresh,
    profiles, metadata.vectorSamples, metadata.derivedSamples,
    metadata.scalarSampleSha256, metadata.realSampleSha256,
    metadata.imaginarySampleSha256);
  return { result, status: publicStatus(statuses) };
}
