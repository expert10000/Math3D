import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject, serializeMath3DProject, sha256Checksum, structuralHash, upsertMath3DProjectNote, upsertMath3DProjectSavedMeshComparison } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "./savedMeshAnalysis";
import { transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { buildSavedMeshResultTrend, savedMeshResultTrendHtml, savedMeshTrendMetricChoices } from "./projectSavedMeshResultTrend";
import { compareSavedMeshTrendPoints, resolveSavedMeshTrendPoint } from "./projectSavedMeshTrendPoint";
import { createSavedMeshPinnedComparison, inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import { checkedProjectSavedMeshComparisonObservations, createProjectSavedMeshComparisonNote, inspectProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";
import { savedMeshResultComparisonHtml } from "./projectSavedMeshResultComparison";
import { createWorkbookSavedMeshComparisonReference, inspectWorkbookSavedMeshComparisonReference,
  normalizeWorkbookSavedMeshComparisonReference, createDefaultWorkbook, validateWorkbookDependencies } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";
import { inspectWorkbookSavedMeshComparison, resolveWorkbookSavedMeshComparisonTarget } from "./projectSavedMeshWorkbookComparison";
import { createPortableNotebookPublication, inspectPortableNotebookPublication, notebookPublicationManifest,
  notebookPublicationManifestHtml, notebookPublicationMarkdown } from "../workbook/notebookPublication";

const mesh = () => ({ label: "Trend square", source: { kind: "import" as const, format: "obj" as const, filename: "square.obj",
  math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m", axes: ["x", "y", "z"], handedness: "right" } },
  positions: Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]), indices: Uint32Array.from([0,1,2,1,3,2]) });
const fixture = (saveMiddle = true) => {
  const adapter = MeshDocumentAdapter.fromMesh(mesh());
  const first = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 2);
  const middle = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 0.5);
  const last = analyzeSavedMesh(adapter, "quality");
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: replay.checkpoint.document,
    expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
    activeDocumentIds: [adapter.document().identity.id], constructions: [],
    results: saveMiddle ? [first, middle, last] : [first, last], relations: [], artifacts: [], committedSelection: null });
  const project = createMath3DProject(workspace, { stableKey: "pc14" });
  const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
  return { project, resources, first, middle, last };
};

describe("PC14 saved Mesh analysis trends", () => {
  it("uses only verified recorded points and retains exact hashes through portable import", () => {
    const { project, resources, first, middle, last } = fixture();
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const metric = "metrics.triangleArea.avg";
    expect(savedMeshTrendMetricChoices(reopened, first.resultId)).toContain(metric);
    const study = buildSavedMeshResultTrend(reopened, first.resultId, metric, item => imported.resources.bytes(item));
    expect(study.unit).toBe("m²");
    expect(study.rows.map(row => row.status)).toEqual(["available", "available", "available"]);
    expect(study.rows.map(row => row.value)).toEqual([0.5, 2, 0.5]);
    expect(study.rows.map(row => row.resultId)).toEqual([first.resultId, middle.resultId, last.resultId]);
    expect(study.rows.map(row => row.sourceHash)).toEqual([first, middle, last].map(result => result.provenance.source.structuralHash));
    expect(savedMeshResultTrendHtml(study)).toContain(first.resultId);
    expect(savedMeshResultTrendHtml(study)).toContain(last.provenance.source.structuralHash);
  });
  it("shows retained generations without a result as gaps and excludes changed methods", () => {
    const { project, resources, first, middle } = fixture(false);
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    expect(study.rows.map(row => row.status)).toEqual(["available", "not recorded", "available"]);
    expect(study.rows[1]).toMatchObject({ revision: middle.provenance.source.revision, value: null, resultId: null });
    expect(savedMeshResultTrendHtml(study)).toContain("No saved result for this retained generation");
    const altered = { ...middle, provenance: { ...middle.provenance, operation: { ...middle.provenance.operation, algorithmVersion: "99" } } };
    const different = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [first, altered] }), { stableKey: "pc14-version" });
    expect(buildSavedMeshResultTrend(different, first.resultId, "metrics.triangleArea.avg", read).rows[1]?.status).toBe("not recorded");
  });
  it("marks missing and tampered source bytes unavailable and refuses export", () => {
    const { project, resources, first } = fixture();
    const missing = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", () => null);
    expect(missing.rows.filter(row => row.resultId).every(row => row.status === "unavailable")).toBe(true);
    expect(() => savedMeshResultTrendHtml(missing)).toThrow(/unavailable/);
    const tampered = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", item => {
      const bytes = resources.bytes(item); if (!bytes) return null; const changed = bytes.slice(); changed[0] ^= 1; return changed;
    });
    expect(tampered.rows.some(row => row.status === "unavailable")).toBe(true);
    expect(() => savedMeshResultTrendHtml(tampered)).toThrow(/unavailable/);
  });
});

describe("PC20 exact saved Mesh comparison Note", () => {
  it("binds authored text to the saved pair, both results, and both source generations", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    const pair = createSavedMeshPinnedComparison(project, { study,
      a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) }, read, "pc20-pair", "PC20 pair");
    expect(() => createProjectSavedMeshComparisonNote(project, pair, read, "Observation", "Stored area increased.", 100, "pc20-note")).toThrow();
    const saved = upsertMath3DProjectSavedMeshComparison(project, pair);
    const note = createProjectSavedMeshComparisonNote(saved, pair, read, "Observation", "Stored area increased.", 100, "pc20-note");
    expect(note.anchor).toMatchObject({ kind: "saved-mesh-comparison", comparisonHash: structuralHash(pair), metricPath: pair.metricPath,
      a: pair.a, b: pair.b });
    const withNote = upsertMath3DProjectNote(saved, note);
    const imported = parseProjectPackage(exportProjectPackage(withNote, resources));
    expect(inspectProjectSavedMeshComparisonNote(imported.project, imported.project.notes![0]!, item => imported.resources.bytes(item)).status).toBe("current");
    expect(inspectProjectSavedMeshComparisonNote(withNote, note, () => null).status).toBe("missing");
    expect(inspectProjectSavedMeshComparisonNote({ ...withNote, savedMeshComparisons: [{ ...pair, metricPath: "faceCount" }] }, note, read).status).toBe("stale");
    const corrupt = (item: Parameters<typeof resources.bytes>[0]) => { const bytes = read(item); if (!bytes) return null; const copy = bytes.slice(); copy[0] ^= 1; return copy; };
    expect(inspectProjectSavedMeshComparisonNote(withNote, note, corrupt).status).toBe("missing");
  });
  it("includes verified observations in HTML and portable Workbook reports, refusing changed evidence", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    const pair = createSavedMeshPinnedComparison(project, { study,
      a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) }, read, "pc20-export", "PC20 export");
    const saved = upsertMath3DProjectSavedMeshComparison(project, pair);
    const note = createProjectSavedMeshComparisonNote(saved, pair, read, "Observed <area>", "A and B differ.", 100, "pc20-export-note");
    const withNote = upsertMath3DProjectNote(saved, note);
    const reference = createWorkbookSavedMeshComparisonReference(withNote, pair);
    const workbook = createDefaultWorkbook(() => crypto.randomUUID());
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshComparison: reference };
    const observations = checkedProjectSavedMeshComparisonObservations(withNote, pair, read);
    expect(observations).toHaveLength(1);
    const evidence = inspectSavedMeshPinnedComparison(withNote, pair, read);
    const html = savedMeshResultComparisonHtml(evidence, observations);
    expect(html).toContain("Observed &lt;area&gt;");
    expect(html).toContain(note.identity.structuralHash);
    const manifest = notebookPublicationManifest([workbook], withNote, undefined, undefined, read);
    expect(manifest.blocks.find(block => block.savedMeshComparison)?.savedMeshComparison?.observations).toEqual(observations);
    expect(notebookPublicationManifestHtml(manifest)).toContain("Observed &lt;area&gt;");
    expect(notebookPublicationMarkdown(manifest)).toContain(note.identity.structuralHash);
    const portable = createPortableNotebookPublication(withNote, [workbook], resources, undefined, read);
    expect(inspectPortableNotebookPublication(portable).project.notes?.[0]?.body).toBe(note.body);
    const forged = JSON.parse(JSON.stringify(portable)) as typeof portable;
    forged.manifest.blocks.find(block => block.savedMeshComparison)!.savedMeshComparison!.observations[0]!.body = "forged interpretation";
    forged.manifestChecksum = sha256Checksum(new TextEncoder().encode(JSON.stringify(forged.manifest)));
    expect(() => inspectPortableNotebookPublication(forged)).toThrow(/comparison/);
    const imported = parseProjectPackage(exportProjectPackage(withNote, resources));
    expect(checkedProjectSavedMeshComparisonObservations(imported.project, pair, item => imported.resources.bytes(item))).toHaveLength(1);
    const missing = () => null;
    expect(() => checkedProjectSavedMeshComparisonObservations(withNote, pair, missing)).toThrow(/unavailable|missing/i);
    const tampered = (item: Parameters<typeof resources.bytes>[0]) => {
      const bytes = read(item); if (!bytes) return null; const changed = bytes.slice(); changed[0] ^= 1; return changed;
    };
    expect(() => notebookPublicationManifest([workbook], withNote, undefined, undefined, tampered)).toThrow();
    const changed = { ...withNote, savedMeshComparisons: [{ ...pair, metricPath: "faceCount" }] };
    expect(() => checkedProjectSavedMeshComparisonObservations(changed, pair, read)).toThrow();
    expect(() => notebookPublicationManifest([workbook], changed, undefined, undefined, read)).toThrow();
  });
});

describe("PC16 exact saved trend points", () => {
  it("resolves a retained point to its exact result, Mesh revision, hash and sidecar", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    expect(resolveSavedMeshTrendPoint(project, study, middle.resultId, read)).toMatchObject({
      projectId: project.identity.id, resultId: middle.resultId,
      meshId: middle.provenance.source.documentId, revision: middle.provenance.source.revision,
      sourceHash: middle.provenance.source.structuralHash, generation: "retained",
    });
  });
  it("refuses a changed result, missing sidecar, and a stale plot snapshot", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    expect(() => resolveSavedMeshTrendPoint(project, study, middle.resultId, () => null)).toThrow();
    const changed = { ...project, workspace: createMixedWorkspaceDocument({ ...project.workspace,
      results: project.workspace.results.map(item => item.resultId === middle.resultId ?
        { ...item, summary: { ...item.summary, faceCount: 999 } } : item) }) };
    expect(() => resolveSavedMeshTrendPoint(changed, study, middle.resultId, read)).toThrow(/changed/);
    expect(() => resolveSavedMeshTrendPoint(project, { ...study, rows: study.rows.slice(1) }, middle.resultId, read)).toThrow(/changed/);
    expect(() => resolveSavedMeshTrendPoint(project, study, "missing", read)).toThrow(/no verified/);
  });
});

describe("PC17 pinned saved trend comparisons", () => {
  it("uses the existing PC13 stored-result difference for two exact retained points", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    const a = resolveSavedMeshTrendPoint(project, study, first.resultId, read);
    const b = resolveSavedMeshTrendPoint(project, study, middle.resultId, read);
    const evidence = compareSavedMeshTrendPoints(project, { study, a, b }, read);
    expect(evidence.compatible).toBe(true);
    expect(evidence.a.resultId).toBe(first.resultId);
    expect(evidence.b.resultId).toBe(middle.resultId);
    expect(evidence.metrics.find(item => item.path === "metrics.triangleArea.avg")).toMatchObject({ a: 0.5, b: 2, unit: "m²", difference: 1.5 });
  });
  it("refuses duplicate pins, stale pinned hashes, missing and tampered sidecars", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    const a = resolveSavedMeshTrendPoint(project, study, first.resultId, read);
    const b = resolveSavedMeshTrendPoint(project, study, middle.resultId, read);
    expect(() => compareSavedMeshTrendPoints(project, { study, a, b: a }, read)).toThrow(/distinct/);
    expect(() => compareSavedMeshTrendPoints(project, { study, a, b: { ...b, resultHash: "sha256:changed" } }, read)).toThrow(/changed/);
    expect(() => compareSavedMeshTrendPoints(project, { study, a, b }, () => null)).toThrow();
    expect(() => compareSavedMeshTrendPoints(project, { study, a, b }, item => {
      const bytes = resources.bytes(item); if (!bytes) return null;
      const changed = bytes.slice(); changed[0] ^= 1; return changed;
    })).toThrow();
  });
});

describe("PC18 durable pinned Mesh comparisons", () => {
  const saved = () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    const selection = { study, a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) };
    const reference = createSavedMeshPinnedComparison(project, selection, read, "saved-pair", "First versus middle");
    return { project: upsertMath3DProjectSavedMeshComparison(project, reference), resources, reference, first, middle, read };
  };
  it("reopens the exact pair after serialization and portable import", () => {
    const { project, resources, reference, first, middle } = saved();
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const imported = parseProjectPackage(exportProjectPackage(reopened, resources));
    const pair = imported.project.savedMeshComparisons?.[0];
    expect(pair).toEqual(reference);
    const evidence = inspectSavedMeshPinnedComparison(imported.project, pair!, item => imported.resources.bytes(item));
    expect(evidence.a.resultId).toBe(first.resultId);
    expect(evidence.b.resultId).toBe(middle.resultId);
    expect(evidence.metrics.find(item => item.path === reference.metricPath)?.difference).toBe(1.5);
  });
  it("refuses missing, changed, or tampered exact evidence", () => {
    const { project, resources, reference, middle, read } = saved();
    expect(() => inspectSavedMeshPinnedComparison(project, reference, () => null)).toThrow();
    expect(() => inspectSavedMeshPinnedComparison(project, reference, item => {
      const bytes = resources.bytes(item); if (!bytes) return null; const changed = bytes.slice(); changed[0] ^= 1; return changed;
    })).toThrow();
    expect(() => inspectSavedMeshPinnedComparison(project, { ...reference, b: { ...reference.b, sourceHash: reference.a.sourceHash } }, read)).toThrow();
    const missing = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace,
      results: project.workspace.results.filter(item => item.resultId !== middle.resultId) }), { stableKey: "pc18-missing" });
    expect(() => inspectSavedMeshPinnedComparison({ ...missing, savedMeshComparisons: [reference] }, reference, read)).toThrow();
  });
});

describe("PC19 Workbook pinned Mesh reference contract", () => {
  it("links only a saved pair and retains both exact result and source hashes", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    const selection = { study, a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) };
    const pinned = createSavedMeshPinnedComparison(project, selection, read, "pair-pc19", "PC19 pair");
    expect(() => createWorkbookSavedMeshComparisonReference(project, pinned)).toThrow(/Save/);
    const saved = upsertMath3DProjectSavedMeshComparison(project, pinned);
    const reference = createWorkbookSavedMeshComparisonReference(saved, pinned);
    expect(reference.a.resultHash).toBe(selection.a.resultHash);
    expect(reference.b.sourceHash).toBe(selection.b.sourceHash);
    expect(inspectWorkbookSavedMeshComparisonReference(saved, reference)).toBe("current");
    const workbook = createDefaultWorkbook(() => crypto.randomUUID());
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshComparison: reference };
    validateWorkbookDependencies(workbook);
    expect(JSON.parse(JSON.stringify(workbook)).stages[2].blocks[0].visualize.savedMeshComparison).toEqual(reference);
    expect(() => normalizeWorkbookSavedMeshComparisonReference({ ...reference, b: reference.a })).toThrow();
    expect(inspectWorkbookSavedMeshComparisonReference(saved, { ...reference, comparisonHash: structuralHash("changed") })).toBe("stale");
    expect(inspectWorkbookSavedMeshComparisonReference(project, reference)).toBe("missing");
  });
  it("reopens and publishes the same checked A/B values after Project and Workbook import", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    const pinned = createSavedMeshPinnedComparison(project, { study,
      a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) }, read, "pc19-report", "PC19 report");
    const saved = upsertMath3DProjectSavedMeshComparison(project, pinned);
    const reference = createWorkbookSavedMeshComparisonReference(saved, pinned);
    let n = 0; const workbook = createDefaultWorkbook(() => `pc19-${++n}`);
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshComparison: reference };
    const bound = prepareProjectWorkbook(saved, workbook, "pc19");
    expect(readProjectWorkbook(bound.bytes, bound.reference).stages[2]!.blocks[0]!.visualize?.savedMeshComparison).toEqual(reference);
    const imported = parseProjectPackage(exportProjectPackage(saved, resources));
    const checked = inspectWorkbookSavedMeshComparison(imported.project, reference, item => imported.resources.bytes(item));
    expect(checked.status).toBe("current");
    expect(checked.evidence?.metrics.find(metric => metric.path === reference.metricPath)?.difference).toBe(1.5);
    expect(resolveWorkbookSavedMeshComparisonTarget(imported.project, reference, "a", item => imported.resources.bytes(item)).resultId).toBe(first.resultId);
    expect(resolveWorkbookSavedMeshComparisonTarget(imported.project, reference, "b", item => imported.resources.bytes(item)).resultId).toBe(middle.resultId);
    const manifest = notebookPublicationManifest([workbook], imported.project, undefined, undefined, item => imported.resources.bytes(item));
    expect(manifest.blocks.find(block => block.savedMeshComparison)?.savedMeshComparison?.reference).toEqual(reference);
    const html = notebookPublicationManifestHtml(manifest), markdown = notebookPublicationMarkdown(manifest);
    expect(html).toContain("data-saved-mesh-comparison");
    expect(html).toContain("1.5");
    for (const result of [first, middle]) {
      expect(html).toContain(result.resultId);
      expect(markdown).toContain(result.provenance.source.structuralHash);
    }
    const portable = createPortableNotebookPublication(saved, [workbook], resources, undefined, read);
    expect(inspectPortableNotebookPublication(portable).project.identity.id).toBe(saved.identity.id);
  });
  it("refuses missing, changed and tampered source evidence in Workbook and export", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    const pinned = createSavedMeshPinnedComparison(project, { study,
      a: resolveSavedMeshTrendPoint(project, study, first.resultId, read),
      b: resolveSavedMeshTrendPoint(project, study, middle.resultId, read) }, read, "pc19-refusal", "PC19 refusal");
    const saved = upsertMath3DProjectSavedMeshComparison(project, pinned);
    const reference = createWorkbookSavedMeshComparisonReference(saved, pinned);
    let n = 0; const workbook = createDefaultWorkbook(() => `pc19-refusal-${++n}`);
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshComparison: reference };
    expect(inspectWorkbookSavedMeshComparison(saved, reference, () => null).status).not.toBe("current");
    expect(() => notebookPublicationManifest([workbook], saved, undefined, undefined, () => null)).toThrow(/comparison/);
    const corrupt = (item: Parameters<typeof resources.bytes>[0]) => { const bytes = read(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy; };
    expect(inspectWorkbookSavedMeshComparison(saved, reference, corrupt).status).not.toBe("current");
    expect(() => notebookPublicationManifest([workbook], saved, undefined, undefined, corrupt)).toThrow(/comparison/);
    const changed = { ...saved, savedMeshComparisons: [] };
    expect(inspectWorkbookSavedMeshComparison(changed, reference, read).status).not.toBe("current");
    expect(() => notebookPublicationManifest([workbook], changed, undefined, undefined, read)).toThrow(/comparison/);
    const changedResult = { ...saved, workspace: createMixedWorkspaceDocument({ ...saved.workspace,
      results: saved.workspace.results.map(result => result.resultId === middle.resultId ?
        { ...result, summary: { ...result.summary, faceCount: 999 } } : result) }) };
    expect(inspectWorkbookSavedMeshComparison(changedResult, reference, read).status).not.toBe("current");
  });
});
