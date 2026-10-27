import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScientificSceneManifest, type ScientificFieldDocument } from "@math3d/core";
import { scientificExplorerLibrary, scientificSceneReferenceFromManifest,
  savedScientificExplorerEntries } from "./scientificExplorerLibrary";

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

  it("indexes several scene references with source status and no samples", () => {
    const scenes = ["quadratic-volume", "complex-wave-volume"].map((name, index) =>
      scientificSceneReferenceFromManifest(manifest(name), String(index + 1).repeat(64),
        { kind: "directory", value: `C:/scenes/${name}.sscene` }));
    const pending = savedScientificExplorerEntries(scenes, {});
    expect(pending).toHaveLength(2);
    expect(pending.every(entry => !entry.ready && entry.sourceStatus === "checking")).toBe(true);
    const statuses = Object.fromEntries(scenes.map(scene =>
      [`directory:${scene.locator.value}:${scene.fingerprint}`, "current" as const]));
    expect(savedScientificExplorerEntries(scenes, statuses).map(entry => entry.kind))
      .toEqual(["scalar", "complex"]);
    expect(savedScientificExplorerEntries(scenes, statuses).every(entry => entry.ready)).toBe(true);
    expect(JSON.stringify(scenes)).not.toContain("values");
  });
});
