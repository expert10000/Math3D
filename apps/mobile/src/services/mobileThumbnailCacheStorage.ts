import { Directory, File, Paths } from "expo-file-system";
import {
  isMobileSceneThumbnail,
  type MobileSceneThumbnail,
} from "../viewer/mobileSceneThumbnail";

const THUMBNAIL_CACHE_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const THUMBNAIL_CACHE_FILE_NAME = "project-thumbnails.json";

export type MobileThumbnailCacheEntry = {
  cacheKey: string;
  thumbnail: MobileSceneThumbnail;
};

export type MobileThumbnailCache = Record<string, MobileThumbnailCacheEntry | undefined>;

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const cacheFile = new File(storageDirectory, THUMBNAIL_CACHE_FILE_NAME);

const ensureCacheLocation = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
  if (!cacheFile.exists) cacheFile.create({ intermediates: true, overwrite: true });
};

export const loadMobileThumbnailCache = async (): Promise<MobileThumbnailCache> => {
  ensureCacheLocation();
  if (!cacheFile.exists) return {};
  const raw = await cacheFile.text();
  if (!raw.trim()) return {};
  try {
    const payload = JSON.parse(raw) as { schemaVersion?: unknown; entries?: unknown };
    if (payload.schemaVersion !== THUMBNAIL_CACHE_SCHEMA_VERSION || !payload.entries || typeof payload.entries !== "object") {
      return {};
    }
    const cache: MobileThumbnailCache = {};
    for (const [projectId, candidate] of Object.entries(payload.entries)) {
      if (!candidate || typeof candidate !== "object") continue;
      const entry = candidate as Partial<MobileThumbnailCacheEntry>;
      if (typeof entry.cacheKey !== "string" || !isMobileSceneThumbnail(entry.thumbnail)) continue;
      cache[projectId] = { cacheKey: entry.cacheKey, thumbnail: entry.thumbnail };
    }
    return cache;
  } catch {
    return {};
  }
};

export const saveMobileThumbnailCache = async (cache: MobileThumbnailCache): Promise<void> => {
  ensureCacheLocation();
  cacheFile.write(JSON.stringify({ schemaVersion: THUMBNAIL_CACHE_SCHEMA_VERSION, entries: cache }), { encoding: "utf8" });
};

export const clearMobileThumbnailCache = async (): Promise<void> => {
  await saveMobileThumbnailCache({});
};
