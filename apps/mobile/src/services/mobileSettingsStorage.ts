import { Directory, File, Paths } from "expo-file-system";

const SETTINGS_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const SETTINGS_FILE_NAME = "mobile-settings.json";

type PersistedSettingsPayload = {
  schemaVersion: number;
  workerBaseUrl: string;
  androidGlEnabled?: boolean;
  androidGlProbePending?: boolean;
};

export type MobileSettingsLoad = {
  workerBaseUrl: string | null;
  androidGlEnabled: boolean | null;
  androidGlProbePending: boolean | null;
  issues: string[];
};

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const settingsFile = new File(storageDirectory, SETTINGS_FILE_NAME);

const ensureStorageLocation = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
  if (!settingsFile.exists) {
    settingsFile.create({ intermediates: true, overwrite: true });
  }
};

export const loadMobileSettings = async (): Promise<MobileSettingsLoad> => {
  try {
    ensureStorageLocation();
    if (!settingsFile.exists) return { workerBaseUrl: null, androidGlEnabled: null, androidGlProbePending: null, issues: [] };

    const raw = await settingsFile.text();
    if (!raw.trim()) return { workerBaseUrl: null, androidGlEnabled: null, androidGlProbePending: null, issues: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        issues: [`Settings JSON parse failed: ${String((error as Error).message ?? error)}`],
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        issues: ["Settings payload must be an object."],
      };
    }

    const payload = parsed as Partial<PersistedSettingsPayload>;
    const issues: string[] = [];

    if (payload.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      issues.push(
        `Settings schema mismatch: expected ${SETTINGS_SCHEMA_VERSION}, got ${String(payload.schemaVersion ?? "unknown")}.`
      );
    }

    if (typeof payload.workerBaseUrl !== "string" || payload.workerBaseUrl.trim().length === 0) {
      issues.push("Settings workerBaseUrl is missing or invalid.");
      return { workerBaseUrl: null, androidGlEnabled: null, androidGlProbePending: null, issues };
    }

    return {
      workerBaseUrl: payload.workerBaseUrl.trim(),
      androidGlEnabled: typeof payload.androidGlEnabled === "boolean" ? payload.androidGlEnabled : null,
      androidGlProbePending: typeof payload.androidGlProbePending === "boolean" ? payload.androidGlProbePending : null,
      issues,
    };
  } catch (error) {
    return {
      workerBaseUrl: null,
      androidGlEnabled: null,
      androidGlProbePending: null,
      issues: [`Failed to load settings: ${String((error as Error).message ?? error)}`],
    };
  }
};

export const saveMobileSettings = async (settings: {
  workerBaseUrl: string;
  androidGlEnabled: boolean;
  androidGlProbePending?: boolean;
}): Promise<void> => {
  ensureStorageLocation();
  const payload: PersistedSettingsPayload = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    workerBaseUrl: settings.workerBaseUrl.trim(),
    androidGlEnabled: settings.androidGlEnabled,
    androidGlProbePending: typeof settings.androidGlProbePending === "boolean" ? settings.androidGlProbePending : false,
  };
  settingsFile.write(JSON.stringify(payload, null, 2), { encoding: "utf8" });
};
