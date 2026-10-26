import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DFieldReference, createScientificFieldDocument, Graph2DPointTableStore,
  parseScientificFieldDocument, previewGraph2DScientificVolumeLine,
  reviseScientificFieldDocument, scientificFieldResultBinding,
  serializeScientificFieldDocument, sha256Checksum,
  type Graph2DScientificDatasetPreview, type ScientificFieldDocument } from "@math3d/core";
import { reverifyScientificFieldLine } from "./reverifyScientificFieldLine";
import { createSavedScientificFieldRefreshAction,
  reverifySavedScientificFieldGraphResult } from "./reverifySavedScientificFieldGraphResult";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
type Bridge = NonNullable<typeof window.scientificScenes>;
const graphFor = (field: ScientificFieldDocument, previews: readonly Graph2DScientificDatasetPreview[],
  store: Graph2DPointTableStore) => {
  const drafts = previews.map(preview => ({ label: preview.label, table: store.publish(preview.rows),
    mode: "line" as const, domain: preview.domain,
    origin: { ...preview.origin, locator: field.source.reference.locator,
      fieldDocument: scientificFieldResultBinding(field) }, style }));
  const initial = createEmptyGraph2DDocument("saved-field-result");
  const scene = drafts.length === 1 ? applyGraph2DAuthoring(initial,
    { type: "create-point-series", draft: drafts[0]! }) : applyGraph2DAuthoring(initial,
    { type: "create-point-series-pair", drafts: drafts as [typeof drafts[number], typeof drafts[number]] });
  return createGraph2DDocument({ ...scene, stableKey: "saved-field-result" });
};

const scalarFixture = () => {
  const root = new URL("../../../tests/fixtures/scientific-scene/thermal-gradient.sscene/", import.meta.url);
  const manifestJson = readFileSync(fileURLToPath(new URL("manifest.json", root)), "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const reference = createGraph2DFieldReference(manifestJson, fingerprint,
    { kind: "preset", value: "thermal-gradient" }, "temperature", "scalar");
  const field = createScientificFieldDocument({ reference,
    quantity: { name: "Temperature", unit: "K" },
    display: { view: "plane", normalAxis: null, fixedIndex: null,
      transfer: { mode: "data" } } }, { stableKey: reference.id });
  const bytes = readFileSync(fileURLToPath(new URL("temperature.f64", root)));
  const values = Array.from({ length: 5 }, (_, index) => bytes.readDoubleLE((index * 7 + 1) * 8));
  const raw = new Uint8Array(values.length * 8), view = new DataView(raw.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  const bridge = {
    openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson, fingerprint } })),
    previewGraphSlice: vi.fn(async () => ({ fingerprint, datasetId: "temperature",
      component: "scalar", varyingAxis: 0, fixedIndex: 1, shape: [5, 7],
      resourceSha256: reference.resourceSha256, sliceSha256: sha256Checksum(raw).slice(7), values })),
    closeGraphDataset: vi.fn(async () => true),
  } as unknown as Bridge;
  return { field, reference, bridge };
};

const complexFixture = () => {
  const root = new URL("../../../tests/fixtures/scientific-scene/complex-wave-volume.sscene/", import.meta.url);
  const manifestJson = readFileSync(fileURLToPath(new URL("manifest.json", root)), "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const locator = { kind: "preset" as const, value: "complexWaveVolume" };
  const real = createGraph2DFieldReference(manifestJson, fingerprint, locator, "field", "real");
  const imaginary = createGraph2DFieldReference(manifestJson, fingerprint, locator, "field", "imaginary");
  const selection = { normalAxis: 2 as const, planeFixedIndex: 8,
    varyingAxis: 0 as const, fixedIndex: 20 };
  const field = createScientificFieldDocument({ reference: real,
    paired: { imaginary, line: selection }, quantity: { name: "Wave amplitude", unit: "1" },
    display: { view: "plane", normalAxis: 2, fixedIndex: 8,
      transfer: { mode: "data" } } }, { stableKey: real.id });
  const lines = ([real, imaginary] as const).map(reference => {
    const bytes = readFileSync(fileURLToPath(new URL(`${reference.component}.f64`, root)));
    const values = Array.from({ length: 41 }, (_, x) => bytes.readDoubleLE(((x * 41 + 20) * 17 + 8) * 8));
    const raw = new Uint8Array(values.length * 8), view = new DataView(raw.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    return { fingerprint, datasetId: "field", component: reference.component,
      shape: [41, 41, 17] as [number, number, number], ...selection,
      resourceSha256: reference.resourceSha256, sliceSha256: sha256Checksum(raw).slice(7), values };
  });
  const pair = lines as [typeof lines[number], typeof lines[number]];
  const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
    source: { manifestJson, fingerprint } })),
    previewGraphComplexVolumeLines: vi.fn(async () => pair),
    closeGraphDataset: vi.fn(async () => true) } as unknown as Bridge;
  const previews = lines.map(line => previewGraph2DScientificVolumeLine(manifestJson, fingerprint, line));
  return { field, real, imaginary, bridge, previews };
};

describe("saved scientific Graph result reverification", () => {
  it("rechecks scalar rows after reopen, relink and transfer corruption before refreshing provenance", async () => {
    const { field, reference, bridge } = scalarFixture();
    const selection = { kind: "grid2d" as const, varyingAxis: 0 as const, fixedIndex: 1 };
    const preview = await reverifyScientificFieldLine(field, selection, bridge);
    const store = new Graph2DPointTableStore(), graph = graphFor(field, [preview], store);
    const reopened = parseScientificFieldDocument(serializeScientificFieldDocument(field));
    const first = await reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [reopened], store, bridge);
    expect(first.matchesStored).toBe(true);
    const object = graph.source.objects[0]!;
    if (object.kind !== "point-series") throw new Error("Expected a saved field line.");
    const alteredRows = preview.rows.map((row, index) => index ? row : { ...row, y: row.y! + 1 });
    const altered = createGraph2DDocument({ ...applyGraph2DAuthoring(graph, {
      type: "edit-point-series", objectId: object.id, draft: { label: object.label,
        table: store.publish(alteredRows), mode: object.mode, domain: object.domain,
        origin: object.origin, style } }), stableKey: "saved-field-result" });
    expect(() => createSavedScientificFieldRefreshAction(first, altered, store))
      .toThrow(/Graph selection or source changed/);
    const mismatch = await reverifySavedScientificFieldGraphResult(altered, altered.selection.objectId!,
      [reopened], store, bridge);
    expect(mismatch.rowsMatch).toBe(false);
    const repaired = createGraph2DDocument({ ...applyGraph2DAuthoring(altered,
      createSavedScientificFieldRefreshAction(mismatch, altered, store)),
    stableKey: "saved-field-result" });
    expect((await reverifySavedScientificFieldGraphResult(repaired, repaired.selection.objectId!,
      [reopened], store, bridge)).matchesStored).toBe(true);
    const moved = createGraph2DFieldReference(readFileSync(fileURLToPath(new URL(
      "../../../tests/fixtures/scientific-scene/thermal-gradient.sscene/manifest.json", import.meta.url)), "utf8"),
    reference.sceneFingerprint, { kind: "directory", value: "C:\\moved\\thermal-gradient.sscene" },
    "temperature", "scalar");
    const relinked = reviseScientificFieldDocument(reopened, { ...reopened.source,
      reference: { ...moved, id: reference.id } });
    const stale = await reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [relinked], store, bridge);
    expect(stale.rowsMatch).toBe(true);
    expect(stale.matchesStored).toBe(false);
    const action = createSavedScientificFieldRefreshAction(stale, graph, store);
    expect(action.type).toBe("edit-point-series");
    const refreshed = createGraph2DDocument({ ...applyGraph2DAuthoring(graph, action),
      stableKey: "saved-field-result" });
    expect((refreshed.source.objects[0] as typeof graph.source.objects[number]).id)
      .toBe(graph.source.objects[0]!.id);
    expect((await reverifySavedScientificFieldGraphResult(refreshed, refreshed.selection.objectId!,
      [relinked], store, bridge)).matchesStored).toBe(true);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () => ({ ok: false,
      status: "missing", error: "bundle removed" })) } as unknown as Bridge;
    await expect(reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [relinked], store, missing)).rejects.toThrow(/source missing/);
    const tampered = { ...bridge, previewGraphSlice: vi.fn(async () => ({ ...await bridge.previewGraphSlice!({
      fingerprint: reference.sceneFingerprint, datasetId: "temperature", component: "scalar",
      varyingAxis: 0, fixedIndex: 1 }), sliceSha256: "0".repeat(64) })) } as unknown as Bridge;
    await expect(reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [relinked], store, tampered)).rejects.toThrow(/checksum/);
  });

  it("verifies both complex components and refreshes them in one Graph command", async () => {
    const { field, bridge, previews } = complexFixture();
    const store = new Graph2DPointTableStore(), graph = graphFor(field, previews, store);
    const restored = parseScientificFieldDocument(serializeScientificFieldDocument(field));
    expect((await reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [restored], store, bridge)).matchesStored).toBe(true);
    const revised = reviseScientificFieldDocument(restored, { ...restored.source,
      display: { ...restored.source.display, transfer: { mode: "percentile" } } });
    const stale = await reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [revised], store, bridge);
    expect(stale.rowsMatch).toBe(true);
    expect(stale.matchesStored).toBe(false);
    const action = createSavedScientificFieldRefreshAction(stale, graph, store);
    expect(action.type).toBe("edit-point-series-pair");
    const refreshed = createGraph2DDocument({ ...applyGraph2DAuthoring(graph, action),
      stableKey: "saved-field-result" });
    expect(refreshed.source.objects.map(item => item.id)).toEqual(graph.source.objects.map(item => item.id));
    expect((await reverifySavedScientificFieldGraphResult(refreshed, refreshed.selection.objectId!,
      [revised], store, bridge)).matchesStored).toBe(true);
    const locator = { kind: "directory" as const, value: "C:\\moved\\complex-wave-volume.sscene" };
    const moved = reviseScientificFieldDocument(revised, { ...revised.source,
      reference: { ...revised.source.reference, locator }, paired: { ...revised.source.paired!,
        imaginary: { ...revised.source.paired!.imaginary, locator } } });
    const relinkReview = await reverifySavedScientificFieldGraphResult(refreshed,
      refreshed.selection.objectId!, [moved], store, bridge);
    expect(relinkReview.rowsMatch).toBe(true);
    expect(relinkReview.matchesStored).toBe(false);
    expect(createSavedScientificFieldRefreshAction(relinkReview, refreshed, store).type)
      .toBe("edit-point-series-pair");
    const changed = { ...bridge, previewGraphComplexVolumeLines: vi.fn(async () => {
      const original = await bridge.previewGraphComplexVolumeLines!({ fingerprint: field.source.reference.sceneFingerprint,
        datasetId: field.source.reference.datasetId, normalAxis: 2, planeFixedIndex: 8,
        varyingAxis: 0, fixedIndex: 20 });
      return [original[0], { ...original[1], sliceSha256: "0".repeat(64) }];
    }) } as unknown as Bridge;
    await expect(reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [revised], store, changed)).rejects.toThrow(/checksum/);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () => ({ ok: false,
      status: "missing", error: "bundle removed" })) } as unknown as Bridge;
    await expect(reverifySavedScientificFieldGraphResult(graph, graph.selection.objectId!,
      [revised], store, missing)).rejects.toThrow(/source missing/);
  });
});
