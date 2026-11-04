import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { createSavedMeshComparisonReviewSnapshot, savedMeshComparisonReviewHtml } from "./projectSavedMeshComparisonReviewReport";

describe("PC22 saved Mesh comparison review report", () => {
  const fixture = () => {
    const { project, resources } = instantiateMeshComparisonStarter("pc22-report", "mesh-comparison-review");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    return { project: reopened, read: (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item) };
  };

  it("keeps all three portable pairs, exact hashes, qualified values, and two verified Notes after reopen", () => {
    const { project, read } = fixture();
    const snapshot = createSavedMeshComparisonReviewSnapshot(project, read);
    expect(snapshot.format).toBe("mesh-comparison-review/v1");
    expect(snapshot.entries.map(entry => entry.status)).toEqual(["verified", "verified", "verified"]);
    expect(snapshot.entries.map(entry => entry.observations.length)).toEqual([1, 1, 0]);
    expect(snapshot.entries[0]!.values).toEqual({ a: 0.5, b: 1.125, difference: 0.625, unit: "m²" });
    expect(snapshot.entries[2]!.values).toEqual({ a: 0.5, b: 2.53125, difference: 2.03125, unit: "m²" });
    const html = savedMeshComparisonReviewHtml(snapshot);
    expect(html).toContain(snapshot.project.hash);
    expect(html).toContain(snapshot.entries[0]!.a.resultHash);
    expect(html).toContain(snapshot.entries[1]!.b.sourceHash);
    expect(html).toContain("Review observation 1");
    expect(html).toContain("Review observation 2");
    expect(html).toContain("No Mesh calculation or interpolation");
  });

  it("lists missing and tampered evidence without scalar values or Note text", () => {
    const { project, read } = fixture();
    const missing = createSavedMeshComparisonReviewSnapshot(project, () => null);
    expect(missing.entries.every(entry => entry.status === "unavailable" && entry.values === null)).toBe(true);
    const missingHtml = savedMeshComparisonReviewHtml(missing);
    expect(missingHtml).toContain("Values withheld");
    expect(missingHtml).not.toContain("The first saved scaling");
    const tampered = createSavedMeshComparisonReviewSnapshot(project, item => {
      const bytes = read(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy;
    });
    expect(tampered.entries.every(entry => entry.status === "unavailable" && entry.values === null)).toBe(true);
  });

  it("keeps a changed pair visible while unaffected pairs still export", () => {
    const { project, read } = fixture();
    const changed = { ...project, savedMeshComparisons: project.savedMeshComparisons!.map((pair, index) =>
      index ? pair : { ...pair, metricPath: "unrecorded.metric" }) };
    const snapshot = createSavedMeshComparisonReviewSnapshot(changed, read);
    expect(snapshot.entries.map(entry => entry.status)).toEqual(["unavailable", "verified", "verified"]);
    expect(snapshot.entries[0]!.values).toBeNull();
    expect(snapshot.entries[0]!.observations[0]!.status).toBe("unavailable");
    expect(snapshot.entries[0]!.observations[0]).not.toHaveProperty("title");
    expect(snapshot.entries[0]!.observations[0]).not.toHaveProperty("body");
    expect(snapshot.entries[1]!.values?.difference).toBe(1.40625);
  });

  it("withholds a stale Note without hiding its verified pair and escapes report text", () => {
    const { project, read } = fixture();
    const changed = { ...project, notes: project.notes!.map((note, index) => index ? note :
      { ...note, anchor: { ...note.anchor!, comparisonHash: "0".repeat(64) } }) } as typeof project;
    const snapshot = createSavedMeshComparisonReviewSnapshot(changed, read);
    expect(snapshot.entries[0]).toMatchObject({ status: "verified", observations: [{ status: "unavailable" }] });
    expect(savedMeshComparisonReviewHtml(snapshot)).not.toContain("The first saved scaling");
    const escaped = savedMeshComparisonReviewHtml({ ...snapshot, project: { ...snapshot.project, title: "<script>alert('x')</script>" } });
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });
});
