import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DFieldReference, GRAPH2D_FIELD_REFERENCE_CAPABILITY, inspectGraph2DCompatibility,
  createGraph2DVectorFieldReference, inspectGraph2DVectorFieldReference, isGraph2DVectorFieldReference,
  GRAPH2D_VECTOR_FIELD_REFERENCE_CAPABILITY, reviewGraph2DVectorFieldRelink,
  inspectGraph2DFieldReference, reviewGraph2DFieldRelink, parseGraph2DDocument, serializeGraph2DDocument, sha256Checksum } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const source = () => {
  const manifestJson = readFileSync(resolve(import.meta.dirname,
    "../../../tests/fixtures/scientific-scene/vortex-flow.sscene/manifest.json"), "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  return { manifestJson, fingerprint };
};

describe("GRA-13.3 saved field references", () => {
  it("persists one ordered 2D vector reference and rechecks both components after reopening", () => {
    const { manifestJson, fingerprint } = source();
    const reference = createGraph2DVectorFieldReference(manifestJson, fingerprint,
      { kind: "preset", value: "vortexFlow" }, "field");
    expect(reference.components.map(part => part.component)).toEqual(["east", "north"]);
    expect(reference.components.every(part => part.resourceSha256.length === 64)).toBe(true);
    const empty = createEmptyGraph2DDocument("paired-field");
    const scene = applyGraph2DAuthoring(empty, { type: "save-vector-field-reference", reference });
    const document = createGraph2DDocument({ ...scene, stableKey: "paired-field" });
    expect(document.requiredCapabilities).toContain(GRAPH2D_VECTOR_FIELD_REFERENCE_CAPABILITY);
    const serialized = serializeGraph2DDocument(document);
    expect(serialized).not.toContain('"values"');
    const reopened = parseGraph2DDocument(serialized);
    expect(inspectGraph2DCompatibility(reopened).status).toBe("current");
    expect(reopened.source.vectorFieldReferences).toEqual([reference]);
    expect(inspectGraph2DVectorFieldReference(reference, manifestJson)).toBe("current");
    expect(inspectGraph2DVectorFieldReference(reference, manifestJson.replace("vortex", "changed"))).toBe("changed");
    expect(inspectGraph2DVectorFieldReference(reference, null)).toBe("missing");
    expect(isGraph2DVectorFieldReference({ ...reference,
      components: [reference.components[0], { ...reference.components[1], shape: [32, 33] }] })).toBe(false);
    expect(() => applyGraph2DAuthoring(reopened, { type: "save-vector-field-reference", reference }))
      .toThrow(/already saved/);
    const adapter = new Graph2DCommandAdapter(empty);
    adapter.commitScene(scene, "save-vector-field-reference");
    expect(adapter.document().source.vectorFieldReferences).toHaveLength(1);
    expect(adapter.undo()?.source.vectorFieldReferences).toBeUndefined();
    expect(adapter.redo()?.source.vectorFieldReferences).toHaveLength(1);
    const removed = applyGraph2DAuthoring(reopened, { type: "remove-vector-field-reference", referenceId: reference.id });
    expect(removed.source.vectorFieldReferences).toBeUndefined();
  });
  it("reviews both component hashes and relinks the pair as one undoable change", () => {
    const { manifestJson, fingerprint } = source();
    const saved = createGraph2DVectorFieldReference(manifestJson, fingerprint,
      { kind: "preset", value: "vortexFlow" }, "field");
    const replacement = createGraph2DVectorFieldReference(manifestJson, fingerprint,
      { kind: "directory", value: "C:\\matching.sscene" }, "field");
    const review = reviewGraph2DVectorFieldRelink(saved, replacement);
    expect(review.eligible).toBe(true);
    expect(review.differences.filter(item => item.required && !item.matches)).toHaveLength(0);
    expect(review.differences.find(item => item.field === "Location")).toMatchObject({ matches: false, required: false });
    const modified = JSON.parse(manifestJson);
    modified.resources.find((part: { id: string }) => part.id === "north").sha256 = "0".repeat(64);
    const changedJson = JSON.stringify(modified);
    const changed = createGraph2DVectorFieldReference(changedJson,
      sha256Checksum(new TextEncoder().encode(changedJson)).slice(7),
      { kind: "directory", value: "C:\\changed.sscene" }, "field");
    expect(reviewGraph2DVectorFieldRelink(saved, changed).eligible).toBe(false);
    expect(reviewGraph2DVectorFieldRelink(saved, changed).differences
      .find(item => item.field === "Component 2 resource SHA-256")).toMatchObject({ required: true, matches: false });
    const swapped = { ...replacement, components: [...replacement.components].reverse() };
    expect(reviewGraph2DVectorFieldRelink(saved, swapped).eligible).toBe(false);
    const wrongAxes = { ...replacement, components: replacement.components.map(part => ({
      ...part, axes: [{ ...part.axes[0]!, unit: "cm" }, part.axes[1]!] })) };
    expect(reviewGraph2DVectorFieldRelink(saved, wrongAxes).eligible).toBe(false);
    const empty = createEmptyGraph2DDocument("paired-relink");
    const adapter = new Graph2DCommandAdapter(empty);
    adapter.commitScene(applyGraph2DAuthoring(empty, { type: "save-vector-field-reference", reference: saved }),
      "save-vector-field-reference");
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(),
      { type: "relink-vector-field-reference", referenceId: saved.id, replacement }),
      "relink-vector-field-reference");
    const updated = adapter.document().source.vectorFieldReferences![0]!;
    expect(updated.id).toBe(saved.id);
    expect(updated.components[0]!.locator).toEqual(replacement.components[0]!.locator);
    expect(isGraph2DVectorFieldReference(updated)).toBe(true);
    expect(parseGraph2DDocument(serializeGraph2DDocument(adapter.document())).source.vectorFieldReferences![0])
      .toEqual(updated);
    expect(adapter.undo()?.source.vectorFieldReferences![0]).toEqual(saved);
    expect(adapter.redo()?.source.vectorFieldReferences![0]).toEqual(updated);
    expect(() => applyGraph2DAuthoring(adapter.document(), {
      type: "relink-vector-field-reference", referenceId: saved.id, replacement: changed }))
      .toThrow(/do not match/);
  });
  it("saves a component without grid values and rechecks the original metadata on reopen", () => {
    const { manifestJson, fingerprint } = source();
    const locator = { kind: "preset" as const, value: "vortexFlow" };
    const reference = createGraph2DFieldReference(manifestJson, fingerprint, locator, "field", "east");
    expect(reference).toMatchObject({ sceneFingerprint: fingerprint, datasetId: "field", component: "east",
      semanticType: "vector-field", locator });
    expect(reference.shape).toHaveLength(2);
    expect(reference.axes).toHaveLength(2);
    const empty = createEmptyGraph2DDocument("saved-field");
    const scene = applyGraph2DAuthoring(empty, { type: "save-field-reference", reference });
    const document = createGraph2DDocument({ ...scene, stableKey: "saved-field" });
    expect(document.requiredCapabilities).toContain(GRAPH2D_FIELD_REFERENCE_CAPABILITY);
    const serialized = serializeGraph2DDocument(document);
    expect(serialized).not.toContain("values");
    const reopened = parseGraph2DDocument(serialized);
    expect(inspectGraph2DCompatibility(reopened).status).toBe("current");
    expect(reopened.source.fieldReferences).toEqual([reference]);
    expect(inspectGraph2DFieldReference(reference, manifestJson)).toBe("current");
    expect(inspectGraph2DFieldReference(reopened.source.fieldReferences![0]!, manifestJson)).toBe("current");
    expect(inspectGraph2DFieldReference(reference, manifestJson.replace("vortex", "changed"))).toBe("changed");
    expect(inspectGraph2DFieldReference(reference, null)).toBe("missing");
    expect(() => applyGraph2DAuthoring(reopened, { type: "save-field-reference", reference })).toThrow(/already saved/);
    const removed = applyGraph2DAuthoring(reopened, { type: "remove-field-reference", referenceId: reference.id });
    expect(removed.source.fieldReferences).toBeUndefined();
    const adapter = new Graph2DCommandAdapter(empty);
    adapter.commitScene(scene, "save-field-reference");
    expect(adapter.document().source.fieldReferences).toHaveLength(1);
    expect(adapter.undo()?.source.fieldReferences).toBeUndefined();
    expect(adapter.redo()?.source.fieldReferences).toHaveLength(1);
  });
  it("reviews every required field, relinks a verified matching copy, and replays undoably", () => {
    const { manifestJson, fingerprint } = source();
    const saved = createGraph2DFieldReference(manifestJson, fingerprint,
      { kind: "preset", value: "vortexFlow" }, "field", "north");
    const replacement = createGraph2DFieldReference(manifestJson, fingerprint,
      { kind: "directory", value: "C:\\verified-copy.sscene" }, "field", "north");
    const review = reviewGraph2DFieldRelink(saved, replacement);
    expect(review.eligible).toBe(true);
    expect(review.differences.find(item => item.field === "Location")).toMatchObject({ matches: false, required: false });
    expect(review.differences.filter(item => item.required).every(item => item.matches)).toBe(true);
    const renamed = { ...replacement, sceneId: "replacement-scene", datasetId: "velocity",
      sceneFingerprint: "0".repeat(64) };
    expect(reviewGraph2DFieldRelink(saved, renamed).eligible).toBe(true);
    expect(reviewGraph2DFieldRelink(saved, renamed).differences.filter(item => !item.matches).map(item => item.field))
      .toEqual(expect.arrayContaining(["Location", "Scene", "Manifest fingerprint", "Dataset"]));
    const sourceDocument = createGraph2DDocument({ ...applyGraph2DAuthoring(createEmptyGraph2DDocument("relink"),
      { type: "save-field-reference", reference: saved }), stableKey: "relink" });
    const adapter = new Graph2DCommandAdapter(sourceDocument);
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(),
      { type: "relink-field-reference", referenceId: saved.id, replacement }), "relink-field-reference");
    const updated = adapter.document().source.fieldReferences![0]!;
    expect(updated.id).toBe(saved.id);
    expect(updated.locator).toEqual(replacement.locator);
    expect(parseGraph2DDocument(serializeGraph2DDocument(adapter.document())).source.fieldReferences![0]).toEqual(updated);
    expect(adapter.undo()?.source.fieldReferences![0]).toEqual(saved);
    expect(adapter.redo()?.source.fieldReferences![0]).toEqual(updated);
    expect(reviewGraph2DFieldRelink(saved, { ...replacement, component: "east" }).eligible).toBe(false);
    expect(reviewGraph2DFieldRelink(saved, { ...replacement, shape: [32, 33] }).eligible).toBe(false);
    expect(reviewGraph2DFieldRelink(saved, { ...replacement,
      axes: [{ ...replacement.axes[0]!, spacing: 0.5 }, replacement.axes[1]!] }).eligible).toBe(false);
    expect(reviewGraph2DFieldRelink(saved, { ...replacement, resourceSha256: "0".repeat(64) }).eligible).toBe(false);
    expect(() => applyGraph2DAuthoring(sourceDocument, { type: "relink-field-reference", referenceId: saved.id,
      replacement: { ...replacement, resourceSha256: "0".repeat(64) } })).toThrow(/do not match/);
    expect(inspectGraph2DFieldReference(saved, null)).toBe("missing");
  });
});
