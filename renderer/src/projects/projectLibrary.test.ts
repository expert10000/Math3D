import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, serializeMath3DProject, updateMath3DProjectMetadata } from "@math3d/core";
import { loadLibraryProject, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY, PROJECT_STORAGE_KEY, projectPayloadKey,
  projectThumbnailKey, readProjectThumbnail, isAutomaticProjectThumbnail, saveLibraryProject, updateLibraryActivity, validateProjectThumbnail } from "./projectLibrary";

const project = (key = "study") => createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("source")), { stableKey: key, title: key });
const thumbnail = "data:image/png;base64,aGVsbG8=";
const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
describe("PRJ03 local project library", () => {
  it("refreshes automatic sidecars without changing scientific bytes and preserves explicit uploaded mode", () => {
    const storage = store(), original = project(), first = saveLibraryProject(storage, original, 100, thumbnail, { thumbnailMode: "automatic" });
    expect(isAutomaticProjectThumbnail(storage, first.entries[0])).toBe(true);
    const bytes = storage.getItem(projectPayloadKey(original.identity.id)), updatedImage = "data:image/jpeg;base64,d29ybGQ=";
    const updated = saveLibraryProject(storage, original, 200, updatedImage, { thumbnailMode: "automatic" });
    expect(storage.getItem(projectPayloadKey(original.identity.id))).toBe(bytes);
    expect(readProjectThumbnail(storage, updated.entries[0])).toBe(updatedImage);
    expect(isAutomaticProjectThumbnail(storage, updated.entries[0])).toBe(true);
    const uploaded = saveLibraryProject(storage, original, 300, thumbnail);
    expect(isAutomaticProjectThumbnail(storage, uploaded.entries[0])).toBe(false);
    const metadataOnly = saveLibraryProject(storage, updateMath3DProjectMetadata(original, { title: "Saved-copy label" }), 400, undefined, { activate: false });
    expect(readProjectThumbnail(storage, metadataOnly.entries[0])).toBe(thumbnail);
    expect(isAutomaticProjectThumbnail(storage, metadataOnly.entries[0])).toBe(false);
    expect(parseProjectLibrary(storage.getItem(PROJECT_LIBRARY_KEY)).entries[0]).not.toHaveProperty("thumbnailMode");
  });
  it("treats legacy, missing or mismatched automatic markers as uploaded images", () => {
    const storage = store(), original = project(), library = saveLibraryProject(storage, original, 100, thumbnail, { thumbnailMode: "automatic" });
    const key = `${projectThumbnailKey(original.identity.id)}.automatic`;
    storage.setItem(key, "unrelated"); expect(isAutomaticProjectThumbnail(storage, library.entries[0])).toBe(false);
    storage.removeItem(key); expect(isAutomaticProjectThumbnail(storage, library.entries[0])).toBe(false);
    saveLibraryProject(storage, original, 200, thumbnail, { thumbnailMode: "automatic" });
    storage.setItem(projectThumbnailKey(original.identity.id), "data:image/png;base64,d29ybGQ=");
    expect(isAutomaticProjectThumbnail(storage, library.entries[0])).toBe(false);
  });
  it("keeps the previous preview and commits the project when optional automatic image storage is full", () => {
    const storage = store(), original = project(), first = saveLibraryProject(storage, original, 100, thumbnail, { thumbnailMode: "automatic" });
    const marker = storage.getItem(`${projectThumbnailKey(original.identity.id)}.automatic`);
    const failing = { ...storage, setItem: (key: string, value: string) => {
      if (key === projectThumbnailKey(original.identity.id) && value !== thumbnail) throw new DOMException("Image quota", "QuotaExceededError");
      storage.setItem(key, value);
    } };
    const changed = updateMath3DProjectMetadata(original, { title: "Project saved without new image" });
    const saved = saveLibraryProject(failing, changed, 200, "data:image/png;base64,d29ybGQ=", { thumbnailMode: "automatic" });
    expect(loadLibraryProject(storage, original.identity.id)).toEqual(changed);
    expect(readProjectThumbnail(storage, saved.entries[0])).toBe(thumbnail);
    expect(storage.getItem(`${projectThumbnailKey(original.identity.id)}.automatic`)).toBe(marker);
    expect(isAutomaticProjectThumbnail(storage, first.entries[0])).toBe(true);
    const before = [...storage.values];
    expect(() => saveLibraryProject(failing, changed, 300, "data:image/png;base64,d29ybGQ=")).toThrow("Image quota");
    expect([...storage.values]).toEqual(before);
  });
  it("round-trips descriptions, tags, favorites and activity separately from source identities", () => {
    const storage = store(), original = project(), named = updateMath3DProjectMetadata(original, { title: "Study", description: "Catenary study", tags: ["geometry", "research"] });
    saveLibraryProject(storage, named, 100, thumbnail);
    const bytes = storage.getItem(projectPayloadKey(named.identity.id));
    updateLibraryActivity(storage, named.identity.id, { favorite: true });
    updateLibraryActivity(storage, named.identity.id, { viewedAt: 200 });
    const reopened = loadLibraryProject(storage, named.identity.id), library = parseProjectLibrary(storage.getItem(PROJECT_LIBRARY_KEY));
    expect(reopened.metadata).toEqual(named.metadata);
    expect(reopened.identity).toEqual(original.identity);
    expect(reopened.workspace).toEqual(original.workspace);
    expect(storage.getItem(projectPayloadKey(named.identity.id))).toBe(bytes);
    expect(library.entries[0]).toMatchObject({ tags: ["geometry", "research"], favorite: true, savedAt: 100, viewedAt: 200 });
    expect(readProjectThumbnail(storage, library.entries[0]!)).toBe(thumbnail);
    expect(bytes).not.toContain("data:image");
  });
  it("keeps independent project payloads, favorites first and then recent saved/viewed activity", () => {
    const storage = store(), first = project("first"), second = project("second"), third = project("third");
    for (const [item, time] of [[first, 100], [second, 200], [third, 300]] as const) saveLibraryProject(storage, item, time);
    updateLibraryActivity(storage, first.identity.id, { favorite: true });
    const library = updateLibraryActivity(storage, second.identity.id, { viewedAt: 400 });
    expect(orderProjectLibrary(library).map((entry) => entry.id)).toEqual([first.identity.id, second.identity.id, third.identity.id]);
    expect(loadLibraryProject(storage, first.identity.id)).toEqual(first);
    expect(loadLibraryProject(storage, second.identity.id)).toEqual(second);
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(serializeMath3DProject(third));
  });
  it("does not replace any saved bytes when the library is corrupt or from a future version", () => {
    for (const bad of ["{broken", JSON.stringify({ format: "math3d.project-library", version: 2, entries: [] })]) {
      const storage = store(), original = project(); saveLibraryProject(storage, original, 100);
      storage.setItem(PROJECT_LIBRARY_KEY, bad);
      const before = [...storage.values];
      expect(() => saveLibraryProject(storage, project("another"), 200)).toThrow();
      expect(() => updateLibraryActivity(storage, original.identity.id, { favorite: true })).toThrow();
      expect([...storage.values]).toEqual(before);
      expect(loadLibraryProject(storage, original.identity.id)).toEqual(original);
    }
  });
  it("rolls back a quota failure after payload and active-project writes", () => {
    const storage = store(), original = project(); saveLibraryProject(storage, original, 100, thumbnail);
    const before = [...storage.values];
    const failing = { ...storage, setItem: (key: string, value: string) => {
      if (key === PROJECT_LIBRARY_KEY) throw new Error("Quota exceeded");
      storage.setItem(key, value);
    } };
    for (const next of [project("new"), updateMath3DProjectMetadata(original, { title: "Changed", tags: ["unsaved"] })]) {
      expect(() => saveLibraryProject(failing, next, 200, thumbnail)).toThrow("Quota exceeded");
      expect([...storage.values]).toEqual(before);
    }
    expect(storage.getItem(projectPayloadKey(project("new").identity.id))).toBeNull();
  });
  it("falls back for absent or malformed thumbnails without changing project bytes", () => {
    const storage = store(), original = project(), library = saveLibraryProject(storage, original, 100, thumbnail);
    const bytes = storage.getItem(PROJECT_STORAGE_KEY), entry = library.entries[0]!;
    storage.removeItem(projectThumbnailKey(original.identity.id));
    expect(readProjectThumbnail(storage, entry)).toBeNull();
    storage.setItem(projectThumbnailKey(original.identity.id), "https://example.com/remote.png");
    expect(readProjectThumbnail(storage, entry)).toBeNull();
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(bytes);
    expect(() => validateProjectThumbnail("data:image/svg+xml;base64,aGVsbG8=")).toThrow();
    expect(() => validateProjectThumbnail(`data:image/png;base64,${"a".repeat(180000)}`)).toThrow();
  });
  it("rejects missing or mismatched payloads and foreign thumbnail references", () => {
    const storage = store(), original = project(), other = project("other"), library = saveLibraryProject(storage, original, 100);
    storage.removeItem(projectPayloadKey(original.identity.id));
    expect(() => loadLibraryProject(storage, original.identity.id)).toThrow("missing");
    storage.setItem(projectPayloadKey(original.identity.id), serializeMath3DProject(other));
    expect(() => loadLibraryProject(storage, original.identity.id)).toThrow("identity");
    expect(() => parseProjectLibrary(JSON.stringify({ ...library, entries: [{ ...library.entries[0], thumbnailKey: PROJECT_STORAGE_KEY }] }))).toThrow("corrupt");
  });
  it("enforces bounded unique entries and valid activity before mutation", () => {
    const storage = store(), original = project(), library = saveLibraryProject(storage, original, 100), entry = library.entries[0]!;
    for (const entries of [[entry, entry], Array.from({ length: 65 }, () => entry), [{ ...entry, savedAt: -1 }], [{ ...entry, tags: ["x", "x"] }]]) {
      expect(() => parseProjectLibrary(JSON.stringify({ ...library, entries }))).toThrow();
    }
    const before = [...storage.values];
    expect(() => updateLibraryActivity(storage, original.identity.id, { viewedAt: Infinity })).toThrow();
    expect([...storage.values]).toEqual(before);
  });
  it("saves managed snapshots without activating them and detects concurrent edits", () => {
    const storage = store(), original = project(); saveLibraryProject(storage, original, 100);
    const bytes = serializeMath3DProject(original), edited = updateMath3DProjectMetadata(original, { title: "Managed snapshot" });
    saveLibraryProject(storage, edited, 200, undefined, { activate: false, expectedBytes: bytes });
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(bytes);
    expect(loadLibraryProject(storage, original.identity.id)).toEqual(edited);
    const before = [...storage.values];
    expect(() => saveLibraryProject(storage, original, 300, undefined, { activate: false, expectedBytes: bytes })).toThrow("changed");
    expect(() => saveLibraryProject(storage, original, 300)).toThrow("edited separately");
    expect([...storage.values]).toEqual(before);
  });
});
