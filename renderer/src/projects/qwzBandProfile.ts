import { createAnalysisResultEnvelope, createDocumentRelation, createGraph2DDocument,
  createMixedWorkspaceDocument, graph2DPointDomain, inspectProjectQwzPinnedSample,
  replaceMath3DProjectWorkspace, structuralHash, viewerSourceFromDocument,
  type Graph2DPointRow, type Graph2DPointTableStore, type Math3DProject,
  type ProjectQwzPair, type StudyRecordV1 } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";
import { verifyProjectQwzSample } from "./qwzStudySample";

export const QWZ_BAND_PROFILE_OPERATION = "quantum.qwz-band-profile";
type BandSample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["bandSample"]>>;
type BandSampleReader = (input: { fingerprint: string; objectId: string; sampleIndex: number }) => Promise<BandSample>;

/** An adjacent constant-coordinate section of the verified producer band array, bounded to 65 samples. */
export async function deriveQwzBandProfile(project: Math3DProject, study: StudyRecordV1,
  pair: ProjectQwzPair, tables: Graph2DPointTableStore,
  bandSample: BandSampleReader | undefined = window.quantumScenes?.bandSample,
  pathIndices?: readonly number[]) {
  const pin = inspectProjectQwzPinnedSample(study, pair);
  if (pin.status !== "current" || !bandSample)
    throw new TypeError("A current pinned QWZ k and desktop band reader are required.");
  const selected = (await verifyProjectQwzSample(project, pair, pin.sampleIndex)).band;
  // The cursor check leaves the curvature scene active; band IPC is scoped to the active scene.
  await openVerifiedStudyQuantumScene(project, pair.bands);
  const check = (sample: BandSample, index: number) => {
    if (sample.fingerprint !== pair.bands.source.sceneFingerprint || sample.sampleIndex !== index ||
        sample.objectId !== "band-0" || sample.runId !== selected.runId ||
        sample.resultSha256 !== selected.resultSha256 || sample.kUnit !== selected.kUnit ||
        sample.energyUnit !== selected.energyUnit || !sample.k.every(Number.isFinite) ||
        !Number.isFinite(sample.energy))
      throw new TypeError("Band profile sample differs from the pinned producer generation.");
  };
  check(selected, pin.sampleIndex);
  const authored = pathIndices !== undefined;
  const requestedPath = pathIndices ?? [];
  if (authored && (!Array.isArray(requestedPath) || requestedPath.length < 2 || requestedPath.length > 65 ||
      !requestedPath.includes(pin.sampleIndex) || new Set(requestedPath).size !== requestedPath.length ||
      !requestedPath.every(index => Number.isSafeInteger(index) && index >= 0 && index <= 1_000_000)))
    throw new TypeError("Authored reciprocal path needs 2–65 distinct producer sample indices including the pinned k.");
  let pathAxis: 0 | 1 | null = null;
  for (const index of authored ? [] : [pin.sampleIndex + 1, pin.sampleIndex - 1]) {
    if (index < 0) continue;
    let adjacent: BandSample;
    try { adjacent = await bandSample({ fingerprint: pair.bands.source.sceneFingerprint,
      objectId: "band-0", sampleIndex: index }); }
    catch (error) {
      if (String((error as Error).message).includes("outside the verified dataset")) continue;
      throw error;
    }
    check(adjacent, index);
    const dx = Math.abs(adjacent.k[0] - selected.k[0]);
    const dy = Math.abs(adjacent.k[1] - selected.k[1]);
    if (dx > 1e-9 && dy <= 1e-9) { pathAxis = 0; break; }
    if (dy > 1e-9 && dx <= 1e-9) { pathAxis = 1; break; }
  }
  if (pathAxis === null && !authored) throw new TypeError("Pinned QWZ sample has no adjacent reciprocal path.");
  const fixedAxis = (1 - (pathAxis ?? 0)) as 0 | 1;
  const samples: BandSample[] = authored ? [] : [selected];
  if (authored) {
    for (const index of requestedPath) {
      const sample = index === pin.sampleIndex ? selected : await bandSample({
        fingerprint: pair.bands.source.sceneFingerprint, objectId: "band-0", sampleIndex: index });
      check(sample, index);
      samples.push(sample);
    }
  }
  for (const direction of authored ? [] : [-1, 1] as const) {
    for (let step = 1; step <= 32; step++) {
      const index = pin.sampleIndex + step * direction;
      if (index < 0) break;
      let sample: BandSample;
      try { sample = await bandSample({ fingerprint: pair.bands.source.sceneFingerprint,
        objectId: "band-0", sampleIndex: index }); }
      catch (error) {
        if (String((error as Error).message).includes("outside the verified dataset")) break;
        throw error;
      }
      check(sample, index);
      if (Math.abs(sample.k[fixedAxis] - selected.k[fixedAxis]) > 1e-9) break;
      if (direction < 0) samples.unshift(sample); else samples.push(sample);
    }
  }
  if (!authored && (samples.length < 2 || samples.some((sample, index) => index > 0 &&
      sample.k[pathAxis!] <= samples[index - 1]!.k[pathAxis!]))
    )
    throw new TypeError("Pinned QWZ sample has no monotone constant-coordinate band path.");
  if (authored && samples.some((sample, index) => index > 0 &&
      Math.hypot(sample.k[0] - samples[index - 1]!.k[0],
        sample.k[1] - samples[index - 1]!.k[1]) <= 1e-12))
    throw new TypeError("Adjacent authored path points must have distinct reciprocal coordinates.");
  await openVerifiedStudyQuantumScene(project, pair.bands);
  await openVerifiedStudyQuantumScene(project, pair.curvature);
  let distance = 0;
  const rows: Graph2DPointRow[] = samples.map((sample, index) => {
    if (authored && index) distance += Math.hypot(sample.k[0] - samples[index - 1]!.k[0],
      sample.k[1] - samples[index - 1]!.k[1]);
    return { id: `row_${index + 1}`, x: authored ? distance : sample.k[pathAxis!], y: sample.energy };
  });
  const table = tables.publish(rows);
  const graph = createGraph2DDocument({ stableKey: [project.identity.id, study.id,
      pair.bands.identity.id, pair.bands.identity.revision, pin.sampleIndex,
      authored ? structuralHash(requestedPath) : "qwz-band-profile-v1"],
    title: authored ? `QWZ authored reciprocal path · ${samples.length} samples` :
      `QWZ band profile · k${fixedAxis === 0 ? "x" : "y"}=${selected.k[fixedAxis]} ${selected.kUnit}`,
    source: { objects: [{ id: "qwz-band-profile", kind: "point-series", label: "Band 0 energy",
      table, mode: "line", missing: "gap", domain: graph2DPointDomain(rows) }],
      variables: [], assumptions: [] } });
  const bandSource = viewerSourceFromDocument(pair.bands);
  const graphSource = viewerSourceFromDocument(graph);
  const result = createAnalysisResultEnvelope({
    resultId: `qwz-band-profile:${structuralHash({ bandSource, table,
      sampleIndex: pin.sampleIndex }).slice(7)}`, status: "numerical",
    provenance: { source: bandSource, operation: { type: QWZ_BAND_PROFILE_OPERATION,
      algorithm: authored ? "producer-band-authored-reciprocal-path-v1" :
        "producer-band-constant-coordinate-section-v1", algorithmVersion: "1",
      parameters: { studyId: study.id, graphDocumentId: graph.identity.id,
        graphHash: graph.identity.structuralHash, tableId: table.id,
        tableChecksum: table.checksum, sampleIndex: pin.sampleIndex,
        runId: selected.runId, resultSha256: selected.resultSha256,
        ...(authored ? { pathIndices: [...requestedPath] } : {}) } },
      engine: { name: "Math3D verified QWZ scene reader", version: "1" },
      numericContext: { precision: { binaryBits: 64 } }, elapsedMs: 0 },
    summary: { rowCount: rows.length, pathType: authored ? "authored-sample-path" : "constant-coordinate-section",
      fixedAxis: authored ? null : fixedAxis === 0 ? "kx" : "ky",
      fixedK: authored ? null : selected.k[fixedAxis], pathAxis: authored ? "reciprocal distance" : pathAxis === 0 ? "kx" : "ky",
      kUnit: selected.kUnit, energyUnit: selected.energyUnit,
      kMin: rows[0]!.x, kMax: rows.at(-1)!.x,
      selectedIndex: pin.sampleIndex, selectedK: authored ? selected.k : selected.k[pathAxis!],
      selectedEnergy: selected.energy },
    warnings: [authored ? "This Graph connects selected producer samples by reciprocal path distance; intervals between them are visualization segments, not independently computed band energies." :
      `This is a bounded constant-k${fixedAxis === 0 ? "x" : "y"} section of producer samples, not an independently computed band dispersion.`],
    diagnostics: [], artifacts: [],
  });
  const relation = createDocumentRelation({ kind: "derived-from", sources: [bandSource],
    sourceOrder: "ordered", target: { type: "document", generation: graphSource },
    operation: QWZ_BAND_PROFILE_OPERATION, parameters: result.provenance.operation.parameters });
  const resultRelation = createDocumentRelation({ kind: "analysis-of", sources: [bandSource, graphSource],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: result.provenance.operation.type }, operation: QWZ_BAND_PROFILE_OPERATION,
    parameters: result.provenance.operation.parameters });
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries.filter(entry => entry.expected.id !== graph.identity.id),
      { module: "graph2d", checkpoint: graph, expected: graph.identity, replay: null }],
    activeDocumentIds: [...new Set([...project.workspace.activeDocumentIds, graph.identity.id])],
    relations: [...project.workspace.relations.filter(item => item.relationId !== relation.relationId &&
      item.relationId !== resultRelation.relationId), relation, resultRelation],
    results: [...project.workspace.results.filter(item => item.resultId !== result.resultId), result] });
  return { project: replaceMath3DProjectWorkspace(project, workspace), graph, result, table };
}
