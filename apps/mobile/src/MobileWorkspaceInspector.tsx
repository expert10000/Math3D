import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type SceneDocument } from "@math3d/core";
import { MOBILE_GRID_PLANES } from "./models/mobileCoordinateGrid";
import { surfaceSummary, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileWorkspaceInspector: React.FC<{ model: MobileAppController; viewerDocument: SceneDocument }> = ({ model, viewerDocument }) => {
  const {
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
    renderQuality,
    setRenderQuality,
    showAxes,
    setShowAxes,
    gridPlanes,
    setGridPlanes,
    visibleSurfaceIds,
    setSelectedSurfaceId,
    limitedMode,
    implicitPreviewBySurfaceId,
    viewerSurfaces,
    selectedSurface,
    hasImplicitPreviewErrors,
    workerNegotiation,
    workerCanPreviewImplicit,
    androidFallbackForced,
    saveCurrentViewerScene,
    runCameraCommand,
    toggleSurfaceVisibility,
    setAllSurfacesVisible,
    retryImplicitPreviews,
    reduceQualityAndRetry,
    openDiagnostics,
    finishInspectorSwipe
  } = model;
  return (
    <View style={styles.inspectorSheet}>
      <View
        style={styles.inspectorHandleArea}
        accessibilityRole="button"
        accessibilityLabel={inspectorExpanded ? "Collapse inspector" : "Expand inspector"}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(event) => { inspectorSwipeStartY.current = event.nativeEvent.pageY; }}
        onResponderRelease={finishInspectorSwipe}
        onResponderTerminate={() => { inspectorSwipeStartY.current = null; }}
      >
        <View style={styles.inspectorGrabber} />
        <Text style={styles.inspectorHint}>{inspectorExpanded ? "Swipe down to close" : "Swipe up for tools"}</Text>
      </View>
      <View style={styles.inspectorTabs}>
        {(["scene", "object", "view", "compute"] as const).map((section) => (
          <Pressable
            key={section}
            testID={`mobile-inspector-tab-${section}`}
            onPress={() => {
              setInspectorSection(section);
              setInspectorExpanded(true);
            }}
            style={[styles.inspectorTab, inspectorSection === section ? styles.inspectorTabActive : null]}
          >
            <Text style={[styles.inspectorTabText, inspectorSection === section ? styles.inspectorTabTextActive : null]}>
              {section === "scene" ? "Scene" : section === "object" ? "Object" : section === "view" ? "View" : "Compute"}
            </Text>
          </Pressable>
        ))}
      </View>
      {inspectorExpanded && (
        <ScrollView style={styles.inspectorContent} contentContainerStyle={styles.inspectorContentInner}>
          {inspectorSection === "scene" && (
            <>
              <Text style={styles.panelTitle}>Scene</Text>
              <Text style={styles.note}>{viewerDocument.title} · {viewerSurfaces.length} object{viewerSurfaces.length === 1 ? "" : "s"}</Text>
              <View style={styles.viewerToolbarRow}>
                <Pressable onPress={() => setAllSurfacesVisible(true)} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Show all</Text></Pressable>
                <Pressable onPress={() => setAllSurfacesVisible(false)} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Hide all</Text></Pressable>
                <Pressable onPress={() => void saveCurrentViewerScene()} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Save project</Text></Pressable>
              </View>
            </>
          )}
          {inspectorSection === "object" && (
            <>
              <Text style={styles.panelTitle}>Object</Text>
              <View style={styles.viewerToolbarRow}>
                {viewerSurfaces.map((surface) => (
                  <Pressable key={surface.id} onPress={() => setSelectedSurfaceId(surface.id)} style={[styles.pill, selectedSurface?.id === surface.id ? styles.pillActive : null]}>
                    <Text style={[styles.pillText, selectedSurface?.id === surface.id ? styles.pillTextActive : null]} numberOfLines={1}>
                      {viewerSurfaces.length === 1 ? viewerDocument.title : surface.id}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {selectedSurface && (
                <>
                  <Text style={styles.note}>{surfaceSummary(selectedSurface)}</Text>
                  <Pressable onPress={() => toggleSurfaceVisibility(selectedSurface.id)} style={styles.inspectorSettingRow}>
                    <Text style={styles.itemTitle}>Visibility</Text>
                    <Text style={styles.itemMeta}>{visibleSurfaceIds.includes(selectedSurface.id) ? "On" : "Off"}</Text>
                  </Pressable>
                  <View style={styles.inspectorSettingRow}>
                    <Text style={styles.itemTitle}>Opacity</Text>
                    <Text style={styles.itemMeta}>{Math.round((surfaceOpacityById[selectedSurface.id] ?? 1) * 100)}%</Text>
                  </View>
                  <View style={styles.viewerToolbarRow}>
                    {([0.25, 0.5, 0.75, 1] as const).map((opacity) => (
                      <Pressable key={opacity} onPress={() => setSurfaceOpacityById((current) => ({ ...current, [selectedSurface.id]: opacity }))} style={[styles.pill, (surfaceOpacityById[selectedSurface.id] ?? 1) === opacity ? styles.pillActive : null]}>
                        <Text style={[styles.pillText, (surfaceOpacityById[selectedSurface.id] ?? 1) === opacity ? styles.pillTextActive : null]}>{Math.round(opacity * 100)}%</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.viewerToolbarRow}>
                    <Pressable onPress={() => { if (visibleSurfaceIds.includes(selectedSurface.id)) toggleSurfaceVisibility(selectedSurface.id); }} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Hide</Text></Pressable>
                  </View>
                </>
              )}
            </>
          )}
          {inspectorSection === "view" && (
            <>
              <Text style={styles.panelTitle}>View</Text>
              <Text style={styles.note}>Camera</Text>
              <View style={styles.viewerToolbarRow}>
                <Pressable testID="mobile-view-fit" onPress={() => runCameraCommand("fit")} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Fit scene</Text></Pressable>
                <Pressable testID="mobile-view-reset" onPress={() => runCameraCommand("reset")} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Reset view</Text></Pressable>
              </View>
              <Text style={styles.note}>Surface style</Text>
              <View style={styles.viewerToolbarRow}>
                {([[
                  "solid", "Solid"
                ], [
                  "wireframe", "Wireframe"
                ], [
                  "solid-edges", "Solid + edges"
                ]] as const).map(([mode, label]) => (
                  <Pressable
                    key={mode}
                    testID={`mobile-render-mode-${mode}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: surfaceRenderMode === mode }}
                    onPress={() => setSurfaceRenderMode(mode)}
                    style={[styles.pill, surfaceRenderMode === mode ? styles.pillActive : null]}
                  >
                    <Text style={[styles.pillText, surfaceRenderMode === mode ? styles.pillTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.note}>Shading</Text>
              <View style={styles.viewerToolbarRow}>
                {(["smooth", "flat"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    testID={`mobile-surface-shading-${mode}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: surfaceShading === mode }}
                    onPress={() => setSurfaceShading(mode)}
                    style={[styles.pill, surfaceShading === mode ? styles.pillActive : null]}
                  >
                    <Text style={[styles.pillText, surfaceShading === mode ? styles.pillTextActive : null]}>{mode === "smooth" ? "Smooth" : "Flat"}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.note}>Render quality</Text>
              <View style={styles.viewerToolbarRow}>
                {(["auto", "performance", "balanced", "quality"] as const).map((quality) => (
                  <Pressable key={quality} onPress={() => setRenderQuality(quality)} style={[styles.pill, renderQuality === quality ? styles.pillActive : null]}>
                    <Text style={[styles.pillText, renderQuality === quality ? styles.pillTextActive : null]}>{quality[0].toUpperCase() + quality.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.itemMeta}>Auto currently uses the balanced baseline while device measurements are collected.</Text>
              <Text style={styles.note}>Reference planes at zero · show or hide each plane</Text>
              <View style={styles.viewerToolbarRow}>
                <Pressable
                  testID="mobile-view-grid-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={gridPlanes.length === MOBILE_GRID_PLANES.length ? "Hide all reference planes" : "Show all reference planes"}
                  onPress={() => setGridPlanes((current) => current.length === MOBILE_GRID_PLANES.length ? [] : [...MOBILE_GRID_PLANES])}
                  style={styles.pill}
                >
                  <Text style={styles.pillText}>{gridPlanes.length === MOBILE_GRID_PLANES.length ? "Hide all" : "Show all"}</Text>
                </Pressable>
                <Pressable
                  testID="mobile-view-axes-toggle"
                  accessibilityRole="switch"
                  accessibilityLabel="Coordinate axes"
                  accessibilityState={{ checked: showAxes }}
                  onPress={() => setShowAxes((value) => !value)}
                  style={[styles.pill, showAxes ? styles.pillActive : null]}
                >
                  <Text style={[styles.pillText, showAxes ? styles.pillTextActive : null]}>Axes {showAxes ? "On" : "Off"}</Text>
                </Pressable>
              </View>
              <View style={styles.viewerToolbarRow}>
                {MOBILE_GRID_PLANES.map((plane) => {
                  const selected = gridPlanes.includes(plane);
                  const selectedStyle = plane === "xy" ? styles.planePillXY : plane === "xz" ? styles.planePillXZ : styles.planePillYZ;
                  return (
                    <Pressable
                      key={plane}
                      testID={`mobile-view-grid-plane-${plane}`}
                      accessibilityRole="switch"
                      accessibilityLabel={`${plane.toUpperCase()} grid plane`}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setGridPlanes((current) => {
                        if (current.includes(plane)) return current.filter((item) => item !== plane);
                        return MOBILE_GRID_PLANES.filter((item) => item === plane || current.includes(item));
                      })}
                      style={[styles.pill, selected ? selectedStyle : null]}
                    >
                      <Text style={styles.pillText}>{plane.toUpperCase()} {selected ? "On" : "Off"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                testID="mobile-view-bounds-toggle"
                accessibilityRole="switch"
                accessibilityLabel="Surface bounding box"
                accessibilityState={{ checked: showBoundingBox }}
                onPress={() => setShowBoundingBox((value) => !value)}
                style={[styles.inspectorSettingRow, showBoundingBox ? styles.pillActive : null]}
              >
                <Text style={showBoundingBox ? styles.pillTextActive : styles.itemTitle}>Bounding box</Text>
                <Text style={showBoundingBox ? styles.pillTextActive : styles.itemMeta}>{showBoundingBox ? "On" : "Off"}</Text>
              </Pressable>
              <Text style={styles.itemMeta}>XY blue · XZ green · YZ orange. Each plane has major and minor lines; X red · Y green · Z blue.</Text>
              <Text style={styles.itemMeta}>Surface color</Text>
              <View style={styles.viewerToolbarRow}>
                {([
                  ["solid", "Solid"],
                  ["curvature", "Curvature"],
                  ["curvature-faces", "Faces"],
                ] as const).map(([mode, label]) => (
                  <Pressable
                    key={mode}
                    testID={`mobile-surface-color-${mode}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: surfaceColorMode === mode }}
                    onPress={() => setSurfaceColorMode(mode)}
                    style={[styles.pill, surfaceColorMode === mode ? styles.pillActive : null]}
                  >
                    <Text style={[styles.pillText, surfaceColorMode === mode ? styles.pillTextActive : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {surfaceColorMode !== "solid" && <Text style={styles.itemMeta}>Blue: low curvature · orange: high curvature. Faces shows one color per triangle.</Text>}
              {androidFallbackForced && <Text style={styles.warningNote}>Android safe mode is active.</Text>}
            </>
          )}
          {inspectorSection === "compute" && (
            <>
              <Text style={styles.panelTitle}>Compute</Text>
              <Text style={styles.note}>Mesh generation, cache status, and worker diagnostics for implicit surfaces.</Text>
              <Text style={styles.itemMeta}>Worker: {workerNegotiation.status}</Text>
              {!workerCanPreviewImplicit && <Text style={styles.warningNote}>{workerNegotiation.message}</Text>}
              {viewerSurfaces.filter((surface) => surface.kind === "implicit").map((surface) => {
                const preview = implicitPreviewBySurfaceId[surface.id];
                return <View key={surface.id} style={styles.subPanel}>
                  <Text style={styles.subPanelTitle}>{surface.id}</Text>
                  <Text style={styles.itemMeta}>Status: {preview?.status ?? "idle"}{preview?.cached ? " · cached" : ""}</Text>
                  {preview?.status === "ready" && <Text style={styles.itemMeta}>{preview.vertexCount ?? 0} vertices · {preview.triCount ?? 0} triangles</Text>}
                  {preview?.status === "error" && <Text style={styles.issueText}>{preview.error}</Text>}
                </View>;
              })}
              {workerCanPreviewImplicit && hasImplicitPreviewErrors && <View style={styles.viewerToolbarRow}>
                <Pressable onPress={retryImplicitPreviews} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Retry</Text></Pressable>
                {!limitedMode && <Pressable onPress={reduceQualityAndRetry} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Reduce quality</Text></Pressable>}
              </View>}
              <Pressable onPress={openDiagnostics} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Backend diagnostics</Text></Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};
