import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScientificSceneManifest, type ScientificFieldDocument } from "@math3d/core";
import { scientificExplorerLibrary } from "./scientificExplorerLibrary";

const manifest = (name: string) => {
  const parsed = parseScientificSceneManifest(readFileSync(resolve(import.meta.dirname,
    `../../../tests/fixtures/scientific-scene/${name}.sscene/manifest.json`), "utf8"));
  if (!parsed.ok) throw new Error(parsed.errors.join(" "));
  return parsed.value;
};

describe("Field Explorer dataset library", () => {
  it("lists vector, scalar and complex 3D scene layers without field samples", () => {
    for (const [name, kind] of [["vortex-volume", "vector"],
      ["quadratic-volume", "scalar"], ["complex-wave-volume", "complex"]] as const) {
      const entries = scientificExplorerLibrary(manifest(name), [], []);
      expect(entries).toEqual([expect.objectContaining({ origin: "scene", kind, ready: true,
        shape: expect.any(Array) })]);
      expect(JSON.stringify(entries)).not.toContain("values");
    }
  });

  it("keeps saved scalar and complex Project documents in the library after scene close", () => {
    const field = (id: string, paired: boolean) => ({ identity: { id }, metadata: { title: id },
      source: { reference: { datasetId: id, shape: [4, 5, 6] },
        quantity: { unit: "K" }, ...(paired ? { paired: {} } : {}) } }) as
      unknown as ScientificFieldDocument;
    expect(scientificExplorerLibrary(null, [], [field("temperature", false), field("wave", true)]))
      .toEqual([expect.objectContaining({ origin: "project", kind: "scalar",
        documentId: "temperature" }), expect.objectContaining({ origin: "project", kind: "complex",
        documentId: "wave" })]);
  });
});
