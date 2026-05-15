import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SCENE_PROJECT_VERSION, type SceneDocument, type SurfaceDefinition, type VtkPreviewRequest } from "@math3d/core";
import Constants from "expo-constants";
import { MobileSceneViewport, type OrbitState } from "./components/MobileSceneViewport";
import { mobileFunctionPresets, mobileGallery, mobileSeedScenes } from "./data/mobileSeedData";
import type { MobileSceneSummary, MobileStoredSceneProject } from "./models/mobileScene";
import {
  buildSceneSummary,
  clearStoredSceneProjects,
  createStoredProjectFromScene,
  loadStoredSceneProjects,
  readSceneFromStoredProject,
  saveStoredSceneProjects,
} from "./services/mobileSceneStorage";
import { createMobileMeshBackend } from "./services/mobileMeshBackend";
import { clearMeshCache, createMeshCacheKey, readCachedMesh, writeCachedMesh } from "./services/mobileMeshCacheStorage";
import { loadMobileSettings, saveMobileSettings } from "./services/mobileSettingsStorage";
import type { MobileMeshPayload, MobileRenderQuality } from "./viewer/mobileSurfacePreview";

type MobileTab = "home" | "gallery" | "viewer" | "learn" | "functions" | "settings";
type StorageStatus = "loading" | "ready" | "error";
type CameraCommandType = "reset" | "fit";
type SceneSortMode = "recent" | "updated" | "title";
const ANDROID_GL_DEFAULT_ENABLED = true;
const FORCE_ANDROID_SAFE_MODE = false;

const tabs: ReadonlyArray<{ key: MobileTab; label: string }> = [
  { key: "home", label: "home" },
  { key: "gallery", label: "gallery" },
  { key: "viewer", label: "viewer" },
  { key: "functions", label: "functions" },
  { key: "learn", label: "learn" },
  { key: "settings", label: "settings" },
];

const roadmapSteps: ReadonlyArray<{ id: string; title: string; status: "done" | "in_progress" | "pending" }> = [
  { id: "m1", title: "Mobile shell and tab navigation", status: "done" },
  { id: "m2", title: "Gallery and function preset loading", status: "done" },
  { id: "m3", title: "Scene persistence and validation", status: "done" },
  { id: "m4", title: "Native 3D viewport integration", status: "done" },
  { id: "m5", title: "Backend compute integration", status: "done" },
];

const asDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

const surfaceSummary = (surface: SurfaceDefinition): string => {
  if (surface.kind === "mesh") return `mesh source: ${surface.source}`;
  if (surface.kind === "implicit") return `implicit f(x,y,z)=0 @ ${surface.resolution}`;
  if (surface.kind === "explicit") return `explicit z=f(x,y) @ ${surface.resolution}`;
  if (surface.kind === "weierstrass") return `weierstrass g(z),phi(z) @ ${surface.resolution}`;
  return `parametric sigma(u,v) @ ${surface.resolution}`;
};

const cloneSceneWithNewTimestamp = (scene: SceneDocument): SceneDocument => ({
  ...scene,
  updatedAt: Date.now(),
});

type ImplicitPreviewStatus = "idle" | "loading" | "ready" | "error";
type ImplicitPreviewState = {
  status: ImplicitPreviewStatus;
  error?: string;
  vertexCount?: number;
  triCount?: number;
  cached?: boolean;
};
type ImplicitPreviewBySurfaceId = Record<string, ImplicitPreviewState | undefined>;
type BackendHealthStatus = "idle" | "loading" | "ok" | "error";
type DiagnosticsStatus = "idle" | "running" | "ready" | "error";
type BackendDiagnostics = {
  status: DiagnosticsStatus;
  healthOk: boolean | null;
  latencyMs: number | null;
  workerVersion: string | null;
  workerProtocol: string | null;
  lastError: string | null;
  timeoutDetected: boolean;
  lastPayloadBytes: number | null;
};

const DEFAULT_WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_MATH3D_WORKER_BASE_URL || "http://127.0.0.1:8787/api/worker";
const EXPECTED_WORKER_PROTOCOL = process.env.EXPO_PUBLIC_MATH3D_WORKER_PROTOCOL || "2026-03-15";
const DEFAULT_MESH_RESOLUTION_CAP = 96;
const MESH_RESOLUTION_CAP_MIN = 36;
const MESH_RESOLUTION_CAP_MAX = 192;
const PREVIEW_PAYLOAD_WARNING_BYTES = 25_000;
const PREVIEW_SCHEMA_VERSION = 1;

const normalizeWorkerBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_WORKER_BASE_URL;
  return trimmed.replace(/\/+$/, "");
};

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const isLikelyLocalHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(normalized)) return true;
  const match172 = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (match172) {
    const second = Number(match172[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }
  return false;
};

const inspectWorkerBaseUrl = (
  value: string
):
  | { supported: true; insecure: boolean; host: string; isLocal: boolean }
  | { supported: false; reason: string } => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { supported: false, reason: `Unsupported protocol ${parsed.protocol}` };
    }
    const host = parsed.hostname || "";
    const isLocal = isLikelyLocalHost(host);
    return {
      supported: true,
      insecure: parsed.protocol === "http:",
      host,
      isLocal,
    };
  } catch {
    return { supported: false, reason: "Invalid URL format" };
  }
};

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const buildSceneHash = (scene: SceneDocument): string =>
  hashText(
    JSON.stringify({
      id: scene.id,
      updatedAt: scene.updatedAt,
      title: scene.title,
      surfaceIds: (scene.surfaces ?? []).map((surface) => surface.id),
    })
  );

const buildImplicitParameterHash = (payload: Omit<VtkPreviewRequest, "jobId">, quality: MobileRenderQuality): string =>
  hashText(JSON.stringify({ payload, quality }));

const toArrayBuffer = (input: ArrayBuffer | ArrayBufferView): ArrayBuffer => {
  if (input instanceof ArrayBuffer) return input;
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const clone = new Uint8Array(bytes.length);
  clone.set(bytes);
  return clone.buffer;
};

const toFloat32 = (input: ArrayBuffer | ArrayBufferView): Float32Array => new Float32Array(toArrayBuffer(input));
const toUint32 = (input: ArrayBuffer | ArrayBufferView): Uint32Array => new Uint32Array(toArrayBuffer(input));

const createViewerSceneFromSurface = (surface: SurfaceDefinition, title: string): SceneDocument => {
  const now = Date.now();
  return {
    id: `scene-mobile-${surface.id}-${now}`,
    title,
    createdAt: now,
    updatedAt: now,
    surfaces: [surface],
  };
};

const upsertStoredProject = (
  projects: MobileStoredSceneProject[],
  nextProject: MobileStoredSceneProject
): MobileStoredSceneProject[] => {
  const index = projects.findIndex((item) => item.id === nextProject.id);
  if (index === -1) {
    return [nextProject, ...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }

  const clone = [...projects];
  clone[index] = nextProject;
  return clone.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
};

export const MobileApp: React.FC = () => {
  const androidTopInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const [tab, setTab] = useState<MobileTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(mobileGallery[0]?.id ?? null);
  const [viewerDocument, setViewerDocument] = useState<SceneDocument | null>(null);
  const [renderQuality, setRenderQuality] = useState<MobileRenderQuality>("balanced");
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(true);
  const [storedProjects, setStoredProjects] = useState<MobileStoredSceneProject[]>([]);
  const [storageIssues, setStorageIssues] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [sceneSearchQuery, setSceneSearchQuery] = useState("");
  const [sceneSortMode, setSceneSortMode] = useState<SceneSortMode>("recent");
  const [visibleSurfaceIds, setVisibleSurfaceIds] = useState<string[]>([]);
  const [cameraCommandType, setCameraCommandType] = useState<CameraCommandType | null>(null);
  const [cameraCommandToken, setCameraCommandToken] = useState(0);
  const [workerBaseUrl, setWorkerBaseUrl] = useState(DEFAULT_WORKER_BASE_URL);
  const [workerBaseUrlDraft, setWorkerBaseUrlDraft] = useState(DEFAULT_WORKER_BASE_URL);
  const [backendHealthStatus, setBackendHealthStatus] = useState<BackendHealthStatus>("idle");
  const [backendHealthMessage, setBackendHealthMessage] = useState("");
  const [backendDiagnostics, setBackendDiagnostics] = useState<BackendDiagnostics>({
    status: "idle",
    healthOk: null,
    latencyMs: null,
    workerVersion: null,
    workerProtocol: null,
    lastError: null,
    timeoutDetected: false,
    lastPayloadBytes: null,
  });
  const [settingsActionMessage, setSettingsActionMessage] = useState("");
  const [meshResolutionCap, setMeshResolutionCap] = useState(DEFAULT_MESH_RESOLUTION_CAP);
  const [meshResolutionCapDraft, setMeshResolutionCapDraft] = useState(String(DEFAULT_MESH_RESOLUTION_CAP));
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [cameraOrbit, setCameraOrbit] = useState<OrbitState | null>(null);
  const [appIsForeground, setAppIsForeground] = useState(true);
  const [limitedMode, setLimitedMode] = useState(false);
  const [lastPreviewTimeout, setLastPreviewTimeout] = useState(false);
  const [viewerLoadingMessage, setViewerLoadingMessage] = useState("");
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);
  const [androidGlEnabled, setAndroidGlEnabled] = useState(ANDROID_GL_DEFAULT_ENABLED);
  const [androidGlProbePending, setAndroidGlProbePending] = useState(false);
  const [androidGlRecoveredFromCrash, setAndroidGlRecoveredFromCrash] = useState(false);
  const [implicitMeshBySurfaceId, setImplicitMeshBySurfaceId] = useState<
    Record<string, MobileMeshPayload | undefined>
  >({});
  const [implicitPreviewBySurfaceId, setImplicitPreviewBySurfaceId] = useState<ImplicitPreviewBySurfaceId>({});
  const [implicitPreviewRetryToken, setImplicitPreviewRetryToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadStorage = async () => {
      setStorageStatus("loading");
      const [loaded, loadedSettings] = await Promise.all([loadStoredSceneProjects(), loadMobileSettings()]);

      let projects = loaded.projects;
      const issues = [...loaded.issues];
      issues.push(...loadedSettings.issues);

      const loadedWorkerBaseUrl = loadedSettings.workerBaseUrl
        ? normalizeWorkerBaseUrl(loadedSettings.workerBaseUrl)
        : DEFAULT_WORKER_BASE_URL;
      const loadedMeshResolutionCap =
        typeof loadedSettings.meshResolutionCap === "number"
          ? clampInt(loadedSettings.meshResolutionCap, MESH_RESOLUTION_CAP_MIN, MESH_RESOLUTION_CAP_MAX)
          : DEFAULT_MESH_RESOLUTION_CAP;
      const loadedAndroidGlEnabled =
        typeof loadedSettings.androidGlEnabled === "boolean"
          ? loadedSettings.androidGlEnabled
          : ANDROID_GL_DEFAULT_ENABLED;
      const loadedAndroidGlProbePending = loadedSettings.androidGlProbePending === true;
      const preferAndroidGlByDefault = Platform.OS === "android" && !FORCE_ANDROID_SAFE_MODE;
      let effectiveAndroidGlEnabled = preferAndroidGlByDefault ? true : loadedAndroidGlEnabled;
      let recoveredFromCrash = false;
      if (!preferAndroidGlByDefault && Platform.OS === "android" && loadedAndroidGlEnabled && loadedAndroidGlProbePending) {
        effectiveAndroidGlEnabled = false;
        recoveredFromCrash = true;
        issues.push("Android GL auto-disabled after previous startup crash. Re-enable in Settings to retry.");
      }

      if (projects.length === 0) {
        projects = mobileSeedScenes.map((scene) => createStoredProjectFromScene(scene, scene.updatedAt));
        try {
          await saveStoredSceneProjects(projects);
        } catch (error) {
          issues.push(`Failed to write initial seed scenes: ${String((error as Error).message ?? error)}`);
        }
      }

      if (!active) return;

      setStoredProjects(projects);
      setStorageIssues(issues);
      setWorkerBaseUrl(loadedWorkerBaseUrl);
      setWorkerBaseUrlDraft(loadedWorkerBaseUrl);
      setMeshResolutionCap(loadedMeshResolutionCap);
      setMeshResolutionCapDraft(String(loadedMeshResolutionCap));
      setSelectedSceneId(loadedSettings.lastSceneId || null);
      setSelectedSurfaceId(loadedSettings.lastSelectedSurfaceId || null);
      setCameraOrbit(loadedSettings.cameraOrbit || null);
      setBackendDiagnostics((current) => ({
        ...current,
        lastError: loadedSettings.lastBackendError,
        latencyMs: loadedSettings.lastBackendLatencyMs,
        timeoutDetected: loadedSettings.lastRequestTimeout === true,
      }));
      if (loadedSettings.lastBackendError) setLimitedMode(true);
      setAndroidGlEnabled(effectiveAndroidGlEnabled);
      setAndroidGlProbePending(false);
      setAndroidGlRecoveredFromCrash(recoveredFromCrash);

      if (
        recoveredFromCrash ||
        loadedAndroidGlProbePending ||
        effectiveAndroidGlEnabled !== loadedAndroidGlEnabled
      ) {
        void saveMobileSettings({
          workerBaseUrl: loadedWorkerBaseUrl,
          androidGlEnabled: effectiveAndroidGlEnabled,
          androidGlProbePending: false,
          meshResolutionCap: loadedMeshResolutionCap,
          lastSceneId: loadedSettings.lastSceneId || undefined,
          lastSelectedSurfaceId: loadedSettings.lastSelectedSurfaceId || undefined,
          cameraOrbit: loadedSettings.cameraOrbit || undefined,
          lastBackendError: loadedSettings.lastBackendError || undefined,
          lastBackendLatencyMs:
            typeof loadedSettings.lastBackendLatencyMs === "number"
              ? loadedSettings.lastBackendLatencyMs
              : undefined,
          lastRequestTimeout:
            typeof loadedSettings.lastRequestTimeout === "boolean" ? loadedSettings.lastRequestTimeout : undefined,
        }).catch((error) => {
          if (!active) return;
          setStorageIssues((current) => [
            ...current,
            `Failed to persist GL recovery setting: ${String((error as Error).message ?? error)}`,
          ]);
          setStorageStatus("error");
        });
      }

      const initialSceneId = loadedSettings.lastSceneId || projects[0]?.id || null;
      const firstProject = initialSceneId ? projects.find((project) => project.id === initialSceneId) ?? projects[0] ?? null : null;
      setSelectedSceneId(firstProject?.id ?? null);
      if (firstProject) {
        const parsed = readSceneFromStoredProject(firstProject);
        if (parsed.ok) {
          setViewerDocument(parsed.scene);
          setStorageStatus(issues.length > 0 ? "error" : "ready");
        } else {
          setStorageStatus("error");
          setStorageIssues((current) => [...current, ...parsed.errors]);
        }
      } else {
        setViewerDocument(null);
        setStorageStatus(issues.length > 0 ? "error" : "ready");
      }
    };

    void loadStorage();

    return () => {
      active = false;
    };
  }, []);

  const sceneSummaries: MobileSceneSummary[] = useMemo(
    () => storedProjects.map((project) => buildSceneSummary(project)),
    [storedProjects]
  );

  const selectedScene = useMemo(
    () => sceneSummaries.find((scene) => scene.id === selectedSceneId) ?? null,
    [sceneSummaries, selectedSceneId]
  );

  const filteredSceneSummaries = useMemo(() => {
    const query = sceneSearchQuery.trim().toLowerCase();
    const source = sceneSummaries.filter((scene) => {
      if (!query) return true;
      return scene.title.toLowerCase().includes(query) || scene.id.toLowerCase().includes(query);
    });

    const lastOpenedById = new Map(storedProjects.map((project) => [project.id, project.lastOpenedAt]));
    const sorted = [...source];
    if (sceneSortMode === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      return sorted;
    }
    if (sceneSortMode === "updated") {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted;
    }
    sorted.sort((a, b) => (lastOpenedById.get(b.id) ?? 0) - (lastOpenedById.get(a.id) ?? 0));
    return sorted;
  }, [sceneSearchQuery, sceneSortMode, sceneSummaries, storedProjects]);

  const selectedGallery = useMemo(
    () => mobileGallery.find((item) => item.id === selectedGalleryId) ?? null,
    [selectedGalleryId]
  );
  const viewerSurfaces = viewerDocument?.surfaces ?? [];
  const hasImplicitPreviewErrors = useMemo(
    () =>
      (viewerDocument?.surfaces ?? [])
        .filter((surface) => surface.kind === "implicit")
        .some((surface) => implicitPreviewBySurfaceId[surface.id]?.status === "error"),
    [implicitPreviewBySurfaceId, viewerDocument]
  );
  const backendUrlStatus = useMemo(() => inspectWorkerBaseUrl(workerBaseUrl), [workerBaseUrl]);
  const backendSecurityWarning = useMemo(() => {
    if (!backendUrlStatus.supported) return `Backend URL warning: ${backendUrlStatus.reason}.`;
    if (backendUrlStatus.insecure && !backendUrlStatus.isLocal) {
      return "Backend URL warning: non-HTTPS endpoint outside local network may expose traffic.";
    }
    return null;
  }, [backendUrlStatus]);
  const workerProtocolCompatibility = useMemo(() => {
    const protocol = backendDiagnostics.workerProtocol;
    if (!protocol) return "unknown";
    if (protocol === EXPECTED_WORKER_PROTOCOL) return "compatible";
    return "mismatch";
  }, [backendDiagnostics.workerProtocol]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const foreground = next === "active";
      setAppIsForeground(foreground);
      if (!foreground) {
        setViewerLoadingMessage("");
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const surfaceIds = (viewerDocument?.surfaces ?? []).map((surface) => surface.id);
    setVisibleSurfaceIds(surfaceIds);
    setSelectedSurfaceId((current) => (current && surfaceIds.includes(current) ? current : surfaceIds[0] ?? null));
    if (surfaceIds.length > 0) {
      setCameraCommandType("fit");
      setCameraCommandToken((value) => value + 1);
    }
    setImplicitMeshBySurfaceId({});
    setImplicitPreviewBySurfaceId({});
  }, [viewerDocument]);

  useEffect(() => {
    let cancelled = false;
    if (!viewerDocument || tab !== "viewer" || !appIsForeground) return;

    const implicitSurfaces = (viewerDocument.surfaces ?? []).filter(
      (surface): surface is Extract<SurfaceDefinition, { kind: "implicit" }> => surface.kind === "implicit"
    );
    if (implicitSurfaces.length === 0) return;

    const backend = createMobileMeshBackend(workerBaseUrl);

    const loadImplicitPreviews = async () => {
      const loadingState: ImplicitPreviewBySurfaceId = {};
      for (const surface of implicitSurfaces) {
        loadingState[surface.id] = { status: "loading" };
      }
      if (!cancelled) setImplicitPreviewBySurfaceId((current) => ({ ...current, ...loadingState }));
      if (!cancelled) setViewerLoadingMessage("Computing implicit previews...");

      for (const surface of implicitSurfaces) {
        if (cancelled) return;

        const xSpan = Math.max(0.5, surface.domain?.xSpan ?? 2.4);
        const ySpan = Math.max(0.5, surface.domain?.ySpan ?? 2.4);
        const zSpan = Math.max(0.5, surface.domain?.zSpan ?? Math.max(xSpan, ySpan));
        const baseResolution = renderQuality === "performance" ? 52 : renderQuality === "balanced" ? 72 : 96;
        const resolution = Math.min(baseResolution, meshResolutionCap);
        const requestPayload: Omit<VtkPreviewRequest, "jobId"> = {
          expr: surface.expression,
          iso: 0,
          domain: {
            min: [-xSpan, -ySpan, -zSpan],
            max: [xSpan, ySpan, zSpan],
          },
          resolution,
          targetFaces: renderQuality === "performance" ? 16000 : 28000,
        };
        const requestPayloadBytes = JSON.stringify(requestPayload).length;
        const sceneHash = buildSceneHash(viewerDocument);
        const parameterHash = buildImplicitParameterHash(requestPayload, renderQuality);
        const cacheKey = createMeshCacheKey([
          PREVIEW_SCHEMA_VERSION,
          sceneHash,
          surface.id,
          parameterHash,
        ]);

        if (!cancelled) {
          setBackendDiagnostics((current) => ({
            ...current,
            lastPayloadBytes: requestPayloadBytes,
          }));
        }

        if (limitedMode) {
          const cached = await readCachedMesh(cacheKey);
          if (cancelled) return;
          if (cached) {
            setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: cached }));
            setImplicitPreviewBySurfaceId((current) => ({
              ...current,
              [surface.id]: {
                status: "ready",
                vertexCount: cached.vertexCount,
                triCount: cached.triCount,
                cached: true,
              },
            }));
          } else {
            setImplicitPreviewBySurfaceId((current) => ({
              ...current,
              [surface.id]: {
                status: "error",
                error: "Remote compute disabled in limited mode and no cached preview is available.",
              },
            }));
            setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: undefined }));
          }
          continue;
        }

        const response = await backend
          .previewImplicit(requestPayload)
          .catch((error) => ({ ok: false as const, error: String((error as Error).message ?? error) }));

        if (cancelled) return;

        if (!response.ok) {
          const timeoutDetected = /timeout|aborted|abort/i.test(response.error || "");
          const cached = await readCachedMesh(cacheKey);
          if (cached) {
            setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: cached }));
            setImplicitPreviewBySurfaceId((current) => ({
              ...current,
              [surface.id]: {
                status: "ready",
                vertexCount: cached.vertexCount,
                triCount: cached.triCount,
                cached: true,
              },
            }));
            setBackendDiagnostics((current) => ({
              ...current,
              lastError: `Using cached preview: ${response.error}`,
              timeoutDetected,
            }));
            setLastPreviewTimeout(timeoutDetected);
            continue;
          }

          setImplicitPreviewBySurfaceId((current) => ({
            ...current,
            [surface.id]: { status: "error", error: response.error },
          }));
          setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: undefined }));
          setBackendDiagnostics((current) => ({
            ...current,
            status: "error",
            lastError: response.error,
            timeoutDetected,
          }));
          setLastPreviewTimeout(timeoutDetected);
          setLimitedMode(true);
          continue;
        }

        setLimitedMode(false);
        setLastPreviewTimeout(false);

        const meshPayload: MobileMeshPayload = {
          positions: toFloat32(response.positions),
          indices: toUint32(response.indices),
          normals: response.normals ? toFloat32(response.normals) : undefined,
          vertexCount: Number(response.vertexCount) || 0,
          triCount: Number(response.triCount) || 0,
        };

        setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: meshPayload }));
        setImplicitPreviewBySurfaceId((current) => ({
          ...current,
          [surface.id]: {
            status: "ready",
            vertexCount: meshPayload.vertexCount,
            triCount: meshPayload.triCount,
            cached: false,
          },
        }));
        void writeCachedMesh(cacheKey, meshPayload);
      }
      if (!cancelled) setViewerLoadingMessage("");
    };

    void loadImplicitPreviews();

    return () => {
      cancelled = true;
      setViewerLoadingMessage("");
    };
  }, [
    viewerDocument,
    renderQuality,
    workerBaseUrl,
    implicitPreviewRetryToken,
    meshResolutionCap,
    limitedMode,
    appIsForeground,
    tab,
  ]);

  const cameraCommand = useMemo(() => {
    if (!cameraCommandType) return null;
    return { type: cameraCommandType, token: cameraCommandToken };
  }, [cameraCommandType, cameraCommandToken]);

  const androidFallbackForced = Platform.OS === "android" && FORCE_ANDROID_SAFE_MODE;

  const shouldProbeAndroidGl =
    Platform.OS === "android" &&
    !FORCE_ANDROID_SAFE_MODE &&
    androidGlEnabled &&
    tab === "viewer" &&
    Boolean(viewerDocument);

  useEffect(() => {
    if (Platform.OS !== "android" || FORCE_ANDROID_SAFE_MODE) return;

    if (shouldProbeAndroidGl) {
      if (androidGlProbePending) return;
      setAndroidGlProbePending(true);
      void persistMobileSettings({
        workerBaseUrl: normalizeWorkerBaseUrl(workerBaseUrl),
        androidGlProbePending: true,
      }).catch((error) => {
        setStorageIssues((current) => [
          ...current,
          `Failed to persist Android GL probe start: ${String((error as Error).message ?? error)}`,
        ]);
        setStorageStatus("error");
      });
      return;
    }

    if (!androidGlProbePending) return;
    setAndroidGlProbePending(false);
    void persistMobileSettings({
      workerBaseUrl: normalizeWorkerBaseUrl(workerBaseUrl),
      androidGlProbePending: false,
    }).catch((error) => {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist Android GL probe reset: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    });
  }, [androidGlEnabled, androidGlProbePending, shouldProbeAndroidGl, workerBaseUrl]);

  const onViewportRenderReady = () => {
    if (Platform.OS !== "android" || !androidGlProbePending) return;
    setAndroidGlProbePending(false);
    void persistMobileSettings({
      workerBaseUrl: normalizeWorkerBaseUrl(workerBaseUrl),
      androidGlProbePending: false,
    }).catch((error) => {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist Android GL probe completion: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    });
  };

  const openStoredScene = async (projectId: string) => {
    const target = storedProjects.find((item) => item.id === projectId);
    if (!target) return;

    const parsed = readSceneFromStoredProject(target);
    if (!parsed.ok) {
      setStorageIssues((current) => [...current, ...parsed.errors]);
      setStorageStatus("error");
      return;
    }

    const touchedProject: MobileStoredSceneProject = {
      ...target,
      lastOpenedAt: Date.now(),
    };
    const nextProjects = upsertStoredProject(storedProjects, touchedProject);

    setStoredProjects(nextProjects);
    setSelectedSceneId(touchedProject.id);
    setViewerDocument(parsed.scene);
    setTab("viewer");

    try {
      await saveStoredSceneProjects(nextProjects);
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist scene open state: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    }
  };

  const openViewerWithSurface = (surface: SurfaceDefinition, sourceTitle: string) => {
    setViewerDocument(createViewerSceneFromSurface(surface, sourceTitle));
    setTab("viewer");
    setMenuOpen(false);
  };

  const saveCurrentViewerScene = async () => {
    if (!viewerDocument) return;

    const scene = cloneSceneWithNewTimestamp(viewerDocument);
    const stored = createStoredProjectFromScene(scene, Date.now());
    const nextProjects = upsertStoredProject(storedProjects, stored);

    setStoredProjects(nextProjects);
    setSelectedSceneId(stored.id);

    try {
      await saveStoredSceneProjects(nextProjects);
      setStorageStatus(storageIssues.length > 0 ? "error" : "ready");
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist scene save: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    }
  };

  const runCameraCommand = (type: CameraCommandType) => {
    setCameraCommandType(type);
    setCameraCommandToken((value) => value + 1);
  };

  const toggleSurfaceVisibility = (surfaceId: string) => {
    setVisibleSurfaceIds((current) => {
      const next = current.includes(surfaceId)
        ? current.filter((value) => value !== surfaceId)
        : [...current, surfaceId];
      if (!next.includes(selectedSurfaceId || "")) {
        setSelectedSurfaceId(next[0] ?? null);
      }
      return next;
    });
  };

  const setAllSurfacesVisible = (visible: boolean) => {
    if (!viewerDocument) return;
    const ids = visible ? (viewerDocument.surfaces ?? []).map((surface) => surface.id) : [];
    setVisibleSurfaceIds(ids);
    setSelectedSurfaceId(ids[0] ?? null);
    if (visible) runCameraCommand("fit");
  };

  const persistMobileSettings = async (overrides?: Partial<Parameters<typeof saveMobileSettings>[0]>) => {
    await saveMobileSettings({
      workerBaseUrl: normalizeWorkerBaseUrl(workerBaseUrl),
      androidGlEnabled,
      androidGlProbePending,
      meshResolutionCap,
      lastSceneId: selectedSceneId || undefined,
      lastSelectedSurfaceId: selectedSurfaceId || undefined,
      cameraOrbit,
      lastBackendError: backendDiagnostics.lastError || undefined,
      lastBackendLatencyMs: backendDiagnostics.latencyMs ?? undefined,
      lastRequestTimeout: backendDiagnostics.timeoutDetected,
      ...(overrides || {}),
    });
  };

  const applyWorkerBaseUrl = async () => {
    const normalizedUrl = normalizeWorkerBaseUrl(workerBaseUrlDraft);
    setWorkerBaseUrl(normalizedUrl);
    setWorkerBaseUrlDraft(normalizedUrl);
    setBackendHealthStatus("idle");
    setBackendHealthMessage("");

    try {
      await persistMobileSettings({ workerBaseUrl: normalizedUrl });
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist backend URL settings: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    }
  };

  const runBackendHealthCheck = async () => {
    const normalizedUrl = normalizeWorkerBaseUrl(workerBaseUrlDraft);
    setBackendHealthStatus("loading");
    setBackendHealthMessage(`Checking ${normalizedUrl} ...`);
    setSettingsActionMessage("");
    setBackendDiagnostics((current) => ({ ...current, status: "running" }));

    const backend = createMobileMeshBackend(normalizedUrl);
    const startedAt = Date.now();
    const response = await backend
      .health()
      .catch((error) => ({ ok: false, error: String((error as Error).message ?? error) }));
    const latencyMs = Date.now() - startedAt;
    const versionResponse = await backend
      .version()
      .catch((error) => ({ ok: false as const, error: String((error as Error).message ?? error) }));
    const workerVersion = versionResponse.ok ? versionResponse.version || null : null;
    const workerProtocol = versionResponse.ok ? versionResponse.protocol || null : null;

    if (response.ok) {
      setBackendHealthStatus("ok");
      setBackendHealthMessage(`Backend healthy at ${normalizedUrl} (${latencyMs} ms)`);
      setBackendDiagnostics((current) => ({
        ...current,
        status: "ready",
        healthOk: true,
        latencyMs,
        workerVersion,
        workerProtocol,
        lastError: null,
        timeoutDetected: false,
      }));
      setLimitedMode(false);
      setLastPreviewTimeout(false);
      await persistMobileSettings({
        workerBaseUrl: normalizedUrl,
        lastBackendLatencyMs: latencyMs,
        lastBackendError: undefined,
        lastRequestTimeout: false,
      }).catch(() => undefined);
      return;
    }

    const timeoutDetected = /timeout|aborted|abort/i.test(response.error || "");
    setBackendHealthStatus("error");
    setBackendHealthMessage(response.error || `Health check failed for ${normalizedUrl}`);
    setBackendDiagnostics((current) => ({
      ...current,
      status: "error",
      healthOk: false,
      latencyMs,
      workerVersion,
      workerProtocol,
      lastError: response.error || `Health check failed for ${normalizedUrl}`,
      timeoutDetected,
    }));
    setLimitedMode(true);
    setLastPreviewTimeout(timeoutDetected);
    await persistMobileSettings({
      workerBaseUrl: normalizedUrl,
      lastBackendLatencyMs: latencyMs,
      lastBackendError: response.error || `Health check failed for ${normalizedUrl}`,
      lastRequestTimeout: timeoutDetected,
    }).catch(() => undefined);
  };

  const retryImplicitPreviews = () => {
    setImplicitPreviewBySurfaceId((current) => {
      const next: ImplicitPreviewBySurfaceId = { ...current };
      for (const [surfaceId, state] of Object.entries(next)) {
        if (state?.status === "error") {
          next[surfaceId] = { status: "loading" };
        }
      }
      return next;
    });
    setImplicitPreviewRetryToken((value) => value + 1);
  };

  const clearSceneCache = async () => {
    setSettingsActionMessage("");
    try {
      await clearStoredSceneProjects();
      setStoredProjects([]);
      setSelectedSceneId(null);
      setViewerDocument(null);
      setImplicitMeshBySurfaceId({});
      setImplicitPreviewBySurfaceId({});
      setStorageStatus("ready");
      setSettingsActionMessage("Local scene cache cleared.");
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to clear local scene cache: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
      setSettingsActionMessage("Failed to clear local scene cache.");
    }
  };

  const clearPreviewCache = () => {
    setImplicitMeshBySurfaceId({});
    setImplicitPreviewBySurfaceId({});
    setSettingsActionMessage("Preview cache cleared for current session.");
  };

  const applyMeshResolutionCap = async () => {
    const parsed = Number(meshResolutionCapDraft);
    const normalized = clampInt(parsed, MESH_RESOLUTION_CAP_MIN, MESH_RESOLUTION_CAP_MAX);
    setMeshResolutionCap(normalized);
    setMeshResolutionCapDraft(String(normalized));
    setSettingsActionMessage(`Mesh resolution cap set to ${normalized}.`);
    try {
      await persistMobileSettings({ meshResolutionCap: normalized });
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist mesh resolution cap: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    }
  };

  const reduceQualityAndRetry = () => {
    setRenderQuality((current) => (current === "sharp" ? "balanced" : current === "balanced" ? "performance" : "performance"));
    retryImplicitPreviews();
  };

  const openDiagnostics = () => {
    setShowDiagnosticsPanel(true);
    setTab("settings");
    setMenuOpen(false);
  };

  const toggleAndroidGl = async () => {
    const next = !androidGlEnabled;
    setAndroidGlEnabled(next);
    if (!next) setAndroidGlProbePending(false);
    try {
      await persistMobileSettings({
        androidGlEnabled: next,
        androidGlProbePending: next ? androidGlProbePending : false,
      });
    } catch (error) {
      setStorageIssues((current) => [
        ...current,
        `Failed to persist Android GL setting: ${String((error as Error).message ?? error)}`,
      ]);
      setStorageStatus("error");
    }
  };

  useEffect(() => {
    if (storageStatus === "loading") return;
    const handle = setTimeout(() => {
      void persistMobileSettings().catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(handle);
    };
  }, [
    selectedSceneId,
    selectedSurfaceId,
    cameraOrbit,
    storageStatus,
    backendDiagnostics.lastError,
    backendDiagnostics.latencyMs,
    backendDiagnostics.timeoutDetected,
    meshResolutionCap,
  ]);

  return (
    <SafeAreaView style={[styles.root, androidTopInset > 0 ? { paddingTop: androidTopInset } : null]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f6f8" translucent={false} />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Math3D Mobile</Text>
            <Text style={styles.subtitle}>Frontend-first migration (backend last)</Text>
          </View>
          <Pressable onPress={() => setMenuOpen((value) => !value)} style={styles.menuBtn}>
            <Text style={styles.menuBtnText}>{menuOpen ? "Close" : "Menu"}</Text>
          </Pressable>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menuPanel}>
          {tabs.map(({ key, label }) => (
            <Pressable
              key={`menu-${key}`}
              onPress={() => {
                setTab(key);
                setMenuOpen(false);
              }}
              style={[styles.menuItem, tab === key ? styles.menuItemActive : null]}
            >
              <Text style={[styles.menuItemText, tab === key ? styles.menuItemTextActive : null]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.navScroll}
        contentContainerStyle={styles.navRow}
      >
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.navBtn, tab === key ? styles.navBtnActive : null]}
          >
            <Text style={[styles.navBtnText, tab === key ? styles.navBtnTextActive : null]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "home" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recent scenes</Text>
            <View style={styles.settingRow}>
              <TextInput
                value={sceneSearchQuery}
                onChangeText={setSceneSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Search scenes..."
                style={styles.textInput}
              />
              <View style={styles.settingChoiceRow}>
                {(["recent", "updated", "title"] as const).map((mode) => (
                  <Pressable
                    key={`scene-sort-${mode}`}
                    onPress={() => setSceneSortMode(mode)}
                    style={[styles.pill, sceneSortMode === mode ? styles.pillActive : null]}
                  >
                    <Text style={[styles.pillText, sceneSortMode === mode ? styles.pillTextActive : null]}>
                      {mode}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {storageStatus === "loading" && <Text style={styles.note}>Loading local scene storage...</Text>}
            {storageStatus !== "loading" && filteredSceneSummaries.length === 0 && (
              <Text style={styles.note}>No local scenes available.</Text>
            )}
            {filteredSceneSummaries.map((scene) => (
              <Pressable
                key={scene.id}
                onPress={() => {
                  void openStoredScene(scene.id);
                }}
                style={styles.item}
              >
                <View style={styles.sceneListRow}>
                  <View style={styles.sceneThumb}>
                    <Text style={styles.sceneThumbText}>{scene.title.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={styles.sceneListMeta}>
                    <Text style={styles.itemTitle}>{scene.title}</Text>
                    <Text style={styles.itemMeta}>
                      updated {asDate(scene.updatedAt)} | last opened{" "}
                      {asDate(storedProjects.find((project) => project.id === scene.id)?.lastOpenedAt ?? scene.updatedAt)} |
                      surfaces: {scene.surfaceCount}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
            {selectedScene && <Text style={styles.note}>Selected: {selectedScene.title}</Text>}

            <View style={styles.subPanel}>
              <Text style={styles.subPanelTitle}>Migration progress</Text>
              {roadmapSteps.map((step) => (
                <Text key={step.id} style={styles.itemMeta}>
                  {step.status === "done" ? "[done]" : step.status === "in_progress" ? "[in progress]" : "[pending]"} {step.title}
                </Text>
              ))}
            </View>
          </View>
        )}

        {tab === "gallery" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Gallery demos</Text>
            {mobileGallery.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelectedGalleryId(item.id);
                  openViewerWithSurface(item.surface, item.title);
                }}
                style={[styles.item, selectedGalleryId === item.id ? styles.itemActive : null]}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMeta}>{item.description}</Text>
                <Text style={styles.itemMeta}>{surfaceSummary(item.surface)}</Text>
              </Pressable>
            ))}

            {selectedGallery && (
              <Pressable
                onPress={() => openViewerWithSurface(selectedGallery.surface, selectedGallery.title)}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Open In Viewer ({selectedGallery.title})</Text>
              </Pressable>
            )}
          </View>
        )}

        {tab === "viewer" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Scene viewer</Text>
            {viewerDocument ? (
              <>
                <Text style={styles.itemTitle}>{viewerDocument.title}</Text>
                <Text style={styles.itemMeta}>Surfaces: {viewerDocument.surfaces?.length ?? 0}</Text>
                <Text style={styles.itemMeta}>Quality preset: {renderQuality}</Text>
                <Text style={styles.note}>
                  Native preview mode is active. This slice runs fully local and keeps backend integration for the final phase.
                </Text>
                {limitedMode && (
                  <Text style={styles.warningNote}>
                    Limited mode is active. Remote compute is disabled; cached previews will be used when available.
                  </Text>
                )}
                {androidFallbackForced && (
                  <Text style={styles.warningNote}>
                    Android safe mode is enforced because `expo-gl` crashes on this device.
                  </Text>
                )}
                {Platform.OS === "android" && androidGlRecoveredFromCrash && (
                  <Text style={styles.warningNote}>
                    Android GL crashed on a previous run, so safe mode was auto-enabled.
                  </Text>
                )}
                <View style={styles.viewerToolbarRow}>
                  <Pressable onPress={() => runCameraCommand("reset")} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Reset Camera</Text>
                  </Pressable>
                  <Pressable onPress={() => runCameraCommand("fit")} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Fit Visible</Text>
                  </Pressable>
                  <Pressable onPress={openDiagnostics} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Open Diagnostics</Text>
                  </Pressable>
                  {hasImplicitPreviewErrors && (
                    <Pressable onPress={retryImplicitPreviews} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Retry Failed Previews</Text>
                    </Pressable>
                  )}
                  {hasImplicitPreviewErrors && !limitedMode && (
                    <Pressable onPress={reduceQualityAndRetry} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Reduce Quality + Retry</Text>
                    </Pressable>
                  )}
                </View>
                <MobileSceneViewport
                  scene={viewerDocument}
                  quality={renderQuality}
                  visibleSurfaceIds={visibleSurfaceIds}
                  selectedSurfaceId={selectedSurfaceId}
                  cameraCommand={cameraCommand}
                  forceFallback={androidFallbackForced}
                  implicitMeshBySurfaceId={implicitMeshBySurfaceId}
                  onRenderReady={onViewportRenderReady}
                  initialOrbit={cameraOrbit}
                  onOrbitChange={setCameraOrbit}
                  onSelectedSurfaceChange={setSelectedSurfaceId}
                  renderPaused={!appIsForeground}
                />
                {viewerLoadingMessage.length > 0 && (
                  <View style={styles.loadingOverlay} pointerEvents="none">
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.loadingOverlayText}>{viewerLoadingMessage}</Text>
                  </View>
                )}

                <View style={styles.visibilityPanel}>
                  <Text style={styles.subPanelTitle}>Surface visibility</Text>
                  <View style={styles.viewerToolbarRow}>
                    <Pressable onPress={() => setAllSurfacesVisible(true)} style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>Show all</Text>
                    </Pressable>
                    <Pressable onPress={() => setAllSurfacesVisible(false)} style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>Hide all</Text>
                    </Pressable>
                  </View>
                  {viewerSurfaces.map((surface) => {
                    const visible = visibleSurfaceIds.includes(surface.id);
                    return (
                      <Pressable
                        key={`surface-visible-${surface.id}`}
                        onPress={() => toggleSurfaceVisibility(surface.id)}
                        style={[styles.surfaceToggleRow, visible ? styles.surfaceToggleRowActive : null]}
                      >
                        <Text style={[styles.surfaceToggleTitle, visible ? styles.surfaceToggleTitleActive : null]}>
                          {surface.id}
                        </Text>
                        <Text style={[styles.surfaceToggleMeta, visible ? styles.surfaceToggleMetaActive : null]}>
                          {visible ? "visible" : "hidden"} | {surfaceSummary(surface)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {viewerSurfaces
                  .filter((surface) => surface.kind === "implicit")
                  .map((surface) => {
                    const previewState = implicitPreviewBySurfaceId[surface.id];
                    return (
                      <View key={`implicit-status-${surface.id}`} style={styles.backendPanel}>
                        <Text style={styles.backendPanelTitle}>Implicit Backend Preview</Text>
                        <Text style={styles.itemMeta}>Surface: {surface.id}</Text>
                        <Text style={styles.itemMeta}>Backend: {workerBaseUrl}</Text>
                        <Text style={styles.itemMeta}>Status: {previewState?.status ?? "idle"}</Text>
                        {previewState?.status === "ready" && (
                          <Text style={styles.itemMeta}>
                            Vertices: {previewState.vertexCount ?? 0} | Triangles: {previewState.triCount ?? 0}
                            {previewState.cached ? " | cached" : ""}
                          </Text>
                        )}
                        {previewState?.status === "error" && (
                          <>
                            <Text style={styles.issueText}>Error: {previewState.error}</Text>
                            {!limitedMode ? (
                              <View style={styles.viewerToolbarRow}>
                                <Pressable onPress={retryImplicitPreviews} style={styles.smallBtn}>
                                  <Text style={styles.smallBtnText}>Retry</Text>
                                </Pressable>
                                <Pressable onPress={reduceQualityAndRetry} style={styles.smallBtn}>
                                  <Text style={styles.smallBtnText}>Reduce + Retry</Text>
                                </Pressable>
                                <Pressable onPress={openDiagnostics} style={styles.smallBtn}>
                                  <Text style={styles.smallBtnText}>Diagnostics</Text>
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable onPress={openDiagnostics} style={styles.smallBtn}>
                                <Text style={styles.smallBtnText}>Diagnostics</Text>
                              </Pressable>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })}
                <Pressable
                  onPress={() => {
                    void saveCurrentViewerScene();
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Save Scene To Local Storage</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.note}>Select a gallery item, function preset, or local scene first.</Text>
            )}
          </View>
        )}

        {tab === "learn" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Formula notes</Text>
            <Text style={styles.note}>This tab is reserved for workbook explanations and guided examples.</Text>
            <Text style={styles.itemMeta}>Planned first module: implicit surfaces and domain bounds intuition.</Text>
          </View>
        )}

        {tab === "functions" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Function library</Text>
            <Text style={styles.note}>Tap any preset to load it directly into viewer workflow.</Text>
            {mobileFunctionPresets.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => openViewerWithSurface(preset.surface, preset.name)}
                style={styles.item}
              >
                <Text style={styles.itemTitle}>{preset.name}</Text>
                <Text style={styles.itemMeta}>{preset.description}</Text>
                <Text style={styles.itemMeta}>{surfaceSummary(preset.surface)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === "settings" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Settings</Text>
            <Text style={styles.note}>Configure backend endpoint used by implicit preview and future compute calls.</Text>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Worker base URL</Text>
              <TextInput
                value={workerBaseUrlDraft}
                onChangeText={setWorkerBaseUrlDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://127.0.0.1:8787/api/worker"
                style={styles.textInput}
              />
              <View style={styles.viewerToolbarRow}>
                <Pressable onPress={() => void applyWorkerBaseUrl()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Save URL</Text>
                </Pressable>
                <Pressable onPress={() => void runBackendHealthCheck()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Health Check</Text>
                </Pressable>
              </View>
              <Text style={styles.itemMeta}>Applied URL: {workerBaseUrl}</Text>
              <Text style={styles.itemMeta}>Health: {backendHealthStatus}</Text>
              <Text style={styles.itemMeta}>Request policy: timeout 25s + 1 automatic retry</Text>
              {backendSecurityWarning ? <Text style={styles.warningNote}>{backendSecurityWarning}</Text> : null}
              {backendHealthMessage.length > 0 && (
                <Text style={backendHealthStatus === "error" ? styles.issueText : styles.note}>{backendHealthMessage}</Text>
              )}
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Mesh resolution cap</Text>
              <TextInput
                value={meshResolutionCapDraft}
                onChangeText={setMeshResolutionCapDraft}
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="96"
                style={styles.textInput}
              />
              <View style={styles.viewerToolbarRow}>
                <Pressable onPress={() => void applyMeshResolutionCap()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Apply cap</Text>
                </Pressable>
              </View>
              <Text style={styles.itemMeta}>
                Active cap: {meshResolutionCap} (allowed {MESH_RESOLUTION_CAP_MIN}-{MESH_RESOLUTION_CAP_MAX})
              </Text>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Render quality</Text>
              <View style={styles.settingChoiceRow}>
                {(["performance", "balanced", "sharp"] as const).map((quality) => (
                  <Pressable
                    key={`quality-${quality}`}
                    onPress={() => setRenderQuality(quality)}
                    style={[styles.pill, renderQuality === quality ? styles.pillActive : null]}
                  >
                    <Text style={[styles.pillText, renderQuality === quality ? styles.pillTextActive : null]}>
                      {quality}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Diagnostics</Text>
              <Pressable onPress={() => setDiagnosticsEnabled((value) => !value)} style={styles.pill}>
                <Text style={styles.pillText}>{diagnosticsEnabled ? "enabled" : "disabled"}</Text>
              </Pressable>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Local cache</Text>
              <View style={styles.viewerToolbarRow}>
                <Pressable onPress={() => void clearSceneCache()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Clear scene cache</Text>
                </Pressable>
                <Pressable onPress={clearPreviewCache} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Clear preview cache</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void clearMeshCache()
                      .then(() => setSettingsActionMessage("Mesh cache cleared."))
                      .catch((error) =>
                        setSettingsActionMessage(`Failed to clear mesh cache: ${String((error as Error).message ?? error)}`)
                      );
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Clear mesh cache</Text>
                </Pressable>
              </View>
              {settingsActionMessage.length > 0 && <Text style={styles.note}>{settingsActionMessage}</Text>}
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.itemMeta}>Runtime mode</Text>
              <View style={styles.viewerToolbarRow}>
                <Pressable onPress={() => setLimitedMode((value) => !value)} style={styles.pill}>
                  <Text style={styles.pillText}>{limitedMode ? "limited/offline" : "online"}</Text>
                </Pressable>
                <Pressable onPress={openDiagnostics} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Open diagnostics</Text>
                </Pressable>
              </View>
              <Text style={styles.itemMeta}>
                In limited mode, remote compute is disabled and cached previews are preferred.
              </Text>
            </View>

            {Platform.OS === "android" && !FORCE_ANDROID_SAFE_MODE && (
              <View style={styles.settingRow}>
                <Text style={styles.itemMeta}>Android GL renderer</Text>
                <Pressable
                  onPress={() => {
                    void toggleAndroidGl();
                  }}
                  style={[styles.pill, androidGlEnabled ? styles.pillActive : null]}
                >
                  <Text style={[styles.pillText, androidGlEnabled ? styles.pillTextActive : null]}>
                    {androidGlEnabled ? "enabled (may crash)" : "safe mode (fallback)"}
                  </Text>
                </Pressable>
              </View>
            )}
            {Platform.OS === "android" && androidGlProbePending && (
              <Text style={styles.itemMeta}>Android GL probe: pending startup verification</Text>
            )}
            {Platform.OS === "android" && androidGlRecoveredFromCrash && (
              <Text style={styles.warningNote}>
                Crash recovery is active. Re-enable Android GL only if you want to retry.
              </Text>
            )}

            {Platform.OS === "android" && FORCE_ANDROID_SAFE_MODE && (
              <Text style={styles.warningNote}>Android GL renderer is locked to safe fallback mode.</Text>
            )}

            <Text style={styles.itemMeta}>Storage status: {storageStatus}</Text>
            <Text style={styles.itemMeta}>
              App version: {Constants.expoConfig?.version || "unknown"} | Build:{" "}
              {typeof Constants.expoConfig?.runtimeVersion === "string"
                ? Constants.expoConfig.runtimeVersion
                : Constants.expoConfig?.runtimeVersion &&
                    typeof Constants.expoConfig.runtimeVersion === "object" &&
                    "policy" in Constants.expoConfig.runtimeVersion
                  ? String(Constants.expoConfig.runtimeVersion.policy)
                  : "n/a"}
            </Text>
            <Text style={styles.itemMeta}>Worker/proxy version: {backendDiagnostics.workerVersion || "unknown"}</Text>
            <Text style={styles.itemMeta}>Worker protocol: {backendDiagnostics.workerProtocol || "unknown"}</Text>
            <Text style={styles.itemMeta}>Expected protocol: {EXPECTED_WORKER_PROTOCOL}</Text>
            <Text style={styles.itemMeta}>Scene schema version: {SCENE_PROJECT_VERSION}</Text>
            <Text style={styles.itemMeta}>Protocol compatibility: {workerProtocolCompatibility}</Text>
            {workerProtocolCompatibility === "mismatch" ? (
              <Text style={styles.warningNote}>
                Unsupported backend warning: worker protocol does not match mobile expectation.
              </Text>
            ) : null}
            <Text style={styles.itemMeta}>
              Scenes: {sceneSummaries.length} | Gallery items: {mobileGallery.length} | Presets: {mobileFunctionPresets.length}
            </Text>

            {(showDiagnosticsPanel || diagnosticsEnabled) && (
              <View style={styles.backendPanel}>
                <Text style={styles.backendPanelTitle}>Backend diagnostics</Text>
                <Text style={styles.itemMeta}>Status: {backendDiagnostics.status}</Text>
                <Text style={styles.itemMeta}>Health: {backendDiagnostics.healthOk == null ? "unknown" : backendDiagnostics.healthOk ? "ok" : "error"}</Text>
                <Text style={styles.itemMeta}>Latency: {backendDiagnostics.latencyMs == null ? "n/a" : `${backendDiagnostics.latencyMs} ms`}</Text>
                <Text style={styles.itemMeta}>Worker version: {backendDiagnostics.workerVersion || "unknown"}</Text>
                <Text style={styles.itemMeta}>Worker protocol: {backendDiagnostics.workerProtocol || "unknown"}</Text>
                <Text style={styles.itemMeta}>
                  Endpoints: /cgal/health, /cgal/version, /vtk/preview, /volume/isosurface
                </Text>
                <Text style={styles.itemMeta}>Request timeout detected: {backendDiagnostics.timeoutDetected ? "yes" : "no"}</Text>
                <Text style={styles.itemMeta}>
                  Last payload estimate:{" "}
                  {backendDiagnostics.lastPayloadBytes == null ? "n/a" : `${backendDiagnostics.lastPayloadBytes} bytes`}
                </Text>
                {backendDiagnostics.lastPayloadBytes != null &&
                  backendDiagnostics.lastPayloadBytes > PREVIEW_PAYLOAD_WARNING_BYTES && (
                    <Text style={styles.warningNote}>
                      Payload size warning: preview request may be heavy for unstable networks.
                    </Text>
                  )}
                {backendDiagnostics.lastError ? <Text style={styles.issueText}>Last error: {backendDiagnostics.lastError}</Text> : null}
                <View style={styles.viewerToolbarRow}>
                  <Pressable onPress={() => void runBackendHealthCheck()} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Run diagnostics</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowDiagnosticsPanel(false)} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Hide diagnostics</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {storageIssues.length > 0 && (
              <View style={styles.issuePanel}>
                <Text style={styles.issuePanelTitle}>Storage / validation issues</Text>
                {storageIssues.slice(0, 8).map((issue, index) => (
                  <Text key={`issue-${index}`} style={styles.issueText}>
                    {index + 1}. {issue}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f6f8",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1b2430",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#566172",
  },
  menuBtn: {
    backgroundColor: "#163b66",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  menuPanel: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d5dbe2",
    padding: 8,
    gap: 8,
  },
  menuItem: {
    borderRadius: 8,
    backgroundColor: "#edf2f7",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuItemActive: {
    backgroundColor: "#163b66",
  },
  menuItemText: {
    color: "#203047",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  menuItemTextActive: {
    color: "#ffffff",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
  },
  navScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 52,
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e1e8ef",
  },
  navBtnActive: {
    backgroundColor: "#163b66",
  },
  navBtnText: {
    textTransform: "capitalize",
    color: "#1f2a36",
    fontWeight: "600",
  },
  navBtnTextActive: {
    color: "#ffffff",
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 12,
  },
  panel: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12,
    borderWidth: 1,
    borderColor: "#d5dbe2",
    gap: 8,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#203047",
  },
  subPanel: {
    marginTop: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e8ef",
    padding: 10,
    gap: 4,
  },
  subPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2b3a4e",
  },
  item: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e3e8ef",
  },
  sceneListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sceneThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#163b66",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sceneThumbText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  sceneListMeta: {
    flex: 1,
  },
  itemActive: {
    borderColor: "#163b66",
    backgroundColor: "#edf4ff",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2d3d",
  },
  itemMeta: {
    marginTop: 3,
    color: "#5b6573",
    fontSize: 12,
  },
  note: {
    color: "#48586b",
    fontSize: 13,
    lineHeight: 18,
  },
  warningNote: {
    color: "#8f1d1d",
    fontSize: 12,
    lineHeight: 17,
  },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: "#163b66",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#c8d3df",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: "#223248",
    fontSize: 12,
    fontWeight: "700",
  },
  smallBtn: {
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnText: {
    color: "#2a3a50",
    fontSize: 11,
    fontWeight: "700",
  },
  viewerToolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  loadingOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 10,
    backgroundColor: "rgba(17,33,50,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingOverlayText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  visibilityPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 8,
  },
  surfaceToggleRow: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 8,
    gap: 2,
  },
  surfaceToggleRowActive: {
    borderColor: "#163b66",
    backgroundColor: "#edf4ff",
  },
  surfaceToggleTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#344559",
  },
  surfaceToggleTitleActive: {
    color: "#163b66",
  },
  surfaceToggleMeta: {
    fontSize: 11,
    color: "#5b6573",
  },
  surfaceToggleMetaActive: {
    color: "#2f4e73",
  },
  settingRow: {
    marginTop: 6,
    gap: 6,
  },
  settingChoiceRow: {
    flexDirection: "row",
    gap: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#c8d3df",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#203047",
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b3c0d1",
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  pillActive: {
    backgroundColor: "#163b66",
    borderColor: "#163b66",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2a3a50",
    textTransform: "capitalize",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  issuePanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f2c4c4",
    backgroundColor: "#fff5f5",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  issuePanelTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8f1d1d",
  },
  issueText: {
    fontSize: 11,
    color: "#8f1d1d",
    lineHeight: 16,
  },
  backendPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 4,
  },
  backendPanelTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#274567",
  },
});
