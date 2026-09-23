import React from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { SCENE_PROJECT_VERSION } from "@math3d/core";
import Constants from "expo-constants";
import { mobileFunctionPresets, mobileGallery } from "./data/mobileSeedData";
import { clearMeshCache } from "./services/mobileMeshCacheStorage";
import { FORCE_ANDROID_SAFE_MODE, EXPECTED_WORKER_PROTOCOL, MESH_RESOLUTION_CAP_MIN, MESH_RESOLUTION_CAP_MAX, PREVIEW_PAYLOAD_WARNING_BYTES, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileSettingsScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    renderQuality,
    setRenderQuality,
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    storageIssues,
    storageStatus,
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
    limitedMode,
    setLimitedMode,
    showDiagnosticsPanel,
    setShowDiagnosticsPanel,
    androidGlEnabled,
    androidGlProbePending,
    androidGlRecoveredFromCrash,
    sceneSummaries,
    backendSecurityWarning,
    workerProtocolCompatibility,
    applyWorkerBaseUrl,
    runBackendHealthCheck,
    clearSceneCache,
    clearPreviewCache,
    applyMeshResolutionCap,
    openDiagnostics,
    toggleAndroidGl
  } = model;
  return (

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
          {(["auto", "performance", "balanced", "quality"] as const).map((quality) => (
            <Pressable
              key={`quality-${quality}`}
              onPress={() => setRenderQuality(quality)}
              style={[styles.pill, renderQuality === quality ? styles.pillActive : null]}
            >
              <Text style={[styles.pillText, renderQuality === quality ? styles.pillTextActive : null]}>
                {quality[0].toUpperCase() + quality.slice(1)}
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
  );
};
