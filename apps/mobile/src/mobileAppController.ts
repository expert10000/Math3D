import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, type GestureResponderEvent } from "react-native";
import { SCENE_PROJECT_VERSION, createSceneProjectDocument, deserializeSceneProject, serializeSceneProject, type SceneDocument, type SurfaceDefinition, type VtkPreviewJobSnapshot, type VtkPreviewRequest } from "@math3d/core";
import { mobileExamples, mobileSeedScenes } from "./data/mobileSeedData";
import { DEFAULT_MOBILE_GRID_PLANES } from "./models/mobileCoordinateGrid";
import type { Math3DExample, MobileSceneSummary, MobileStoredSceneProject } from "./models/mobileScene";
import { buildSceneSummary, clearStoredSceneProjects, createStoredProjectFromScene, describeMobileSceneStorageError, loadStoredSceneProjects, readSceneFromStoredProject, saveStoredSceneProjects } from "./services/mobileSceneStorage";
import { createMobileMeshBackend } from "./services/mobileMeshBackend";
import { readCachedMesh, readLatestCachedMesh, writeCachedMesh, type MobileCachedMesh } from "./services/mobileMeshCacheStorage";
import { loadMobileSettings, saveMobileSettings } from "./services/mobileSettingsStorage";
import type { MobileMeshPayload, MobileRenderQuality } from "./viewer/mobileSurfacePreview";
import { useMobileNavigationState, type MobileTab } from "./models/useMobileNavigationState";
import { useMobileWorkspaceState, type CameraCommandType } from "./models/useMobileWorkspaceState";
import { useMobileProjectState } from "./models/useMobileProjectState";
import { duplicateMobileProject, renameMobileProject } from "./models/mobileProjectOperations";
import { importMobileSceneProject } from "./models/mobileProjectTransfer";
import {
  evaluateMobileWorkerCapabilities,
  MOBILE_IMPLICIT_PREVIEW_CAPABILITY,
  mobileWorkerHasCapability,
  negotiatingMobileWorker,
  unconfiguredMobileWorker,
} from "./models/mobileWorkerCapabilities";
import { parseMobileWorkerPairing } from "./models/mobileWorkerPairing";
import { canResumeMobileComputeJob, createMobileComputeJob, createMobileComputeJobId, isMobileComputeJobTerminal, mergeMobileComputeJobSnapshot, type MobileComputeJob } from "./models/mobileComputeJobs";
import { createMobileComputeCacheKey, type MobileComputeCacheLookup } from "./models/mobileComputeCache";
import { buildMobileSceneObjectItems } from "./models/mobileSceneObjects";
import { filterMobileExamples, mobileExampleCategories, mobileExampleIsAvailable, mobileExampleRequiredCapabilities, type MobileExampleCapabilityFilter, type MobileExampleCategoryFilter } from "./models/mobileExampleCatalog";
import { deleteMobileSceneObject, duplicateMobileSceneObject, renameMobileSceneObject, restoreMobileSceneObject, type MobileDeletedSceneObject } from "./models/mobileSceneObjectOperations";
import {
  appendMobileSurface,
  buildMobileExplicitSurface,
  buildMobileParametricSurface,
  buildMobileImplicitSurface,
  createMobilePrimitiveSurface,
  DEFAULT_MOBILE_EXPLICIT_DRAFT,
  DEFAULT_MOBILE_PARAMETRIC_DRAFT,
  DEFAULT_MOBILE_IMPLICIT_DRAFT,
  type MobileExplicitSurfaceDraft,
  type MobileParametricSurfaceDraft,
  type MobileImplicitSurfaceDraft,
  type MobilePrimitiveKind,
} from "./models/mobileSurfaceCreation";
import { clearMobileComputeJobs, loadMobileComputeJobs, saveMobileComputeJobs } from "./services/mobileComputeJobStorage";
import { clearMobileThumbnailCache, loadMobileThumbnailCache, saveMobileThumbnailCache, type MobileThumbnailCache } from "./services/mobileThumbnailCacheStorage";
import { exportMobileSceneProject, pickMobileSceneProject, shareMobileSceneProject } from "./services/mobileProjectTransferService";
import { createMobileThumbnailCacheKey, generateMobileSceneThumbnail } from "./viewer/mobileSceneThumbnail";
import { buildMobileSurfaceAnalysis } from "./viewer/mobileSurfaceAnalysis";
import { mobileAnalysisOverlayAvailability, type MobileAnalysisOverlay } from "./viewer/mobileAnalysisOverlays";

const ANDROID_GL_DEFAULT_ENABLED = true;
export const FORCE_ANDROID_SAFE_MODE = false;

export const tabs: ReadonlyArray<{ key: MobileTab; label: string }> = [
  { key: "home", label: "Home" },
  { key: "explore", label: "Explore" },
  { key: "workspace", label: "Workspace" },
  { key: "projects", label: "Projects" },
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
  computedAt?: number;
  engineLabel?: string;
  stale?: boolean;
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
  serverVersion: string | null;
  engineId: string | null;
  engineVersion: string | null;
  capabilities: string[];
  lastError: string | null;
  timeoutDetected: boolean;
  lastPayloadBytes: number | null;
};

const DEFAULT_WORKER_BASE_URL = process.env.EXPO_PUBLIC_MATH3D_WORKER_BASE_URL || "";
export const EXPECTED_WORKER_PROTOCOL = process.env.EXPO_PUBLIC_MATH3D_WORKER_PROTOCOL || "2026-03-15";
const DEFAULT_MESH_RESOLUTION_CAP = 96;
export const MESH_RESOLUTION_CAP_MIN = 36;
export const MESH_RESOLUTION_CAP_MAX = 192;
export const PREVIEW_PAYLOAD_WARNING_BYTES = 25_000;

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
  if (!value.trim()) return { supported: false, reason: "No worker configured" };
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

const createViewerSceneFromExample = (example: Math3DExample): SceneDocument => {
  const now = Date.now();
  return {
    ...example.scene,
    id: `scene-mobile-${example.id}-${now}`,
    title: example.title,
    createdAt: now,
    updatedAt: now,
    surfaces: (example.scene.surfaces ?? []).map((surface) => ({ ...surface })),
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
    viewportSelectionEnabled, setViewportSelectionEnabled,
    activeAnalysisOverlay, setActiveAnalysisOverlay,
  } = useMobileWorkspaceState();
  const { selectedSceneId, setSelectedSceneId, storedProjects, setStoredProjects, storageIssues, setStorageIssues,
    storageStatus, setStorageStatus, sceneSearchQuery, setSceneSearchQuery, sceneSortMode, setSceneSortMode,
    deletedProject, setDeletedProject, projectActionMessage, setProjectActionMessage,
    sceneThumbnailsById, setSceneThumbnailsById } = useMobileProjectState();
  const inspectorSwipeStartY = useRef<number | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(mobileExamples[0]?.id ?? null);
  const [exampleSearchQuery, setExampleSearchQuery] = useState("");
  const [exampleCategoryFilter, setExampleCategoryFilter] = useState<MobileExampleCategoryFilter>("all");
  const [exampleCapabilityFilter, setExampleCapabilityFilter] = useState<MobileExampleCapabilityFilter>("all");
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
    serverVersion: null,
    engineId: null,
    engineVersion: null,
    capabilities: [],
    lastError: null,
    timeoutDetected: false,
    lastPayloadBytes: null,
  });
  const [workerNegotiation, setWorkerNegotiation] = useState(unconfiguredMobileWorker);
  const [workerAuthorization, setWorkerAuthorization] = useState<{ token: string; expiresAt: number } | null>(null);
  const [workerPairingScannerVisible, setWorkerPairingScannerVisible] = useState(false);
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
  const [mobileComputeJobs, setMobileComputeJobs] = useState<MobileComputeJob[]>([]);
  const mobileComputeJobsRef = useRef<MobileComputeJob[]>([]);
  const [objectNameDraft, setObjectNameDraft] = useState("");
  const [objectActionMessage, setObjectActionMessage] = useState("");
  const [deletedWorkspaceObject, setDeletedWorkspaceObject] = useState<{
    sceneId: string;
    deleted: MobileDeletedSceneObject;
    visible: boolean;
    opacity?: number;
    mesh?: MobileMeshPayload;
    preview?: ImplicitPreviewState;
  } | null>(null);
  const [surfaceEditorMode, setSurfaceEditorMode] = useState<"explicit" | "parametric" | "implicit">("explicit");
  const [explicitSurfaceDraft, setExplicitSurfaceDraft] = useState<MobileExplicitSurfaceDraft>(DEFAULT_MOBILE_EXPLICIT_DRAFT);
  const [parametricSurfaceDraft, setParametricSurfaceDraft] = useState<MobileParametricSurfaceDraft>(DEFAULT_MOBILE_PARAMETRIC_DRAFT);
  const [implicitSurfaceDraft, setImplicitSurfaceDraft] = useState<MobileImplicitSurfaceDraft>(DEFAULT_MOBILE_IMPLICIT_DRAFT);
  const [authoringPreviewSurface, setAuthoringPreviewSurface] = useState<SurfaceDefinition | null>(null);
  const [createActionMessage, setCreateActionMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadStorage = async () => {
      setStorageStatus("loading");
      const [loaded, loadedSettings, loadedComputeJobs] = await Promise.all([
        loadStoredSceneProjects(),
        loadMobileSettings(),
        loadMobileComputeJobs(),
      ]);

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

      if (projects.length === 0 && loaded.source === "empty") {
        projects = mobileSeedScenes.map((scene) => createStoredProjectFromScene(scene, scene.updatedAt));
        try {
          await saveStoredSceneProjects(projects);
        } catch (error) {
          issues.push(`Failed to write initial seed scenes: ${describeMobileSceneStorageError(error)}`);
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
      const loadedSurfaceColorMode = loadedSettings.surfaceColorMode ?? "solid";
      setSurfaceColorMode(loadedSurfaceColorMode);
      setActiveAnalysisOverlay(loadedSurfaceColorMode === "solid" ? "none" : "curvature");
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
      mobileComputeJobsRef.current = loadedComputeJobs;
      setMobileComputeJobs(loadedComputeJobs);

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

  useEffect(() => {
    if (storageStatus === "loading") return;
    let active = true;

    const refreshThumbnails = async () => {
      const cached = await loadMobileThumbnailCache();
      const nextCache: MobileThumbnailCache = {};
      const nextThumbnails: typeof sceneThumbnailsById = {};

      for (const project of storedProjects) {
        if (!active) return;
        const cacheKey = createMobileThumbnailCacheKey(project);
        const existing = cached[project.id];
        if (existing?.cacheKey === cacheKey) {
          nextCache[project.id] = existing;
          nextThumbnails[project.id] = existing.thumbnail;
          continue;
        }
        const parsed = readSceneFromStoredProject(project);
        if (!parsed.ok) continue;
        const thumbnail = generateMobileSceneThumbnail(parsed.scene);
        const entry = { cacheKey, thumbnail };
        nextCache[project.id] = entry;
        nextThumbnails[project.id] = thumbnail;
        await Promise.resolve();
      }

      if (!active) return;
      setSceneThumbnailsById(nextThumbnails);
      await saveMobileThumbnailCache(nextCache).catch(() => undefined);
    };

    void refreshThumbnails();
    return () => {
      active = false;
    };
  }, [storageStatus, storedProjects]);

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

  const selectedExample = useMemo(
    () => mobileExamples.find((item) => item.id === selectedExampleId) ?? null,
    [selectedExampleId]
  );
  const availableExampleCapabilities = workerNegotiation.status === "ready" ? workerNegotiation.capabilities : [];
  const filteredExamples = useMemo(
    () => filterMobileExamples(mobileExamples, {
      query: exampleSearchQuery,
      category: exampleCategoryFilter,
      capability: exampleCapabilityFilter,
      availableCapabilities: availableExampleCapabilities,
    }),
    [availableExampleCapabilities, exampleCapabilityFilter, exampleCategoryFilter, exampleSearchQuery]
  );
  const exampleCategories = useMemo(() => mobileExampleCategories(mobileExamples), []);
  const exampleRequiredCapabilities = useMemo(() => mobileExampleRequiredCapabilities(mobileExamples), []);
  const isExampleAvailable = (example: Math3DExample) => mobileExampleIsAvailable(example, availableExampleCapabilities);
  const viewerSurfaces = viewerDocument?.surfaces ?? [];
  const selectedSurface = viewerSurfaces.find((surface) => surface.id === selectedSurfaceId) ?? null;
  const contextualLearnExample = useMemo(
    () => selectedSurface
      ? mobileExamples.find((example) => (example.scene.surfaces ?? []).some((surface) => surface.id === selectedSurface.id) && example.learnTopic) ?? null
      : null,
    [selectedSurface]
  );
  const sceneObjectItems = useMemo(
    () => viewerDocument ? buildMobileSceneObjectItems(viewerDocument, visibleSurfaceIds, selectedSurfaceId) : [],
    [selectedSurfaceId, viewerDocument, visibleSurfaceIds]
  );
  const selectedSurfaceAnalysis = useMemo(
    () => (inspectorSection === "analyze" || activeAnalysisOverlay !== "none") && selectedSurface
      ? buildMobileSurfaceAnalysis(selectedSurface, renderQuality, implicitMeshBySurfaceId[selectedSurface.id])
      : null,
    [activeAnalysisOverlay, implicitMeshBySurfaceId, inspectorSection, renderQuality, selectedSurface]
  );
  const authoringPreviewScene = useMemo<SceneDocument | null>(() => {
    if (!authoringPreviewSurface) return null;
    const now = Date.now();
    return {
      id: `${viewerDocument?.id ?? "scene-mobile"}-authoring-preview`,
      title: "Formula preview",
      createdAt: viewerDocument?.createdAt ?? now,
      updatedAt: now,
      surfaces: [authoringPreviewSurface],
    };
  }, [authoringPreviewSurface, viewerDocument?.createdAt, viewerDocument?.id]);
  useEffect(() => {
    if (inspectorSection !== "create") setAuthoringPreviewSurface(null);
  }, [inspectorSection]);
  const analysisOverlayAvailability = useMemo(
    () => mobileAnalysisOverlayAvailability(activeAnalysisOverlay, selectedSurfaceAnalysis),
    [activeAnalysisOverlay, selectedSurfaceAnalysis]
  );
  useEffect(() => {
    setObjectNameDraft(selectedSurface?.id ?? "");
  }, [selectedSurface?.id]);
  const hasImplicitPreviewErrors = useMemo(
    () =>
      (viewerDocument?.surfaces ?? [])
        .filter((surface) => surface.kind === "implicit")
        .some((surface) => implicitPreviewBySurfaceId[surface.id]?.status === "error"),
    [implicitPreviewBySurfaceId, viewerDocument]
  );
  const backendUrlStatus = useMemo(() => inspectWorkerBaseUrl(workerBaseUrl), [workerBaseUrl]);
  const backendSecurityWarning = useMemo(() => {
    if (!workerBaseUrl.trim()) return null;
    if (!backendUrlStatus.supported) return `Backend URL warning: ${backendUrlStatus.reason}.`;
    if (backendUrlStatus.insecure && !backendUrlStatus.isLocal) {
      return "Backend URL warning: non-HTTPS endpoint outside local network may expose traffic.";
    }
    return null;
  }, [backendUrlStatus]);
  const workerProtocolCompatibility = useMemo(() => {
    if (workerNegotiation.status === "ready") return "compatible";
    if (workerNegotiation.status === "incompatible") return "mismatch";
    return "unknown";
  }, [workerNegotiation.status]);
  const workerCanPreviewImplicit = useMemo(
    () => mobileWorkerHasCapability(workerNegotiation, MOBILE_IMPLICIT_PREVIEW_CAPABILITY),
    [workerNegotiation]
  );
  const activeWorkerAuthorizationToken = useMemo(
    () => workerAuthorization && workerAuthorization.expiresAt > Date.now() ? workerAuthorization.token : "",
    [workerAuthorization]
  );
  const computeJobBySurfaceId = useMemo(() => {
    const sceneId = viewerDocument?.id;
    const result: Record<string, MobileComputeJob | undefined> = {};
    if (!sceneId) return result;
    const newestFirst = [...mobileComputeJobs].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const job of newestFirst) {
      if (job.request.sceneId === sceneId && result[job.surfaceId] == null) result[job.surfaceId] = job;
    }
    return result;
  }, [mobileComputeJobs, viewerDocument?.id]);

  const updateMobileComputeJob = (job: MobileComputeJob) => {
    const current = mobileComputeJobsRef.current;
    const index = current.findIndex((item) => item.jobId === job.jobId);
    const next = index >= 0
      ? current.map((item, itemIndex) => itemIndex === index ? job : item)
      : [job, ...current];
    mobileComputeJobsRef.current = next;
    setMobileComputeJobs(next);
  };

  useEffect(() => {
    if (storageStatus === "loading") return;
    const timer = setTimeout(() => {
      void saveMobileComputeJobs(mobileComputeJobsRef.current).catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [mobileComputeJobs, storageStatus]);

  useEffect(() => {
    if (!workerAuthorization) return;
    const remainingMs = workerAuthorization.expiresAt - Date.now();
    const expire = () => {
      setWorkerAuthorization(null);
      setWorkerNegotiation((current) => ({
        ...current,
        status: "unavailable",
        message: "Desktop pairing expired. Scan a new pairing code to continue remote compute.",
      }));
      setLimitedMode(true);
    };
    if (remainingMs <= 0) {
      expire();
      return;
    }
    const timer = setTimeout(expire, remainingMs);
    return () => clearTimeout(timer);
  }, [workerAuthorization]);

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
  }, [viewerDocument?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!viewerDocument || tab !== "workspace" || !appIsForeground) return;

    const implicitSurfaces = (viewerDocument.surfaces ?? []).filter(
      (surface): surface is Extract<SurfaceDefinition, { kind: "implicit" }> => surface.kind === "implicit"
    );
    if (implicitSurfaces.length === 0) return;

    const backend = createMobileMeshBackend(workerBaseUrl, activeWorkerAuthorizationToken);

    const trackSnapshot = (surfaceId: string, job: MobileComputeJob, snapshot: VtkPreviewJobSnapshot) => {
      const merged = mergeMobileComputeJobSnapshot(job, snapshot);
      updateMobileComputeJob(merged);
      if (!cancelled) {
        setImplicitPreviewBySurfaceId((current) => ({
          ...current,
          [surfaceId]: snapshot.status === "failed" || snapshot.status === "cancelled"
            ? { status: "error", error: snapshot.error || snapshot.message || `Compute job ${snapshot.status}.` }
            : { status: "loading" },
        }));
      }
      return merged;
    };

    const showCachedMesh = (surfaceId: string, cached: MobileCachedMesh) => {
      setImplicitMeshBySurfaceId((current) => ({ ...current, [surfaceId]: cached.mesh }));
      setImplicitPreviewBySurfaceId((current) => ({
        ...current,
        [surfaceId]: {
          status: "ready",
          vertexCount: cached.mesh.vertexCount,
          triCount: cached.mesh.triCount,
          cached: true,
          computedAt: cached.provenance.computedAt,
          engineLabel: `${cached.provenance.engine.id} ${cached.provenance.engine.version}`,
          stale: cached.stale,
        },
      }));
    };

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
        const requestedResolution = clampInt(surface.resolution ?? baseResolution, 12, MESH_RESOLUTION_CAP_MAX);
        const resolution = Math.min(requestedResolution, baseResolution, meshResolutionCap);
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
        const parameterHash = buildImplicitParameterHash(requestPayload, renderQuality);
        const latestJob = [...mobileComputeJobsRef.current]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .find((job) =>
            job.surfaceId === surface.id &&
            job.request.sceneId === viewerDocument.id &&
            job.request.inputHash === parameterHash
          );
        const expectedEngine = workerNegotiation.engine ?? latestJob?.engine;
        const cacheLookup: MobileComputeCacheLookup = {
          operation: "vtk.preview-implicit",
          inputHash: parameterHash,
          sceneId: viewerDocument.id,
          sceneSchemaVersion: SCENE_PROJECT_VERSION,
          engine: expectedEngine,
        };
        const exactCacheKey = expectedEngine
          ? createMobileComputeCacheKey({ ...cacheLookup, engine: expectedEngine })
          : null;
        let cachedForInput = exactCacheKey ? await readCachedMesh(exactCacheKey) : null;
        if (!cachedForInput) cachedForInput = await readLatestCachedMesh(cacheLookup);

        if (!cancelled) {
          setBackendDiagnostics((current) => ({
            ...current,
            lastPayloadBytes: requestPayloadBytes,
          }));
        }

        if (limitedMode || !workerCanPreviewImplicit) {
          if (cancelled) return;
          if (cachedForInput) {
            showCachedMesh(surface.id, cachedForInput);
          } else {
            setImplicitPreviewBySurfaceId((current) => ({
              ...current,
              [surface.id]: {
                status: "error",
                error: limitedMode
                  ? "Remote compute disabled in limited mode and no cached preview is available."
                  : `A negotiated worker with ${MOBILE_IMPLICIT_PREVIEW_CAPABILITY} is required.`,
              },
            }));
            setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: undefined }));
          }
          continue;
        }

        if (cachedForInput && !cachedForInput.stale) {
          showCachedMesh(surface.id, cachedForInput);
          continue;
        }
        if (cachedForInput) showCachedMesh(surface.id, cachedForInput);

        const existingJob = latestJob && canResumeMobileComputeJob(latestJob, workerBaseUrl, parameterHash)
          ? latestJob
          : undefined;

        let mobileJob = existingJob;
        let snapshot: VtkPreviewJobSnapshot;
        try {
          if (mobileJob) {
            snapshot = await backend.getPreviewJob(mobileJob.jobId);
          } else {
            const jobId = createMobileComputeJobId();
            const request = {
              jobId,
              operation: "vtk.preview-implicit" as const,
              inputHash: parameterHash,
              sceneId: viewerDocument.id,
              sceneSchemaVersion: SCENE_PROJECT_VERSION,
              parameters: requestPayload,
            };
            mobileJob = createMobileComputeJob({
              surfaceId: surface.id,
              workerBaseUrl,
              request,
            });
            updateMobileComputeJob(mobileJob);
            await saveMobileComputeJobs(mobileComputeJobsRef.current);
            snapshot = await backend.submitPreviewJob(request);
          }

          mobileJob = trackSnapshot(surface.id, mobileJob, snapshot);
          while (!cancelled && !isMobileComputeJobTerminal(snapshot.status)) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (cancelled) return;
            snapshot = await backend.getPreviewJob(mobileJob.jobId);
            mobileJob = trackSnapshot(surface.id, mobileJob, snapshot);
          }
        } catch (error) {
          const message = String((error as Error).message ?? error);
          const now = Date.now();
          snapshot = {
            jobId: mobileJob?.jobId ?? createMobileComputeJobId(now),
            operation: "vtk.preview-implicit",
            inputHash: parameterHash,
            sceneId: viewerDocument.id,
            sceneSchemaVersion: SCENE_PROJECT_VERSION,
            status: "failed",
            progress: mobileJob?.progress ?? 0,
            createdAt: mobileJob?.createdAt ?? now,
            updatedAt: now,
            error: message,
            diagnostics: [message],
          };
          if (mobileJob) mobileJob = trackSnapshot(surface.id, mobileJob, snapshot);
        }

        if (cancelled) return;

        const response = snapshot.result;
        if (snapshot.status !== "succeeded" || !response?.ok) {
          const responseError = snapshot.error || snapshot.message || (response && !response.ok ? response.error : "Compute job failed.");
          const timeoutDetected = /timeout|aborted|abort/i.test(responseError);
          if (cachedForInput) {
            showCachedMesh(surface.id, cachedForInput);
            setBackendDiagnostics((current) => ({
              ...current,
              lastError: `Using cached preview: ${responseError}`,
              timeoutDetected,
            }));
            setLastPreviewTimeout(timeoutDetected);
            continue;
          }

          setImplicitPreviewBySurfaceId((current) => ({
            ...current,
            [surface.id]: { status: "error", error: responseError },
          }));
          setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: undefined }));
          setBackendDiagnostics((current) => ({
            ...current,
            status: "error",
            lastError: responseError,
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
            computedAt: Date.now(),
            engineLabel: snapshot.engine ? `${snapshot.engine.id} ${snapshot.engine.version}` : undefined,
            stale: false,
          },
        }));
        const resultEngine = snapshot.engine ?? workerNegotiation.engine;
        if (resultEngine) {
          const provenance = {
            operation: "vtk.preview-implicit" as const,
            inputHash: parameterHash,
            sceneId: viewerDocument.id,
            sceneSchemaVersion: SCENE_PROJECT_VERSION,
            engine: resultEngine,
            computedAt: Date.now(),
            resolution,
            serverVersion: workerNegotiation.serverVersion ?? undefined,
          };
          void writeCachedMesh(createMobileComputeCacheKey(provenance), meshPayload, provenance);
        }
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
    activeWorkerAuthorizationToken,
    implicitPreviewRetryToken,
    meshResolutionCap,
    limitedMode,
    workerCanPreviewImplicit,
    workerNegotiation.engine,
    workerNegotiation.serverVersion,
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
      const message = describeMobileSceneStorageError(error);
      setStorageIssues((current) => [
        ...current,
        `Failed to persist scene open state: ${message}`,
      ]);
      setStorageStatus("error");
    }
  };

  const openViewerWithExample = (example: Math3DExample) => {
    const scene = createViewerSceneFromExample(example);
    setViewerDocument(scene);
    setSelectedSceneId(null);
    setInspectorExpanded(false);
    setTab("workspace");
    void persistMobileSettings({ lastSceneId: undefined, lastViewerProject: serializeViewerScene(scene) })
      .catch(() => undefined);
  };

  const openLearningExample = (example: Math3DExample) => {
    openViewerWithExample(example);
    setSelectedExampleId(example.id);
    setInspectorSection("analyze");
    setInspectorExpanded(true);
    const surface = example.scene.surfaces?.[0];
    const overlay = example.learnTopic?.recommendedOverlay;
    if (surface && surface.kind !== "implicit" && overlay) {
      setActiveAnalysisOverlay(overlay);
      setSurfaceColorMode(overlay === "curvature" ? "curvature" : "solid");
    } else {
      setActiveAnalysisOverlay("none");
      setSurfaceColorMode("solid");
    }
  };

  const showLearnExample = (exampleId: string) => {
    if (!mobileExamples.some((example) => example.id === exampleId && example.learnTopic)) return;
    setSelectedExampleId(exampleId);
    setExploreSection("learn");
    setTab("explore");
  };

  const saveCurrentViewerScene = async () => {
    if (!viewerDocument) return;

    const scene = cloneSceneWithNewTimestamp(viewerDocument);
    const stored = createStoredProjectFromScene(scene, Date.now());
    const nextProjects = upsertStoredProject(storedProjects, stored);

    try {
      await saveStoredSceneProjects(nextProjects);
      setStoredProjects(nextProjects);
      setSelectedSceneId(stored.id);
      void persistMobileSettings({ lastSceneId: stored.id, lastViewerProject: stored.serializedProject })
        .catch(() => undefined);
      setStorageStatus(storageIssues.length > 0 ? "error" : "ready");
    } catch (error) {
      const message = describeMobileSceneStorageError(error);
      setStorageIssues((current) => [
        ...current,
        `Failed to persist scene save: ${message}`,
      ]);
      setStorageStatus("error");
      setProjectActionMessage(message);
    }
  };

  const persistProjectMutation = async (
    nextProjects: MobileStoredSceneProject[],
    successMessage: string,
    failureLabel: string
  ): Promise<boolean> => {
    try {
      await saveStoredSceneProjects(nextProjects);
      setStoredProjects(nextProjects);
      setStorageStatus(storageIssues.length > 0 ? "error" : "ready");
      setProjectActionMessage(successMessage);
      return true;
    } catch (error) {
      const message = describeMobileSceneStorageError(error);
      setStorageIssues((current) => [
        ...current,
        `${failureLabel}: ${message}`,
      ]);
      setStorageStatus("error");
      setProjectActionMessage(message);
      return false;
    }
  };

  const renameStoredScene = async (projectId: string, title: string): Promise<boolean> => {
    const target = storedProjects.find((project) => project.id === projectId);
    if (!target) return false;
    const result = renameMobileProject(target, title);
    if (!result.ok) {
      setProjectActionMessage(result.error);
      return false;
    }
    const nextProjects = upsertStoredProject(storedProjects, result.project);
    const saved = await persistProjectMutation(nextProjects, `Renamed to ${result.project.title}.`, "Failed to rename project");
    if (!saved) return false;
    if (selectedSceneId === projectId) {
      const parsed = readSceneFromStoredProject(result.project);
      if (parsed.ok) setViewerDocument(parsed.scene);
      void persistMobileSettings({ lastViewerProject: result.project.serializedProject }).catch(() => undefined);
    }
    return true;
  };

  const duplicateStoredScene = async (projectId: string): Promise<boolean> => {
    const target = storedProjects.find((project) => project.id === projectId);
    if (!target) return false;
    const result = duplicateMobileProject(target, storedProjects);
    if (!result.ok) {
      setProjectActionMessage(result.error);
      return false;
    }
    const nextProjects = upsertStoredProject(storedProjects, result.project);
    return persistProjectMutation(nextProjects, `Created ${result.project.title}.`, "Failed to duplicate project");
  };

  const deleteStoredScene = async (projectId: string): Promise<boolean> => {
    const target = storedProjects.find((project) => project.id === projectId);
    if (!target) return false;
    const nextProjects = storedProjects.filter((project) => project.id !== projectId);
    const saved = await persistProjectMutation(nextProjects, `Deleted ${target.title}.`, "Failed to delete project");
    if (!saved) return false;
    setDeletedProject(target);
    if (selectedSceneId === projectId) {
      setSelectedSceneId(null);
      void persistMobileSettings({ lastSceneId: undefined }).catch(() => undefined);
    }
    return true;
  };

  const undoDeleteStoredScene = async (): Promise<boolean> => {
    if (!deletedProject) return false;
    const restored = deletedProject;
    const nextProjects = upsertStoredProject(storedProjects, restored);
    const saved = await persistProjectMutation(nextProjects, `Restored ${restored.title}.`, "Failed to restore project");
    if (saved) setDeletedProject(null);
    return saved;
  };

  const importStoredScene = async (): Promise<boolean> => {
    setProjectActionMessage("Choose a Math3D scene project to import.");
    try {
      const picked = await pickMobileSceneProject();
      if (picked.status === "cancelled") {
        setProjectActionMessage("Import cancelled.");
        return false;
      }
      const imported = importMobileSceneProject(picked.serializedProject, storedProjects);
      if (!imported.ok) {
        setProjectActionMessage(imported.error);
        return false;
      }
      const nextProjects = upsertStoredProject(storedProjects, imported.project);
      return persistProjectMutation(
        nextProjects,
        `Imported ${imported.project.title} from ${picked.sourceName}.`,
        "Failed to import project"
      );
    } catch (error) {
      setProjectActionMessage(`Import failed: ${String((error as Error).message ?? error)}`);
      return false;
    }
  };

  const exportStoredScene = async (projectId: string): Promise<boolean> => {
    const project = storedProjects.find((candidate) => candidate.id === projectId);
    if (!project) return false;
    setProjectActionMessage(`Choose a folder for ${project.title}.`);
    try {
      const exported = await exportMobileSceneProject(project);
      if (exported.status === "cancelled") {
        setProjectActionMessage("Export cancelled.");
        return false;
      }
      setProjectActionMessage(`Exported ${exported.fileName}.`);
      return true;
    } catch (error) {
      setProjectActionMessage(`Export failed: ${String((error as Error).message ?? error)}`);
      return false;
    }
  };

  const shareStoredScene = async (projectId: string): Promise<boolean> => {
    const project = storedProjects.find((candidate) => candidate.id === projectId);
    if (!project) return false;
    setProjectActionMessage(`Preparing ${project.title} for sharing.`);
    try {
      await shareMobileSceneProject(project);
      setProjectActionMessage(`${project.title} is ready to share.`);
      return true;
    } catch (error) {
      setProjectActionMessage(`Share failed: ${String((error as Error).message ?? error)}`);
      return false;
    }
  };

  const runCameraCommand = (type: CameraCommandType) => {
    setCameraCommandType(type);
    setCameraCommandToken((value) => value + 1);
  };

  const selectWorkspaceObject = (surfaceId: string) => {
    if (!viewerSurfaces.some((surface) => surface.id === surfaceId)) return;
    setObjectActionMessage("");
    setSelectedSurfaceId(surfaceId);
    setInspectorSection("object");
    setInspectorExpanded(true);
  };

  const toggleSurfaceVisibility = (surfaceId: string) => {
    setVisibleSurfaceIds((current) => {
      return current.includes(surfaceId)
        ? current.filter((value) => value !== surfaceId)
        : [...current, surfaceId];
    });
  };

  const setAllSurfacesVisible = (visible: boolean) => {
    if (!viewerDocument) return;
    const ids = visible ? (viewerDocument.surfaces ?? []).map((surface) => surface.id) : [];
    setVisibleSurfaceIds(ids);
    if (visible) runCameraCommand("fit");
  };

  const addPrimitiveToWorkspace = (kind: MobilePrimitiveKind) => {
    const wasEmpty = !viewerDocument;
    const surface = createMobilePrimitiveSurface(kind, viewerDocument);
    const scene = appendMobileSurface(viewerDocument, surface);
    setViewerDocument(scene);
    if (!wasEmpty) setVisibleSurfaceIds((current) => [...current, surface.id]);
    setSelectedSurfaceId(surface.id);
    setDeletedWorkspaceObject(null);
    setObjectActionMessage(`Added ${surface.id}. Save project to keep this scene in the project library.`);
    setTab("workspace");
    setInspectorSection("object");
    setInspectorExpanded(true);
  };

  const buildAuthoredSurface = () => surfaceEditorMode === "explicit"
    ? buildMobileExplicitSurface(viewerDocument, explicitSurfaceDraft)
    : surfaceEditorMode === "parametric"
      ? buildMobileParametricSurface(viewerDocument, parametricSurfaceDraft)
      : buildMobileImplicitSurface(viewerDocument, implicitSurfaceDraft);

  const previewAuthoredSurface = () => {
    const result = buildAuthoredSurface();
    if (!result.ok) {
      setAuthoringPreviewSurface(null);
      setCreateActionMessage(result.message);
      return;
    }
    if (result.surface.kind === "implicit") {
      setAuthoringPreviewSurface(null);
      setCreateActionMessage("Implicit surfaces are previewed by a compute job. Use Add & compute.");
      return;
    }
    setAuthoringPreviewSurface(result.surface);
    setCreateActionMessage(`Previewing ${result.surface.id}. The scene has not changed.`);
  };

  const addAuthoredSurfaceToWorkspace = () => {
    const result = buildAuthoredSurface();
    if (!result.ok) {
      setCreateActionMessage(result.message);
      return;
    }
    if (result.surface.kind === "implicit" && !workerCanPreviewImplicit) {
      setCreateActionMessage("Pair a compatible worker before adding an implicit surface.");
      return;
    }
    const wasEmpty = !viewerDocument;
    const scene = appendMobileSurface(viewerDocument, result.surface);
    setAuthoringPreviewSurface(null);
    setViewerDocument(scene);
    if (!wasEmpty) setVisibleSurfaceIds((current) => [...current, result.surface.id]);
    setSelectedSurfaceId(result.surface.id);
    setDeletedWorkspaceObject(null);
    setObjectActionMessage(`Added ${result.surface.id}. Save project to keep this scene in the project library.`);
    setInspectorSection(result.surface.kind === "implicit" ? "compute" : "object");
    setInspectorExpanded(true);
  };

  const selectAnalysisOverlay = (overlay: MobileAnalysisOverlay) => {
    const availability = mobileAnalysisOverlayAvailability(overlay, selectedSurfaceAnalysis);
    if (!availability.available) return;
    setActiveAnalysisOverlay(overlay);
    if (overlay === "curvature") {
      setSurfaceColorMode((current) => current === "curvature-faces" ? current : "curvature");
    } else {
      setSurfaceColorMode("solid");
    }
  };

  const selectSurfaceColorMode = (mode: typeof surfaceColorMode) => {
    setSurfaceColorMode(mode);
    setActiveAnalysisOverlay(mode === "solid" ? "none" : "curvature");
  };

  const remapObjectSessionState = (oldId: string, nextId: string) => {
    setVisibleSurfaceIds((current) => current.includes(oldId)
      ? current.map((id) => id === oldId ? nextId : id)
      : current);
    setSurfaceOpacityById((current) => {
      if (current[oldId] == null) return current;
      const { [oldId]: opacity, ...rest } = current;
      return { ...rest, [nextId]: opacity };
    });
    setImplicitMeshBySurfaceId((current) => {
      if (current[oldId] == null) return current;
      const { [oldId]: mesh, ...rest } = current;
      return { ...rest, [nextId]: mesh };
    });
    setImplicitPreviewBySurfaceId((current) => {
      if (current[oldId] == null) return current;
      const { [oldId]: preview, ...rest } = current;
      return { ...rest, [nextId]: preview };
    });
    const nextJobs = mobileComputeJobsRef.current.map((job) =>
      job.request.sceneId === viewerDocument?.id && job.surfaceId === oldId
        ? { ...job, surfaceId: nextId }
        : job
    );
    mobileComputeJobsRef.current = nextJobs;
    setMobileComputeJobs(nextJobs);
  };

  const renameSelectedWorkspaceObject = () => {
    if (!viewerDocument || !selectedSurfaceId) return;
    const result = renameMobileSceneObject(viewerDocument, selectedSurfaceId, objectNameDraft);
    if (!result.ok) {
      setObjectActionMessage(result.message);
      return;
    }
    const previousId = selectedSurfaceId;
    setViewerDocument(result.scene);
    if (result.objectId !== previousId) remapObjectSessionState(previousId, result.objectId);
    setSelectedSurfaceId(result.objectId);
    setObjectNameDraft(result.objectId);
    setDeletedWorkspaceObject(null);
    setObjectActionMessage(`Renamed to ${result.objectId}. Save project to keep this change in the project library.`);
  };

  const duplicateSelectedWorkspaceObject = () => {
    if (!viewerDocument || !selectedSurfaceId) return;
    const result = duplicateMobileSceneObject(viewerDocument, selectedSurfaceId);
    if (!result.ok) {
      setObjectActionMessage(result.message);
      return;
    }
    const sourceId = selectedSurfaceId;
    setViewerDocument(result.scene);
    setVisibleSurfaceIds((current) => current.includes(sourceId) ? [...current, result.objectId] : current);
    setSurfaceOpacityById((current) => current[sourceId] == null ? current : { ...current, [result.objectId]: current[sourceId] });
    setImplicitMeshBySurfaceId((current) => current[sourceId] == null ? current : { ...current, [result.objectId]: current[sourceId] });
    setImplicitPreviewBySurfaceId((current) => current[sourceId] == null ? current : { ...current, [result.objectId]: current[sourceId] });
    setSelectedSurfaceId(result.objectId);
    setDeletedWorkspaceObject(null);
    setObjectActionMessage(`Duplicated as ${result.objectId}.`);
  };

  const deleteSelectedWorkspaceObject = () => {
    if (!viewerDocument || !selectedSurfaceId) return;
    const objectId = selectedSurfaceId;
    const result = deleteMobileSceneObject(viewerDocument, objectId);
    if (!result.ok) {
      setObjectActionMessage(result.message);
      return;
    }
    setDeletedWorkspaceObject({
      sceneId: viewerDocument.id,
      deleted: result.deleted,
      visible: visibleSurfaceIds.includes(objectId),
      opacity: surfaceOpacityById[objectId],
      mesh: implicitMeshBySurfaceId[objectId],
      preview: implicitPreviewBySurfaceId[objectId],
    });
    setViewerDocument(result.scene);
    setVisibleSurfaceIds((current) => current.filter((id) => id !== objectId));
    setSurfaceOpacityById((current) => { const { [objectId]: _removed, ...rest } = current; return rest; });
    setImplicitMeshBySurfaceId((current) => { const { [objectId]: _removed, ...rest } = current; return rest; });
    setImplicitPreviewBySurfaceId((current) => { const { [objectId]: _removed, ...rest } = current; return rest; });
    setSelectedSurfaceId(result.nextSelectedId);
    setObjectActionMessage(`Deleted ${objectId}.`);
  };

  const undoDeleteWorkspaceObject = () => {
    if (!viewerDocument || !deletedWorkspaceObject || deletedWorkspaceObject.sceneId !== viewerDocument.id) return;
    const result = restoreMobileSceneObject(viewerDocument, deletedWorkspaceObject.deleted);
    if (!result.ok) {
      setObjectActionMessage(result.message);
      return;
    }
    const restoredId = result.objectId;
    setViewerDocument(result.scene);
    if (deletedWorkspaceObject.visible) setVisibleSurfaceIds((current) => [...current, restoredId]);
    if (deletedWorkspaceObject.opacity != null) setSurfaceOpacityById((current) => ({ ...current, [restoredId]: deletedWorkspaceObject.opacity! }));
    if (deletedWorkspaceObject.mesh) setImplicitMeshBySurfaceId((current) => ({ ...current, [restoredId]: deletedWorkspaceObject.mesh }));
    if (deletedWorkspaceObject.preview) setImplicitPreviewBySurfaceId((current) => ({ ...current, [restoredId]: deletedWorkspaceObject.preview }));
    setSelectedSurfaceId(restoredId);
    setDeletedWorkspaceObject(null);
    setObjectActionMessage(`Restored ${restoredId}.`);
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
    setWorkerNegotiation(unconfiguredMobileWorker());
    setWorkerAuthorization(null);

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

  const runBackendHealthCheck = async (explicitUrl?: string, explicitToken?: string) => {
    const normalizedUrl = normalizeWorkerBaseUrl(explicitUrl ?? workerBaseUrlDraft);
    const authorizationToken = explicitToken ?? activeWorkerAuthorizationToken;
    if (!normalizedUrl) {
      const unconfigured = unconfiguredMobileWorker();
      setWorkerBaseUrl("");
      setWorkerNegotiation(unconfigured);
      setBackendHealthStatus("idle");
      setBackendHealthMessage(unconfigured.message);
      setLimitedMode(true);
      await persistMobileSettings({ workerBaseUrl: "" }).catch(() => undefined);
      return;
    }

    setWorkerBaseUrl(normalizedUrl);
    setBackendHealthStatus("loading");
    setBackendHealthMessage(`Checking ${normalizedUrl} ...`);
    setSettingsActionMessage("");
    setBackendDiagnostics((current) => ({ ...current, status: "running" }));
    setWorkerNegotiation(negotiatingMobileWorker());

    const backend = createMobileMeshBackend(normalizedUrl, authorizationToken);
    const startedAt = Date.now();
    const [response, versionResponse] = await Promise.all([
      backend.health().catch((error) => ({ ok: false, error: String((error as Error).message ?? error) })),
      backend.version().catch((error) => ({ ok: false as const, error: String((error as Error).message ?? error) })),
    ]);
    const latencyMs = Date.now() - startedAt;
    const negotiation = evaluateMobileWorkerCapabilities(versionResponse, EXPECTED_WORKER_PROTOCOL);
    const workerVersion = versionResponse.ok ? versionResponse.version || null : null;
    const workerProtocol = versionResponse.ok ? versionResponse.protocol || null : null;
    setWorkerNegotiation(negotiation);

    if (response.ok && negotiation.status === "ready") {
      setBackendHealthStatus("ok");
      setBackendHealthMessage(`Backend healthy at ${normalizedUrl} (${latencyMs} ms). ${negotiation.message}`);
      setBackendDiagnostics((current) => ({
        ...current,
        status: "ready",
        healthOk: true,
        latencyMs,
        workerVersion,
        workerProtocol,
        serverVersion: negotiation.serverVersion,
        engineId: negotiation.engine?.id ?? null,
        engineVersion: negotiation.engine?.version ?? null,
        capabilities: negotiation.capabilities,
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

    const failureDetail = response.ok
      ? negotiation.message
      : response.error || versionResponse.error || "Unknown network error";
    const timeoutDetected = /timeout|aborted|abort/i.test(failureDetail);
    const healthError = response.ok
      ? `Worker at ${normalizedUrl} is incompatible. ${failureDetail}`
      : `Cannot reach worker at ${normalizedUrl}. Check the URL, Wi-Fi, and that the worker is running. (${failureDetail})`;
    setBackendHealthStatus("error");
    setBackendHealthMessage(healthError);
    setBackendDiagnostics((current) => ({
      ...current,
      status: "error",
      healthOk: false,
      latencyMs,
      workerVersion,
      workerProtocol,
      serverVersion: negotiation.serverVersion,
      engineId: negotiation.engine?.id ?? null,
      engineVersion: negotiation.engine?.version ?? null,
      capabilities: negotiation.capabilities,
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

  const startWorkerPairing = () => {
    setSettingsActionMessage("");
    setWorkerPairingScannerVisible(true);
  };

  const cancelWorkerPairing = () => {
    setWorkerPairingScannerVisible(false);
  };

  const completeWorkerPairing = async (rawValue: string): Promise<boolean> => {
    setWorkerPairingScannerVisible(false);
    const parsed = parseMobileWorkerPairing(rawValue, EXPECTED_WORKER_PROTOCOL);
    if (!parsed.ok) {
      setSettingsActionMessage(parsed.error);
      return false;
    }

    const { endpoint, token, expiresAt } = parsed.pairing;
    setWorkerAuthorization({ token, expiresAt });
    setWorkerBaseUrl(endpoint);
    setWorkerBaseUrlDraft(endpoint);
    setSettingsActionMessage("Pairing code accepted. Verifying the desktop worker...");
    await persistMobileSettings({ workerBaseUrl: endpoint }).catch(() => undefined);
    await runBackendHealthCheck(endpoint, token);
    return true;
  };

  const retryImplicitPreviews = () => {
    if (workerCanPreviewImplicit) setLimitedMode(false);
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

  const retryImplicitPreview = (surfaceId: string) => {
    if (workerCanPreviewImplicit) setLimitedMode(false);
    setImplicitPreviewBySurfaceId((current) => ({
      ...current,
      [surfaceId]: { status: "loading" },
    }));
    setImplicitPreviewRetryToken((value) => value + 1);
  };

  const cancelImplicitPreview = async (surfaceId: string) => {
    const job = computeJobBySurfaceId[surfaceId];
    if (!job || isMobileComputeJobTerminal(job.status)) return;
    const backend = createMobileMeshBackend(workerBaseUrl, activeWorkerAuthorizationToken);
    try {
      const snapshot = await backend.cancelPreviewJob(job.jobId);
      const merged = mergeMobileComputeJobSnapshot(job, snapshot);
      updateMobileComputeJob(merged);
      setImplicitPreviewBySurfaceId((current) => ({
        ...current,
        [surfaceId]: { status: "error", error: snapshot.message || "Compute job cancelled." },
      }));
    } catch (error) {
      const message = String((error as Error).message ?? error);
      setImplicitPreviewBySurfaceId((current) => ({
        ...current,
        [surfaceId]: { status: "error", error: `Cancellation failed: ${message}` },
      }));
    }
  };

  const clearSceneCache = async () => {
    setSettingsActionMessage("");
    try {
      await clearStoredSceneProjects();
      await clearMobileThumbnailCache();
      await clearMobileComputeJobs();
      setStoredProjects([]);
      setSceneThumbnailsById({});
      setSelectedSceneId(null);
      setViewerDocument(null);
      setImplicitMeshBySurfaceId({});
      setImplicitPreviewBySurfaceId({});
      mobileComputeJobsRef.current = [];
      setMobileComputeJobs([]);
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
    selectSurfaceColorMode,
    surfaceRenderMode,
    setSurfaceRenderMode,
    surfaceShading,
    setSurfaceShading,
    showBoundingBox,
    setShowBoundingBox,
    inspectorSwipeStartY,
    selectedExampleId,
    setSelectedExampleId,
    exampleSearchQuery,
    setExampleSearchQuery,
    exampleCategoryFilter,
    setExampleCategoryFilter,
    exampleCapabilityFilter,
    setExampleCapabilityFilter,
    viewerDocument,
    authoringPreviewScene,
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
    deletedProject,
    projectActionMessage,
    sceneThumbnailsById,
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
    computeJobBySurfaceId,
    sceneSummaries,
    selectedScene,
    filteredSceneSummaries,
    selectedExample,
    filteredExamples,
    exampleCategories,
    exampleRequiredCapabilities,
    isExampleAvailable,
    viewerSurfaces,
    selectedSurface,
    contextualLearnExample,
    sceneObjectItems,
    selectedSurfaceAnalysis,
    activeAnalysisOverlay,
    analysisOverlayAvailability,
    objectNameDraft,
    setObjectNameDraft,
    objectActionMessage,
    canUndoDeleteWorkspaceObject: deletedWorkspaceObject?.sceneId === viewerDocument?.id,
    surfaceEditorMode,
    setSurfaceEditorMode,
    explicitSurfaceDraft,
    setExplicitSurfaceDraft,
    parametricSurfaceDraft,
    setParametricSurfaceDraft,
    implicitSurfaceDraft,
    setImplicitSurfaceDraft,
    createActionMessage,
    hasImplicitPreviewErrors,
    backendSecurityWarning,
    workerProtocolCompatibility,
    workerNegotiation,
    workerCanPreviewImplicit,
    workerPairingScannerVisible,
    workerPairingExpiresAt: workerAuthorization?.expiresAt ?? null,
    cameraCommand,
    viewportSelectionEnabled,
    setViewportSelectionEnabled,
    androidFallbackForced,
    onViewportRenderReady,
    openStoredScene,
    renameStoredScene,
    duplicateStoredScene,
    deleteStoredScene,
    undoDeleteStoredScene,
    importStoredScene,
    exportStoredScene,
    shareStoredScene,
    openViewerWithExample,
    openLearningExample,
    showLearnExample,
    saveCurrentViewerScene,
    runCameraCommand,
    selectWorkspaceObject,
    toggleSurfaceVisibility,
    setAllSurfacesVisible,
    addPrimitiveToWorkspace,
    previewAuthoredSurface,
    addAuthoredSurfaceToWorkspace,
    selectAnalysisOverlay,
    renameSelectedWorkspaceObject,
    duplicateSelectedWorkspaceObject,
    deleteSelectedWorkspaceObject,
    undoDeleteWorkspaceObject,
    applyWorkerBaseUrl,
    runBackendHealthCheck,
    startWorkerPairing,
    cancelWorkerPairing,
    completeWorkerPairing,
    retryImplicitPreviews,
    retryImplicitPreview,
    cancelImplicitPreview,
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
