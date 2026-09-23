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
    surfaceRenderMode,
    surfaceShading,
    showBoundingBox,
    viewerDocument,
    renderQuality,
    showAxes,
    gridPlanes,
    showGrid,
    visibleSurfaceIds,
    selectedSurfaceId,
    setSelectedSurfaceId,
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
    androidFallbackForced,
    onViewportRenderReady
  } = model;
  return (

    <View style={styles.workspaceRoot}>
      {viewerDocument ? (
        <>
          <View style={styles.workspaceStatus}>
            <Text style={styles.workspaceSceneTitle} numberOfLines={1}>{viewerDocument.title}</Text>
            <Text style={styles.itemMeta}>{viewerSurfaces.length} object{viewerSurfaces.length === 1 ? "" : "s"} · {renderQuality}</Text>
            {limitedMode && <Text style={styles.warningNote}>Offline mode: cached previews only</Text>}
          </View>
          <View style={styles.workspaceViewportFrame}>
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
              onOpenCompute={() => {
                setInspectorSection("compute");
                setInspectorExpanded(true);
              }}
              renderPaused={!appIsForeground}
              surfaceOpacityById={surfaceOpacityById}
              colorMode={surfaceColorMode}
              renderMode={surfaceRenderMode}
              shading={surfaceShading}
              showBoundingBox={showBoundingBox}
              showGrid={showGrid}
              showAxes={showAxes}
              gridPlanes={gridPlanes}
              viewportStyle={styles.workspaceViewport}
            />
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
        </View>
      )}
    </View>
  );
};
