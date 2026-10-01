import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/post-1.6.0/graph-gallery-upgrade-storage.json";
import legacyGraph from "../../../packages/core/fixtures/graph2d/legacy-v0.json";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMixedWorkspaceDocument,
  parseMixedWorkspaceDocument, serializeMixedWorkspaceDocument, parseGraph2DProjectFavorites,
  migrateGraph2DDocument, Graph2DPointTableStore, createViewerProvenanceEvidence, viewerSourceFromDocument,
  applyGraph2DAuthoring, type Graph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "./Graph2DCommandAdapter";
import { listPersonalGraphProjects, listGraphGalleryPresetCopies, resumeGraphGalleryCheckpoint } from "./graph2dGallerySession";
import { GRAPH_GALLERY_PREFERENCES_KEY, parseGraphGalleryPreferences } from "./graph2dGalleryPreferences";

const coldStorage = () => {
  const values = new Map(Object.entries(fixture.storage));
  let failKey: string | null = null;
  return { values, fail: (key: string) => { failKey = key; }, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (key === failKey) { failKey = null; throw new Error("upgrade quota failure"); } values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};
const blank = () => createGraph2DWorkspaceProject(createEmptyGraph2DDocument("upgraded-process"));
const graph = (workspace: ReturnType<typeof blank>) => workspace.entries.find((entry) => entry.module === "graph2d")!.checkpoint as Graph2DDocument;

describe("post-1.6.0 frozen Graph Gallery storage upgrade", () => {
  it("discovers saved projects and the last gallery copy after a cold start without writing", () => {
    const storage = coldStorage(), before = [...storage.values];
    expect(listPersonalGraphProjects(storage, graph(blank()).identity.id, "Empty").map((item) => item.id))
      .toEqual(expect.arrayContaining([fixture.originalId, fixture.dataId, fixture.activeId]));
    expect(listGraphGalleryPresetCopies(storage, graph(blank()).identity.id, "Empty"))
      .toContainEqual(expect.objectContaining({ id: fixture.activeId, presetId: "line-comparison", active: false }));
    expect(parseGraphGalleryPreferences(storage.getItem(GRAPH_GALLERY_PREFERENCES_KEY)).favorites).toEqual(["parabola-tangent"]);
    expect(parseGraph2DProjectFavorites(storage.getItem("math3d.graph2d.project-favorites.v1")).ids).toEqual([fixture.originalId]);
    expect([...storage.values]).toEqual(before);
  });

  it("reopens frozen sources/results and point-table sidecars with unchanged identities", () => {
    const storage = coldStorage();
    const key = `math3d.mixed-workspace.v1.gallery-checkpoint.${fixture.originalId}`;
    const saved = JSON.parse(storage.getItem(key)!).workspace;
    const original = resumeGraphGalleryCheckpoint(blank, fixture.originalId, storage);
    expect(original.entries).toEqual(saved.entries);
    expect(original.results).toEqual(saved.results);
    expect(original.results).toHaveLength(1);
    const reopened = parseMixedWorkspaceDocument(serializeMixedWorkspaceDocument(original));
    expect(reopened).toEqual(original);
    const data = resumeGraphGalleryCheckpoint(() => original, fixture.dataId, storage);
    const tables = new Graph2DPointTableStore({ read: (id) => storage.getItem(`math3d.graph2d.table.${id}`), write: () => { throw new Error("Read-only upgrade check"); } });
    const series = graph(data).source.objects.filter((object) => object.kind === "point-series");
    expect(series.length).toBeGreaterThan(0);
    for (const object of series) expect(tables.resolve(object.table)).not.toBeNull();
    expect(parseGraph2DProjectFavorites(storage.getItem("math3d.graph2d.project-favorites.v1")).ids).toEqual([fixture.originalId]);
  });

  it("keeps old analysis stale after editing and reopening the upgraded project", () => {
    const storage = coldStorage(), original = resumeGraphGalleryCheckpoint(blank, fixture.originalId, storage);
    const document = graph(original), commands = new Graph2DCommandAdapter(document);
    const scene = applyGraph2DAuthoring(document, { type: "create", draft: { label: "new line", expression: "2*x",
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      style: { color: "#123456", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const edited = commands.commitScene(scene, "create");
    const project = createMixedWorkspaceDocument({ ...original, entries: original.entries.map((entry) => entry.module === "graph2d"
      ? { ...entry, checkpoint: edited, expected: edited.identity, replay: null } : entry) });
    const reopened = parseMixedWorkspaceDocument(serializeMixedWorkspaceDocument(project));
    const current = viewerSourceFromDocument(graph(reopened));
    expect(createViewerProvenanceEvidence({ source: current, current, result: reopened.results[0]!, artifactAvailable: () => true }).status).toBe("stale");
    expect(reopened.results[0]!.provenance.source.revision).toBe(document.identity.revision);
    expect(current.revision).toBeGreaterThan(document.identity.revision);
  });

  it("rolls back a failed reopen without changing any durable upgrade bytes", () => {
    const storage = coldStorage(), before = [...storage.values].sort();
    storage.fail("math3d.graph2d-handoff.v2");
    expect(() => resumeGraphGalleryCheckpoint(blank, fixture.originalId, storage)).toThrow(/quota/);
    expect([...storage.values].sort()).toEqual(before);
  });

  it("migrates frozen v0 source without changing the original saved bytes", () => {
    const before = JSON.stringify(legacyGraph), migrated = migrateGraph2DDocument(JSON.parse(before));
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) throw new Error(migrated.errors.join(" "));
    expect(migrated.value.identity.id).toBe(legacyGraph.identity.id);
    expect(migrated.value.identity.revision).toBe(legacyGraph.identity.revision + 1);
    expect(migrated.value.source.objects[0]?.expression.source).toBe("x");
    expect(JSON.stringify(legacyGraph)).toBe(before);
    expect(migrateGraph2DDocument(migrated.value)).toEqual({ ok: true, value: migrated.value });
  });
});
