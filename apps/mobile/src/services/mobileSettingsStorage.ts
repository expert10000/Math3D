import { Directory, File, Paths } from "expo-file-system";

const SETTINGS_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const SETTINGS_FILE_NAME = "mobile-settings.json";

type PersistedSettingsPayload = {
  schemaVersion: number;
  workerBaseUrl: string;
  androidGlEnabled?: boolean;
  androidGlProbePending?: boolean;
  meshResolutionCap?: number;
  lastSceneId?: string;
  lastSelectedSurfaceId?: string;
  lastBackendError?: string;
  lastBackendLatencyMs?: number;
  lastRequestTimeout?: boolean;
  cameraOrbit?: {
    azimuth: number;
    polar: number;
    distance: number;
    targetX: number;
    targetY: number;
    targetZ: number;
  };
};

export type MobileSettingsLoad = {
  workerBaseUrl: string | null;
  androidGlEnabled: boolean | null;
  androidGlProbePending: boolean | null;
  meshResolutionCap: number | null;
  lastSceneId: string | null;
  lastSelectedSurfaceId: string | null;
  lastBackendError: string | null;
  lastBackendLatencyMs: number | null;
  lastRequestTimeout: boolean | null;
  cameraOrbit:
    | {
        azimuth: number;
        polar: number;
        distance: number;
        targetX: number;
        targetY: number;
        targetZ: number;
      }
    | null;
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
    if (!settingsFile.exists) {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        meshResolutionCap: null,
        lastSceneId: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
        issues: [],
      };
    }

    const raw = await settingsFile.text();
    if (!raw.trim()) {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        meshResolutionCap: null,
        lastSceneId: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
        issues: [],
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        meshResolutionCap: null,
        lastSceneId: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
        issues: [`Settings JSON parse failed: ${String((error as Error).message ?? error)}`],
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        meshResolutionCap: null,
        lastSceneId: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
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
      return {
        workerBaseUrl: null,
        androidGlEnabled: null,
        androidGlProbePending: null,
        meshResolutionCap: null,
        lastSceneId: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
        issues,
      };
    }

    const cameraOrbit =
      payload.cameraOrbit &&
      typeof payload.cameraOrbit.azimuth === "number" &&
      typeof payload.cameraOrbit.polar === "number" &&
      typeof payload.cameraOrbit.distance === "number" &&
      typeof payload.cameraOrbit.targetX === "number" &&
      typeof payload.cameraOrbit.targetY === "number" &&
      typeof payload.cameraOrbit.targetZ === "number"
        ? payload.cameraOrbit
        : null;

    return {
      workerBaseUrl: payload.workerBaseUrl.trim(),
      androidGlEnabled: typeof payload.androidGlEnabled === "boolean" ? payload.androidGlEnabled : null,
      androidGlProbePending: typeof payload.androidGlProbePending === "boolean" ? payload.androidGlProbePending : null,
      meshResolutionCap: typeof payload.meshResolutionCap === "number" ? payload.meshResolutionCap : null,
      lastSceneId: typeof payload.lastSceneId === "string" ? payload.lastSceneId : null,
      lastSelectedSurfaceId:
        typeof payload.lastSelectedSurfaceId === "string" ? payload.lastSelectedSurfaceId : null,
      lastBackendError: typeof payload.lastBackendError === "string" ? payload.lastBackendError : null,
      lastBackendLatencyMs:
        typeof payload.lastBackendLatencyMs === "number" ? payload.lastBackendLatencyMs : null,
      lastRequestTimeout:
        typeof payload.lastRequestTimeout === "boolean" ? payload.lastRequestTimeout : null,
      cameraOrbit,
      issues,
    };
  } catch (error) {
    return {
      workerBaseUrl: null,
      androidGlEnabled: null,
      androidGlProbePending: null,
      meshResolutionCap: null,
      lastSceneId: null,
      lastSelectedSurfaceId: null,
      lastBackendError: null,
      lastBackendLatencyMs: null,
      lastRequestTimeout: null,
      cameraOrbit: null,
      issues: [`Failed to load settings: ${String((error as Error).message ?? error)}`],
    };
  }
};

export const saveMobileSettings = async (settings: {
  workerBaseUrl: string;
  androidGlEnabled: boolean;
  androidGlProbePending?: boolean;
  meshResolutionCap?: number;
  lastSceneId?: string;
  lastSelectedSurfaceId?: string;
  lastBackendError?: string;
  lastBackendLatencyMs?: number;
  lastRequestTimeout?: boolean;
  cameraOrbit?: {
    azimuth: number;
    polar: number;
    distance: number;
    targetX: number;
    targetY: number;
    targetZ: number;
  } | null;
}): Promise<void> => {
  ensureStorageLocation();
  const payload: PersistedSettingsPayload = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    workerBaseUrl: settings.workerBaseUrl.trim(),
    androidGlEnabled: settings.androidGlEnabled,
    androidGlProbePending: typeof settings.androidGlProbePending === "boolean" ? settings.androidGlProbePending : false,
    meshResolutionCap: typeof settings.meshResolutionCap === "number" ? settings.meshResolutionCap : undefined,
    lastSceneId: typeof settings.lastSceneId === "string" ? settings.lastSceneId : undefined,
    lastSelectedSurfaceId:
      typeof settings.lastSelectedSurfaceId === "string" ? settings.lastSelectedSurfaceId : undefined,
    lastBackendError: typeof settings.lastBackendError === "string" ? settings.lastBackendError : undefined,
    lastBackendLatencyMs:
      typeof settings.lastBackendLatencyMs === "number" ? settings.lastBackendLatencyMs : undefined,
    lastRequestTimeout:
      typeof settings.lastRequestTimeout === "boolean" ? settings.lastRequestTimeout : undefined,
    cameraOrbit: settings.cameraOrbit && typeof settings.cameraOrbit === "object" ? settings.cameraOrbit : undefined,
  };
  settingsFile.write(JSON.stringify(payload, null, 2), { encoding: "utf8" });
};
