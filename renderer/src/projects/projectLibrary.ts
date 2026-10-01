import { canonicalJsonStringify, parseMath3DProject, serializeMath3DProject, type Math3DProject } from "@math3d/core";

export const PROJECT_STORAGE_KEY = "math3d.project.v1";
export const PROJECT_LIBRARY_KEY = "math3d.project-library.v1";
export const MAX_PROJECT_THUMBNAIL_BYTES = 128 * 1024;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ProjectLibraryEntry = Readonly<{
  id: string; title: string; tags: readonly string[]; favorite: boolean;
  savedAt: number; viewedAt: number; thumbnailKey?: string;
}>;
export type ProjectLibrary = Readonly<{ format: "math3d.project-library"; version: 1; entries: readonly ProjectLibraryEntry[] }>;
const validId = (id: unknown): id is string => typeof id === "string" && /^math3d:project:[a-zA-Z0-9:_-]{1,160}$/.test(id);
export const projectPayloadKey = (id: string): string => {
  if (!validId(id)) throw new Error("Invalid library project ID.");
  return `${PROJECT_STORAGE_KEY}.payload.${id}`;
};
export const projectThumbnailKey = (id: string): string => `${projectPayloadKey(id)}.thumbnail`;
const exact = (value: object, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const timestamp = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
export const parseProjectLibrary = (raw: string | null): ProjectLibrary => {
  if (raw === null) return { format: "math3d.project-library", version: 1, entries: [] };
  if (new TextEncoder().encode(raw).length > 128 * 1024) throw new Error("Project library exceeds its size limit.");
  const value = JSON.parse(raw);
  if (!value || !exact(value, ["format", "version", "entries"]) || value.format !== "math3d.project-library" || value.version !== 1 ||
    !Array.isArray(value.entries) || value.entries.length > 64) throw new Error("Project library index is unsupported or corrupt. Saved project payloads are retained.");
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || !exact(entry, ["id", "title", "tags", "favorite", "savedAt", "viewedAt", ...(entry.thumbnailKey !== undefined ? ["thumbnailKey"] : [])]) ||
      !validId(entry.id) || ids.has(entry.id) || typeof entry.title !== "string" || entry.title.trim() !== entry.title || entry.title.length < 1 || entry.title.length > 160 ||
      !Array.isArray(entry.tags) || entry.tags.length > 16 || !entry.tags.every((tag: unknown) => typeof tag === "string" && tag.trim() === tag && tag.length > 0 && tag.length <= 40) ||
      new Set(entry.tags).size !== entry.tags.length || typeof entry.favorite !== "boolean" || !timestamp(entry.savedAt) || !timestamp(entry.viewedAt) ||
      (entry.thumbnailKey !== undefined && entry.thumbnailKey !== projectThumbnailKey(entry.id))) {
      throw new Error("Project library index is unsupported or corrupt. Saved project payloads are retained.");
    }
    ids.add(entry.id);
  }
  return value;
};
export const orderProjectLibrary = (library: ProjectLibrary): readonly ProjectLibraryEntry[] => [...library.entries].sort((a, b) =>
  Number(b.favorite) - Number(a.favorite) || Math.max(b.savedAt, b.viewedAt) - Math.max(a.savedAt, a.viewedAt) || a.id.localeCompare(b.id));

/** Raster sidecar only; thumbnail bytes never enter the project/source hash. */
export const validateProjectThumbnail = (raw: string): string => {
  if (raw.length > Math.ceil(MAX_PROJECT_THUMBNAIL_BYTES * 4 / 3) + 64 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error("Choose a PNG or JPEG thumbnail up to 128 KiB.");
  }
  const base64 = raw.slice(raw.indexOf(",") + 1), padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  if (base64.length % 4 !== 0 || base64.length * 3 / 4 - padding > MAX_PROJECT_THUMBNAIL_BYTES) throw new Error("Choose a PNG or JPEG thumbnail up to 128 KiB.");
  return raw;
};
export const readProjectThumbnail = (store: Store, entry: ProjectLibraryEntry): string | null => {
  try { const raw = entry.thumbnailKey ? store.getItem(entry.thumbnailKey) : null; return raw ? validateProjectThumbnail(raw) : null; }
  catch { return null; }
};

// localStorage has no multi-key transaction. Validate first, roll back writes on
// failure, and never prune payloads from an index. Interrupted saves may leave an
// unindexed payload, which is safer than deleting project data.
const write = (store: Store, changes: readonly (readonly [string, string])[]) => {
  const previous = changes.map(([key]) => [key, store.getItem(key)] as const);
  let completed = 0;
  try { for (const [key, value] of changes) { store.setItem(key, value); completed++; } }
  catch (error) {
    for (let index = completed - 1; index >= 0; index--) {
      const [key, value] = previous[index]!;
      try { if (value === null) store.removeItem(key); else store.setItem(key, value); } catch { /* Retain recoverable payload on storage failure. */ }
    }
    throw error;
  }
};
export const saveLibraryProject = (store: Store, project: Math3DProject, now: number, thumbnail?: string,
  options: { activate?: boolean; expectedBytes?: string } = {}): ProjectLibrary => {
  const bytes = serializeMath3DProject(project), library = parseProjectLibrary(store.getItem(PROJECT_LIBRARY_KEY));
  const payloadKey = projectPayloadKey(project.identity.id), existing = store.getItem(payloadKey);
  if (options.expectedBytes !== undefined && existing !== options.expectedBytes) throw new Error("Saved project changed. Reopen it before saving your changes.");
  const active = store.getItem(PROJECT_STORAGE_KEY);
  if (options.activate !== false && existing && active && parseMath3DProject(active).identity.id === project.identity.id && active !== existing) {
    throw new Error("Saved project was edited separately. Manage its saved copy or create a new project from the current workspace.");
  }
  const old = library.entries.find((entry) => entry.id === project.identity.id);
  const entry: ProjectLibraryEntry = { id: project.identity.id, title: project.metadata.title, tags: project.metadata.tags ?? [],
    favorite: old?.favorite ?? false, savedAt: now, viewedAt: old?.viewedAt ?? 0,
    ...(thumbnail ? { thumbnailKey: projectThumbnailKey(project.identity.id) } : old?.thumbnailKey ? { thumbnailKey: old.thumbnailKey } : {}) };
  const next = parseProjectLibrary(canonicalJsonStringify({ ...library, entries: [...library.entries.filter((item) => item.id !== entry.id), entry] }));
  const changes: [string, string][] = [[payloadKey, bytes]];
  if (options.activate !== false) changes.push([PROJECT_STORAGE_KEY, bytes]);
  if (thumbnail) changes.push([projectThumbnailKey(entry.id), validateProjectThumbnail(thumbnail)]);
  changes.push([PROJECT_LIBRARY_KEY, canonicalJsonStringify(next)]);
  write(store, changes);
  return next;
};
export const loadLibraryProject = (store: Store, id: string): Math3DProject => {
  const raw = store.getItem(projectPayloadKey(id));
  if (!raw) throw new Error("Saved project payload is missing.");
  const project = parseMath3DProject(raw);
  if (project.identity.id !== id) throw new Error("Saved project identity does not match its library entry.");
  return project;
};
export const updateLibraryActivity = (store: Store, id: string, change: { favorite: boolean } | { viewedAt: number }): ProjectLibrary => {
  const library = parseProjectLibrary(store.getItem(PROJECT_LIBRARY_KEY));
  if (!library.entries.some((entry) => entry.id === id)) throw new Error("Project is not in the library.");
  const next = parseProjectLibrary(canonicalJsonStringify({ ...library, entries: library.entries.map((entry) => entry.id === id ? { ...entry, ...change } : entry) }));
  store.setItem(PROJECT_LIBRARY_KEY, canonicalJsonStringify(next));
  return next;
};
