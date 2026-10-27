import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument,
  createScientificDatasetLink, createVectorField3DDocument, parseMath3DProject,
  reviseVectorField3DDocument, serializeMath3DProject, sha256Checksum,
  ScientificDerivedResultCache, structuralHash,
  type Graph2DFieldReference, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DVolumes } from "@math3d/core";
import { cachedVerifiedVectorField3DDerivedLine,
  cachedVerifiedVectorField3DSlice, invalidateVerifiedDerivedResults } from
  "./verifiedDerivedResultCache";

const directory = fileURLToPath(new URL(
  "../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url));
const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const names = ["east", "north", "up"] as const;
const references = (locator: Graph2DFieldReference["locator"]) => names.map(name =>
  createGraph2DFieldReference(manifestJson, fingerprint, locator, "field", name)) as
  [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
const source: VectorField3DSource = {
  axes: [{ role: "x", label: "x", unit: "m", min: -4, max: 4 },
    { role: "y", label: "y", unit: "m", min: -4, max: 4 },
    { role: "z", label: "z", unit: "m", min: -3, max: 3 }],
  timeUnit: "s", field: { kind: "scientific-bundle",
    references: references({ kind: "preset", value: "vortexVolume" }),
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
    maxSteps: 1000, maxTime: 10 },
};
const document = createVectorField3DDocument(source, { stableKey: "cached-vortex" });
const shape = [21, 21, 17] as const;
const volumes = names.map((component, index) => {
  const bytes = readFileSync(`${directory}${component}.f64`);
  return { fingerprint, datasetId: "field", component, sourceShape: shape,
    sampleShape: shape, resourceSha256: source.field.kind === "scientific-bundle" ?
      source.field.references[index]!.resourceSha256 : "",
    sampleSha256: sha256Checksum(bytes).slice(7),
    values: Array.from({ length: shape[0] * shape[1] * shape[2] },
      (_, offset) => bytes.readDoubleLE(offset * 8)) };
}) as VectorField3DVolumes;
const transfer = { manifestJson, fingerprint, volumes };
const sliceAt = (current: VectorField3DDocument) =>
  cachedVerifiedVectorField3DSlice(current, 2, -1.5, "curl-z", transfer);

describe("SCI-03 verified derived-result dependencies", () => {
  it("bounds session results and recomputes an evicted recipe", () => {
    const limited = new ScientificDerivedResultCache(2);
    const binding = { documentId: document.identity.id,
      revision: document.identity.revision, documentHash: document.identity.structuralHash,
      sourceHash: createScientificDatasetLink(source.field.kind === "scientific-bundle" ?
        source.field.references : []).sourceHash };
    const transferHash = structuralHash({ fixture: "verified-vortex" });
    let computations = 0;
    for (const recipe of ["xy", "xz", "yz", "xy"])
      limited.getOrCompute(binding, { recipe }, transferHash, () => ++computations);
    expect(limited.size).toBe(2);
    expect(computations).toBe(4);
  });

  it("reuses a verified slice and Graph line, then invalidates both on revision and relink", () => {
    invalidateVerifiedDerivedResults(document.identity.id);
    const slice = sliceAt(document), sameSlice = sliceAt(document);
    expect(sameSlice).toBe(slice);
    const line = cachedVerifiedVectorField3DDerivedLine(document, 2, -1.5,
      "curl-z", 0, 0, transfer);
    expect(cachedVerifiedVectorField3DDerivedLine(document, 2, -1.5,
      "curl-z", 0, 0, transfer)).toBe(line);
    expect(line.origin.sourceHash).toBe(slice.sourceHash);
    expect(line.rows.length).toBeGreaterThan(1);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
    committedSelection: null, constructions: [] });
    const projectJson = serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "cached-field-project" }));
    expect(projectJson).not.toContain('"values"');
    const reopened = parseMath3DProject(projectJson).workspace.entries[0]!
      .checkpoint as VectorField3DDocument;
    expect(sliceAt(reopened)).toBe(slice);
    expect(cachedVerifiedVectorField3DDerivedLine(reopened, 2, -1.5,
      "curl-z", 0, 0, transfer))
      .toBe(line);

    const revised = reviseVectorField3DDocument(reopened, { ...reopened.source,
      display: { ...reopened.source.display, magnitudeScale: 2 } });
    const nextSlice = sliceAt(revised);
    expect(nextSlice).not.toBe(slice);
    expect(nextSlice.source.revision).toBe(revised.identity.revision);
    const nextLine = cachedVerifiedVectorField3DDerivedLine(revised, 2, -1.5,
      "curl-z", 0, 0, transfer);
    expect(nextLine).not.toBe(line);

    const moved = reviseVectorField3DDocument(revised, { ...revised.source,
      field: { kind: "scientific-bundle", references: references({ kind: "directory",
        value: "C:\\moved\\vortex-volume.sscene" }),
        componentUnits: ["m/s", "m/s", "m/s"] } });
    const movedSlice = sliceAt(moved);
    expect(movedSlice).not.toBe(nextSlice);
    expect(movedSlice.sourceHash).toBe(createScientificDatasetLink(
      moved.source.field.kind === "scientific-bundle" ? moved.source.field.references : [])
      .sourceHash);
    expect(movedSlice.sourceHash).not.toBe(slice.sourceHash);
    expect(cachedVerifiedVectorField3DDerivedLine(moved, 2, -1.5,
      "curl-z", 0, 0, transfer))
      .not.toBe(nextLine);
    invalidateVerifiedDerivedResults(document.identity.id);
  });

  it("rejects changed transfer bytes before a cached result can be returned", () => {
    invalidateVerifiedDerivedResults(document.identity.id);
    const slice = sliceAt(document);
    const changed = [{ ...volumes[0]!, values: volumes[0]!.values.map((value, index) =>
      index === 0 ? value + 1 : value) }, volumes[1]!, volumes[2]!] as VectorField3DVolumes;
    expect(() => cachedVerifiedVectorField3DSlice(document, 2, -1.5, "curl-z",
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
    expect(() => cachedVerifiedVectorField3DDerivedLine(document, 2, -1.5,
      "curl-z", 0, 0, { manifestJson, fingerprint, volumes: changed }))
      .toThrow(/checksum/);
    expect(sliceAt(document)).toBe(slice);
    invalidateVerifiedDerivedResults(document.identity.id);
  });
});
