import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import raw from "./examples/samsung-projects.json?raw";
import { importProjectExamples, prepareProjectExampleCollection, SAMSUNG_EXAMPLE_COUNT } from "./projectExampleCollection";
import { importLibraryProject, parseProjectLibrary, PROJECT_LIBRARY_KEY, PROJECT_STORAGE_KEY, projectPayloadKey, saveLibraryProject, updateLibraryActivity } from "./projectLibrary";

const store = () => { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; };
describe("bundled Samsung project import", () => {
  it("validates all 25 independent project identities and their supplied resources", () => {
    const examples = prepareProjectExampleCollection(raw);
    expect(examples).toHaveLength(SAMSUNG_EXAMPLE_COUNT); expect(new Set(examples.map(e => e.project.identity.id)).size).toBe(25);
    expect(examples.filter(e => e.previewOnly).map(e => e.project.metadata.title)).toEqual(["PRJ21 Mixed Preview"]);
    expect(examples.some(e => e.resources.sidecars().length === 5)).toBe(true);
    expect(examples.some(e => e.project.metadata.title === "Enneper Study")).toBe(true);
  });
  it("retains edited saved projects, activity, favorites and the active workspace on repeated import", async () => {
    const examples = prepareProjectExampleCollection(raw), storage = store();
    const edited = updateMath3DProjectMetadata(examples[0].project, { title: "My edited study", tags: ["personal"] });
    saveLibraryProject(storage, edited, 11); updateLibraryActivity(storage, edited.identity.id, { favorite: true });
    const active = storage.getItem(PROJECT_STORAGE_KEY), payload = storage.getItem(projectPayloadKey(edited.identity.id)), entry = parseProjectLibrary(storage.getItem(PROJECT_LIBRARY_KEY)).entries[0];
    const commit = async (example: typeof examples[number]) => importLibraryProject(storage, example.project, 22, { activate: false });
    expect(await importProjectExamples(storage, examples, commit)).toMatchObject({ imported: 24, kept: 1, remaining: 0, previewOnly: 1 });
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(active); expect(storage.getItem(projectPayloadKey(edited.identity.id))).toBe(payload);
    expect(parseProjectLibrary(storage.getItem(PROJECT_LIBRARY_KEY)).entries.find(e => e.id === edited.identity.id)).toEqual(entry);
    const before = new Map(storage.values); expect(await importProjectExamples(storage, examples, commit)).toMatchObject({ imported: 0, kept: 25, remaining: 0 }); expect(storage.values).toEqual(before);
  });
  it("reports a partial storage failure and resumes without replacing successful imports", async () => {
    const examples = prepareProjectExampleCollection(raw), storage = store(); let commits = 0;
    const partial = await importProjectExamples(storage, examples, async example => { if (++commits === 3) throw Error("quota"); return importLibraryProject(storage, example.project, 1, { activate: false }); });
    expect(partial).toMatchObject({ imported: 2, kept: 0, remaining: 23 }); expect(partial.error).toContain("quota");
    const before = storage.getItem(projectPayloadKey(examples[0].project.identity.id));
    expect(await importProjectExamples(storage, examples, async example => importLibraryProject(storage, example.project, 2, { activate: false }))).toMatchObject({ imported: 23, kept: 2, remaining: 0 });
    expect(storage.getItem(projectPayloadKey(examples[0].project.identity.id))).toBe(before);
  });
  it("rejects corrupt collections and capacity overflow before committing", async () => {
    const collection = JSON.parse(raw), examples = prepareProjectExampleCollection(raw), storage = store();
    collection.projects.push(collection.projects[0]); expect(() => prepareProjectExampleCollection(JSON.stringify(collection))).toThrow("Duplicate");
    const corrupt = JSON.parse(raw); corrupt.projects[0].resources[0].data = "AAAA"; expect(() => prepareProjectExampleCollection(JSON.stringify(corrupt))).toThrow();
    for (let i = 0; i < 40; i++) saveLibraryProject(storage, createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument(`source-${i}`)), { stableKey: `existing-${i}` }), 1, undefined, { activate: false });
    let committed = false; const before = new Map(storage.values);
    await expect(importProjectExamples(storage, examples, async () => { committed = true; })).rejects.toThrow("room for 24");
    expect(committed).toBe(false); expect(storage.values).toEqual(before);
  });
});
