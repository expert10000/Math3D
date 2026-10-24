import { describe, expect, it, vi } from "vitest";
import { acceptGraph2DComplexContour, applyGraph2DAuthoring, createComplexAnalysisDocument,
  createEmptyGraph2DDocument, createGraph2DDocument, deserializeComplexAnalysisDocument,
  graph2DComplexContourSourceStatus, refreshGraph2DComplexContour, reviewGraph2DComplexContour,
  reviewGraph2DComplexPair, verifyGraph2DComplexPairBundle, Graph2DPointTableStore, previewGraph2DScientificSlice,
  previewGraph2DScientificVolumeLine, serializeComplexAnalysisDocument, sha256Checksum,
  type Graph2DPointSeriesDraft, type ScientificSceneManifest } from "@math3d/core";
import { reverifyComplexFieldSource } from "./reverifyComplexFieldSource";

const path = (xExpression = "cos(t)", yExpression = "sin(t)") => {
  const draft = { label: "Complex contour", xExpression, yExpression,
    domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true } };
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("complex-graph-source"),
    { type: "create-parametric", draft });
  const document = createGraph2DDocument({ ...source, stableKey: "complex-graph-source" });
  return { document, draft, objectId: document.source.objects[0]!.id };
};

describe("GRA-17 sampled Graph path to Complex Analysis contour", () => {
  it("reviews a circle, commits only a fresh source and persists source lineage", () => {
    const { document, objectId } = path();
    const review = reviewGraph2DComplexContour(document, objectId);
    expect(review.target.contours[0]!.points).toHaveLength(257);
    expect(review.target.contours[0]!.closed).toBe(true);
    expect(review.target.function.sourceText).toBe("z");
    expect(review.maximumSegmentLength).toBeLessThan(.03);
    expect(review.warnings.join(" ")).toMatch(/not an analytic complex function/i);
    const target = acceptGraph2DComplexContour(review, document);
    expect(graph2DComplexContourSourceStatus(target, document)).toBe("current");
    const restored = deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(target));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.provenance.graphSource?.structuralHash).toBe(document.identity.structuralHash);
    expect(graph2DComplexContourSourceStatus(restored.value, document)).toBe("current");
  });

  it("detects changed and missing sources, re-reviews refresh and protects edited targets", () => {
    const { document, draft, objectId } = path();
    const review = reviewGraph2DComplexContour(document, objectId, { sampleCount: 129, closure: "auto" });
    const changedSource = createGraph2DDocument({
      ...applyGraph2DAuthoring(document, { type: "edit-parametric", objectId,
        draft: { ...draft, xExpression: "2*cos(t)" } }), stableKey: "complex-graph-source" });
    expect(() => acceptGraph2DComplexContour(review, changedSource)).toThrow(/changed after contour preview/i);
    const target = acceptGraph2DComplexContour(review, document);
    expect(graph2DComplexContourSourceStatus(target, changedSource)).toBe("changed");
    expect(graph2DComplexContourSourceStatus(target, null)).toBe("missing");
    const refreshed = refreshGraph2DComplexContour(target, changedSource);
    expect(refreshed.identity.id).toBe(target.identity.id);
    expect(refreshed.identity.revision).toBe(target.identity.revision + 1);
    expect(refreshed.contours[0]!.points).toHaveLength(129);
    expect(graph2DComplexContourSourceStatus(refreshed, changedSource)).toBe("current");
    const edited = createComplexAnalysisDocument({ function: target.function,
      parameters: target.parameters, assumptions: target.assumptions, domain: target.domain,
      sampling: target.sampling, contours: [], branchPolicy: target.branchPolicy,
      covering: target.covering, mobius: target.mobius }, {
      id: target.identity.id, revision: target.identity.revision + 1, provenance: target.provenance });
    expect(graph2DComplexContourSourceStatus(edited, changedSource)).toBe("target-edited");
    expect(() => refreshGraph2DComplexContour(edited, changedSource)).toThrow(/target was edited/i);
  });

  it("rejects undefined paths and unsupported closure rather than fabricating a contour", () => {
    const { document, objectId } = path("1/t", "t");
    expect(() => reviewGraph2DComplexContour(document, objectId)).toThrow(/undefined at sample/i);
    const line = path("t", "0");
    expect(() => reviewGraph2DComplexContour(line.document, line.objectId,
      { sampleCount: 32, closure: "closed" })).toThrow(/endpoints do not meet/i);
    const stationary = path("1", "0");
    expect(() => reviewGraph2DComplexContour(stationary.document, stationary.objectId))
      .toThrow(/degenerate/i);
  });

  it("retains an explicit open closure policy across source refresh", () => {
    const { document, draft, objectId } = path();
    const review = reviewGraph2DComplexContour(document, objectId, { sampleCount: 65, closure: "open" });
    const target = acceptGraph2DComplexContour(review, document);
    expect(target.contours[0]!.closed).toBe(false);
    expect(target.provenance.graphSource?.closure).toBe("open");
    const changed = createGraph2DDocument({
      ...applyGraph2DAuthoring(document, { type: "edit-parametric", objectId,
        draft: { ...draft, xExpression: "2*cos(t)" } }), stableKey: "complex-graph-source" });
    const refreshed = refreshGraph2DComplexContour(target, changed);
    expect(refreshed.contours[0]!.closed).toBe(false);
    expect(refreshed.provenance.graphSource?.closure).toBe("open");
  });
});

describe("GRA-17 paired 3D complex plane lines", () => {
  const shape = [17, 2, 3] as const;
  const values = (component: "real" | "imaginary") => Array.from({ length: 102 }, (_, index) => {
    const i = Math.floor(index / 6), j = Math.floor(index / 3) % 2, k = index % 3;
    return (component === "real" ? Math.cos(2 * Math.PI * i / 16) : Math.sin(2 * Math.PI * i / 16)) +
      j * .02 + k * .1;
  });
  const realValues = values("real"), imaginaryValues = values("imaginary");
  const hashValues = (numbers: readonly number[]) => {
    const bytes = new Uint8Array(numbers.length * 8), view = new DataView(bytes.buffer);
    numbers.forEach((number, index) => view.setFloat64(index * 8, number, true));
    return sha256Checksum(bytes).slice(7);
  };
  const manifest: ScientificSceneManifest = { schema: "scientific-scene/v1", sceneId: "complex-volume",
    title: "Complex volume", source: { producer: "theory-lab", sourceId: "complex-run",
      sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [
      { id: "real-values", path: "real.f64", format: "f64le", count: 102, bytes: 816, sha256: hashValues(realValues) },
      { id: "imag-values", path: "imag.f64", format: "f64le", count: 102, bytes: 816, sha256: hashValues(imaginaryValues) },
    ], coordinates: [{ id: "volume", kind: "cartesian", axes: [{ name: "x", unit: "m" },
      { name: "y", unit: "m" }, { name: "z", unit: "m" }], origin: [-4, 2, -1],
      spacing: [.5, 2, .5], periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "complex-scalar-field", coordinateSystem: "volume",
      shape: [...shape], order: "last-axis-fastest", quantity: { name: "Amplitude", unit: "V" },
      real: "real-values", imaginary: "imag-values" }], views: [] };
  const json = JSON.stringify(manifest), fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
  const rawLine = (component: "real" | "imaginary", planeFixedIndex = 1) => {
    const source = component === "real" ? realValues : imaginaryValues;
    const lineValues = Array.from({ length: 17 }, (_, i) => source[(i * 2 + 1) * 3 + planeFixedIndex]!);
    return { fingerprint, datasetId: "field", component, shape: [...shape] as [number, number, number],
      normalAxis: 2 as const, planeFixedIndex, varyingAxis: 0 as const, fixedIndex: 1,
      resourceSha256: manifest.resources[component === "real" ? 0 : 1]!.sha256,
      sliceSha256: hashValues(lineValues), values: lineValues };
  };
  const locator = { kind: "directory" as const, value: "C:/verified-complex-volume.sscene" };
  const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };

  it("imports one undoable pair with plane provenance and maps it after a fresh two-component check", async () => {
    const previews = ["real", "imaginary"].map(component =>
      previewGraph2DScientificVolumeLine(json, fingerprint, rawLine(component as "real" | "imaginary"))) as
      [ReturnType<typeof previewGraph2DScientificVolumeLine>, ReturnType<typeof previewGraph2DScientificVolumeLine>];
    const store = new Graph2DPointTableStore();
    const drafts = previews.map(preview => ({ label: preview.label, table: store.publish(preview.rows),
      mode: "line" as const, domain: preview.domain, origin: { ...preview.origin, locator }, style })) as
      [Graph2DPointSeriesDraft, Graph2DPointSeriesDraft];
    const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("complex-volume-pair"),
      { type: "create-point-series-pair", drafts });
    expect(scene.source.objects).toHaveLength(2);
    const document = createGraph2DDocument({ ...scene, stableKey: "complex-volume-pair" });
    const [real, imaginary] = document.source.objects;
    const review = reviewGraph2DComplexPair(document, real!.id, imaginary!.id,
      { sampleCount: 17, closure: "auto" }, store);
    expect(review.target.provenance.graphSource?.scientificSource).toMatchObject({
      varyingAxis: 0, fixedAxis: 1, fixedIndex: 1, fixedCoordinate: 4,
      plane: { normalAxis: 2, fixedIndex: 1, fixedCoordinate: -.5, fixedName: "z", fixedUnit: "m" },
      realResourceSha256: manifest.resources[0]!.sha256,
      imaginaryResourceSha256: manifest.resources[1]!.sha256 });
    expect(deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(review.target)).ok).toBe(true);
    expect(() => verifyGraph2DComplexPairBundle(document, real!.id, imaginary!.id, store,
      json, fingerprint, [rawLine("real"), rawLine("imaginary")])).not.toThrow();
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true as const,
      source: { manifestJson: json, fingerprint } })), previewGraphSlice: vi.fn(),
    previewGraphComplexVolumeLines: vi.fn(async () => [rawLine("real"), rawLine("imaginary")]),
    closeGraphDataset: vi.fn(async () => true) } as unknown as
      Pick<NonNullable<typeof window.scientificScenes>,
        "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphComplexVolumeLines" | "closeGraphDataset">;
    await expect(reverifyComplexFieldSource(document, real!.id, imaginary!.id, store, bridge)).resolves.toBeUndefined();
    expect(bridge.previewGraphComplexVolumeLines).toHaveBeenCalledOnce();
    const changed = { ...bridge, previewGraphComplexVolumeLines: vi.fn(async () =>
      [rawLine("real"), rawLine("imaginary", 2)]) } as unknown as typeof bridge;
    await expect(reverifyComplexFieldSource(document, real!.id, imaginary!.id, store, changed))
      .rejects.toThrow(/line or axes changed/);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () =>
      ({ ok: false as const, status: "missing" as const, error: "imaginary resource removed" })) };
    await expect(reverifyComplexFieldSource(document, real!.id, imaginary!.id, store, missing))
      .rejects.toThrow(/bundle missing/);
    const wrong = previewGraph2DScientificVolumeLine(json, fingerprint, rawLine("imaginary", 2));
    const mismatched = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit-point-series",
      objectId: imaginary!.id, draft: { label: wrong.label, table: store.publish(wrong.rows),
        mode: "line", domain: wrong.domain, origin: { ...wrong.origin, locator }, style } }),
      stableKey: "complex-volume-pair" });
    expect(() => reviewGraph2DComplexPair(mismatched, real!.id, imaginary!.id,
      { sampleCount: 17, closure: "auto" }, store)).toThrow(/same verified complex-grid slice/);
  });
});

describe("GRA-17 paired Graph and verified complex-grid sources", () => {
  const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
  const domain = { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true };

  it("pairs independent functions, persists both IDs, and refreshes after either source changes", () => {
    let scene = createEmptyGraph2DDocument("paired-complex-functions");
    scene = applyGraph2DAuthoring(scene, { type: "create", draft: { label: "Real", expression: "cos(x)", domain, style } });
    scene = applyGraph2DAuthoring(scene, { type: "create", draft: { label: "Imaginary", expression: "sin(x)", domain, style } });
    const document = createGraph2DDocument({ ...scene, stableKey: "paired-complex-functions" });
    const [real, imaginary] = document.source.objects;
    const review = reviewGraph2DComplexPair(document, real!.id, imaginary!.id, { sampleCount: 129, closure: "auto" });
    expect(review.target.contours[0]?.closed).toBe(true);
    expect(review.target.provenance.graphSource).toMatchObject({ objectId: real!.id,
      pairedObjectId: imaginary!.id, mapping: "paired-functions-to-complex-contour" });
    const target = acceptGraph2DComplexContour(review, document);
    expect(deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(target)).ok).toBe(true);
    expect(graph2DComplexContourSourceStatus(target, document)).toBe("current");
    const changed = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit", objectId: imaginary!.id,
      draft: { label: "Imaginary", expression: "0.5*sin(x)", domain, style } }), stableKey: "paired-complex-functions" });
    expect(graph2DComplexContourSourceStatus(target, changed)).toBe("changed");
    expect(() => acceptGraph2DComplexContour(review, changed)).toThrow(/changed after contour preview/);
    const refreshed = refreshGraph2DComplexContour(target, changed);
    expect(refreshed.identity.id).toBe(target.identity.id);
    expect(graph2DComplexContourSourceStatus(refreshed, changed)).toBe("current");
    expect(refreshed.provenance.graphSource?.pairedObjectId).toBe(imaginary!.id);
  });

  it("rejects disjoint domains and undefined paired samples", () => {
    let scene = createEmptyGraph2DDocument("invalid-complex-pair");
    scene = applyGraph2DAuthoring(scene, { type: "create", draft: { label: "Real", expression: "x", domain, style } });
    scene = applyGraph2DAuthoring(scene, { type: "create", draft: { label: "Imaginary", expression: "1/x", domain, style } });
    const document = createGraph2DDocument({ ...scene, stableKey: "invalid-complex-pair" });
    expect(() => reviewGraph2DComplexPair(document, document.source.objects[0]!.id,
      document.source.objects[1]!.id)).toThrow(/undefined at sample/);
    const disjoint = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit",
      objectId: document.source.objects[1]!.id,
      draft: { label: "Imaginary", expression: "x", domain: { ...domain, min: 10, max: 20 }, style } }),
      stableKey: "invalid-complex-pair" });
    expect(() => reviewGraph2DComplexPair(disjoint, disjoint.source.objects[0]!.id,
      disjoint.source.objects[1]!.id)).toThrow(/shared domain/);
  });

  it("maps only checksum-checked real/imaginary lines from the same fixed grid coordinate", async () => {
    const shape = [17, 2] as const;
    const realValues = Array.from({ length: 34 }, (_, index) => Math.cos(2 * Math.PI * Math.floor(index / 2) / 16));
    const imaginaryValues = Array.from({ length: 34 }, (_, index) => Math.sin(2 * Math.PI * Math.floor(index / 2) / 16));
    const hashValues = (values: readonly number[]) => { const bytes = new Uint8Array(values.length * 8);
      const view = new DataView(bytes.buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true));
      return sha256Checksum(bytes).slice(7); };
    const manifest: ScientificSceneManifest = { schema: "scientific-scene/v1", sceneId: "wave-grid",
      title: "Complex wave grid", source: { producer: "theory-lab", sourceId: "wave-run",
        sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
      resources: [
        { id: "real-values", path: "real.f64", format: "f64le", count: 34, bytes: 272, sha256: hashValues(realValues) },
        { id: "imag-values", path: "imag.f64", format: "f64le", count: 34, bytes: 272, sha256: hashValues(imaginaryValues) },
      ], coordinates: [{ id: "grid", kind: "cartesian", axes: [{ name: "time", unit: "s" },
        { name: "height", unit: "m" }], origin: [0, 4], spacing: [.25, 2], periodic: [false, false] }],
      datasets: [{ id: "amplitude", semanticType: "complex-scalar-field", coordinateSystem: "grid",
        shape: [...shape], order: "last-axis-fastest", quantity: { name: "Amplitude", unit: "V" },
        real: "real-values", imaginary: "imag-values" }], views: [] };
    const json = JSON.stringify(manifest), fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const rawLine = (component: "real" | "imaginary", fixedIndex: number) => {
      const values = (component === "real" ? realValues : imaginaryValues)
        .filter((_, index) => index % 2 === fixedIndex);
      return { fingerprint, datasetId: "amplitude",
        component, varyingAxis: 0, fixedIndex, shape,
        resourceSha256: manifest.resources[component === "real" ? 0 : 1]!.sha256,
        sliceSha256: hashValues(values), values };
    };
    const line = (component: "real" | "imaginary", fixedIndex: number) =>
      previewGraph2DScientificSlice(json, fingerprint, rawLine(component, fixedIndex));
    const store = new Graph2DPointTableStore();
    const real = line("real", 1), imaginary = line("imaginary", 1);
    let scene = createEmptyGraph2DDocument("complex-grid-pair");
    for (const preview of [real, imaginary]) scene = applyGraph2DAuthoring(scene, { type: "create-point-series",
      draft: { label: preview.label, table: store.publish(preview.rows), mode: "line",
        domain: preview.domain, origin: { ...preview.origin,
          locator: { kind: "preset", value: "complexWave" } }, style } });
    const document = createGraph2DDocument({ ...scene, stableKey: "complex-grid-pair" });
    const [realObject, imaginaryObject] = document.source.objects;
    const review = reviewGraph2DComplexPair(document, realObject!.id, imaginaryObject!.id,
      { sampleCount: 257, closure: "auto" }, store);
    expect(review.target.contours[0]?.points).toHaveLength(17);
    expect(review.target.provenance.graphSource?.scientificSource).toMatchObject({
      sceneId: "wave-grid", datasetId: "amplitude", varyingAxis: 0, fixedIndex: 1,
      fixedCoordinate: 6, fixedName: "height", fixedUnit: "m", varyingName: "time", varyingUnit: "s",
      realResourceSha256: manifest.resources[0]!.sha256,
      imaginaryResourceSha256: manifest.resources[1]!.sha256 });
    const target = acceptGraph2DComplexContour(review, document, store);
    expect(() => verifyGraph2DComplexPairBundle(document, realObject!.id, imaginaryObject!.id, store,
      json, fingerprint, [rawLine("real", 1), rawLine("imaginary", 1)])).not.toThrow();
    const changedLine = rawLine("imaginary", 1);
    const changedValues = [...changedLine.values]; changedValues[3] += .125;
    expect(() => verifyGraph2DComplexPairBundle(document, realObject!.id, imaginaryObject!.id, store,
      json, fingerprint, [rawLine("real", 1), { ...changedLine, values: changedValues,
        sliceSha256: hashValues(changedValues) }])).toThrow(/line or axes changed/);
    expect(() => verifyGraph2DComplexPairBundle(document, realObject!.id, imaginaryObject!.id, store,
      json, "0".repeat(64), [rawLine("real", 1), rawLine("imaginary", 1)])).toThrow(/fingerprint changed/);
    const close = vi.fn(async () => true);
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson: json, fingerprint } })),
    previewGraphSlice: vi.fn(async (request: { component: "real" | "imaginary" }) =>
      rawLine(request.component, 1)), previewGraphComplexVolumeLines: vi.fn(), closeGraphDataset: close } as unknown as
      Pick<NonNullable<typeof window.scientificScenes>,
        "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphComplexVolumeLines" | "closeGraphDataset">;
    await expect(reverifyComplexFieldSource(document, realObject!.id, imaginaryObject!.id, store, bridge)).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledWith(fingerprint);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () =>
      ({ ok: false as const, status: "missing" as const, error: "bundle removed" })) };
    await expect(reverifyComplexFieldSource(document, realObject!.id, imaginaryObject!.id, store, missing))
      .rejects.toThrow(/bundle missing: bundle removed/);
    const changedBridge = { ...bridge, previewGraphSlice: vi.fn(async (request: { component: "real" | "imaginary" }) =>
      request.component === "real" ? rawLine("real", 1) : { ...changedLine, values: changedValues,
        sliceSha256: hashValues(changedValues) }) } as unknown as typeof bridge;
    await expect(reverifyComplexFieldSource(document, realObject!.id, imaginaryObject!.id, store, changedBridge))
      .rejects.toThrow(/line or axes changed/);
    expect(deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(target)).ok).toBe(true);
    expect(graph2DComplexContourSourceStatus(target, document, store)).toBe("current");
    if (imaginaryObject?.kind !== "point-series") throw new Error("Expected imported imaginary line.");
    const changed = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit-point-series",
      objectId: imaginaryObject.id, draft: { label: "Imaginary line reviewed", table: imaginaryObject.table,
        mode: imaginaryObject.mode, domain: imaginaryObject.domain, origin: imaginaryObject.origin, style } }),
      stableKey: "complex-grid-pair" });
    expect(graph2DComplexContourSourceStatus(target, changed, store)).toBe("changed");
    const refreshed = refreshGraph2DComplexContour(target, changed, undefined, store);
    expect(graph2DComplexContourSourceStatus(refreshed, changed, store)).toBe("current");
    expect(refreshed.provenance.graphSource?.scientificSource).toEqual(target.provenance.graphSource?.scientificSource);
    store.clearCache();
    expect(graph2DComplexContourSourceStatus(target, document, store)).toBe("missing");
    expect(() => acceptGraph2DComplexContour(review, document, store)).toThrow(/missing or changed/);

    const other = line("imaginary", 0);
    const wrongStore = new Graph2DPointTableStore();
    const mismatch = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit-point-series",
      objectId: imaginaryObject!.id, draft: { label: other.label, table: wrongStore.publish(other.rows),
        mode: "line", domain: other.domain, origin: other.origin, style } }), stableKey: "complex-grid-pair" });
    const checkedReal = line("real", 1);
    wrongStore.publish(checkedReal.rows);
    expect(() => reviewGraph2DComplexPair(mismatch, realObject!.id, imaginaryObject!.id,
      { sampleCount: 257, closure: "auto" }, wrongStore)).toThrow(/same verified complex-grid slice/);
  });
});
