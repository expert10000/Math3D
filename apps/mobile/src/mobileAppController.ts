import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, type GestureResponderEvent } from "react-native";
import { createSceneProjectDocument, deserializeSceneProject, serializeSceneProject, type SceneDocument, type SurfaceDefinition, type VtkPreviewRequest } from "@math3d/core";
import { mobileGallery, mobileSeedScenes } from "./data/mobileSeedData";
import { DEFAULT_MOBILE_GRID_PLANES } from "./models/mobileCoordinateGrid";
import type { MobileSceneSummary, MobileStoredSceneProject } from "./models/mobileScene";
import { buildSceneSummary, clearStoredSceneProjects, createStoredProjectFromScene, loadStoredSceneProjects, readSceneFromStoredProject, saveStoredSceneProjects } from "./services/mobileSceneStorage";
import { createMobileMeshBackend } from "./services/mobileMeshBackend";
import { createMeshCacheKey, readCachedMesh, writeCachedMesh } from "./services/mobileMeshCacheStorage";
import { loadMobileSettings, saveMobileSettings } from "./services/mobileSettingsStorage";
import type { MobileMeshPayload, MobileRenderQuality } from "./viewer/mobileSurfacePreview";
import { useMobileNavigationState, type MobileTab } from "./models/useMobileNavigationState";
import { useMobileWorkspaceState, type CameraCommandType } from "./models/useMobileWorkspaceState";
import { useMobileProjectState } from "./models/useMobileProjectState";

const ANDROID_GL_DEFAULT_ENABLED = true;
export const FORCE_ANDROID_SAFE_MODE = false;

export const tabs: ReadonlyArray<{ key: MobileTab; label: string }> = [
  { key: "home", label: "Home" },
  { key: "explore", label: "Explore" },
  { key: "workspace", label: "Workspace" },
  { key: "files", label: "Files" },
  { key: "settings", label: "Settings" },
];

export const asDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

export const surfaceSummary = (surface: SurfaceDefinition): string => {
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
export const EXPECTED_WORKER_PROTOCOL = process.env.EXPO_PUBLIC_MATH3D_WORKER_PROTOCOL || "2026-03-15";
const DEFAULT_MESH_RESOLUTION_CAP = 96;
export const MESH_RESOLUTION_CAP_MIN = 36;
export const MESH_RESOLUTION_CAP_MAX = 192;
export const PREVIEW_PAYLOAD_WARNING_BYTES = 25_000;
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

const serializeViewerScene = (scene: SceneDocument): string =>
  serializeSceneProject(createSceneProjectDocument(scene));

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

export const useMobileAppController = () => {
  const { tab, setTab, exploreSection, setExploreSection, inspectorSection, setInspectorSection, inspectorExpanded, setInspectorExpanded } = useMobileNavigationState();
  const {
    viewerDocument, setViewerDocument, selectedSurfaceId, setSelectedSurfaceId, visibleSurfaceIds, setVisibleSurfaceIds,
    surfaceOpacityById, setSurfaceOpacityById, surfaceColorMode, setSurfaceColorMode,
    surfaceRenderMode, setSurfaceRenderMode, surfaceShading, setSurfaceShading, renderQuality, setRenderQuality,
    showBoundingBox, setShowBoundingBox,
    showAxes, setShowAxes, gridPlanes, setGridPlanes, cameraOrbit, setCameraOrbit, cameraCommandType, setCameraCommandType,
    cameraCommandToken, setCameraCommandToken,
  } = useMobileWorkspaceState();
  const { selectedSceneId, setSelectedSceneId, storedProjects, setStoredProjects, storageIssues, setStorageIssues,
    storageStatus, setStorageStatus, sceneSearchQuery, setSceneSearchQuery, sceneSortMode, setSceneSortMode } = useMobileProjectState();
  const inspectorSwipeStartY = useRef<number | null>(null);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(mobileGallery[0]?.id ?? null);
  const showGrid = gridPlanes.length > 0;
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(true);
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
      const loadedGridPlanes = loadedSettings.showGrid === false
        ? []
        : loadedSettings.gridPlanes ?? [...DEFAULT_MOBILE_GRID_PLANES];
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
      setShowAxes(loadedSettings.showAxes ?? true);
      setGridPlanes(loadedGridPlanes);
      setSurfaceColorMode(loadedSettings.surfaceColorMode ?? "solid");
      setSurfaceRenderMode(loadedSettings.surfaceRenderMode ?? "solid");
      setSurfaceShading(loadedSettings.surfaceShading ?? "smooth");
      setRenderQuality(loadedSettings.renderQuality ?? "balanced");
      setShowBoundingBox(loadedSettings.showBoundingBox ?? false);
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
          showGrid: loadedGridPlanes.length > 0,
          showAxes: loadedSettings.showAxes ?? true,
          gridPlanes: loadedGridPlanes,
          surfaceColorMode: loadedSettings.surfaceColorMode ?? "solid",
          surfaceRenderMode: loadedSettings.surfaceRenderMode ?? "solid",
          surfaceShading: loadedSettings.surfaceShading ?? "smooth",
          renderQuality: loadedSettings.renderQuality ?? "balanced",
          showBoundingBox: loadedSettings.showBoundingBox ?? false,
          lastSceneId: loadedSettings.lastSceneId || undefined,
          lastViewerProject: loadedSettings.lastViewerProject || undefined,
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
      const lastViewerProject = loadedSettings.lastViewerProject
        ? deserializeSceneProject(loadedSettings.lastViewerProject)
        : null;
      if (lastViewerProject && !lastViewerProject.ok) {
        issues.push(`Last viewed scene is invalid: ${lastViewerProject.errors.join("; ")}`);
        setStorageIssues(issues);
      }
      if (lastViewerProject?.ok) {
        setViewerDocument(lastViewerProject.value.scene);
        setSelectedSceneId(projects.some((project) => project.id === lastViewerProject.value.scene.id)
          ? lastViewerProject.value.scene.id
          : null);
        setStorageStatus(issues.length > 0 ? "error" : "ready");
      } else if (firstProject) {
        setSelectedSceneId(firstProject.id);
        const parsed = readSceneFromStoredProject(firstProject);
        if (parsed.ok) {
          setViewerDocument(parsed.scene);
          setStorageStatus(issues.length > 0 ? "error" : "ready");
        } else {
          setStorageStatus("error");
          setStorageIssues((current) => [...current, ...parsed.errors]);
        }
      } else {
        setSelectedSceneId(null);
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
  const selectedSurface = viewerSurfaces.find((surface) => surface.id === selectedSurfaceId) ?? viewerSurfaces[0];
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
    setSurfaceOpacityById({});
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
    if (!viewerDocument || tab !== "workspace" || !appIsForeground) return;

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
        const baseResolution = renderQuality === "performance" ? 52 : renderQuality === "quality" ? 96 : 72;
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
    tab === "workspace" &&
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
    setInspectorExpanded(false);
    setTab("workspace");
    void persistMobileSettings({
      lastSceneId: touchedProject.id,
      lastViewerProject: touchedProject.serializedProject,
    }).catch(() => undefined);

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
    const scene = createViewerSceneFromSurface(surface, sourceTitle);
    setViewerDocument(scene);
    setSelectedSceneId(null);
    setInspectorExpanded(false);
    setTab("workspace");
    void persistMobileSettings({ lastSceneId: undefined, lastViewerProject: serializeViewerScene(scene) })
      .catch(() => undefined);
  };

  const saveCurrentViewerScene = async () => {
    if (!viewerDocument) return;

    const scene = cloneSceneWithNewTimestamp(viewerDocument);
    const stored = createStoredProjectFromScene(scene, Date.now());
    const nextProjects = upsertStoredProject(storedProjects, stored);

    setStoredProjects(nextProjects);
    setSelectedSceneId(stored.id);
    void persistMobileSettings({ lastSceneId: stored.id, lastViewerProject: stored.serializedProject })
      .catch(() => undefined);

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
      showGrid,
      showAxes,
      gridPlanes,
      surfaceColorMode,
      surfaceRenderMode,
      surfaceShading,
      renderQuality,
      showBoundingBox,
      lastSceneId: selectedSceneId || undefined,
      lastViewerProject: viewerDocument ? serializeViewerScene(viewerDocument) : undefined,
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
    const healthError = `Cannot reach worker at ${normalizedUrl}. Check the URL, Wi-Fi, and that the worker is running. (${response.error || "Unknown network error"})`;
    setBackendHealthStatus("error");
    setBackendHealthMessage(healthError);
    setBackendDiagnostics((current) => ({
      ...current,
      status: "error",
      healthOk: false,
      latencyMs,
      workerVersion,
      workerProtocol,
      lastError: healthError,
      timeoutDetected,
    }));
    setLimitedMode(true);
    setLastPreviewTimeout(timeoutDetected);
    await persistMobileSettings({
      workerBaseUrl: normalizedUrl,
      lastBackendLatencyMs: latencyMs,
      lastBackendError: healthError,
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
    setRenderQuality((current) => (current === "quality" ? "balanced" : "performance"));
    retryImplicitPreviews();
  };

  const openDiagnostics = () => {
    setShowDiagnosticsPanel(true);
    setTab("settings");
  };

  const finishInspectorSwipe = (event: GestureResponderEvent) => {
    const startY = inspectorSwipeStartY.current;
    inspectorSwipeStartY.current = null;
    if (startY == null) return;
    const deltaY = event.nativeEvent.pageY - startY;
    if (Math.abs(deltaY) > 32) {
      setInspectorExpanded(deltaY < 0);
    } else {
      setInspectorExpanded((value) => !value);
    }
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
    viewerDocument,
    selectedSurfaceId,
    cameraOrbit,
    storageStatus,
    backendDiagnostics.lastError,
    backendDiagnostics.latencyMs,
    backendDiagnostics.timeoutDetected,
    meshResolutionCap,
    showGrid,
    showAxes,
    gridPlanes,
    surfaceColorMode,
    surfaceRenderMode,
    surfaceShading,
    renderQuality,
    showBoundingBox,
  ]);

  return {
    tab,
    setTab,
    exploreSection,
    setExploreSection,
    inspectorSection,
    setInspectorSection,
    inspectorExpanded,
    setInspectorExpanded,
    surfaceOpacityById,
    setSurfaceOpacityById,
    surfaceColorMode,
    setSurfaceColorMode,
    surfaceRenderMode,
    setSurfaceRenderMode,
    surfaceShading,
    setSurfaceShading,
    showBoundingBox,
    setShowBoundingBox,
    inspectorSwipeStartY,
    selectedGalleryId,
    setSelectedGalleryId,
    viewerDocument,
    renderQuality,
    setRenderQuality,
    showAxes,
    setShowAxes,
    gridPlanes,
    setGridPlanes,
    showGrid,
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    storedProjects,
    storageIssues,
    storageStatus,
    sceneSearchQuery,
    setSceneSearchQuery,
    sceneSortMode,
    setSceneSortMode,
    visibleSurfaceIds,
    workerBaseUrl,
    workerBaseUrlDraft,
    setWorkerBaseUrlDraft,
    backendHealthStatus,
    backendHealthMessage,
    backendDiagnostics,
    settingsActionMessage,
    setSettingsActionMessage,
    meshResolutionCap,
    meshResolutionCapDraft,
    setMeshResolutionCapDraft,
    selectedSurfaceId,
    setSelectedSurfaceId,
    cameraOrbit,
    setCameraOrbit,
    appIsForeground,
    limitedMode,
    setLimitedMode,
    viewerLoadingMessage,
    showDiagnosticsPanel,
    setShowDiagnosticsPanel,
    androidGlEnabled,
    androidGlProbePending,
    androidGlRecoveredFromCrash,
    implicitMeshBySurfaceId,
    implicitPreviewBySurfaceId,
    sceneSummaries,
    selectedScene,
    filteredSceneSummaries,
    selectedGallery,
    viewerSurfaces,
    selectedSurface,
    hasImplicitPreviewErrors,
    backendSecurityWarning,
    workerProtocolCompatibility,
    cameraCommand,
    androidFallbackForced,
    onViewportRenderReady,
    openStoredScene,
    openViewerWithSurface,
    saveCurrentViewerScene,
    runCameraCommand,
    toggleSurfaceVisibility,
    setAllSurfacesVisible,
    applyWorkerBaseUrl,
    runBackendHealthCheck,
    retryImplicitPreviews,
    clearSceneCache,
    clearPreviewCache,
    applyMeshResolutionCap,
    reduceQualityAndRetry,
    openDiagnostics,
    finishInspectorSwipe,
    toggleAndroidGl,
  };
};

export type MobileAppController = ReturnType<typeof useMobileAppController>;
