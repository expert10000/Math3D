import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { SceneDocument, SurfaceDefinition } from "@math3d/core";
import { MobileSceneViewport } from "./components/MobileSceneViewport";
import { mobileFunctionPresets, mobileGallery, mobileSeedScenes } from "./data/mobileSeedData";
import type { MobileSceneSummary, MobileStoredSceneProject } from "./models/mobileScene";
import {
  buildSceneSummary,
  createStoredProjectFromScene,
  loadStoredSceneProjects,
  readSceneFromStoredProject,
  saveStoredSceneProjects,
} from "./services/mobileSceneStorage";
import { createMobileMeshBackend } from "./services/mobileMeshBackend";
import { loadMobileSettings, saveMobileSettings } from "./services/mobileSettingsStorage";
import type { MobileMeshPayload, MobileRenderQuality } from "./viewer/mobileSurfacePreview";

type MobileTab = "home" | "gallery" | "viewer" | "learn" | "functions" | "settings";
type StorageStatus = "loading" | "ready" | "error";
type CameraCommandType = "reset" | "fit";
const ANDROID_GL_ENABLED = true;

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
  { id: "m5", title: "Backend compute integration", status: "in_progress" },
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
};
type ImplicitPreviewBySurfaceId = Record<string, ImplicitPreviewState | undefined>;
type BackendHealthStatus = "idle" | "loading" | "ok" | "error";

const DEFAULT_WORKER_BASE_URL =
  process.env.EXPO_PUBLIC_MATH3D_WORKER_BASE_URL || "http://127.0.0.1:8787/api/worker";

const normalizeWorkerBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_WORKER_BASE_URL;
  return trimmed.replace(/\/+$/, "");
};

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
  const [visibleSurfaceIds, setVisibleSurfaceIds] = useState<string[]>([]);
  const [cameraCommandType, setCameraCommandType] = useState<CameraCommandType | null>(null);
  const [cameraCommandToken, setCameraCommandToken] = useState(0);
  const [workerBaseUrl, setWorkerBaseUrl] = useState(DEFAULT_WORKER_BASE_URL);
  const [workerBaseUrlDraft, setWorkerBaseUrlDraft] = useState(DEFAULT_WORKER_BASE_URL);
  const [backendHealthStatus, setBackendHealthStatus] = useState<BackendHealthStatus>("idle");
  const [backendHealthMessage, setBackendHealthMessage] = useState("");
  const [implicitMeshBySurfaceId, setImplicitMeshBySurfaceId] = useState<
    Record<string, MobileMeshPayload | undefined>
  >({});
  const [implicitPreviewBySurfaceId, setImplicitPreviewBySurfaceId] = useState<ImplicitPreviewBySurfaceId>({});

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

      const firstProject = projects[0] ?? null;
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

  const selectedGallery = useMemo(
    () => mobileGallery.find((item) => item.id === selectedGalleryId) ?? null,
    [selectedGalleryId]
  );
  const viewerSurfaces = viewerDocument?.surfaces ?? [];

  useEffect(() => {
    const surfaceIds = (viewerDocument?.surfaces ?? []).map((surface) => surface.id);
    setVisibleSurfaceIds(surfaceIds);
    if (surfaceIds.length > 0) {
      setCameraCommandType("fit");
      setCameraCommandToken((value) => value + 1);
    }
    setImplicitMeshBySurfaceId({});
    setImplicitPreviewBySurfaceId({});
  }, [viewerDocument]);

  useEffect(() => {
    let cancelled = false;
    if (!viewerDocument) return;

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

      for (const surface of implicitSurfaces) {
        if (cancelled) return;

        const xSpan = Math.max(0.5, surface.domain?.xSpan ?? 2.4);
        const ySpan = Math.max(0.5, surface.domain?.ySpan ?? 2.4);
        const zSpan = Math.max(0.5, surface.domain?.zSpan ?? Math.max(xSpan, ySpan));
        const resolution = renderQuality === "performance" ? 52 : renderQuality === "balanced" ? 72 : 96;

        const response = await backend
          .previewImplicit({
            expr: surface.expression,
            iso: 0,
            domain: {
              min: [-xSpan, -ySpan, -zSpan],
              max: [xSpan, ySpan, zSpan],
            },
            resolution,
            targetFaces: renderQuality === "performance" ? 16000 : 28000,
          })
          .catch((error) => ({ ok: false as const, error: String((error as Error).message ?? error) }));

        if (cancelled) return;

        if (!response.ok) {
          setImplicitPreviewBySurfaceId((current) => ({
            ...current,
            [surface.id]: { status: "error", error: response.error },
          }));
          setImplicitMeshBySurfaceId((current) => ({ ...current, [surface.id]: undefined }));
          continue;
        }

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
          },
        }));
      }
    };

    void loadImplicitPreviews();

    return () => {
      cancelled = true;
    };
  }, [viewerDocument, renderQuality, workerBaseUrl]);

  const cameraCommand = useMemo(() => {
    if (!cameraCommandType) return null;
    return { type: cameraCommandType, token: cameraCommandToken };
  }, [cameraCommandType, cameraCommandToken]);

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
    setVisibleSurfaceIds((current) =>
      current.includes(surfaceId) ? current.filter((value) => value !== surfaceId) : [...current, surfaceId]
    );
  };

  const setAllSurfacesVisible = (visible: boolean) => {
    if (!viewerDocument) return;
    const ids = visible ? (viewerDocument.surfaces ?? []).map((surface) => surface.id) : [];
    setVisibleSurfaceIds(ids);
    if (visible) runCameraCommand("fit");
  };

  const applyWorkerBaseUrl = async () => {
    const normalizedUrl = normalizeWorkerBaseUrl(workerBaseUrlDraft);
    setWorkerBaseUrl(normalizedUrl);
    setWorkerBaseUrlDraft(normalizedUrl);
    setBackendHealthStatus("idle");
    setBackendHealthMessage("");

    try {
      await saveMobileSettings(normalizedUrl);
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

    const response = await createMobileMeshBackend(normalizedUrl)
      .health()
      .catch((error) => ({ ok: false, error: String((error as Error).message ?? error) }));

    if (response.ok) {
      setBackendHealthStatus("ok");
      setBackendHealthMessage(`Backend healthy at ${normalizedUrl}`);
      return;
    }

    setBackendHealthStatus("error");
    setBackendHealthMessage(response.error || `Health check failed for ${normalizedUrl}`);
  };

  return (
    <SafeAreaView style={styles.root}>
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
            {storageStatus === "loading" && <Text style={styles.note}>Loading local scene storage...</Text>}
            {storageStatus !== "loading" && sceneSummaries.length === 0 && (
              <Text style={styles.note}>No local scenes available.</Text>
            )}
            {sceneSummaries.map((scene) => (
              <Pressable
                key={scene.id}
                onPress={() => {
                  void openStoredScene(scene.id);
                }}
                style={styles.item}
              >
                <Text style={styles.itemTitle}>{scene.title}</Text>
                <Text style={styles.itemMeta}>
                  updated {asDate(scene.updatedAt)} | surfaces: {scene.surfaceCount}
                </Text>
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
                {Platform.OS === "android" && !ANDROID_GL_ENABLED && (
                  <Text style={styles.warningNote}>
                    Android safe mode is enforced because `expo-gl` crashes on this device.
                  </Text>
                )}
                <View style={styles.viewerToolbarRow}>
                  <Pressable onPress={() => runCameraCommand("reset")} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Reset Camera</Text>
                  </Pressable>
                  <Pressable onPress={() => runCameraCommand("fit")} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Fit Visible</Text>
                  </Pressable>
                </View>
                <MobileSceneViewport
                  scene={viewerDocument}
                  quality={renderQuality}
                  visibleSurfaceIds={visibleSurfaceIds}
                  cameraCommand={cameraCommand}
                  forceFallback={Platform.OS === "android" && !ANDROID_GL_ENABLED}
                  implicitMeshBySurfaceId={implicitMeshBySurfaceId}
                />

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
                          </Text>
                        )}
                        {previewState?.status === "error" && (
                          <Text style={styles.issueText}>Error: {previewState.error}</Text>
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
              {backendHealthMessage.length > 0 && (
                <Text style={backendHealthStatus === "error" ? styles.issueText : styles.note}>{backendHealthMessage}</Text>
              )}
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

            <Text style={styles.itemMeta}>Storage status: {storageStatus}</Text>
            <Text style={styles.itemMeta}>
              Scenes: {sceneSummaries.length} | Gallery items: {mobileGallery.length} | Presets: {mobileFunctionPresets.length}
            </Text>

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
