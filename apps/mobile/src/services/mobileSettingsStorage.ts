import { Directory, File, Paths } from "expo-file-system";
import { normalizeMobileGridPlanes, type MobileGridPlane } from "../models/mobileCoordinateGrid";
import type { MobileSurfaceColorMode } from "../viewer/mobileCurvatureColors";
import {
  normalizeMobileSurfaceRenderMode,
  normalizeMobileSurfaceShading,
  type MobileSurfaceRenderMode,
  type MobileSurfaceShading,
} from "../viewer/mobileViewModes";

const SETTINGS_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const SETTINGS_FILE_NAME = "mobile-settings.json";

type PersistedSettingsPayload = {
  schemaVersion: number;
  workerBaseUrl: string;
  androidGlEnabled?: boolean;
  androidGlProbePending?: boolean;
  meshResolutionCap?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  gridPlanes?: MobileGridPlane[];
  surfaceColorMode?: MobileSurfaceColorMode;
  surfaceRenderMode?: MobileSurfaceRenderMode;
  surfaceShading?: MobileSurfaceShading;
  lastSceneId?: string;
  lastViewerProject?: string;
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
  cameraOrbitFrame?: "z-up-v1";
};

export type MobileSettingsLoad = {
  workerBaseUrl: string | null;
  androidGlEnabled: boolean | null;
  androidGlProbePending: boolean | null;
  meshResolutionCap: number | null;
  showGrid: boolean | null;
  showAxes: boolean | null;
  gridPlanes?: MobileGridPlane[];
  surfaceColorMode?: MobileSurfaceColorMode;
  surfaceRenderMode?: MobileSurfaceRenderMode;
  surfaceShading?: MobileSurfaceShading;
  lastSceneId: string | null;
  lastViewerProject: string | null;
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
        showGrid: null,
        showAxes: null,
        lastSceneId: null,
        lastViewerProject: null,
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
        showGrid: null,
        showAxes: null,
        lastSceneId: null,
        lastViewerProject: null,
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
        showGrid: null,
        showAxes: null,
        lastSceneId: null,
        lastViewerProject: null,
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
        showGrid: null,
        showAxes: null,
        lastSceneId: null,
        lastViewerProject: null,
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
        showGrid: null,
        showAxes: null,
        lastSceneId: null,
        lastViewerProject: null,
        lastSelectedSurfaceId: null,
        lastBackendError: null,
        lastBackendLatencyMs: null,
        lastRequestTimeout: null,
        cameraOrbit: null,
        issues,
      };
    }

    const cameraOrbit =
      payload.cameraOrbitFrame === "z-up-v1" &&
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
      showGrid: typeof payload.showGrid === "boolean" ? payload.showGrid : null,
      showAxes: typeof payload.showAxes === "boolean" ? payload.showAxes : null,
      gridPlanes: normalizeMobileGridPlanes(payload.gridPlanes),
      surfaceColorMode: payload.surfaceColorMode === "curvature" || payload.surfaceColorMode === "curvature-faces"
        ? payload.surfaceColorMode : "solid",
      surfaceRenderMode: normalizeMobileSurfaceRenderMode(payload.surfaceRenderMode),
      surfaceShading: normalizeMobileSurfaceShading(payload.surfaceShading),
      lastSceneId: typeof payload.lastSceneId === "string" ? payload.lastSceneId : null,
      lastViewerProject: typeof payload.lastViewerProject === "string" ? payload.lastViewerProject : null,
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
      showGrid: null,
      showAxes: null,
      lastSceneId: null,
      lastViewerProject: null,
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
  showGrid?: boolean;
  showAxes?: boolean;
  gridPlanes?: MobileGridPlane[];
  surfaceColorMode?: MobileSurfaceColorMode;
  surfaceRenderMode?: MobileSurfaceRenderMode;
  surfaceShading?: MobileSurfaceShading;
  lastSceneId?: string;
  lastViewerProject?: string;
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
    showGrid: typeof settings.showGrid === "boolean" ? settings.showGrid : undefined,
    showAxes: typeof settings.showAxes === "boolean" ? settings.showAxes : undefined,
    gridPlanes: normalizeMobileGridPlanes(settings.gridPlanes),
    surfaceColorMode: settings.surfaceColorMode === "curvature" || settings.surfaceColorMode === "curvature-faces"
      ? settings.surfaceColorMode : "solid",
    surfaceRenderMode: normalizeMobileSurfaceRenderMode(settings.surfaceRenderMode),
    surfaceShading: normalizeMobileSurfaceShading(settings.surfaceShading),
    lastSceneId: typeof settings.lastSceneId === "string" ? settings.lastSceneId : undefined,
    lastViewerProject: typeof settings.lastViewerProject === "string" ? settings.lastViewerProject : undefined,
    lastSelectedSurfaceId:
      typeof settings.lastSelectedSurfaceId === "string" ? settings.lastSelectedSurfaceId : undefined,
    lastBackendError: typeof settings.lastBackendError === "string" ? settings.lastBackendError : undefined,
    lastBackendLatencyMs:
      typeof settings.lastBackendLatencyMs === "number" ? settings.lastBackendLatencyMs : undefined,
    lastRequestTimeout:
      typeof settings.lastRequestTimeout === "boolean" ? settings.lastRequestTimeout : undefined,
    cameraOrbit: settings.cameraOrbit && typeof settings.cameraOrbit === "object" ? settings.cameraOrbit : undefined,
    cameraOrbitFrame: "z-up-v1",
  };
  settingsFile.write(JSON.stringify(payload, null, 2), { encoding: "utf8" });
};
