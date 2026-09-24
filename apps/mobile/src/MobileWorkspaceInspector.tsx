import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
    limitedMode,
    implicitPreviewBySurfaceId,
    computeJobBySurfaceId,
    viewerSurfaces,
    selectedSurface,
    sceneObjectItems,
    selectedSurfaceAnalysis,
    objectNameDraft,
    setObjectNameDraft,
    objectActionMessage,
    canUndoDeleteWorkspaceObject,
    hasImplicitPreviewErrors,
    workerNegotiation,
    workerCanPreviewImplicit,
    androidFallbackForced,
    saveCurrentViewerScene,
    runCameraCommand,
    selectWorkspaceObject,
    toggleSurfaceVisibility,
    setAllSurfacesVisible,
    renameSelectedWorkspaceObject,
    duplicateSelectedWorkspaceObject,
    deleteSelectedWorkspaceObject,
    undoDeleteWorkspaceObject,
    retryImplicitPreviews,
    retryImplicitPreview,
    cancelImplicitPreview,
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
        {(["scene", "object", "view", "compute", "analyze"] as const).map((section) => (
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
              {section === "scene" ? "Scene" : section === "object" ? "Object" : section === "view" ? "View" : section === "compute" ? "Compute" : "Analyze"}
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
              <Text style={styles.note}>Objects</Text>
              {sceneObjectItems.length === 0 && <Text style={styles.itemMeta}>This scene has no surface objects.</Text>}
              {sceneObjectItems.map((item) => (
                <View
                  key={item.id}
                  testID={`mobile-scene-object-${item.id}`}
                  style={[styles.objectListRow, item.selected ? styles.objectListRowSelected : null]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${item.label}`}
                    accessibilityState={{ selected: item.selected }}
                    onPress={() => selectWorkspaceObject(item.id)}
                    style={styles.objectListSelection}
                  >
                    <View style={[styles.objectKindBadge, item.selected ? styles.objectKindBadgeSelected : null]}>
                      <Text style={[styles.objectKindBadgeText, item.selected ? styles.objectKindBadgeTextSelected : null]}>
                        {item.kind === "parametric" ? "P" : item.kind === "implicit" ? "I" : item.kind === "explicit" ? "E" : item.kind === "weierstrass" ? "W" : "M"}
                      </Text>
                    </View>
                    <View style={styles.objectListMeta}>
                      <Text style={[styles.itemTitle, item.selected ? styles.objectListTitleSelected : null]} numberOfLines={1}>{item.label}</Text>
                      <Text style={styles.itemMeta}>{item.kindLabel} · {item.visible ? "Visible" : "Hidden"}{item.selected ? " · Selected" : ""}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    testID={`mobile-scene-object-visibility-${item.id}`}
                    accessibilityRole="switch"
                    accessibilityLabel={`${item.label} visibility`}
                    accessibilityState={{ checked: item.visible }}
                    onPress={() => toggleSurfaceVisibility(item.id)}
                    style={[styles.objectVisibilityButton, item.visible ? styles.objectVisibilityButtonActive : null]}
                  >
                    <Text style={[styles.objectVisibilityText, item.visible ? styles.objectVisibilityTextActive : null]}>{item.visible ? "Shown" : "Hidden"}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
          {inspectorSection === "object" && (
            <>
              <Text style={styles.panelTitle}>Object</Text>
              {!selectedSurface && <Text style={styles.itemMeta}>Select an object from the Scene list or tap a visible surface.</Text>}
              {selectedSurface && (
                <>
                  <Text style={styles.subPanelTitle}>{sceneObjectItems.find((item) => item.id === selectedSurface.id)?.label ?? selectedSurface.id}</Text>
                  <Text style={styles.note}>{surfaceSummary(selectedSurface)}</Text>
                  <Text style={styles.note}>Object name</Text>
                  <TextInput
                    testID="mobile-object-name-input"
                    value={objectNameDraft}
                    onChangeText={setObjectNameDraft}
                    onSubmitEditing={renameSelectedWorkspaceObject}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    style={styles.textInput}
                  />
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
                    <Pressable testID="mobile-object-rename" onPress={renameSelectedWorkspaceObject} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Rename</Text>
                    </Pressable>
                    <Pressable testID="mobile-object-duplicate" onPress={duplicateSelectedWorkspaceObject} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Duplicate</Text>
                    </Pressable>
                    <Pressable onPress={() => toggleSurfaceVisibility(selectedSurface.id)} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>{visibleSurfaceIds.includes(selectedSurface.id) ? "Hide" : "Show"}</Text>
                    </Pressable>
                    <Pressable testID="mobile-object-delete" onPress={deleteSelectedWorkspaceObject} style={styles.dangerBtn}>
                      <Text style={styles.dangerBtnText}>Delete</Text>
                    </Pressable>
                  </View>
                  {objectActionMessage ? <Text style={styles.itemMeta}>{objectActionMessage}</Text> : null}
                </>
              )}
              {!selectedSurface && canUndoDeleteWorkspaceObject && (
                <Pressable testID="mobile-object-undo-delete" onPress={undoDeleteWorkspaceObject} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Undo delete</Text>
                </Pressable>
              )}
              {selectedSurface && canUndoDeleteWorkspaceObject && (
                <Pressable testID="mobile-object-undo-delete" onPress={undoDeleteWorkspaceObject} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Undo last delete</Text>
                </Pressable>
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
              <Text style={styles.itemMeta}>Active job IDs are saved locally. They resume after backgrounding, or after worker authorization is restored following an app restart.</Text>
              <Text style={styles.itemMeta}>Worker: {workerNegotiation.status}</Text>
              {!workerCanPreviewImplicit && <Text style={styles.warningNote}>{workerNegotiation.message}</Text>}
              {viewerSurfaces.filter((surface) => surface.kind === "implicit").map((surface) => {
                const preview = implicitPreviewBySurfaceId[surface.id];
                const job = computeJobBySurfaceId[surface.id];
                return <View key={surface.id} style={styles.subPanel}>
                  <Text style={styles.subPanelTitle}>{surface.id}</Text>
                  <Text style={styles.itemMeta}>Status: {preview?.cached ? "ready · cached" : job?.status ?? preview?.status ?? "idle"}</Text>
                  {job && <Text style={styles.itemMeta}>Job {job.jobId} · {job.progress}%{job.phase ? ` · ${job.phase}` : ""}</Text>}
                  {job?.message && <Text style={styles.itemMeta}>{job.message}</Text>}
                  {preview?.status === "ready" && <Text style={styles.itemMeta}>{preview.vertexCount ?? 0} vertices · {preview.triCount ?? 0} triangles</Text>}
                  {preview?.cached && preview.engineLabel && (
                    <Text style={preview.stale ? styles.warningNote : styles.itemMeta}>
                      Cache: {preview.stale ? "stale" : "current"} · {preview.engineLabel}
                      {preview.computedAt ? ` · ${new Date(preview.computedAt).toLocaleString()}` : ""}
                    </Text>
                  )}
                  {(!preview?.cached && (job?.error || preview?.status === "error")) && <Text style={styles.issueText}>{job?.error || preview?.error}</Text>}
                  {job && (job.status === "queued" || job.status === "running") && (
                    <Pressable testID={`mobile-compute-cancel-${surface.id}`} onPress={() => void cancelImplicitPreview(surface.id)} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Cancel</Text>
                    </Pressable>
                  )}
                  {job && (job.status === "failed" || job.status === "cancelled") && workerCanPreviewImplicit && (
                    <Pressable testID={`mobile-compute-retry-${surface.id}`} onPress={() => retryImplicitPreview(surface.id)} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Retry</Text>
                    </Pressable>
                  )}
                </View>;
              })}
              {workerCanPreviewImplicit && hasImplicitPreviewErrors && <View style={styles.viewerToolbarRow}>
                <Pressable onPress={retryImplicitPreviews} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Retry</Text></Pressable>
                {!limitedMode && <Pressable onPress={reduceQualityAndRetry} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Reduce quality</Text></Pressable>}
              </View>}
              <Pressable onPress={openDiagnostics} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Backend diagnostics</Text></Pressable>
            </>
          )}
          {inspectorSection === "analyze" && (
            <>
              <Text style={styles.panelTitle}>Analyze</Text>
              {!selectedSurface && <Text style={styles.itemMeta}>Select an object to inspect its geometry, topology, and mesh health.</Text>}
              {selectedSurface && selectedSurfaceAnalysis?.status === "unavailable" && (
                <View style={styles.subPanel}>
                  <Text style={styles.subPanelTitle}>{selectedSurface.id}</Text>
                  <Text style={styles.warningNote}>Analysis unavailable</Text>
                  <Text style={styles.itemMeta}>{selectedSurfaceAnalysis.reason}</Text>
                </View>
              )}
              {selectedSurface && selectedSurfaceAnalysis?.status === "ready" && (
                <>
                  <Text style={styles.subPanelTitle}>{selectedSurface.id}</Text>
                  <Text style={styles.itemMeta}>{selectedSurfaceAnalysis.source}. Measurements use the displayed triangle approximation.</Text>
                  <View style={styles.subPanel}>
                    <Text style={styles.subPanelTitle}>Geometry</Text>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Vertices</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.vertexCount.toLocaleString()}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Triangles</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.triangleCount.toLocaleString()}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Surface area</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.surfaceArea.toPrecision(6)}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Enclosed volume</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.enclosedVolume == null ? "Unavailable" : selectedSurfaceAnalysis.enclosedVolume.toPrecision(6)}</Text></View>
                  </View>
                  <View style={styles.subPanel}>
                    <Text style={styles.subPanelTitle}>Topology</Text>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Components</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.componentCount}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Boundary edges</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.boundaryEdgeCount}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Euler characteristic</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.eulerCharacteristic}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Manifold / closed</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.manifold ? "Yes" : "No"} / {selectedSurfaceAnalysis.closed ? "Yes" : "No"}</Text></View>
                  </View>
                  <View style={styles.subPanel}>
                    <Text style={styles.subPanelTitle}>Mesh health · {selectedSurfaceAnalysis.healthy ? "Good" : "Issues found"}</Text>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Degenerate triangles</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.degenerateTriangleCount}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Nonmanifold edges</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.nonManifoldEdgeCount}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Orientation mismatches</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.orientationMismatchEdgeCount}</Text></View>
                    <View style={styles.inspectorSettingRow}><Text style={styles.itemTitle}>Isolated vertices</Text><Text style={styles.itemMeta}>{selectedSurfaceAnalysis.isolatedVertexCount}</Text></View>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};
