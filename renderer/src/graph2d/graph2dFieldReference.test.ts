import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DFieldReference, GRAPH2D_FIELD_REFERENCE_CAPABILITY, inspectGraph2DCompatibility,
  inspectGraph2DFieldReference, parseGraph2DDocument, serializeGraph2DDocument, sha256Checksum } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const source = () => {
  const manifestJson = readFileSync(resolve("tests/fixtures/scientific-scene/vortex-flow.sscene/manifest.json"), "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  return { manifestJson, fingerprint };
};

describe("GRA-13.3 saved field references", () => {
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
});
