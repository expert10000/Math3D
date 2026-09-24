import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MobileSceneViewport } from "./components/MobileSceneViewport";
import { type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";
import { MobileWorkspaceInspector } from "./MobileWorkspaceInspector";

export const MobileWorkspaceScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    setTab,
    surfaceOpacityById,
    surfaceColorMode,
    activeAnalysisOverlay,
    surfaceRenderMode,
    surfaceShading,
    showBoundingBox,
    viewerDocument,
    authoringPreviewScene,
    renderQuality,
    effectiveRenderQuality,
    adaptiveQualityState,
    showAxes,
    gridPlanes,
    showGrid,
    visibleSurfaceIds,
    selectedSurfaceId,
    selectWorkspaceObject,
    setInspectorSection,
    setInspectorExpanded,
    cameraOrbit,
    setCameraOrbit,
    appIsForeground,
    limitedMode,
    viewerLoadingMessage,
    implicitMeshBySurfaceId,
    viewerSurfaces,
    cameraCommand,
    runCameraCommand,
    viewportSelectionEnabled,
    setViewportSelectionEnabled,
    androidFallbackForced,
    onViewportRenderReady,
    onViewportPerformanceSample
  } = model;
  const viewportDocument = authoringPreviewScene ?? viewerDocument;
  const previewSurfaceId = authoringPreviewScene?.surfaces?.[0]?.id ?? null;
  return (

    <View style={styles.workspaceRoot}>
      {viewerDocument ? (
        <>
          <View style={styles.workspaceStatus}>
            <Text style={styles.workspaceSceneTitle} numberOfLines={1}>{authoringPreviewScene ? "Formula preview" : viewerDocument.title}</Text>
            <Text style={styles.itemMeta}>{authoringPreviewScene ? "Scene unchanged · " : `${viewerSurfaces.length} object${viewerSurfaces.length === 1 ? "" : "s"} · `}{renderQuality === "auto" ? `auto → ${effectiveRenderQuality}` : renderQuality}</Text>
            {limitedMode && <Text style={styles.warningNote}>Offline mode: cached previews only</Text>}
          </View>
          <View style={styles.workspaceViewportFrame}>
            <MobileSceneViewport
              scene={viewportDocument!}
              quality={effectiveRenderQuality}
              visibleSurfaceIds={authoringPreviewScene && previewSurfaceId ? [previewSurfaceId] : visibleSurfaceIds}
              selectedSurfaceId={previewSurfaceId ?? selectedSurfaceId}
              cameraCommand={cameraCommand}
              forceFallback={androidFallbackForced}
              implicitMeshBySurfaceId={implicitMeshBySurfaceId}
              onRenderReady={onViewportRenderReady}
              onPerformanceSample={onViewportPerformanceSample}
              initialOrbit={cameraOrbit}
              onOrbitChange={setCameraOrbit}
              onSelectedSurfaceChange={selectWorkspaceObject}
              selectionEnabled={viewportSelectionEnabled && !authoringPreviewScene}
              onOpenCompute={() => {
                setInspectorSection("compute");
                setInspectorExpanded(true);
              }}
              renderPaused={!appIsForeground}
              surfaceOpacityById={surfaceOpacityById}
              colorMode={surfaceColorMode}
              analysisOverlay={activeAnalysisOverlay}
              renderMode={surfaceRenderMode}
              shading={surfaceShading}
              showBoundingBox={showBoundingBox}
              showGrid={showGrid}
              showAxes={showAxes}
              gridPlanes={gridPlanes}
              viewportStyle={styles.workspaceViewport}
            />
            {renderQuality === "auto" && (
              <View style={styles.adaptiveQualityBadge} pointerEvents="none">
                <Text style={styles.adaptiveQualityText}>Auto · {effectiveRenderQuality}</Text>
                <Text style={styles.adaptiveQualityDetail}>{adaptiveQualityState.reason}</Text>
              </View>
            )}
            <View style={styles.viewportActionToolbar} pointerEvents="box-none">
              <Pressable
                testID="mobile-viewport-fit-selection"
                accessibilityRole="button"
                accessibilityLabel="Fit selected object"
                accessibilityState={{ disabled: !selectedSurfaceId }}
                disabled={!selectedSurfaceId}
                onPress={() => runCameraCommand("fit-selection")}
                style={[styles.viewportActionButton, !selectedSurfaceId ? styles.viewportActionButtonDisabled : null]}
              >
                <Text style={styles.viewportActionText}>Fit selected</Text>
              </Pressable>
              <Pressable testID="mobile-viewport-fit-scene" accessibilityRole="button" onPress={() => runCameraCommand("fit")} style={styles.viewportActionButton}>
                <Text style={styles.viewportActionText}>Fit scene</Text>
              </Pressable>
              <Pressable testID="mobile-viewport-reset" accessibilityRole="button" onPress={() => runCameraCommand("reset")} style={styles.viewportActionButton}>
                <Text style={styles.viewportActionText}>Reset</Text>
              </Pressable>
              <Pressable
                testID="mobile-viewport-selection-mode"
                accessibilityRole="switch"
                accessibilityLabel="Tap object selection mode"
                accessibilityState={{ checked: viewportSelectionEnabled }}
                onPress={() => setViewportSelectionEnabled((enabled) => !enabled)}
                style={[styles.viewportActionButton, viewportSelectionEnabled ? styles.viewportActionButtonActive : null]}
              >
                <Text style={[styles.viewportActionText, viewportSelectionEnabled ? styles.viewportActionTextActive : null]}>Select</Text>
              </Pressable>
            </View>
            {viewerLoadingMessage.length > 0 && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.loadingOverlayText}>{viewerLoadingMessage}</Text>
              </View>
            )}
          </View>
          <MobileWorkspaceInspector model={model} viewerDocument={viewerDocument} />
        </>
      ) : (
        <View style={styles.workspaceEmpty}>
          <Text style={styles.panelTitle}>Workspace is ready</Text>
          <Text style={styles.note}>Choose a scene or surface to start viewing in 3D.</Text>
          <Pressable onPress={() => setTab("explore")} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Explore examples</Text></Pressable>
          <Pressable onPress={() => setTab("projects")} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Open project</Text></Pressable>
          <Text style={styles.note}>Or start a scene with a primitive:</Text>
          <View style={styles.viewerToolbarRow}>
            {(["plane", "sphere", "cylinder", "torus"] as const).map((kind) => (
              <Pressable key={kind} testID={`mobile-empty-create-${kind}`} onPress={() => model.addPrimitiveToWorkspace(kind)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>{kind[0].toUpperCase() + kind.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};
